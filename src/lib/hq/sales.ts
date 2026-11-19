import "server-only";
import { db } from "../desk/db";
import { newId } from "./data";
import type { Onboarding } from "./sales-model";

// Clients, CRM contacts, contracts and their timelines. Callers check access first.

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

type FieldMap = Record<string, readonly [column: string, cast: string]>;

/** Updates only the fields given. Blank dates and numbers become null. */
async function patchRow(table: string, id: string, patch: Record<string, unknown>, fields: FieldMap) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const [k, v] of Object.entries(patch)) {
    const f = fields[k];
    if (!f) continue;
    const [col, cast] = f;
    const value = cast === "jsonb" ? JSON.stringify(v ?? null) : v === "" && cast !== "text" ? null : v;
    params.push(value);
    sets.push(`${col} = $${params.length}::${cast}`);
  }
  if (!sets.length) return;
  await (await db()).query(`update ${table} set ${sets.join(", ")}, updated_at = now() where id = $1`, params);
}

/* ── Timelines (the shared activity log) ─────────────────────────────── */

export type TimelineEntry = { id: number; at: string; actor: string; type: string; text: string };

/** Adds a line to a record's timeline, which is also the Activity log. */
export async function logActivity(actor: { id: number; name: string; email: string }, refType: string, refId: string, type: string, text: string) {
  await (await db()).query(
    `insert into desk_audit (actor, actor_email, actor_id, action, target, summary, ref_type, ref_id) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [actor.name, actor.email, actor.id, `activity.${type}`, `${refType}:${refId}`, text.slice(0, 1000), refType, refId],
  );
}

export async function timeline(refType: string, refId: string): Promise<TimelineEntry[]> {
  const rows = await (await db()).query(
    `select id::int, ${iso("at")} as at, actor, coalesce(nullif(split_part(action, '.', 2), ''), action) as type, summary as text
     from desk_audit where ref_type = $1 and ref_id = $2 order by at desc limit 60`,
    [refType, refId],
  );
  return rows as TimelineEntry[];
}

/** How many follow-ups each person logged since a date (calls, WhatsApp, email, meetings), for KPIs. */
export async function touchesSince(since: string) {
  const rows = await (await db()).query(
    `select actor_id::int as "userId", count(*)::int as n from desk_audit
     where ref_type = 'contact' and action in ('activity.call', 'activity.whatsapp', 'activity.email', 'activity.meeting')
       and (at at time zone 'Africa/Lagos')::date >= $1::date and actor_id is not null group by actor_id`,
    [since],
  );
  return new Map(rows.map((r) => [Number(r.userId), Number(r.n)]));
}

/* ── Clients ─────────────────────────────────────────────────────────── */

export type Client = {
  id: string;
  name: string;
  service: string;
  status: string;
  health: string;
  fee: number | null;
  currency: string;
  billing: string;
  payMode: string;
  payDay: number | null;
  startDate: string;
  endDate: string;
  leadId: number | null;
  pointId: number | null;
  nextDeliverable: string;
  nextDate: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  links: { drive?: string; portal?: string; contract?: string };
  notes: string;
  onb: Onboarding | null;
  leavingOn: string;
};

const CLIENT_COLS = `id, name, service, status, health, fee, currency, billing, pay_mode as "payMode", pay_day as "payDay",
  ${day("start_date")} as "startDate", ${day("end_date")} as "endDate", lead_id::int as "leadId", point_id::int as "pointId",
  next_deliverable as "nextDeliverable", ${day("next_date")} as "nextDate", contact_name as "contactName", contact_role as "contactRole",
  email, phone, links, notes, onb, coalesce(extra->'offb'->>'lastDay', '') as "leavingOn"`;

const toClient = (r: Record<string, unknown>) => ({ ...r, fee: num(r.fee), billing: r.billing || "monthly", status: r.status || "active" }) as Client;

export async function listClientsFull(): Promise<Client[]> {
  return (await (await db()).query(`select ${CLIENT_COLS} from hq_clients order by name`)).map(toClient);
}

export async function getClient(id: string) {
  const rows = await (await db()).query(`select ${CLIENT_COLS} from hq_clients where id = $1`, [id]);
  return rows[0] ? toClient(rows[0]) : null;
}

const CLIENT_FIELDS: FieldMap = {
  name: ["name", "text"],
  service: ["service", "text"],
  status: ["status", "text"],
  health: ["health", "text"],
  fee: ["fee", "numeric"],
  currency: ["currency", "text"],
  billing: ["billing", "text"],
  payMode: ["pay_mode", "text"],
  payDay: ["pay_day", "integer"],
  startDate: ["start_date", "date"],
  endDate: ["end_date", "date"],
  leadId: ["lead_id", "bigint"],
  pointId: ["point_id", "bigint"],
  nextDeliverable: ["next_deliverable", "text"],
  nextDate: ["next_date", "date"],
  contactName: ["contact_name", "text"],
  contactRole: ["contact_role", "text"],
  email: ["email", "text"],
  phone: ["phone", "text"],
  links: ["links", "jsonb"],
  notes: ["notes", "text"],
  onb: ["onb", "jsonb"],
};

export async function createClient(c: Partial<Client> & { name: string }, by: number) {
  const id = newId();
  await (await db()).query(`insert into hq_clients (id, name, created_by) values ($1, $2, $3)`, [id, c.name, by]);
  await patchRow("hq_clients", id, { health: "good", links: {}, ...c }, CLIENT_FIELDS);
  return id;
}

export const updateClient = (id: string, patch: Partial<Client>) => patchRow("hq_clients", id, patch, CLIENT_FIELDS);

export async function deleteClient(id: string) {
  await (await db()).query(`delete from hq_clients where id = $1`, [id]);
}

/* ── CRM contacts ────────────────────────────────────────────────────── */

export type Contact = {
  id: string;
  kind: string;
  name: string;
  company: string;
  role: string;
  industry: string;
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  linkedin: string;
  website: string;
  location: string;
  stage: string;
  ownerId: number | null;
  nextDate: string;
  nextAction: string;
  lastTouch: string;
  service: string;
  relType: string;
  value: number | null;
  currency: string;
  source: string;
  tags: string[];
  talentIds: string[];
  clientId: string | null;
  applicationId: string | null;
  wonAt: string;
  batch: string;
  notes: string;
  createdAt: string;
};

const CONTACT_COLS = `id, kind, name, company, role, industry, email, phone, whatsapp, instagram, linkedin, website, location, stage,
  owner_id::int as "ownerId", ${day("next_date")} as "nextDate", next_action as "nextAction", ${iso("last_touch")} as "lastTouch",
  service, rel_type as "relType", value, currency, source, tags, talent_ids as "talentIds", client_id as "clientId",
  application_id as "applicationId", ${iso("won_at")} as "wonAt", batch, notes, ${iso("created_at")} as "createdAt"`;

const toContact = (r: Record<string, unknown>) => ({ ...r, value: num(r.value), kind: r.kind || "sales" }) as Contact;

export async function listContactsFull(kind?: string): Promise<Contact[]> {
  const rows = await (await db()).query(`select ${CONTACT_COLS} from hq_contacts ${kind ? "where kind = $1" : ""} order by next_date nulls last, name`, kind ? [kind] : []);
  return rows.map(toContact);
}

export async function getContact(id: string) {
  const rows = await (await db()).query(`select ${CONTACT_COLS} from hq_contacts where id = $1`, [id]);
  return rows[0] ? toContact(rows[0]) : null;
}

const CONTACT_FIELDS: FieldMap = {
  kind: ["kind", "text"],
  name: ["name", "text"],
  company: ["company", "text"],
  role: ["role", "text"],
  industry: ["industry", "text"],
  email: ["email", "text"],
  phone: ["phone", "text"],
  whatsapp: ["whatsapp", "text"],
  instagram: ["instagram", "text"],
  linkedin: ["linkedin", "text"],
  website: ["website", "text"],
  location: ["location", "text"],
  stage: ["stage", "text"],
  ownerId: ["owner_id", "bigint"],
  nextDate: ["next_date", "date"],
  nextAction: ["next_action", "text"],
  lastTouch: ["last_touch", "timestamptz"],
  service: ["service", "text"],
  relType: ["rel_type", "text"],
  value: ["value", "numeric"],
  currency: ["currency", "text"],
  source: ["source", "text"],
  tags: ["tags", "text[]"],
  talentIds: ["talent_ids", "text[]"],
  clientId: ["client_id", "text"],
  wonAt: ["won_at", "timestamptz"],
  notes: ["notes", "text"],
};

export async function createContact(c: Partial<Contact> & { name: string }, by: number) {
  const id = newId();
  await (await db()).query(`insert into hq_contacts (id, name, created_by) values ($1, $2, $3)`, [id, c.name, by]);
  await patchRow("hq_contacts", id, c, CONTACT_FIELDS);
  return id;
}

export const updateContact = (id: string, patch: Partial<Contact>) => patchRow("hq_contacts", id, patch, CONTACT_FIELDS);

export async function deleteContact(id: string) {
  await (await db()).query(`delete from hq_contacts where id = $1`, [id]);
}

/* ── Contracts ───────────────────────────────────────────────────────── */

export type Contract = {
  id: string;
  kind: string;
  status: string;
  clientId: string | null;
  talentId: string | null;
  party: string;
  title: string;
  start: string;
  end: string;
  renewal: string;
  noticeDays: number;
  value: number | null;
  period: string;
  currency: string;
  ownerId: number | null;
  link: string;
  notes: string;
  history: { start: string; end: string; value: number | null; at: string }[];
};

const CONTRACT_COLS = `id, kind, status, client_id as "clientId", talent_id as "talentId", party, title, ${day("start_date")} as start,
  ${day("end_date")} as "end", renewal, notice_days as "noticeDays", value, period, currency, owner_id::int as "ownerId", link, notes, history`;

const toContract = (r: Record<string, unknown>) => ({ ...r, value: num(r.value), noticeDays: Number(r.noticeDays ?? 30) }) as Contract;

export async function listContracts(): Promise<Contract[]> {
  return (await (await db()).query(`select ${CONTRACT_COLS} from hq_contracts order by end_date nulls last`)).map(toContract);
}

export async function getContract(id: string) {
  const rows = await (await db()).query(`select ${CONTRACT_COLS} from hq_contracts where id = $1`, [id]);
  return rows[0] ? toContract(rows[0]) : null;
}

const CONTRACT_FIELDS: FieldMap = {
  kind: ["kind", "text"],
  status: ["status", "text"],
  clientId: ["client_id", "text"],
  talentId: ["talent_id", "text"],
  party: ["party", "text"],
  title: ["title", "text"],
  start: ["start_date", "date"],
  end: ["end_date", "date"],
  renewal: ["renewal", "text"],
  noticeDays: ["notice_days", "integer"],
  value: ["value", "numeric"],
  period: ["period", "text"],
  currency: ["currency", "text"],
  ownerId: ["owner_id", "bigint"],
  link: ["link", "text"],
  notes: ["notes", "text"],
  history: ["history", "jsonb"],
};

export async function saveContract(id: string | null, c: Partial<Contract>, by: number) {
  const cid = id ?? newId();
  if (!id) await (await db()).query(`insert into hq_contracts (id, created_by) values ($1, $2)`, [cid, by]);
  await patchRow("hq_contracts", cid, c, CONTRACT_FIELDS);
  return cid;
}

export async function deleteContract(id: string) {
  await (await db()).query(`delete from hq_contracts where id = $1`, [id]);
}

/** Ends every contract for a client that isn't already ended. */
export async function endClientContracts(clientId: string) {
  await (await db()).query(`update hq_contracts set status = 'ended', updated_at = now() where client_id = $1 and status <> 'ended'`, [clientId]);
}

/* ── Onboarding template ─────────────────────────────────────────────── */

export async function getOnbTemplate() {
  const rows = await (await db()).query(`select value from hq_settings where key = 'onboarding'`);
  return (rows[0]?.value?.steps as { t: string; day: number; who: "lead" | "point" }[] | undefined) ?? null;
}

export async function saveOnbTemplate(steps: { t: string; day: number; who: string }[], by: number) {
  await (await db()).query(
    `insert into hq_settings (key, value, updated_by) values ('onboarding', $1::jsonb, $2)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [JSON.stringify({ steps, updatedAt: new Date().toISOString(), by }), by],
  );
}
