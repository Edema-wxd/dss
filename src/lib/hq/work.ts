// Day-to-day work logic shared by the server and the browser: Lagos dates, the capture bar,
// repeating tasks, carrying work to the next day, and KPI scores. Ported from HQ's
// d-today.js, l-actions.js and h-ops.js. Pure functions only, so they're easy to test.

/* ── Dates (always the studio's day: Africa/Lagos) ───────────────────── */

const TZ = "Africa/Lagos";

/** Today's date in Lagos as YYYY-MM-DD, whatever the server's clock zone. */
export function lagosToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The hour (0 to 23) in Lagos. */
export function lagosHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
}

const parse = (key: string) => new Date(`${key}T12:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (key: string, n: number) => {
  const d = parse(key);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};

/** 0 is Sunday, as JavaScript counts. */
export const weekday = (key: string) => parse(key).getUTCDay();

/** The next Monday to Friday after `key`. */
export function nextWorkingDay(key: string) {
  let k = addDays(key, 1);
  while ([0, 6].includes(weekday(k))) k = addDays(k, 1);
  return k;
}

/** The Monday of the week `key` falls in. */
export const weekStart = (key: string) => addDays(key, -((weekday(key) + 6) % 7));

export function addMonths(key: string, n: number) {
  const d = parse(key);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return fmt(d);
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Today", "Tomorrow", "Yesterday", "Friday" (within a week), or "3 Dec". */
export function relDay(key: string, today: string) {
  if (!key) return "";
  // no today to compare with: just the date
  if (!today) return parse(key).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  if (key === addDays(today, -1)) return "Yesterday";
  const diff = Math.round((parse(key).getTime() - parse(today).getTime()) / 864e5);
  if (diff > 1 && diff < 7) return DAY_NAMES[weekday(key)];
  return parse(key).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export const longDate = (key: string) =>
  parse(key).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function minutes(m: number | null | undefined) {
  if (!m) return "";
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

/* ── Tasks ───────────────────────────────────────────────────────────── */

export const TASK_STATUS = [
  ["todo", "To do"],
  ["doing", "In progress"],
  ["review", "In review"],
  ["done", "Done"],
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number][0];

export const PRIORITIES = [
  ["top", "Top"],
  ["high", "High"],
  ["normal", "Normal"],
] as const;

export const ESTIMATES: readonly [number, string][] = [
  [15, "15 min"],
  [30, "30 min"],
  [60, "1 hour"],
  [90, "1.5 hours"],
  [120, "2 hours"],
  [180, "3 hours"],
  [240, "Half day"],
  [480, "Full day"],
];

export const REPEATS = [
  ["", "Doesn't repeat"],
  ["daily", "Every weekday"],
  ["weekly", "Every week"],
  ["monthly", "Every month"],
] as const;

export type TaskLike = { id: string; title: string; due: string; priority: string; status: string };

const PRIORITY_RANK: Record<string, number> = { top: 0, high: 1, normal: 2 };

/** Due date first (undated last), then priority, then title. */
export function sortTasks<T extends TaskLike>(list: readonly T[]) {
  return [...list].sort(
    (a, b) =>
      (a.due || "9999").localeCompare(b.due || "9999") ||
      (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
      a.title.localeCompare(b.title),
  );
}

/** When a repeating task is ticked off, the next copy is due on this date. */
export function nextRepeat(repeat: string, due: string, today: string) {
  const base = due || today;
  if (repeat === "weekly") return addDays(base, 7);
  if (repeat === "monthly") return addMonths(base, 1);
  if (repeat === "daily") return nextWorkingDay(base);
  return null;
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * The capture bar: "Call Ada tomorrow!" becomes a top-priority task due tomorrow.
 * Understands today, tonight, tomorrow, next week, a weekday ("friday", "on fri"), "!" for top
 * priority, and a client's name.
 */
export function parseCapture(input: string, today: string, clients: readonly { id: string; name: string }[] = []) {
  let due: string | null = null;
  let priority = "normal";
  let s = input;
  const nextOn = (ix: number) => {
    for (let i = 1; i <= 7; i++) if (weekday(addDays(today, i)) === ix) return addDays(today, i);
    return today;
  };
  s = s
    .replace(/\b(today|tonight)\b/i, () => ((due = today), ""))
    .replace(/\btomorrow\b/i, () => ((due = addDays(today, 1)), ""))
    .replace(/\bnext week\b/i, () => ((due = addDays(today, 7)), ""))
    .replace(/\b(?:on\s+|by\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (_, d: string) => ((due = nextOn(WEEKDAYS.indexOf(d.slice(0, 3).toLowerCase()))), ""))
    .replace(/\b(?:on|by)\s+(mon|tue|wed|thu|fri|sat|sun)\b/i, (_, d: string) => ((due = nextOn(WEEKDAYS.indexOf(d.toLowerCase()))), ""));
  if (s.includes("!")) {
    priority = "top";
    s = s.replace(/!+/g, "");
  }
  const low = s.toLowerCase();
  const client = clients.find((c) => {
    const firstWord = c.name.split(" ")[0].toLowerCase().replace(/[^\w]/g, "");
    return low.includes(c.name.toLowerCase()) || (firstWord.length >= 4 && new RegExp(`\\b${firstWord}\\b`).test(low));
  });
  const title = s.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
  return { title, due, priority, clientId: client?.id ?? null };
}

/* ── Procedures ──────────────────────────────────────────────────────── */

export const SOP_AREAS = ["Clients", "Content", "Talent", "Sales", "Finance", "Admin", "Tools"] as const;

/* ── KPIs ────────────────────────────────────────────────────────────── */

export const KPI_UNITS = [
  ["number", "Number"],
  ["percent", "Percent"],
  ["naira", "Naira"],
] as const;
export const KPI_PERIODS = [
  ["week", "Weekly"],
  ["month", "Monthly"],
  ["quarter", "Quarterly"],
] as const;
export const KPI_SOURCES = [
  ["manual", "Person logs it"],
  ["auto_tasks", "Auto: tasks completed"],
  ["auto_touches", "Auto: CRM follow-ups logged"],
  ["auto_won", "Auto: sales won"],
  ["auto_revenue", "Auto: DSS revenue (same as Finance)"],
] as const;

/** HQ's starter KPIs per role: [title, unit, target, period, source]. */
export const KPI_TEMPLATES: Record<string, [string, string, number, string, string][]> = {
  "Operations (EA)": [["Invoices sent by the 1st working day", "percent", 100, "month", "manual"], ["Client messages answered within 24 hours", "percent", 100, "week", "manual"], ["Prospects researched and qualified", "number", 20, "week", "manual"], ["Tasks completed", "number", 15, "week", "auto_tasks"]],
  "Assistant (VA)": [["Brand outreach and follow-ups logged", "number", 30, "week", "auto_touches"], ["Content ideas submitted", "number", 10, "week", "manual"], ["Tasks completed", "number", 15, "week", "auto_tasks"]],
  Strategist: [["Deliverables delivered on time", "percent", 95, "month", "manual"], ["Client health on track", "percent", 100, "month", "manual"], ["Tasks completed", "number", 15, "week", "auto_tasks"]],
  "Talent Manager": [["Brands pitched or followed up", "number", 20, "week", "auto_touches"], ["Talent deals closed", "number", 2, "month", "manual"], ["Talent deal value closed", "naira", 5000000, "month", "manual"]],
  Owner: [["DSS revenue", "naira", 20000000, "month", "auto_revenue"], ["New clients won", "number", 2, "month", "auto_won"], ["Visibility Sessions held", "number", 8, "month", "manual"]],
  Contractor: [["Deliverables delivered on time", "percent", 100, "month", "manual"], ["Tasks completed", "number", 10, "week", "auto_tasks"]],
  Operations: [["Client deliverables on time", "percent", 95, "month", "manual"], ["Tasks completed", "number", 15, "week", "auto_tasks"], ["Contracts renewed before the notice date", "percent", 100, "month", "manual"]],
  "Project Manager": [["Projects delivered on time", "percent", 95, "month", "manual"], ["Overdue tasks across the team", "number", 3, "week", "manual"], ["Client updates logged each week", "number", 5, "week", "manual"]],
  Sales: [["Follow-ups logged", "number", 30, "week", "auto_touches"], ["Discovery calls booked", "number", 6, "month", "manual"], ["Proposals sent", "number", 4, "month", "manual"], ["New clients won", "number", 2, "month", "auto_won"]],
  Contributor: [["Deliverables delivered on time", "percent", 100, "month", "manual"], ["Tasks completed", "number", 10, "week", "auto_tasks"]],
  Admin: [["Tasks completed", "number", 15, "week", "auto_tasks"], ["Client health on track", "percent", 100, "month", "manual"], ["Follow-ups logged", "number", 25, "week", "auto_touches"]],
  Finance: [["Expenses logged within 48 hours", "percent", 100, "month", "manual"], ["Invoices sent by the 1st working day", "percent", 100, "month", "manual"], ["Month closed and report filed by the 5th", "percent", 100, "month", "manual"]],
  Marketing: [["Posts published as planned", "percent", 90, "month", "manual"], ["Leads from marketing", "number", 10, "month", "manual"], ["Monthly insights logged by the 3rd", "percent", 100, "month", "manual"], ["Tasks completed", "number", 12, "week", "auto_tasks"]],
};

/** The first day of the KPI period that contains `today`. */
export function periodStart(period: string, today: string) {
  if (period === "week") return weekStart(today);
  if (period === "quarter") {
    const m = Number(today.slice(5, 7));
    return `${today.slice(0, 4)}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  }
  return `${today.slice(0, 7)}-01`;
}

