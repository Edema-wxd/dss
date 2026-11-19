import "server-only";
import { db } from "../desk/db";
import { newId } from "./data";
import { type FieldMap, patchRow } from "./sales";
import type { Audience, DealUpdate, Deliverable, Goal, Rate, Social } from "./talent-model";

// Talent profiles, the brand tracker (deals), and Publicity (media and pitches).

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/* ── Talent ──────────────────────────────────────────────────────────── */

export type Talent = {
  id: string;
  name: string;
  category: string;
  status: string;
  package: string;
  commission: number | null;
  payFlow: string;
  managerId: number | null;
  coManager: string;
  startDate: string;
  trialEnds: string;
  terms: string;
  priorities: string;
  handles: string;
  bio: string;
  location: string;
  email: string;
  phone: string;
  mediaKit: string;
  goals: Goal[];
  interests: string[];
  industries: string[];
  avoid: string[];
  partners: string[];
  socials: Social[];
  audience: Audience | null;
  rates: Rate[];
  rateNotes: string;
  rateAt: string;
};

const TALENT_COLS = `id, name, category, status, package, commission, pay_flow as "payFlow", manager_id::int as "managerId", co_manager as "coManager",
  ${day("start_date")} as "startDate", ${day("trial_ends")} as "trialEnds", terms, priorities, handles, bio, location, email, phone,
  media_kit as "mediaKit", goals, interests, industries, avoid, partners, socials, audience, rates, rate_notes as "rateNotes", ${iso("rate_at")} as "rateAt"`;

const toTalent = (r: Record<string, unknown>) => ({ ...r, commission: num(r.commission), status: r.status || "signed" }) as Talent;

export async function listTalents(): Promise<Talent[]> {
  return (await (await db()).query(`select ${TALENT_COLS} from hq_talents order by name`)).map(toTalent);
}

export async function getTalent(id: string) {
  const rows = await (await db()).query(`select ${TALENT_COLS} from hq_talents where id = $1`, [id]);
  return rows[0] ? toTalent(rows[0]) : null;
}

const TALENT_FIELDS: FieldMap = {
  name: ["name", "text"],
  category: ["category", "text"],
  status: ["status", "text"],
  package: ["package", "text"],
  commission: ["commission", "numeric"],
  payFlow: ["pay_flow", "text"],
  managerId: ["manager_id", "bigint"],
  coManager: ["co_manager", "text"],
  startDate: ["start_date", "date"],
  trialEnds: ["trial_ends", "date"],
  terms: ["terms", "text"],
  priorities: ["priorities", "text"],
  handles: ["handles", "text"],
  bio: ["bio", "text"],
  location: ["location", "text"],
  email: ["email", "text"],
  phone: ["phone", "text"],
  mediaKit: ["media_kit", "text"],
  goals: ["goals", "jsonb"],
  interests: ["interests", "text[]"],
  industries: ["industries", "text[]"],
  avoid: ["avoid", "text[]"],
  partners: ["partners", "text[]"],
  socials: ["socials", "jsonb"],
  audience: ["audience", "jsonb"],
  rates: ["rates", "jsonb"],
  rateNotes: ["rate_notes", "text"],
  rateAt: ["rate_at", "timestamptz"],
};

export async function createTalent(t: Partial<Talent> & { name: string }, by: number) {
  const id = newId();
  await (await db()).query(`insert into hq_talents (id, name, created_by) values ($1, $2, $3)`, [id, t.name, by]);
  await patchRow("hq_talents", id, t, TALENT_FIELDS);
  return id;
}

export const updateTalent = (id: string, patch: Partial<Talent>) => patchRow("hq_talents", id, patch, TALENT_FIELDS);

export async function deleteTalent(id: string) {
  await (await db()).query(`delete from hq_talents where id = $1`, [id]);
}

/* ── Deals (the brand tracker) ───────────────────────────────────────── */

export type Deal = {
  id: string;
  talentId: string | null;
  brand: string;
  title: string;
  stage: string;
  health: string;
  contactId: string | null;
  contactPerson: string;
  contactRole: string;
  contactChannel: string;
  proposed: number | null;
  fee: number | null;
  received: number | null;
  currency: string;
  commissionPct: number | null;
  payFlow: string;
  ownerId: number | null;
  nextStep: string;
  nextDate: string;
  dueDate: string;
  deliverables: Deliverable[];
  updates: DealUpdate[];
  usage: string;
  notes: string;
};

const DEAL_COLS = `id, talent_id as "talentId", brand, title, stage, health, contact_id as "contactId", contact_person as "contactPerson",
  contact_role as "contactRole", contact_channel as "contactChannel", proposed, fee, received, currency, commission_pct as "commissionPct",
  pay_flow as "payFlow", owner_id::int as "ownerId", next_step as "nextStep", ${day("next_date")} as "nextDate", ${day("due_date")} as "dueDate",
  deliverables, updates, usage, notes`;

const toDeal = (r: Record<string, unknown>) =>
  ({ ...r, proposed: num(r.proposed), fee: num(r.fee), received: num(r.received), commissionPct: num(r.commissionPct), stage: r.stage || "prospect", health: r.health || "good" }) as Deal;

export async function listDeals(): Promise<Deal[]> {
  return (await (await db()).query(`select ${DEAL_COLS} from hq_deals order by next_date nulls last, brand`)).map(toDeal);
}

export async function getDeal(id: string) {
  const rows = await (await db()).query(`select ${DEAL_COLS} from hq_deals where id = $1`, [id]);
  return rows[0] ? toDeal(rows[0]) : null;
}

