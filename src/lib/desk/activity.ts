import "server-only";
import { headers } from "next/headers";
import { type ActivityChange, type ActivityEntry, type ActivityKind, type Application, EDIT_KEYS, EDIT_LABELS } from "./model";
import { db } from "./db";

// The activity log: who did what on the desk, and what arrived from the website, with the
// time it happened. Entries are only ever added. A failure to write one is reported to the
// server log and never stops the change itself.

export type Actor = { name: string; email?: string } | "Website";

const TZ = "Africa/Lagos";
const MAX_VALUE = 400;
const clip = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s;
};

/** The visitor's address, as passed on by the host's proxy. */
export async function requestIp() {
  try {
    const h = await headers();
    return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim().slice(0, 64);
  } catch {
    return "";
  }
}

export async function logActivity(
  actor: Actor,
  kind: ActivityKind,
  summary: string,
  opts: { target?: string; changes?: ActivityChange[]; ip?: string } = {},
) {
  const who = actor === "Website" ? { name: "Website", email: "" } : actor;
  const changes = (opts.changes ?? []).map((c) => ({ field: c.field, from: clip(c.from), to: clip(c.to) }));
  try {
    await (await db()).query(
      `insert into desk_activity (actor, actor_email, kind, target, summary, changes, ip) values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [who.name, who.email ?? "", kind, opts.target ?? "", summary.slice(0, 500), JSON.stringify(changes), opts.ip ?? ""],
    );
  } catch (e) {
    console.error("activity log", e);
  }
}

export const ACTIVITY_PAGE = 300;

/** The newest entries, or the ones before a given entry when paging back. */
export async function listActivity(before?: number, limit = ACTIVITY_PAGE): Promise<ActivityEntry[]> {
  const rows = (await (await db()).query(
    `select id::int, to_char(at at time zone '${TZ}', 'YYYY-MM-DD HH24:MI:SS') as at,
       (extract(epoch from at) * 1000)::bigint::float8 as ms,
       actor, actor_email as "actorEmail", kind, target, summary, changes, ip
     from desk_activity
     where ($1::bigint is null or id < $1)
     order by id desc
     limit $2`,
    [before ?? null, limit],
  )) as ActivityEntry[];
  return rows.map((r) => ({ ...r, changes: Array.isArray(r.changes) ? r.changes : [] }));
}

/* ── Describing changes ─────────────────────────────────────────────── */

/** The fields that differ between two versions of the same record. */
export function diff<K extends string>(before: Partial<Record<K, unknown>>, after: Partial<Record<K, unknown>>, labels: Record<K, string>) {
  const out: ActivityChange[] = [];
  for (const k of Object.keys(labels) as K[]) {
    const from = String(before[k] ?? "");
    const to = String(after[k] ?? "");
    if (from !== to) out.push({ field: labels[k], from, to });
  }
  return out;
}

export const applicationChanges = (before: Application, after: Application) =>
  diff(pick(before), pick(after), EDIT_LABELS);

const pick = (a: Application) => Object.fromEntries(EDIT_KEYS.map((k) => [k, a[k]])) as Record<(typeof EDIT_KEYS)[number], string>;

/** "Ada Obi (Acme)", the way the log names an application. */
export const appLabel = (a: Pick<Application, "name" | "company">) => (a.company ? `${a.name} (${a.company})` : a.name);
