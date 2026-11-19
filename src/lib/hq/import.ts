import type { Row, Sql } from "../driver.ts";
import { applySchema } from "../schema.ts";
import { type Role, cleanRoles, isOwner } from "./access.ts";

// Brings the claude.ai HQ export (hq-database-export.json) into Postgres.
//
// Planning is pure (no database), so the tests can check every mapping. Writing is an upsert
// keyed on the HQ document id, so running it again updates rows instead of doubling them.
// Fields HQ stored that have no column yet go into each row's `extra`, so nothing is dropped.
// Documents with no table yet are listed, and the run refuses to write until they have one
// (or `allowUnmapped` is set), so a newer export can't lose data quietly.

export type Docs = Record<string, Record<string, unknown>>;
export type ExportFile = { docs: Docs; exportedAt?: string };

/** Paths left out on purpose: private keys and password hashes, and encrypted DMs (dropped from the rebuild). */
export const EXCLUDED = [/^data\/users\//, /^users\//, /^chat_dm(\/|$)/];

/* ── Conversions ─────────────────────────────────────────────────────── */

type Conv =
  | "text" // string, "" when missing
  | "textOrNull"
  | "date" // YYYY-MM-DD or null
  | "ts" // timestamp or null
  | "stamp" // timestamp, or the export time when missing
  | "num"
  | "int"
  | "bool"
  | "json[]"
  | "json{}"
  | "jsonOrNull"
  | "texts" // text[]
  | "user" // an HQ uid (or "owner") to a person id
  | "users" // bigint[] of person ids
  | "reactions" // {emoji: [uid]} to {emoji: [id]}
  | "last" // a channel's {at, by, text}, with by as a person id
  | "updates" // a status log [{at, by, text}], with each by as a person id
  | `ref:${string}`; // another document's id, or null when that document isn't in the export

/** [column, source field, conversion, default when missing] */
type Field = readonly [string, string, Conv?, unknown?];

const CAST: Partial<Record<string, string>> = {
  date: "date",
  ts: "timestamptz",
  stamp: "timestamptz",
  num: "numeric",
  int: "integer",
  bool: "boolean",
  "json[]": "jsonb",
  "json{}": "jsonb",
  jsonOrNull: "jsonb",
  texts: "text[]",
  user: "bigint",
  users: "bigint[]",
  reactions: "jsonb",
  last: "jsonb",
  updates: "jsonb",
};
const castOf = (conv: Conv = "text") => CAST[conv] ?? "text";

export type Context = {
  /** HQ uid to person id */
  users: Map<string, number>;
  /** who "owner" means in HQ's documents */
  ownerId: number | null;
  /** used for created_at and the like when a document has none */
  fallbackStamp: string;
  docs: Docs;
  warn: (msg: string) => void;
};

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
const isStamp = (v: unknown) => typeof v === "string" && v !== "" && !Number.isNaN(Date.parse(v));

function toNum(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function toUser(v: unknown, ctx: Context, where: string) {
  if (v === null || v === undefined || v === "") return null;
  const uid = String(v);
  if (uid === "owner") return ctx.ownerId;
  const id = ctx.users.get(uid);
  if (id === undefined) ctx.warn(`${where}: unknown person ${uid}, left blank`);
  return id ?? null;
}

function convert(v: unknown, conv: Conv, ctx: Context, where: string): unknown {
  switch (conv) {
    case "text":
      return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    case "textOrNull":
      return v === null || v === undefined || v === "" ? null : String(v);
    case "date":
      return isDate(v) ? String(v).slice(0, 10) : null;
    case "ts":
      return isStamp(v) ? String(v) : null;
    case "stamp":
      return isStamp(v) ? String(v) : ctx.fallbackStamp;
    case "num":
      return toNum(v);
    case "int": {
      const n = toNum(v);
      return n === null ? null : Math.round(n);
    }
    case "bool":
      return v === true || v === "true" || v === "TRUE";
    case "json[]":
      return JSON.stringify(Array.isArray(v) ? v : []);
    case "json{}":
      return JSON.stringify(v && typeof v === "object" && !Array.isArray(v) ? v : {});
    case "jsonOrNull":
      return v === null || v === undefined ? null : JSON.stringify(v);
    case "texts":
      return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined).map(String) : [];
    case "user":
      return toUser(v, ctx, where);
    case "users":
      return Array.isArray(v) ? v.map((u) => toUser(u, ctx, where)).filter((x): x is number => x !== null) : [];
    case "reactions": {
      const out: Record<string, number[]> = {};
      if (v && typeof v === "object")
        for (const [emoji, who] of Object.entries(v as Record<string, unknown>))
          out[emoji] = (Array.isArray(who) ? who : []).map((u) => toUser(u, ctx, where)).filter((x): x is number => x !== null);
      return JSON.stringify(out);
    }
    case "updates":
      return JSON.stringify(
        (Array.isArray(v) ? v : []).map((u) =>
          u && typeof u === "object" ? { ...(u as Record<string, unknown>), by: toUser((u as Record<string, unknown>).by, ctx, where) } : u,
        ),
      );
    case "last": {
      if (!v || typeof v !== "object") return null;
      const l = v as Record<string, unknown>;
      return JSON.stringify({ ...l, by: toUser(l.by, ctx, where) });
    }
    default: {
      // ref:<collection>
      const coll = conv.slice(4);
      if (v === null || v === undefined || v === "") return null;
      if (!ctx.docs[`${coll}/${v}`]) {
        ctx.warn(`${where}: points at ${coll}/${v}, which isn't in the export, left blank`);
        return null;
      }
      return String(v);
    }
  }
}

/* ── What goes where ─────────────────────────────────────────────────── */

type Spec = {
  pattern: RegExp;
  table: string;
  key: readonly string[];
  /** key columns (and anything else) taken from the path */
  ids: (m: RegExpMatchArray, ctx: Context) => Record<string, unknown>;
  fields: readonly Field[];
  /** columns that must end up non-null, or the document is reported and skipped */
  required?: readonly string[];
  /** false when the whole document is stored as one value */
  extra?: boolean;
};

const STAMPS: readonly Field[] = [
  ["created_at", "createdAt", "stamp"],
  ["created_by", "createdBy", "user"],
  ["updated_at", "updatedAt", "stamp"],
];

const byId = (m: RegExpMatchArray) => ({ id: m[1] });

/** In write order: a table comes after any table it points at. */
export const SPECS: readonly Spec[] = [
  {
    pattern: /^settings\/(general|onboarding)$/,
    table: "hq_settings",
    key: ["key"],
    ids: (m) => ({ key: m[1] }),
    fields: [["value", "*", "json{}"], ["updated_at", "updatedAt", "stamp"]],
    extra: false,
  },
  {
    pattern: /^fin\/(settings)$/,
    table: "hq_settings",
    key: ["key"],
    ids: () => ({ key: "finance" }),
    fields: [["value", "*", "json{}"], ["updated_at", "updatedAt", "stamp"]],
    extra: false,
  },
  {
    pattern: /^clients\/([^/]+)$/,
    table: "hq_clients",
    key: ["id"],
    ids: byId,
    required: ["name"],
    fields: [
      ["name", "name"],
      ["status", "status", "text", "active"],
      ["health", "health"],
      ["service", "service"],
      ["fee", "fee", "num"],
      ["currency", "currency", "text", "NGN"],
      ["billing", "billing"],
      ["start_date", "startDate", "date"],
      ["end_date", "endDate", "date"],
      ["contact_name", "contactName"],
      ["contact_role", "contactRole"],
      ["lead_id", "leadUid", "user"],
      ["next_date", "nextDate", "date"],
      ["next_deliverable", "nextDeliverable"],
      ["links", "links", "json{}"],
      ["notes", "notes"],
      ["pay_mode", "payMode", "text", "invoice"],
      ["pay_day", "payDay", "int"],
      ["point_id", "pointUid", "user"],
      ["email", "email"],
      ["phone", "phone"],
      ["onb", "onb", "jsonOrNull"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^talents\/([^/]+)$/,
    table: "hq_talents",
    key: ["id"],
    ids: byId,
    required: ["name"],
    fields: [
      ["name", "name"],
      ["category", "category"],
      ["status", "status"],
      ["package", "package"],
      ["manager_id", "managerUid", "user"],
      ["co_manager", "coManager"],
      ["commission", "commission", "num"],
      ["pay_flow", "payFlow"],
      ["priorities", "priorities"],
      ["terms", "terms"],
      ["bio", "bio"],
      ["location", "location"],
      ["email", "email"],
      ["phone", "phone"],
      ["media_kit", "mediaKit"],
      ["trial_ends", "trialEnds", "date"],
      ["goals", "goals", "json[]"],
      ["interests", "interests", "texts"],
      ["industries", "industries", "texts"],
      ["avoid", "avoid", "texts"],
      ["partners", "partners", "texts"],
      ["socials", "socials", "json[]"],
      ["audience", "audience", "jsonOrNull"],
      ["rates", "rates", "json[]"],
      ["rate_notes", "rateNotes"],
      ["rate_at", "rateAt", "ts"],
      ["start_date", "startDate", "date"],
      ["handles", "handles"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^contacts\/([^/]+)$/,
    table: "hq_contacts",
    key: ["id"],
    ids: byId,
    fields: [
      ["name", "name"],
      ["company", "company"],
      ["kind", "kind", "text", "sales"],
      ["stage", "stage", "text", "new"],
      ["owner_id", "ownerUid", "user"],
      ["role", "role"],
      ["rel_type", "relType"],
      ["service", "service"],
      ["value", "value", "num"],
      ["currency", "currency", "text", "NGN"],
      ["industry", "industry"],
      ["location", "location"],
      ["website", "website"],
      ["instagram", "instagram"],
      ["source", "source"],
      ["tags", "tags", "texts"],
      ["talent_ids", "talentIds", "texts"],
      ["next_action", "nextAction"],
      ["next_date", "nextDate", "date"],
      ["notes", "notes"],
      ["touches", "touches", "json[]"],
      ["email", "email"],
      ["phone", "phone"],
      ["whatsapp", "whatsapp"],
      ["won_at", "wonAt", "ts"],
      ["linkedin", "linkedin"],
      ["last_touch", "lastTouch", "ts"],
      ["client_id", "clientId", "textOrNull"],
      ["batch", "batch"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^deals\/([^/]+)$/,
    table: "hq_deals",
    key: ["id"],
    ids: byId,
    fields: [
      ["title", "title"],
      ["brand", "brand"],
      ["talent_id", "talentId", "ref:talents"],
      ["contact_id", "contactId", "ref:contacts"],
      ["owner_id", "ownerUid", "user"],
      ["stage", "stage"],
      ["fee", "fee", "num"],
      ["currency", "currency", "text", "NGN"],
      ["commission_pct", "commissionPct", "num"],
      ["pay_flow", "payFlow"],
      ["due_date", "dueDate", "date"],
      ["deliverables", "deliverables", "json[]"],
      ["notes", "notes"],
      ["health", "health"],
      ["contact_person", "contactPerson"],
      ["contact_role", "contactRole"],
      ["contact_channel", "contactChannel"],
      ["proposed", "proposed", "num"],
      ["received", "received", "num"],
      ["next_step", "nextStep"],
      ["next_date", "nextDate", "date"],
      ["updates", "updates", "updates"],
      ["usage", "usage"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^contracts\/([^/]+)$/,
    table: "hq_contracts",
    key: ["id"],
    ids: byId,
    fields: [
      ["kind", "kind", "text", "client"],
      ["status", "status", "text", "active"],
      ["client_id", "clientId", "textOrNull"],
      ["talent_id", "talentId", "textOrNull"],
      ["party", "party"],
      ["title", "title"],
      ["start_date", "start", "date"],
      ["end_date", "end", "date"],
      ["renewal", "renewal", "text", "manual"],
      ["notice_days", "noticeDays", "int", 30],
      ["value", "value", "num"],
      ["period", "period", "text", "month"],
      ["currency", "currency", "text", "NGN"],
      ["owner_id", "ownerUid", "user"],
      ["link", "link"],
      ["notes", "notes"],
      ["history", "history", "json[]"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^media\/([^/]+)$/,
    table: "hq_media",
    key: ["id"],
    ids: byId,
    required: ["name"],
    fields: [
      ["name", "name"],
      ["type", "type"],
      ["show", "show"],
      ["host", "host"],
      ["industries", "industries", "texts"],
      ["city", "city"],
      ["region", "region"],
      ["reach", "reach"],
      ["cost", "cost"],
      ["contact_name", "contactName"],
      ["contact_role", "contactRole"],
      ["email", "email"],
      ["phone", "phone"],
      ["link", "link"],
      ["status", "status", "text", "new"],
      ["next_date", "nextDate", "date"],
      ["owner_id", "ownerUid", "user"],
      ["how_to_pitch", "howToPitch"],
      ["notes", "notes"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^pitches\/([^/]+)$/,
    table: "hq_pitches",
    key: ["id"],
    ids: byId,
    fields: [
      ["for_key", "forKey", "text", "dss"],
      ["outlet_id", "outletId", "ref:media"],
      ["angle", "angle"],
      ["status", "status", "text", "idea"],
      ["pitched_on", "pitchedOn", "date"],
      ["run_date", "runDate", "date"],
      ["link", "link"],
      ["next_date", "nextDate", "date"],
      ["owner_id", "ownerUid", "user"],
      ["updates", "updates", "updates"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^tasks\/([^/]+)$/,
    table: "hq_tasks",
    key: ["id"],
    ids: byId,
    required: ["title"],
    fields: [
      ["title", "title"],
      ["assignee_id", "assignee", "user"],
      ["due", "due", "date"],
      ["status", "status", "text", "todo"],
      ["priority", "priority"],
      ["estimate", "estimate", "int"],
      ["notes", "notes"],
      ["client_id", "clientId", "textOrNull"],
      ["tactic_id", "tacticId", "textOrNull"],
      ["checklist", "checklist", "json[]"],
      ["repeat", "repeat"],
      ["done_at", "doneAt", "ts"],
      ["sop_id", "sopId", "textOrNull"],
      ["focus_mins", "focusMins", "int"],
      ["carried", "carried", "int", 0],
      ...STAMPS,
    ],
  },
  {
    pattern: /^standups\/([^/]+)\/days\/(\d{4}-\d{2}-\d{2})$/,
    table: "hq_standups",
    key: ["user_id", "day"],
    ids: (m, ctx) => ({ user_id: toUser(m[1], ctx, `standups/${m[1]}`), day: m[2] }),
    required: ["user_id"],
    fields: [["data", "*", "json{}"]],
    extra: false,
  },
  {
    pattern: /^kpis\/([^/]+)$/,
    table: "hq_kpis",
    key: ["id"],
    ids: byId,
    required: ["title"],
    fields: [
      ["title", "title"],
      ["owner_id", "uid", "user"],
      ["direction", "direction", "text", "up"],
      ["period", "period", "text", "month"],
      ["source", "source"],
      ["target", "target", "num"],
      ["unit", "unit"],
      ["weight", "weight", "num"],
      ["how", "how"],
      ["proposed_by", "proposedBy", "user"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^kpilogs\/([^/]+)$/,
    table: "hq_kpi_logs",
    key: ["id"],
    ids: byId,
    required: ["kpi_id", "period_key", "value"],
    fields: [
      ["kpi_id", "kpiId", "ref:kpis"],
      ["period_key", "periodKey", "textOrNull"],
      ["value", "value", "num"],
      ["user_id", "uid", "user"],
      ["at", "at", "stamp"],
    ],
  },
  {
    pattern: /^kpiprops\/([^/]+)\/items\/([^/]+)$/,
    table: "hq_kpi_proposals",
    key: ["id"],
    ids: (m, ctx) => ({ id: m[2], user_id: toUser(m[1], ctx, `kpiprops/${m[1]}`) }),
    required: ["user_id", "title"],
    fields: [
      ["title", "title"],
      ["unit", "unit", "text", "number"],
      ["target", "target", "num", 0],
      ["period", "period", "text", "month"],
      ["direction", "direction", "text", "up"],
      ["source", "source", "text", "manual"],
      ["how", "how"],
      ["why", "why"],
      ["status", "status", "text", "pending"],
      ["final", "final"],
      ["note", "note"],
      ["kpi_id", "kpiId", "ref:kpis"],
      ["reviewed_by", "reviewedBy", "user"],
      ["reviewed_at", "reviewedAt", "ts"],
      ["created_at", "createdAt", "stamp"],
    ],
  },
  {
    pattern: /^sops\/([^/]+)$/,
    table: "hq_sops",
    key: ["id"],
    ids: byId,
    required: ["title"],
    fields: [
      ["title", "title"],
      ["area", "area"],
      ["owner_id", "ownerUid", "user"],
      ["purpose", "purpose"],
      ["steps", "steps", "json[]"],
      ["links", "links", "json[]"],
      ...STAMPS,
    ],
  },
  ...[/^reports\/(([a-z]+)_(\d{4}-\d{2}))$/, /^fin\/main\/reports\/(([a-z]+)_(\d{4}-\d{2}))$/].map(
    (pattern): Spec => ({
      pattern,
      table: "hq_reports",
      key: ["id"],
      ids: (m) => ({ id: m[1], area: m[2] }),
      fields: [
        ["month", "month", "text"],
        ["title", "title"],
        ["slides", "slides", "json[]"],
        ["auto", "auto", "bool"],
        ["by_id", "by", "user"],
        ["created_at", "createdAt", "stamp"],
      ],
    }),
  ),
  {
    pattern: /^fin\/main\/expenses\/([^/]+)$/,
    table: "hq_fin_expenses",
    key: ["id"],
    ids: byId,
    required: ["date", "amount", "cat"],
    fields: [
      ["date", "date", "date"],
      ["amount", "amount", "num"],
      ["currency", "currency", "text", "NGN"],
      ["cat", "cat", "textOrNull"],
      ["acct", "acct", "text", "business"],
      ["description", "desc"],
      ["vendor", "vendor"],
      ["method", "method"],
      ["client_id", "clientId", "textOrNull"],
      ["deal", "deal"],
      ["asset_id", "assetId", "textOrNull"],
      ["receipt", "receipt"],
      ["recurring", "recurring", "bool"],
      ["source", "source"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^fin\/main\/income\/([^/]+)$/,
    table: "hq_fin_income",
    key: ["id"],
    ids: byId,
    required: ["date", "amount", "type"],
    fields: [
      ["date", "date", "date"],
      ["amount", "amount", "num"],
      ["currency", "currency", "text", "NGN"],
      ["type", "type", "textOrNull"],
      ["acct", "acct", "text", "business"],
      ["description", "desc"],
      ["from_name", "from"],
      ["client_id", "clientId", "textOrNull"],
      ["deal", "deal"],
      ["source", "source"],
      ["period", "period"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^fin\/main\/booked\/(\d{4}-\d{2})$/,
    table: "hq_fin_booked",
    key: ["month"],
    ids: (m) => ({ month: m[1] }),
    fields: [
      ["locked", "locked", "bool"],
      ["source", "source"],
      ["lines", "lines", "json[]"],
      ["seen", "seen", "texts"],
      ["updated_at", "updatedAt", "stamp"],
    ],
  },
  {
    pattern: /^fin\/main\/budgets\/(\d{4}-\d{2})$/,
    table: "hq_fin_budgets",
    key: ["month"],
    ids: (m) => ({ month: m[1] }),
    fields: [
      ["revenue", "revenue", "num"],
      ["cats", "cats", "json{}"],
      ["note", "note"],
      ["by_id", "by", "user"],
      ["updated_at", "updatedAt", "stamp"],
    ],
  },
  {
    pattern: /^fin\/main\/assets\/([^/]+)$/,
    table: "hq_fin_assets",
    key: ["id"],
    ids: byId,
    required: ["name", "cost"],
    fields: [
      ["name", "name"],
      ["cost", "cost", "num"],
      ["date", "date", "date"],
      ["first_month", "firstMonth"],
      ["life_months", "life", "int"],
      ["exp_ids", "expIds", "texts"],
      ["notes", "notes"],
    ],
  },
  {
    pattern: /^fin\/main\/invoices\/([^/]+)$/,
    table: "hq_fin_invoices",
    key: ["id"],
    ids: byId,
    required: ["no"],
    fields: [
      ["no", "no", "textOrNull"],
      ["kind", "kind", "text", "client"],
      ["status", "status", "text", "draft"],
      ["currency", "currency", "text", "NGN"],
      ["issue_date", "issueDate", "date"],
      ["due_date", "dueDate", "date"],
      ["items", "items", "json[]"],
      ["vat", "vat", "bool"],
      ["vat_rate", "vatRate", "num"],
      ["wht", "wht", "bool"],
      ["disc_type", "discType", "text", "pct"],
      ["disc_value", "discValue", "num"],
      ["disc_label", "discLabel"],
      ["notes", "notes"],
      ["bill_to", "billTo", "json{}"],
      ["client_id", "clientId", "ref:clients"],
      ["period", "period"],
      ["talent_id", "talentId", "ref:talents"],
      ["deal_id", "dealId", "ref:deals"],
      ["commission_pct", "commissionPct", "num"],
      ["talent_line", "talentLine"],
      ["pay_bank", "payBank", "bool", true],
      ["pay_paystack", "payPaystack", "bool"],
      ["bank_id", "bankId"],
      ["pay_link", "payLink"],
      ["payments", "payments", "json[]"],
      ["sent_at", "sentAt", "ts"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^fin\/main\/payouts\/([^/]+)$/,
    table: "hq_fin_payouts",
    key: ["id"],
    ids: byId,
    fields: [
      ["invoice_id", "invoiceId", "textOrNull"],
      ["invoice_no", "invoiceNo"],
      ["talent_id", "talentId", "ref:talents"],
      ["deal_id", "dealId", "ref:deals"],
      ["currency", "currency", "text", "NGN"],
      ["gross", "gross", "num", 0],
      ["commission_pct", "commissionPct", "num"],
      ["commission", "commission", "num", 0],
      ["net", "net", "num", 0],
      ["status", "status", "text", "due"],
      ["paid_at", "paidAt", "date"],
      ["ref", "ref"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^fin\/main\/talentbank\/([^/]+)$/,
    table: "hq_fin_talentbank",
    key: ["talent_id"],
    ids: (m) => ({ talent_id: m[1] }),
    fields: [
      ["bank", "bank"],
      ["name", "name"],
      ["number", "number"],
      ["updated_at", "updatedAt", "stamp"],
    ],
  },
  {
    pattern: /^mkt_news\/([^/]+)$/,
    table: "hq_mkt_news",
    key: ["id"],
    ids: byId,
    required: ["title"],
    fields: [
      ["date", "date", "date"],
      ["title", "title"],
      ["url", "url"],
      ["source", "source"],
      ["summary", "summary"],
      ["so_what", "soWhat"],
      ["tag", "tag"],
      ["added_by", "addedBy"],
    ],
  },
  {
    pattern: /^mkt_accounts\/([^/]+)$/,
    table: "hq_mkt_accounts",
    key: ["id"],
    ids: byId,
    required: ["platform"],
    fields: [["platform", "platform", "textOrNull"], ["handle", "handle"], ["url", "url"], ["goal", "goal", "num"], ["owner_id", "ownerUid", "user"], ...STAMPS],
  },
  {
    pattern: /^mkt_stats\/(.+)_(\d{4}-\d{2})$/,
    table: "hq_mkt_stats",
    key: ["account_id", "month"],
    ids: (m) => ({ account_id: m[1], month: m[2] }),
    fields: [
      ["followers", "followers", "num"],
      ["reach", "reach", "num"],
      ["impressions", "impressions", "num"],
      ["engagements", "engagements", "num"],
      ["posts", "posts", "num"],
      ["profile_visits", "profileVisits", "num"],
      ["link_clicks", "linkClicks", "num"],
      ["leads", "leads", "num"],
      ["source", "source"],
      ["at", "at", "stamp"],
      ["by_id", "by", "user"],
    ],
  },
  {
    pattern: /^mkt_daily\/(.+)_(\d{4}-\d{2}-\d{2})$/,
    table: "hq_mkt_daily",
    key: ["account_id", "date"],
    ids: (m) => ({ account_id: m[1], date: m[2] }),
    fields: [
      ["followers", "followers", "num"],
      ["reach", "reach", "num"],
      ["impressions", "impressions", "num"],
      ["engagements", "engagements", "num"],
      ["posts", "posts", "num"],
      ["profile_visits", "profileVisits", "num"],
      ["link_clicks", "linkClicks", "num"],
      ["leads", "leads", "num"],
      ["source", "source"],
      ["at", "at", "stamp"],
    ],
  },
  {
    pattern: /^mkt_posts\/([^/]+)$/,
    table: "hq_mkt_posts",
    key: ["id"],
    ids: byId,
    fields: [
      ["title", "title"],
      ["platform", "platform", "text", "instagram"],
      ["format", "format"],
      ["date", "date", "date"],
      ["time", "time"],
      ["status", "status", "text", "idea"],
      ["pillar", "pillar"],
      ["owner_id", "ownerUid", "user"],
      ["link", "link"],
      ["caption", "caption"],
      ["reach", "reach", "num"],
      ["engagements", "engagements", "num"],
      ["saves", "saves", "num"],
      ["leads", "leads", "num"],
      ["views", "views", "num"],
      ["likes", "likes", "num"],
      ["comments", "comments", "num"],
      ["shares", "shares", "num"],
      ["external_id", "externalId", "textOrNull"],
      ["source", "source"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^mkt_web\/(\d{4}-\d{2})$/,
    table: "hq_mkt_web",
    key: ["month"],
    ids: (m) => ({ month: m[1] }),
    fields: [["data", "*", "json{}"], ["source", "source"], ["synced_at", "syncedAt", "stamp"]],
    extra: false,
  },
  {
    pattern: /^mkt_sync\/([^/]+)$/,
    table: "hq_mkt_sync",
    key: ["platform"],
    ids: (m) => ({ platform: m[1] }),
    fields: [["status", "status"], ["last_success_at", "lastSuccessAt", "ts"], ["message", "message"], ["rows", "rows", "int"]],
    extra: false,
  },
  {
    pattern: /^mkt_ads\/([^/]+)$/,
    table: "hq_mkt_ads",
    key: ["id"],
    ids: byId,
    required: ["name"],
    fields: [
      ["name", "name"],
      ["platform", "platform", "text", "instagram"],
      ["objective", "objective"],
      ["status", "status", "text", "planned"],
      ["currency", "currency", "text", "NGN"],
      ["start_date", "start", "date"],
      ["end_date", "end", "date"],
      ...(["budget", "spend", "impressions", "clicks", "leads", "conversions", "revenue"] as const).map((k) => [k, k, "num"] as Field),
      ["notes", "notes"],
      ["client_id", "clientId", "textOrNull"],
      ["logged_spend", "loggedSpend", "num"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^chat_ch\/([^/]+)$/,
    table: "hq_chat_channels",
    key: ["id"],
    ids: byId,
    required: ["name"],
    fields: [
      ["name", "name"],
      ["description", "desc"],
      ["emoji", "emoji"],
      ["color", "color"],
      ["announce", "announce", "bool"],
      ["sort", "order", "int", 0],
      ["pins", "pins", "texts"],
      ["last", "last", "last"],
      ...STAMPS,
    ],
  },
  {
    pattern: /^chat_ch\/([^/]+)\/msgs\/([^/]+)$/,
    table: "hq_chat_messages",
    key: ["channel_id", "id"],
    ids: (m) => ({ channel_id: m[1], id: m[2] }),
    fields: [
      ["by_id", "by", "user"],
      ["at", "at", "stamp"],
      ["text", "text"],
      ["files", "files", "json[]"],
      ["mentions", "mentions", "users"],
      ["reactions", "reactions", "reactions"],
      ["reply", "reply", "textOrNull"],
      ["edited", "edited", "ts"],
    ],
  },
];

/* ── Planning ────────────────────────────────────────────────────────── */

export type Batch = { table: string; key: readonly string[]; columns: string[]; casts: string[]; rows: unknown[][] };

export type Person = {
  uid: string;
  email: string;
  name: string;
  roles: Role[];
  active: boolean;
  title: string;
  hours: number | null;
  whatsapp: string;
  notifyEmail: string;
  notifyMode: string;
  pattern: string | null;
  kpiSelf: boolean;
  joinedAt: string | null;
  extra: string;
};

export type ActivityLine = { ref: string; at: string; byUid: string; action: string; target: string; summary: string; refType: string; refId: string };

/** Sorts every document path into a table, the people list, the activity feed, left out on purpose, or unmapped. */
export function classify(docs: Docs) {
  const out = { people: new Set<string>(), activity: [] as string[], specs: [] as [string, Spec][], excluded: [] as string[], unmapped: [] as string[] };
  for (const path of Object.keys(docs).sort()) {
    if (EXCLUDED.some((r) => r.test(path))) out.excluded.push(path);
    else if (/^(people|roles)\/[^/]+$/.test(path)) out.people.add(path.split("/")[1]);
    else if (/^activity\/[^/]+$/.test(path)) out.activity.push(path);
    else {
      const spec = SPECS.find((s) => s.pattern.test(path));
      if (spec) out.specs.push([path, spec]);
      else out.unmapped.push(path);
    }
  }
  return out;
}

const PEOPLE_KNOWN = new Set(["name", "email", "notifyEmail", "notifyMode", "title", "hours", "whatsapp", "joinedAt", "updatedAt"]);
const ROLES_KNOWN = new Set(["role", "roles", "active", "pattern", "kpiSelf"]);

/** HQ's people and roles documents, one person each. People without an email can't sign in, so they're reported. */
export function planPeople(docs: Docs, warn: (m: string) => void): { people: Person[]; ownerUid: string | null } {
  const uids = classify(docs).people;
  const people: Person[] = [];
  for (const uid of [...uids].sort()) {
    const p = docs[`people/${uid}`] ?? {};
    const r = docs[`roles/${uid}`] ?? {};
    const email = String(p.email ?? "").trim().toLowerCase();
    if (!email) {
      warn(`people/${uid}: no email, so no account was made; their work is left unassigned`);
      continue;
    }
    let roles = cleanRoles(Array.isArray(r.roles) && r.roles.length ? r.roles : [r.role]);
    if (!roles.length) {
      warn(`roles/${uid}: no known role, given Contributor`);
      roles = ["Contributor"];
    }
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) if (!PEOPLE_KNOWN.has(k)) extra[k] = v;
    for (const [k, v] of Object.entries(r)) if (!ROLES_KNOWN.has(k)) extra[`roles.${k}`] = v;
    const hours = toNum(p.hours);
    people.push({
      uid,
      email,
      name: String(p.name ?? "").trim() || email,
      roles,
      active: r.active !== false,
      title: String(p.title ?? ""),
      hours: hours === null ? null : Math.round(hours),
      whatsapp: String(p.whatsapp ?? ""),
      notifyEmail: String(p.notifyEmail ?? ""),
      notifyMode: ["instant", "digest", "off"].includes(String(p.notifyMode)) ? String(p.notifyMode) : "instant",
      pattern: r.pattern && typeof r.pattern === "object" ? JSON.stringify(r.pattern) : null,
      kpiSelf: r.kpiSelf === true,
      joinedAt: isStamp(p.joinedAt) ? String(p.joinedAt) : null,
      extra: JSON.stringify(extra),
    });
  }
  const ownerUid = people.find((p) => isOwner(p.roles))?.uid ?? null;
  return { people, ownerUid };
}

/** Every mapped document as a row, grouped by table in write order. Skipped documents are reported in `errors`. */
export function planDocs(docs: Docs, ctx: Omit<Context, "docs">) {
  const full: Context = { ...ctx, docs };
  const errors: string[] = [];
  const batches = new Map<Spec, Batch>();
  const { specs } = classify(docs);

  for (const spec of SPECS) {
    const columns = [...spec.key, ...new Set([...spec.fields.map((f) => f[0]).filter((c) => !spec.key.includes(c)), ...(spec.extra === false ? [] : ["extra"])])];
    // ids() can add non-key columns too (a report's area)
    batches.set(spec, { table: spec.table, key: spec.key, columns, casts: [], rows: [] });
  }

  for (const [path, spec] of specs) {
    const doc = docs[path];
    const m = path.match(spec.pattern)!;
    const values: Record<string, unknown> = { ...spec.ids(m, full) };
    const used = new Set<string>();
    for (const [col, src, conv = "text", dflt] of spec.fields) {
      let raw: unknown;
      if (src === "*") raw = doc;
      else {
        used.add(src);
        raw = doc[src];
      }
      if ((raw === undefined || raw === null || raw === "") && dflt !== undefined) raw = dflt;
      values[col] = convert(raw, conv, full, path);
      // a person field holding something that isn't a person ("books"): keep the original in extra
      if (conv === "user" && values[col] === null && raw !== null && raw !== undefined && raw !== "" && src !== "*") used.delete(src);
    }
    const missing = (spec.required ?? []).filter((c) => values[c] === null || values[c] === undefined || values[c] === "");
    if (missing.length) {
      errors.push(`${path}: skipped, missing ${missing.join(", ")}`);
      continue;
    }
    if (spec.extra !== false) {
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(doc)) if (!used.has(k)) extra[k] = v;
      values.extra = JSON.stringify(extra);
    }
    const batch = batches.get(spec)!;
    for (const k of Object.keys(values)) if (!batch.columns.includes(k)) batch.columns.push(k);
    batch.rows.push(batch.columns.map((c) => values[c] ?? null));
  }

  // Columns can grow while rows are added (from ids()), so pad earlier rows and work out casts last.
  const out: Batch[] = [];
  for (const [spec, batch] of batches) {
    if (!batch.rows.length) continue;
    batch.rows = batch.rows.map((r) => [...r, ...Array(batch.columns.length - r.length).fill(null)]);
    batch.casts = batch.columns.map((c) => {
      if (c === "extra") return "jsonb";
      if (c === "user_id") return "bigint";
      if (c === "day") return "date";
      return castOf(spec.fields.find((f) => f[0] === c)?.[2]);
    });
    // two specs can share a table (settings, reports): merge them
    const same = out.find((b) => b.table === batch.table && b.columns.join() === batch.columns.join());
    if (same) same.rows.push(...batch.rows);
    else out.push(batch);
  }
  return { batches: out, errors };
}

/** HQ's activity feed becomes lines in the shared audit log. */
export function planActivity(docs: Docs): ActivityLine[] {
  return classify(docs).activity.map((path) => {
    const a = docs[path];
    return {
      ref: path,
      at: isStamp(a.at) ? String(a.at) : isStamp(a.createdAt) ? String(a.createdAt) : new Date(0).toISOString(),
      byUid: String(a.by ?? a.createdBy ?? ""),
      action: `activity.${String(a.type || "update")}`,
      target: [a.refType, a.refId].filter(Boolean).join(":"),
      summary: String(a.text ?? ""),
      refType: String(a.refType ?? ""),
      refId: String(a.refId ?? ""),
    };
  });
}

/* ── Writing ─────────────────────────────────────────────────────────── */

export type ImportOptions = {
  dryRun?: boolean;
  allowUnmapped?: boolean;
  /** who ran it, for the audit line */
  actor?: string;
  log?: (msg: string) => void;
};

export type ImportReport = {
  dryRun: boolean;
  people: { created: number; updated: number };
  tables: Record<string, number>;
  activity: number;
  excluded: number;
  unmapped: string[];
  warnings: string[];
  errors: string[];
  wrote: boolean;
};

const CHUNK = 100;

async function upsert(sql: Sql, b: Batch) {
  const updates = b.columns.filter((c) => !b.key.includes(c));
  for (let i = 0; i < b.rows.length; i += CHUNK) {
    const rows = b.rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = rows.map(
      (r) =>
        `(${r
          .map((v, j) => {
            params.push(v);
            return `$${params.length}::${b.casts[j]}`;
          })
          .join(", ")})`,
    );
    const set = updates.length ? `do update set ${updates.map((c) => `${c} = excluded.${c}`).join(", ")}` : "do nothing";
    await sql.query(`insert into ${b.table} (${b.columns.join(", ")}) values ${tuples.join(", ")} on conflict (${b.key.join(", ")}) ${set}`, params);
  }
}

export async function runImport(sql: Sql, file: ExportFile, opts: ImportOptions = {}): Promise<ImportReport> {
  const log = opts.log ?? (() => {});
  const docs = file.docs ?? {};
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const sorted = classify(docs);
  const report: ImportReport = {
    dryRun: Boolean(opts.dryRun),
    people: { created: 0, updated: 0 },
    tables: {},
    activity: sorted.activity.length,
    excluded: sorted.excluded.length,
    unmapped: sorted.unmapped,
    warnings,
    errors: [],
    wrote: false,
  };
  const refuse = sorted.unmapped.length > 0 && !opts.allowUnmapped;

  await applySchema(sql);

  // People first: everything else points at them.
  const { people, ownerUid } = planPeople(docs, warn);
  const existing = (await sql.query(`select id::int, email, hq_uid from desk_users`)) as Row[];
  const byEmail = new Map(existing.map((u) => [String(u.email).toLowerCase(), Number(u.id)]));
  const users = new Map<string, number>();
  for (const u of existing) if (u.hq_uid) users.set(String(u.hq_uid), Number(u.id));

  let fakeId = -1;
  for (const p of people) {
    if (byEmail.has(p.email)) report.people.updated++;
    else report.people.created++;
    if (opts.dryRun || refuse) {
      users.set(p.uid, byEmail.get(p.email) ?? fakeId--);
      continue;
    }
    const rows = await sql.query(
      `insert into desk_users (email, name, role, roles, password_hash, active, hq_uid, title, hours, whatsapp, notify_email, notify_mode, pattern, joined_at, extra, kpi_self)
       values ($1, $2, $3, $4::text[], 'none', $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::timestamptz, $14::jsonb, $15)
       on conflict (email) do update set roles = excluded.roles, role = excluded.role, active = excluded.active, hq_uid = excluded.hq_uid,
         title = excluded.title, hours = excluded.hours, whatsapp = excluded.whatsapp, notify_email = excluded.notify_email,
         notify_mode = excluded.notify_mode, pattern = excluded.pattern, joined_at = excluded.joined_at, kpi_self = excluded.kpi_self,
         extra = desk_users.extra || excluded.extra
       returning id::int`,
      [
        p.email, p.name, isOwner(p.roles) ? "admin" : "team", p.roles, p.active, p.uid, p.title, p.hours, p.whatsapp,
        p.notifyEmail, p.notifyMode, p.pattern, p.joinedAt, p.extra, p.kpiSelf,
      ],
    );
    users.set(p.uid, Number(rows[0].id));
  }

  // "owner" in HQ's documents: the export's owner, or else an Owner already on the desk
  let ownerId = ownerUid ? (users.get(ownerUid) ?? null) : null;
  if (ownerId === null) {
    const owners = (await sql.query(`select id::int from desk_users where 'Owner' = any(roles) order by id limit 1`)) as Row[];
    ownerId = owners[0] ? Number(owners[0].id) : null;
    if (ownerId === null) warn(`no Owner found, so work assigned to "owner" is left unassigned`);
  }

  const { batches, errors } = planDocs(docs, { users, ownerId, fallbackStamp: file.exportedAt || new Date().toISOString(), warn });
  report.errors = errors;
  for (const b of batches) report.tables[b.table] = (report.tables[b.table] ?? 0) + b.rows.length;

  if (refuse) {
    log(`Refusing to write: ${sorted.unmapped.length} documents have no table yet. Pass --allow-unmapped to import the rest anyway.`);
    return report;
  }
  if (opts.dryRun) return report;

  for (const b of batches) {
    log(`Writing ${b.rows.length} rows to ${b.table}`);
    await upsert(sql, b);
  }

  const names = new Map(((await sql.query(`select id::int, name, email from desk_users`)) as Row[]).map((u) => [Number(u.id), u]));
  for (const a of planActivity(docs)) {
    const id = a.byUid === "owner" ? ownerId : users.get(a.byUid);
    const who = id ? names.get(id) : undefined;
    await sql.query(
      `insert into desk_audit (at, actor, actor_email, action, target, summary, source_ref, ref_type, ref_id, actor_id)
       values ($1::timestamptz, $2, $3, $4, $5, $6, $7, nullif($8, ''), nullif($9, ''), $10)
       on conflict (source_ref) where source_ref is not null do nothing`,
      [a.at, who?.name ?? "", who?.email ?? "", a.action, a.target, a.summary.slice(0, 1000), a.ref, a.refType, a.refId, id ?? null],
    );
  }

  const total = Object.values(report.tables).reduce((s, n) => s + n, 0);
  await sql.query(`insert into desk_audit (actor, action, target, summary) values ($1, 'hq.import', 'claude.ai HQ export', $2)`, [
    opts.actor ?? "Import script",
    `Imported ${total} documents and ${people.length} people from the export of ${file.exportedAt ?? "an unknown date"}` +
      (errors.length ? `, ${errors.length} skipped` : ""),
  ]);
  report.wrote = true;
  return report;
}
