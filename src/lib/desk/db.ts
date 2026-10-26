import "server-only";
import { neon } from "@neondatabase/serverless";
import {
  type Application,
  type ApplicationEdit,
  type DeskData,
  type EditableSetting,
  type Lead,
  type LeadFlag,
  type Settings,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  STATUSES,
  amount,
  nowStamp,
} from "./model";
import { derivedSettings } from "./logic";

// The Visibility Session backend lives in Neon Postgres. DATABASE_URL is set in .env.local
// (never committed) and in the host's environment settings.

export class NotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Add the Neon connection string to .env.local or the host's environment.");
  }
}

function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new NotConfiguredError();
  return neon(url);
}

const SCHEMA = [
  `create table if not exists vs_applications (
    id text primary key,
    submitted timestamptz not null default now(),
    name text not null default '',
    role text not null default '',
    company text not null default '',
    site text not null default '',
    email text not null default '',
    whatsapp text not null default '',
    moment text not null default '',
    timing text not null default '',
    budget text not null default '',
    decider text not null default '',
    worth text not null default '',
    route text not null default 'fit',
    source text not null default '',
    lookup_score integer,
    consent boolean not null default false,
    status text not null default 'New',
    owner text not null default '',
    session_date date,
    session_time text not null default '',
    first_reply timestamptz,
    review_link text not null default '',
    outcome text not null default '',
    deal_value bigint,
    follow_up date,
    notes text not null default '',
    updated timestamptz not null default now()
  )`,
  `create index if not exists vs_applications_status on vs_applications (status)`,
  `create index if not exists vs_applications_session on vs_applications (session_date)`,
  `create table if not exists vs_checklist_leads (
    id bigserial primary key,
    at timestamptz not null default now(),
    name text not null default '',
    email text not null default '',
    moment text not null default '',
    source text not null default '',
    email1_sent boolean not null default false,
    email2_sent boolean not null default false,
    applied boolean not null default false,
    notes text not null default ''
  )`,
  `create table if not exists vs_settings (
    key text primary key,
    value text not null default '',
    updated timestamptz not null default now(),
    updated_by text not null default ''
  )`,
  `create table if not exists desk_users (
    id bigserial primary key,
    email text not null unique,
    name text not null,
    role text not null default 'team',
    password_hash text not null,
    created timestamptz not null default now()
  )`,
  `create table if not exists desk_sessions (
    token_hash text primary key,
    user_id bigint not null references desk_users(id) on delete cascade,
    expires timestamptz not null
  )`,
];

let ready: Promise<void> | null = null;

