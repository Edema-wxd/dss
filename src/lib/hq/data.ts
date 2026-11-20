import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "../desk/db";
import { cleanRoles, type Role } from "./access";
import { kpiPercent, lagosToday, periodKey, periodStart } from "./work";

// Reading and writing HQ's day-to-day work: people, tasks, standups, KPIs, procedures and
// settings, plus the read-only client and CRM figures Today and the Command centre show.
// Every caller checks access first (src/lib/desk/auth.ts requireModule).

/** A new document id, in the same style as HQ's: 20 url-safe characters. */
export const newId = () => randomBytes(15).toString("base64url");

// Dates come back as plain strings, so a server in another time zone can't shift them.
const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;
const lagosDay = (col: string) => `coalesce(to_char(${col} at time zone 'Africa/Lagos', 'YYYY-MM-DD'), '')`;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/* ── People ──────────────────────────────────────────────────────────── */

export type Person = {
  id: number;
  name: string;
  email: string;
  roles: Role[];
  active: boolean;
  title: string;
  hours: number | null;
  whatsapp: string;
  notifyEmail: string;
  notifyMode: string;
  kpiSelf: boolean;
};

export async function listPeople(): Promise<Person[]> {
  const rows = await (await db()).query(
    `select id::int, name, email, roles, active, title, hours, whatsapp, notify_email as "notifyEmail", notify_mode as "notifyMode",
       kpi_self as "kpiSelf" from desk_users order by name`,
  );
  return rows.map((r) => ({ ...r, roles: cleanRoles(r.roles) })) as Person[];
}

export async function updateProfile(id: number, p: Partial<Pick<Person, "name" | "title" | "hours" | "whatsapp" | "notifyEmail" | "notifyMode">>) {
  await (await db()).query(
    `update desk_users set name = coalesce($2, name), title = coalesce($3, title), hours = case when $8 then $4::integer else hours end,
       whatsapp = coalesce($5, whatsapp), notify_email = coalesce($6, notify_email), notify_mode = coalesce($7, notify_mode) where id = $1`,
    [id, p.name ?? null, p.title ?? null, p.hours ?? null, p.whatsapp ?? null, p.notifyEmail ?? null, p.notifyMode ?? null, "hours" in p],
  );
}

export async function setKpiSelf(id: number, on: boolean) {
  await (await db()).query(`update desk_users set kpi_self = $2 where id = $1`, [id, on]);
}

/* ── Clients and CRM (read-only until Phase 3) ───────────────────────── */

export type ClientLite = { id: string; name: string; status: string; health: string; nextDate: string; nextDeliverable: string; endDate: string; leadId: number | null };

export async function listClients(): Promise<ClientLite[]> {
  return (await (await db()).query(
    `select id, name, status, health, ${day("next_date")} as "nextDate", next_deliverable as "nextDeliverable", ${day("end_date")} as "endDate",
       lead_id::int as "leadId" from hq_clients order by name`,
  )) as ClientLite[];
}

export type ContactLite = {
  id: string;
  name: string;
  company: string;
  kind: string;
  stage: string;
  ownerId: number | null;
  nextDate: string;
  nextAction: string;
  value: number | null;
  currency: string;
  wonAt: string;
  phone: string;
  whatsapp: string;
  email: string;
};

export async function listContacts(): Promise<ContactLite[]> {
  const rows = await (await db()).query(
    `select id, name, company, kind, stage, owner_id::int as "ownerId", ${day("next_date")} as "nextDate", next_action as "nextAction",
       value, currency, coalesce(${iso("won_at")}, '') as "wonAt", phone, whatsapp, email from hq_contacts`,
  );
  return rows.map((r) => ({ ...r, value: num(r.value) })) as ContactLite[];
}

export async function liveDeals() {
  const rows = await (await db()).query(`select count(*)::int as n, coalesce(sum(fee), 0)::float as fees from hq_deals where stage in ('negotiating', 'contracted', 'delivering')`);
  return { count: Number(rows[0].n), fees: Number(rows[0].fees) };
}

/* ── Tasks ───────────────────────────────────────────────────────────── */

