import "server-only";
import { db } from "../desk/db";
import { WORKDAY_DEFAULTS, getGeneral } from "./data";
import { listLeave, listTeamPatterns } from "./leave";
import { dayMode } from "./leave-model";
import { type Eod, type TimeDay, type Workday, closeAt, expectedMin, lateBy, segMins } from "./time-model";

// Attendance rows (hq_time), one per person per day. Every stamp is the server's clock, so
// hours can't be moved by changing a laptop's time. Each person writes only their own days.

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;
const COLS = `user_id::int as "userId", ${day("day")} as day, segs, breaks, status, late, mode, expected_min as "expectedMin", worked_min as "workedMin", eod, ${iso("closed_at")} as "closedAt"`;

export async function workday(): Promise<Workday> {
  const g = await getGeneral();
  const w = { ...WORKDAY_DEFAULTS, ...g.workday };
  return { start: String(w.start), end: String(w.end), fullHours: Number(w.fullHours) || 9, halfHours: Number(w.halfHours) || 4.25, grace: Number(w.grace) || 0 };
}

/** Days from `since` on, for some people (or everyone). */
export async function listTime(since: string, userIds?: readonly number[]): Promise<TimeDay[]> {
  const params: unknown[] = [since];
  let where = `day >= $1::date`;
  if (userIds) {
    params.push(userIds);
    where += ` and user_id = any($2::bigint[])`;
  }
  return (await (await db()).query(`select ${COLS} from hq_time where ${where} order by day`, params)) as TimeDay[];
}

export async function getDay(userId: number, d: string): Promise<TimeDay | null> {
  const rows = (await (await db()).query(`select ${COLS} from hq_time where user_id = $1 and day = $2::date`, [userId, d])) as TimeDay[];
  return rows[0] ?? null;
}

/** Earlier days left clocked in or on a break. */
export async function openPastDays(userId: number, today: string): Promise<TimeDay[]> {
  return (await (await db()).query(`select ${COLS} from hq_time where user_id = $1 and day < $2::date and status in ('in', 'break') order by day`, [userId, today])) as TimeDay[];
}

/** What kind of day it is for one person, from their week and the leave calendar. */
export async function modeFor(userId: number, d: string) {
  const [people, items] = await Promise.all([listTeamPatterns(), listLeave()]);
  const p = people.find((x) => x.id === userId);
  return p ? dayMode(items, userId, p.pattern, d) : "full";
}

const nowIso = async () => String((await (await db()).query(`select ${iso("now()")} as t`))[0].t);

export type ClockResult = { ok: true; late: number; day: TimeDay } | { ok: false; missed?: string; error: string };

/** Clock in, back from a break, or back in after clocking out. */
export async function clockIn(userId: number, today: string): Promise<ClockResult> {
  const missed = await openPastDays(userId, today);
  if (missed.length) return { ok: false, missed: missed[0].day, error: "Close the day you didn't clock out of first." };
  const now = await nowIso();
  const q = await db();
  const d = await getDay(userId, today);
  if (d) {
    if (d.status === "in") return { ok: true, late: 0, day: d };
    const segs = [...d.segs, { in: now, out: null }];
    const breaks = d.breaks.map((b) => (b.end ? b : { ...b, end: now }));
    await q.query(`update hq_time set segs = $3::jsonb, breaks = $4::jsonb, status = 'in' where user_id = $1 and day = $2::date`, [userId, today, JSON.stringify(segs), JSON.stringify(breaks)]);
    return { ok: true, late: 0, day: (await getDay(userId, today))! };
  }
  const [mode, w] = await Promise.all([modeFor(userId, today), workday()]);
  const late = lateBy(now, w, mode);
  // a double tap can race: the second insert does nothing
  await q.query(
    `insert into hq_time (user_id, day, segs, breaks, status, late, mode, expected_min) values ($1, $2::date, $3::jsonb, '[]', 'in', $4, $5, $6)
     on conflict (user_id, day) do nothing`,
    [userId, today, JSON.stringify([{ in: now, out: null }]), late, mode, expectedMin(mode, w)],
  );
  return { ok: true, late, day: (await getDay(userId, today))! };
}

export async function takeBreak(userId: number, today: string) {
  const d = await getDay(userId, today);
  if (!d || d.status !== "in") return false;
  const now = await nowIso();
  const segs = d.segs.map((s) => (s.out ? s : { ...s, out: now }));
  const breaks = [...d.breaks, { start: now, end: null }];
  await (await db()).query(`update hq_time set segs = $3::jsonb, breaks = $4::jsonb, status = 'break' where user_id = $1 and day = $2::date`, [
    userId,
    today,
    JSON.stringify(segs),
    JSON.stringify(breaks),
  ]);
  return true;
}

/**
 * Clock out and file the end-of-day report. Today ends now; an earlier day someone forgot to
 * close ends at the time they give (`end`). Returns the minutes worked.
 */
export async function closeDay(userId: number, d: string, eod: Eod, end: string | null) {
  const cur = (await getDay(userId, d)) ?? { segs: [], breaks: [], expectedMin: null };
  const stop = end ?? (await nowIso());
  const { segs, breaks } = closeAt(cur, stop);
  const worked = Math.round(segMins(segs));
  let expected = cur.expectedMin;
  if (expected === null || expected === undefined) expected = expectedMin(await modeFor(userId, d), await workday());
  await (await db()).query(
    `insert into hq_time (user_id, day, segs, breaks, status, worked_min, expected_min, eod, closed_at, mode)
     values ($1, $2::date, $3::jsonb, $4::jsonb, 'out', $5, $6, $7::jsonb, now(), '')
     on conflict (user_id, day) do update set segs = excluded.segs, breaks = excluded.breaks, status = 'out', worked_min = excluded.worked_min,
       expected_min = coalesce(hq_time.expected_min, excluded.expected_min), eod = excluded.eod, closed_at = now()`,
    [userId, d, JSON.stringify(segs), JSON.stringify(breaks), worked, expected, JSON.stringify(eod)],
  );
  return { worked, firstIn: segs[0]?.in ?? stop, end: stop };
}