/** Creates the tables on first use, and seeds the default settings without overwriting any. */
export function ensureSchema() {
  ready ??= (async () => {
    const db = sql();
    for (const stmt of SCHEMA) await db.query(stmt);
    const keys = Object.keys(SETTING_DEFAULTS);
    await db.query(
      `insert into vs_settings (key, value) select * from unnest($1::text[], $2::text[]) on conflict (key) do nothing`,
      [keys, keys.map((k) => SETTING_DEFAULTS[k as keyof Settings] ?? "")],
    );
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export async function db() {
  await ensureSchema();
  return sql();
}

/* ── Reading ─────────────────────────────────────────────────────────── */

// Dates and times are shown in Lagos time, the studio's working day.
const TZ = "Africa/Lagos";
const stampCol = (c: string) => `coalesce(to_char(${c} at time zone '${TZ}', 'YYYY-MM-DD HH24:MI'), '')`;
const dateCol = (c: string) => `coalesce(to_char(${c}, 'YYYY-MM-DD'), '')`;

// millisecond stamp of the last edit, so two people saving the same application can't overwrite each other
const VERSION = `(extract(epoch from updated) * 1000)::bigint::text`;

const APP_SELECT = `select id, ${stampCol("submitted")} as submitted, name, role, company, site, email, whatsapp,
  moment, timing as "when", budget, decider, worth, route, source, coalesce(lookup_score::text, '') as score, consent,
  status, owner, ${dateCol("session_date")} as "sessionDate", session_time as "sessionTime",
  ${stampCol("first_reply")} as "firstReply", review_link as "reviewLink", outcome,
  coalesce(deal_value::text, '') as "dealValue", ${dateCol("follow_up")} as "followUp", notes,
  ${stampCol("updated")} as updated, ${VERSION} as version from vs_applications`;

export async function getApplication(id: string) {
  const rows = (await (await db()).query(`${APP_SELECT} where id = $1`, [id])) as Application[];
  return rows[0] ?? null;
}

export async function loadDesk(): Promise<DeskData> {
  const q = await db();
  const [apps, leads, settingRows] = await Promise.all([
    q.query(`${APP_SELECT} order by submitted desc`) as Promise<unknown> as Promise<Application[]>,
    q.query(
      `select id, ${stampCol("at")} as at, name, email, moment, source, email1_sent as email1, email2_sent as email2, applied, notes
       from vs_checklist_leads order by at desc`,
    ) as Promise<unknown> as Promise<Lead[]>,
    q.query(`select key, value from vs_settings`) as Promise<unknown> as Promise<{ key: string; value: string }[]>,
  ]);
  const stored: Settings = {};
  for (const r of settingRows) if ((SETTING_KEYS as readonly string[]).includes(r.key)) stored[r.key as keyof Settings] = r.value;
  return { apps, leads, settings: derivedSettings(apps, stored), loadedAt: Date.now() };
}

/** The settings the public website may see. */
export async function publicSettings() {
  const { settings: s } = await loadDesk();
  return {
    sessions_per_month: Number(s.sessions_per_month) || 0,
    sessions_remaining: Number(s.sessions_remaining) || 0,
    applications_open: s.applications_open === "TRUE",
    waitlist_when_full: s.waitlist_when_full === "TRUE",
    minimum_monthly_budget: amount(s.minimum_monthly_budget),
    priority_from_band: s.priority_from_band ?? "",
    session_value: amount(s.session_value),
    site_seats_line: s.site_seats_line ?? "",
    booking_link: s.booking_link ?? "",
    whatsapp_number: s.whatsapp_number ?? "",
    client_slots_total: Number(s.client_slots_total) || 0,
    client_slots_left: Number(s.client_slots_left) || 0,
    site_clients_line: s.site_clients_line ?? "",
  };
}

/* ── Writing ─────────────────────────────────────────────────────────── */

const blankToNull = (v: string) => (v.trim() ? v.trim() : null);

/** Lagos-time stamps like "2026-10-26 14:05" from the desk. */
const stampToTs = (v: string) => (v.trim() ? `${v.trim().replace(" ", "T")}:00+01:00` : null);

export function newApplicationId(d = new Date()) {
  const ymd = nowStamp(d).slice(2, 10).replace(/-/g, "");
  return `VS-${ymd}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export type NewApplication = Omit<Application, "submitted" | "updated" | "version" | "score" | keyof ApplicationEdit> &
  Partial<ApplicationEdit> & { score?: number | null };

export async function insertApplication(a: NewApplication) {
  await (await db()).query(
    `insert into vs_applications (id, name, role, company, site, email, whatsapp, moment, timing, budget, decider, worth,
      route, source, lookup_score, consent, status, owner, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      a.id, a.name, a.role, a.company, a.site, a.email, a.whatsapp, a.moment, a.when, a.budget, a.decider, a.worth,
      a.route, a.source, a.score ?? null, a.consent, a.status ?? "New", a.owner ?? "", a.notes ?? "",
    ],
  );
}

export async function updateApplication(id: string, f: ApplicationEdit, expectedVersion: string) {
  const status = (STATUSES as readonly string[]).includes(f.status) ? f.status : "New";
  const rows = await (await db()).query(
    `update vs_applications set status=$2, owner=$3, session_date=$4::date, session_time=$5, first_reply=$6::timestamptz,
       review_link=$7, outcome=$8, deal_value=$9::bigint, follow_up=$10::date, notes=$11, updated=now()
     where id=$1 and ${VERSION} = $12 returning id`,
    [
      id, status, f.owner, blankToNull(f.sessionDate), f.sessionTime, stampToTs(f.firstReply), f.reviewLink.trim(),
      f.outcome.trim(), amount(f.dealValue) || null, blankToNull(f.followUp), f.notes, expectedVersion,
    ],
  );
  return rows.length > 0;
}

export async function deleteApplication(id: string) {
  await (await db()).query(`delete from vs_applications where id = $1`, [id]);
}

export async function insertLead(l: Pick<Lead, "name" | "email" | "moment" | "source">) {
  await (await db()).query(`insert into vs_checklist_leads (name, email, moment, source) values ($1,$2,$3,$4)`, [
    l.name, l.email, l.moment, l.source,
  ]);
}

const FLAG_COLS: Record<LeadFlag, string> = { email1: "email1_sent", email2: "email2_sent", applied: "applied" };

export async function setLeadFlag(id: number, flag: LeadFlag, value: boolean) {
  await (await db()).query(`update vs_checklist_leads set ${FLAG_COLS[flag]} = $2 where id = $1`, [id, value]);
}

export async function markLeadApplied(email: string) {
  await (await db()).query(`update vs_checklist_leads set applied = true where lower(email) = lower($1)`, [email]);
}

export async function deleteLead(id: number) {
  await (await db()).query(`delete from vs_checklist_leads where id = $1`, [id]);
}

export async function saveSettings(values: Partial<Record<EditableSetting, string>>, by: string) {
  const keys = Object.keys(values);
  if (!keys.length) return;
  await (await db()).query(
    `insert into vs_settings (key, value, updated, updated_by)
     select k, v, now(), $3 from unnest($1::text[], $2::text[]) as t(k, v)
     on conflict (key) do update set value = excluded.value, updated = now(), updated_by = excluded.updated_by`,
    [keys, keys.map((k) => values[k as EditableSetting] ?? ""), by],
  );
}