export type ChecklistItem = { t: string; done: boolean };
export type Task = {
  id: string;
  title: string;
  assigneeId: number | null;
  due: string;
  status: string;
  priority: string;
  estimate: number | null;
  notes: string;
  clientId: string | null;
  checklist: ChecklistItem[];
  repeat: string;
  doneAt: string;
  doneDay: string;
  sopId: string | null;
  carried: number;
  createdBy: number | null;
  /** a 12-week plan tactic and the week this task does it for */
  tacticId: string | null;
  tacticWeek: number | null;
};

const TASK_COLS = `id, title, assignee_id::int as "assigneeId", ${day("due")} as due, status, priority, estimate, notes, client_id as "clientId",
  checklist, repeat, ${iso("done_at")} as "doneAt", ${lagosDay("done_at")} as "doneDay", sop_id as "sopId", carried, created_by::int as "createdBy",
  tactic_id as "tacticId", tactic_week as "tacticWeek"`;

/**
 * Tasks to show. `assigneeId` limits them to one person. Finished tasks older than
 * `doneSince` are left out, so the list doesn't grow forever.
 */
export async function listTasks(opts: { assigneeId?: number | null; doneSince?: string } = {}): Promise<Task[]> {
  const params: unknown[] = [opts.doneSince ?? "1900-01-01"];
  let where = `(status <> 'done' or done_at is null or (done_at at time zone 'Africa/Lagos')::date >= $1::date)`;
  if (opts.assigneeId !== undefined) {
    params.push(opts.assigneeId);
    where += ` and assignee_id is not distinct from $2`;
  }
  return (await (await db()).query(`select ${TASK_COLS} from hq_tasks where ${where} order by due nulls last, title`, params)) as Task[];
}

export async function getTask(id: string) {
  const rows = (await (await db()).query(`select ${TASK_COLS} from hq_tasks where id = $1`, [id])) as Task[];
  return rows[0] ?? null;
}

export type TaskInput = Partial<Pick<Task, "title" | "assigneeId" | "due" | "status" | "priority" | "estimate" | "notes" | "clientId" | "checklist" | "repeat" | "sopId">>;

export async function createTask(t: TaskInput & { title: string; tacticId?: string | null; tacticWeek?: number | null }, by: number) {
  const id = newId();
  await (await db()).query(
    `insert into hq_tasks (id, title, assignee_id, due, status, priority, estimate, notes, client_id, checklist, repeat, sop_id, created_by, tactic_id, tactic_week)
     values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)`,
    [
      id, t.title, t.assigneeId ?? null, t.due || null, t.status || "todo", t.priority || "normal", t.estimate ?? null, t.notes ?? "",
      t.clientId || null, JSON.stringify(t.checklist ?? []), t.repeat ?? "", t.sopId ?? null, by, t.tacticId ?? null, t.tacticWeek ?? null,
    ],
  );
  return id;
}

const TASK_FIELDS: Record<keyof TaskInput, [string, string]> = {
  title: ["title", "text"],
  assigneeId: ["assignee_id", "bigint"],
  due: ["due", "date"],
  status: ["status", "text"],
  priority: ["priority", "text"],
  estimate: ["estimate", "integer"],
  notes: ["notes", "text"],
  clientId: ["client_id", "text"],
  checklist: ["checklist", "jsonb"],
  repeat: ["repeat", "text"],
  sopId: ["sop_id", "text"],
};