/** HQ's key for one period's logged number, for example "month:2026-11-01". */
export const periodKey = (period: string, today: string) => `${period}:${periodStart(period, today)}`;

/** Percent of target. Lower-is-better KPIs score 100 at or under target. */
export function kpiPercent(actual: number | null, target: number, direction: string) {
  if (actual === null) return 0;
  if (direction === "down") return Math.round(actual <= 0 ? 100 : (target / actual) * 100);
  return Math.round(target ? (actual / target) * 100 : 0);
}

/** A person's score: the weighted average of their KPIs, each capped at 120%. Null with no KPIs. */
export function personScore(kpis: readonly { pct: number; weight: number | null }[]) {
  if (!kpis.length) return null;
  let w = 0;
  let s = 0;
  for (const k of kpis) {
    const wt = k.weight || 1;
    w += wt;
    s += Math.min(120, k.pct) * wt;
  }
  return w ? Math.round(s / w) : null;
}

export function formatKpi(unit: string, v: number | null) {
  if (v === null || v === undefined) return "-";
  if (unit === "percent") return `${Math.round(v)}%`;
  if (unit === "naira") return compactNaira(v);
  return String(Math.round(v * 10) / 10);
}

export function compactNaira(n: number) {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${Math.round((a / 1e6) * 10) / 10}M` : a >= 1e3 ? `${Math.round(a / 1e3)}k` : String(Math.round(a));
  return `${n < 0 ? "-" : ""}₦${s}`;
}