const DEAL_FIELDS: FieldMap = {
  talentId: ["talent_id", "text"],
  brand: ["brand", "text"],
  title: ["title", "text"],
  stage: ["stage", "text"],
  health: ["health", "text"],
  contactId: ["contact_id", "text"],
  contactPerson: ["contact_person", "text"],
  contactRole: ["contact_role", "text"],
  contactChannel: ["contact_channel", "text"],
  proposed: ["proposed", "numeric"],
  fee: ["fee", "numeric"],
  received: ["received", "numeric"],
  currency: ["currency", "text"],
  commissionPct: ["commission_pct", "numeric"],
  payFlow: ["pay_flow", "text"],
  ownerId: ["owner_id", "bigint"],
  nextStep: ["next_step", "text"],
  nextDate: ["next_date", "date"],
  dueDate: ["due_date", "date"],
  deliverables: ["deliverables", "jsonb"],
  updates: ["updates", "jsonb"],
  usage: ["usage", "text"],
  notes: ["notes", "text"],
};

export async function createDeal(d: Partial<Deal>, by: number) {
  const id = newId();
  await (await db()).query(`insert into hq_deals (id, created_by) values ($1, $2)`, [id, by]);
  await patchRow("hq_deals", id, d, DEAL_FIELDS);
  return id;
}

export const updateDeal = (id: string, patch: Partial<Deal>) => patchRow("hq_deals", id, patch, DEAL_FIELDS);

export async function deleteDeal(id: string) {
  await (await db()).query(`delete from hq_deals where id = $1`, [id]);
}

/* ── Publicity ───────────────────────────────────────────────────────── */

export type Media = {
  id: string;
  name: string;
  type: string;
  show: string;
  host: string;
  industries: string[];
  city: string;
  region: string;
  reach: string;
  cost: string;
  contactName: string;
  contactRole: string;
  email: string;
  phone: string;
  link: string;
  status: string;
  nextDate: string;
  ownerId: number | null;
  howToPitch: string;
  notes: string;
};

const MEDIA_COLS = `id, name, type, show, host, industries, city, region, reach, cost, contact_name as "contactName", contact_role as "contactRole",
  email, phone, link, status, ${day("next_date")} as "nextDate", owner_id::int as "ownerId", how_to_pitch as "howToPitch", notes`;

const MEDIA_FIELDS: FieldMap = {
  name: ["name", "text"],
  type: ["type", "text"],
  show: ["show", "text"],
  host: ["host", "text"],
  industries: ["industries", "text[]"],
  city: ["city", "text"],
  region: ["region", "text"],
  reach: ["reach", "text"],
  cost: ["cost", "text"],
  contactName: ["contact_name", "text"],
  contactRole: ["contact_role", "text"],
  email: ["email", "text"],
  phone: ["phone", "text"],
  link: ["link", "text"],
  status: ["status", "text"],
  nextDate: ["next_date", "date"],
  ownerId: ["owner_id", "bigint"],
  howToPitch: ["how_to_pitch", "text"],
  notes: ["notes", "text"],
};

export async function listMedia(): Promise<Media[]> {
  return (await (await db()).query(`select ${MEDIA_COLS} from hq_media order by next_date nulls last, name`)) as Media[];
}

export async function saveMedia(id: string | null, m: Partial<Media>, by: number) {
  const mid = id ?? newId();
  if (!id) await (await db()).query(`insert into hq_media (id, name, created_by) values ($1, $2, $3)`, [mid, m.name ?? "", by]);
  await patchRow("hq_media", mid, m, MEDIA_FIELDS);
  return mid;
}

export async function deleteMedia(id: string) {
  await (await db()).query(`delete from hq_media where id = $1`, [id]);
}

export type Pitch = {
  id: string;
  forKey: string;
  outletId: string | null;
  angle: string;
  status: string;
  pitchedOn: string;
  runDate: string;
  link: string;
  nextDate: string;
  ownerId: number | null;
  updates: DealUpdate[];
  createdAt: string;
};

const PITCH_COLS = `id, for_key as "forKey", outlet_id as "outletId", angle, status, ${day("pitched_on")} as "pitchedOn", ${day("run_date")} as "runDate",
  link, ${day("next_date")} as "nextDate", owner_id::int as "ownerId", updates, ${iso("created_at")} as "createdAt"`;

const PITCH_FIELDS: FieldMap = {
  forKey: ["for_key", "text"],
  outletId: ["outlet_id", "text"],
  angle: ["angle", "text"],
  status: ["status", "text"],
  pitchedOn: ["pitched_on", "date"],
  runDate: ["run_date", "date"],
  link: ["link", "text"],
  nextDate: ["next_date", "date"],
  ownerId: ["owner_id", "bigint"],
  updates: ["updates", "jsonb"],
};

export async function listPitches(): Promise<Pitch[]> {
  return (await (await db()).query(`select ${PITCH_COLS} from hq_pitches order by coalesce(run_date, pitched_on, created_at::date) desc`)) as Pitch[];
}

export async function getPitch(id: string) {
  const rows = (await (await db()).query(`select ${PITCH_COLS} from hq_pitches where id = $1`, [id])) as Pitch[];
  return rows[0] ?? null;
}

export async function savePitch(id: string | null, p: Partial<Pitch>, by: number) {
  const pid = id ?? newId();
  if (!id) await (await db()).query(`insert into hq_pitches (id, created_by) values ($1, $2)`, [pid, by]);
  await patchRow("hq_pitches", pid, p, PITCH_FIELDS);
  return pid;
}

export async function deletePitch(id: string) {
  await (await db()).query(`delete from hq_pitches where id = $1`, [id]);
}