/** Updates only the fields given. Moving status to or from done sets or clears done_at. */
export async function updateTask(id: string, patch: TaskInput & { carried?: number }) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(patch) as [keyof TaskInput | "carried", unknown][]) {
    if (k === "carried") {
      params.push(v);
      sets.push(`carried = $${params.length}::integer`);
      continue;
    }
    const f = TASK_FIELDS[k];
    if (!f) continue;
    params.push(k === "checklist" ? JSON.stringify(v ?? []) : v === "" && f[1] !== "text" ? null : v);
    sets.push(`${f[0]} = $${params.length}::${f[1]}`);
  }
  if ("status" in patch) sets.push(`done_at = case when status <> 'done' and $${params.push(patch.status)}::text = 'done' then now() when $${params.length}::text <> 'done' then null else done_at end`);
  if (!sets.length) return;
  const q = await db();
  await q.query(`update hq_tasks set ${sets.join(", ")}, updated_at = now() where id = $1`, params);
  // finishing a task made from a 12-week tactic ticks that tactic's week, however it was finished
  if (patch.status === "done")
    await q.query(
      `update hq_tactics t set done = t.done || jsonb_build_object(k.tactic_week::text, to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), updated_at = now()
       from hq_tasks k where k.id = $1 and k.status = 'done' and k.tactic_id = t.id and k.tactic_week is not null and not (t.done ? k.tactic_week::text)`,
      [id],
    );
}

export async function deleteTask(id: string) {
  await (await db()).query(`delete from hq_tasks where id = $1`, [id]);
}

/* ── Standups (the day: your three, then the close) ──────────────────── */

export type Standup = {
  startedAt?: string;
  energy?: string;
  top?: string[];
  closedAt?: string;
  doneText?: string;
  blockers?: string;
  blockersCleared?: boolean;
  tomorrow?: string;
};

export async function getStandups(dayKey: string) {
  const rows = await (await db()).query(`select user_id::int as "userId", data from hq_standups where day = $1::date`, [dayKey]);
  return new Map(rows.map((r) => [Number(r.userId), r.data as Standup]));
}

/** Merges `patch` into the person's standup for the day, creating it when there is none. */
export async function saveStandup(userId: number, dayKey: string, patch: Standup) {
  await (await db()).query(
    `insert into hq_standups (user_id, day, data) values ($1, $2::date, $3::jsonb)
     on conflict (user_id, day) do update set data = hq_standups.data || excluded.data`,
    [userId, dayKey, JSON.stringify(patch)],
  );
}

/* ── KPIs ────────────────────────────────────────────────────────────── */

export type Kpi = {
  id: string;
  title: string;
  ownerId: number | null;
  unit: string;
  target: number;
  period: string;
  direction: string;
  source: string;
  weight: number | null;
  how: string;
  proposedBy: number | null;
};

export type KpiWithState = Kpi & { actual: number | null; pct: number };

export async function listKpis(): Promise<Kpi[]> {
  const rows = await (await db()).query(
    `select id, title, owner_id::int as "ownerId", unit, target, period, direction, source, weight, how, proposed_by::int as "proposedBy"
     from hq_kpis order by created_at`,
  );
  return rows.map((r) => ({ ...r, target: Number(r.target ?? 0), weight: num(r.weight) })) as Kpi[];
}

export type KpiInput = Omit<Kpi, "id" | "proposedBy"> & { proposedBy?: number | null };

export async function saveKpi(id: string | null, k: KpiInput, by: number) {
  const kid = id ?? newId();
  await (await db()).query(
    `insert into hq_kpis (id, title, owner_id, unit, target, period, direction, source, weight, how, proposed_by, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (id) do update set title = excluded.title, owner_id = excluded.owner_id, unit = excluded.unit, target = excluded.target,
       period = excluded.period, direction = excluded.direction, source = excluded.source, weight = excluded.weight, how = excluded.how,
       updated_at = now()`,
    [kid, k.title, k.ownerId, k.unit, k.target, k.period, k.direction, k.source, k.weight ?? 1, k.how, k.proposedBy ?? null, by],
  );
  return kid;
}

export async function deleteKpi(id: string) {
  await (await db()).query(`delete from hq_kpis where id = $1`, [id]);
}

/** Saves a person's number for a manual KPI in the current period (one per period). */
export async function logKpi(k: Pick<Kpi, "id" | "period">, value: number, userId: number) {
  const pk = periodKey(k.period || "month", lagosToday());
  await (await db()).query(
    `insert into hq_kpi_logs (id, kpi_id, period_key, value, user_id) values ($1, $2, $3, $4, $5)
     on conflict (kpi_id, period_key) do update set value = excluded.value, user_id = excluded.user_id, at = now()`,
    [`${k.id}_${pk.replace(/[^\w-]/g, "-")}`, k.id, pk, value, userId],
  );
}

