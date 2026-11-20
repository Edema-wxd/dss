import { addDays, weekStart } from "./work";
import type { DayKind } from "./leave-model";

// Attendance, ported from HQ's x-time.js (version 24). Pure functions only. Times are ISO stamps
// written by the server; the working day is Lagos time (UTC+1 all year, no daylight saving).

export type Workday = { start: string; end: string; fullHours: number; halfHours: number; grace: number };
export type Seg = { in: string; out: string | null };
export type Brk = { start: string; end: string | null };
export type Eod = { doneText: string; blockers: string; tomorrow: string; mood: string; tasksDone: string[]; tactics: number };

export type TimeDay = {
  userId: number;
  day: string;
  segs: Seg[];
  breaks: Brk[];
  status: "in" | "break" | "out";
  late: number;
  mode: string;
  expectedMin: number | null;
  workedMin: number | null;
  eod: Eod | null;
  closedAt: string;
};

export const MOODS = ["😫 Rough", "😐 Okay", "🙂 Good", "🤩 Great"] as const;

/** Minutes inside the segments; an open one runs to `until` (now by default). */
export function segMins(segs: readonly Seg[], until: Date = new Date()) {
  return segs.reduce((t, s) => {
    const a = Date.parse(s.in);
    const b = s.out ? Date.parse(s.out) : until.getTime();
    return t + Math.max(0, (b - a) / 60000);
  }, 0);
}

/** Minutes worked on a day, live while the clock runs. */
export function workedMin(d: Pick<TimeDay, "segs" | "status" | "workedMin"> | null | undefined, now: Date = new Date()) {
  if (!d) return 0;
  if (d.status === "out" && d.workedMin !== null && d.workedMin !== undefined) return d.workedMin;
  return Math.round(segMins(d.segs, now));
}

/** The target for a kind of day, in minutes: a full day is 9 hours worked, a half day 4 hours 15, by default. */
export const expectedMin = (mode: DayKind | string, w: Workday) => (mode === "full" ? Math.round(w.fullHours * 60) : mode === "half" ? Math.round(w.halfHours * 60) : 0);

/** Minutes past midnight in Lagos for a stamp. */
export function lagosMinutes(iso: string) {
  const d = new Date(Date.parse(iso) + 3600e3);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "09:42" in Lagos. */
export function hhmm(iso: string | null | undefined) {
  if (!iso) return "";
  const m = lagosMinutes(iso);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** How late a first clock-in is, in minutes, on a working day. Within the grace period counts as on time. */
export function lateBy(firstIn: string, w: Workday, mode: DayKind | string) {
  if (mode !== "full" && mode !== "half") return 0;
  const late = lagosMinutes(firstIn) - toMin(w.start);
  return late > w.grace ? late : 0;
}

/** A Lagos wall-clock time on a day as an ISO stamp: for closing a day someone forgot to clock out of. */
export const lagosStamp = (day: string, time: string) => new Date(`${day}T${/^\d{2}:\d{2}$/.test(time) ? time : "17:00"}:00+01:00`).toISOString();

/** "7h 05m", "45m" */
export function fmtHM(n: number) {
  const m = Math.max(0, Math.round(Number(n) || 0));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m % 60}m`;
}

/** "9 hours", "4 hours 15 minutes" */
export function hrsText(h: number) {
  const m = Math.round((Number(h) || 0) * 60);
  const H = Math.floor(m / 60);
  const M = m % 60;
  return `${H} hour${H === 1 ? "" : "s"}${M ? ` ${M} minutes` : ""}`;
}

/** Earlier days still clocked in or on a break: they have to be closed first. */
export const missedClockOut = (days: readonly TimeDay[], today: string) =>
  days.filter((d) => d.day < today && (d.status === "in" || d.status === "break")).sort((a, b) => a.day.localeCompare(b.day));

/** Closes every open segment and break at `end`. */
export function closeAt(d: Pick<TimeDay, "segs" | "breaks">, end: string) {
  const segs = d.segs.map((s) => (s.out ? s : { ...s, out: end }));
  const last = segs.length ? segs[segs.length - 1].out! : end;
  const breaks = d.breaks.map((b) => (b.end ? b : { ...b, end: last }));
  return { segs, breaks };
}

/** Monday to Sunday of the week `offset` weeks from the one `today` is in. */
export function weekOf(today: string, offset = 0) {
  const mon = addDays(weekStart(today), offset * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** Who leads attendance: they see everyone's days, the rest see their own. */
export const SEES_TEAM_TIME = ["Owner", "Admin", "Operations (EA)", "Project Manager"] as const;
export const seesTeamTime = (roles: readonly string[]) => roles.some((r) => (SEES_TEAM_TIME as readonly string[]).includes(r));

/** The timesheet as CSV rows: hours per day, totals, expected hours, late days and reports sent. */
export function timesheetRows(
  week: readonly string[],
  people: readonly { id: number; name: string; roles: readonly string[] }[],
  dayOf: (id: number, d: string) => TimeDay | null,
  expected: (id: number, d: string) => number,
  now: Date = new Date(),
) {
  const rows: (string | number)[][] = [["Name", "Role", ...week, "Total hours", "Expected hours", "Late days", "Reports sent"]];
  for (const p of people) {
    const ds = week.map((d) => dayOf(p.id, d));
    const hrs = (m: number) => (m / 60).toFixed(2);
    rows.push([
      p.name,
      p.roles.join(" + "),
      ...ds.map((x) => (x ? hrs(workedMin(x, now)) : "")),
      hrs(ds.reduce((t, x) => t + workedMin(x, now), 0)),
      hrs(week.reduce((t, d) => t + expected(p.id, d), 0)),
      ds.filter((x) => x?.late).length,
      ds.filter((x) => x?.eod).length,
    ]);
  }
  return rows;
}

export const toCsv = (rows: readonly (readonly (string | number)[])[]) => rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