/**
 * Each KPI with its number so far this period and its percent of target. Auto sources are
 * counted the way HQ counts them. Revenue needs Finance, so until then it reads "not counted
 * yet" (null).
 */
export async function kpiStates(kpis: readonly Kpi[], today = lagosToday()): Promise<KpiWithState[]> {
  if (!kpis.length) return [];
  const q = await db();
  const logs = await q.query(`select kpi_id as "kpiId", period_key as "periodKey", value from hq_kpi_logs where kpi_id = any($1::text[])`, [kpis.map((k) => k.id)]);
  const doneRows = await q.query(
    `select assignee_id::int as "userId", (done_at at time zone 'Africa/Lagos')::date::text as day from hq_tasks
     where status = 'done' and done_at >= now() - interval '100 days'`,
  );
  const wonRows = await q.query(`select owner_id::int as "userId", coalesce(${lagosDay("won_at")}, '') as day from hq_contacts where stage = 'won'`);
  // follow-ups logged on CRM contacts: calls, WhatsApp, email and meetings (notes don't count)
  const touchRows = await q.query(
    `select actor_id::int as "userId", ${lagosDay("at")} as day from desk_audit
     where ref_type = 'contact' and action in ('activity.call', 'activity.whatsapp', 'activity.email', 'activity.meeting') and at >= now() - interval '100 days'`,
  );
  return kpis.map((k) => {
    const start = periodStart(k.period || "month", today);
    let actual: number | null = 0;
    if (k.source === "auto_tasks") actual = doneRows.filter((r) => r.userId === k.ownerId && r.day >= start).length;
    else if (k.source === "auto_won") actual = wonRows.filter((r) => r.userId === k.ownerId && r.day >= start).length;
    else if (k.source === "auto_revenue") actual = null;
    else if (k.source === "auto_touches") actual = touchRows.filter((r) => r.userId === k.ownerId && r.day >= start).length;
    else {
      const log = logs.find((l) => l.kpiId === k.id && l.periodKey === periodKey(k.period || "month", today));
      actual = log ? Number(log.value) : 0;
    }
    return { ...k, actual, pct: kpiPercent(actual, k.target, k.direction) };
  });
}

export type Proposal = {
  id: string;
  userId: number;
  title: string;
  unit: string;
  target: number;
  period: string;
  direction: string;
  source: string;
  how: string;
  why: string;
  status: string;
  final: string;
  note: string;
  createdAt: string;
};

export async function listProposals(userId?: number): Promise<Proposal[]> {
  const rows = await (await db()).query(
    `select id, user_id::int as "userId", title, unit, target, period, direction, source, how, why, status, final, note, ${iso("created_at")} as "createdAt"
     from hq_kpi_proposals ${userId ? "where user_id = $1" : ""} order by created_at desc`,
    userId ? [userId] : [],
  );
  return rows.map((r) => ({ ...r, target: Number(r.target) })) as Proposal[];
}

export async function createProposal(userId: number, p: Pick<Proposal, "title" | "unit" | "target" | "period" | "direction" | "source" | "how" | "why">) {
  const id = newId();
  await (await db()).query(
    `insert into hq_kpi_proposals (id, user_id, title, unit, target, period, direction, source, how, why) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, userId, p.title, p.unit, p.target, p.period, p.direction, p.source, p.how, p.why],
  );
  return id;
}

export async function reviewProposal(id: string, r: { status: string; kpiId?: string | null; note?: string; final?: string }, by: number) {
  await (await db()).query(
    `update hq_kpi_proposals set status = $2, kpi_id = coalesce($3, kpi_id), note = coalesce($4, note), final = coalesce($5, final),
       reviewed_by = $6, reviewed_at = now() where id = $1`,
    [id, r.status, r.kpiId ?? null, r.note ?? null, r.final ?? null, by],
  );
}

export async function deleteProposal(id: string, userId: number) {
  await (await db()).query(`delete from hq_kpi_proposals where id = $1 and user_id = $2 and status = 'pending'`, [id, userId]);
}

/* ── Procedures ──────────────────────────────────────────────────────── */

export type Sop = {
  id: string;
  title: string;
  area: string;
  ownerId: number | null;
  purpose: string;
  steps: { t: string; note: string }[];
  links: { label: string; url: string }[];
  updatedAt: string;
  updatedBy: number | null;
};

const SOP_COLS = `id, title, area, owner_id::int as "ownerId", purpose, steps, links, ${day("updated_at")} as "updatedAt",
  coalesce((extra->>'updatedById')::int, created_by::int) as "updatedBy"`;

export async function listSops(): Promise<Sop[]> {
  return (await (await db()).query(`select ${SOP_COLS} from hq_sops order by title`)) as Sop[];
}

export async function getSop(id: string) {
  const rows = (await (await db()).query(`select ${SOP_COLS} from hq_sops where id = $1`, [id])) as Sop[];
  return rows[0] ?? null;
}

export async function saveSop(id: string | null, s: Pick<Sop, "title" | "area" | "ownerId" | "purpose" | "steps" | "links">, by: number) {
  const sid = id ?? newId();
  await (await db()).query(
    `insert into hq_sops (id, title, area, owner_id, purpose, steps, links, created_by, extra) values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, jsonb_build_object('updatedById', $8::bigint))
     on conflict (id) do update set title = excluded.title, area = excluded.area, owner_id = excluded.owner_id, purpose = excluded.purpose,
       steps = excluded.steps, links = excluded.links, updated_at = now(), extra = hq_sops.extra || jsonb_build_object('updatedById', $8::bigint)`,
    [sid, s.title, s.area, s.ownerId, s.purpose, JSON.stringify(s.steps), JSON.stringify(s.links), by],
  );
  return sid;
}

export async function deleteSop(id: string) {
  await (await db()).query(`delete from hq_sops where id = $1`, [id]);
}

/* ── Settings ────────────────────────────────────────────────────────── */

export type Workday = { start: string; end: string; fullHours: number; halfHours: number; grace: number };
export type GeneralSettings = {
  annualGoal?: number;
  monthlyGoal?: number;
  dataFeed?: string;
  studioDesk?: string;
  fx?: Partial<Record<"USD" | "GBP" | "EUR" | "CAD", number>>;
  workday?: Partial<Workday>;
  lastBackup?: string;
  mktPillars?: string[];
};

/** HQ version 24's working day: 9 to 5, a full day is 9 hours worked, a half day 4 hours 15. */
export const WORKDAY_DEFAULTS: Workday = { start: "09:00", end: "17:00", fullHours: 9, halfHours: 4.25, grace: 15 };

export async function getGeneral(): Promise<GeneralSettings> {
  const rows = await (await db()).query(`select value from hq_settings where key = 'general'`);
  return (rows[0]?.value as GeneralSettings) ?? {};
}

/** Merges into settings/general, one level deep for fx and workday. */
export async function patchGeneral(patch: GeneralSettings, by: number) {
  const cur = await getGeneral();
  const next: GeneralSettings = { ...cur, ...patch };
  if (patch.fx) next.fx = { ...cur.fx, ...patch.fx };
  if (patch.workday) next.workday = { ...cur.workday, ...patch.workday };
  await (await db()).query(
    `insert into hq_settings (key, value, updated_by) values ('general', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [JSON.stringify(next), by],
  );
  return next;
}

/* ── Backup ──────────────────────────────────────────────────────────── */

/** Every table HQ keeps, for the owner's JSON backup. Passwords and sign-in sessions are never included. */
export async function backupData() {
  const q = await db();
  const tables = (await q.query(
    `select table_name as name from information_schema.tables where table_schema = 'public'
       and (table_name like 'hq\\_%' or table_name like 'vs\\_%' or table_name = 'desk_audit') order by table_name`,
  )) as { name: string }[];
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) out[name] = await q.query(`select * from ${name}`);
  out.people = await q.query(
    `select id, email, name, roles, active, title, hours, whatsapp, notify_email, notify_mode, pattern, joined_at, kpi_self, hq_uid, extra from desk_users`,
  );
  return out;
}
