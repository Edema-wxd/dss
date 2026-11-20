import { money } from "./money";
import { addDays } from "./work";

// The 12-week plan, as HQ ran it. A cycle is 12 weeks from a Monday, with 1 to 3 measurable goals.
// Each person writes weekly tactics (the actions that move a goal) and ticks them off week by week.
// A week's score is the share of that week's tactics done. 85% or better is a winning week.
// Week 13 is for reviewing the cycle and planning the next.

export const PLAN_AREAS = [
  ["revenue", "Revenue", "rose"],
  ["clients", "Clients and delivery", "sky"],
  ["sales", "Sales and pipeline", "sunset"],
  ["marketing", "Marketing and brand", "lime"],
  ["talent", "Talent", "aqua"],
  ["ops", "Operations and team", "ink"],
  ["products", "Products", "rose"],
] as const;
export type AreaKey = (typeof PLAN_AREAS)[number][0];
export const areaOf = (k: string) => PLAN_AREAS.find((a) => a[0] === k) ?? PLAN_AREAS[5];

export const GOAL_SOURCES = [
  ["manual", "I'll update it"],
  ["revenue", "Confirmed monthly revenue (Finance)"],
  ["newclients", "New clients since the cycle began"],
  ["leads", "New CRM leads since the cycle began"],
  ["tasks", "Tasks completed since the cycle began"],
] as const;
export type GoalSource = (typeof GOAL_SOURCES)[number][0];
export const sourceLabel = (k: string) => GOAL_SOURCES.find((s) => s[0] === k)?.[1] ?? GOAL_SOURCES[0][1];

export const GOAL_UNITS = [
  ["count", "A number"],
  ["naira", "Naira"],
  ["%", "Percent"],
] as const;

export const CYCLE_STATUSES = [
  ["draft", "Draft: still planning"],
  ["active", "Active: the team is working it"],
  ["closed", "Closed"],
] as const;

export type Goal = {
  id: string;
  title: string;
  area: string;
  owner: number | null;
  measure: string;
  source: string;
  unit: string;
  base: number;
  target: number;
  current: number;
};

export type Cycle = {
  id: string;
  name: string;
  start: string;
  status: string;
  vision: string;
  target: number;
  goals: Goal[];
  review: { worked?: string; stop?: string; carry?: string };
};

export type Tactic = {
  id: string;
  userId: number;
  cycleId: string;
  goalId: string | null;
  title: string;
  weeks: number[];
  /** week number to when it was ticked */
  done: Record<string, string | null>;
  byId: number | null;
};

export type Review = {
  userId: number;
  cycleId: string;
  week: number;
  score: number | null;
  wins: string;
  lessons: string;
  change: string;
  at: string;
};

export const WIN = 85;
export const MAX_GOALS = 5;

/** The cycle people are working: the active one, else the earliest draft. */
export function currentCycle<C extends Pick<Cycle, "status" | "start">>(cycles: readonly C[]): C | null {
  return cycles.find((c) => c.status === "active") ?? [...cycles].filter((c) => c.status === "draft").sort((a, b) => a.start.localeCompare(b.start))[0] ?? null;
}

const dayNum = (k: string) => Date.parse(`${k}T00:00:00Z`) / 864e5;

/** Which week of the cycle a day falls in: 0 or less before it starts, 13 is review week. */
export const weekNo = (start: string, d: string) => (start ? Math.floor((dayNum(d) - dayNum(start)) / 7) + 1 : 0);
export const weekStart = (start: string, w: number) => addDays(start, (w - 1) * 7);
export const weekEnd = (start: string, w: number) => addDays(start, (w - 1) * 7 + 6);
/** The Monday after today (never today itself). */
export function nextMonday(today: string) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, (8 - dow) % 7 || 7);
}
export const isMonday = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).getUTCDay() === 1;

export const dueIn = (t: Pick<Tactic, "weeks">, w: number) => t.weeks.includes(w);
export const doneIn = (t: Pick<Tactic, "done">, w: number) => !!t.done[String(w)];

/** One person's score for a week, or null when they had nothing due. */
export function scoreOf(tactics: readonly Tactic[], userId: number, w: number) {
  const due = tactics.filter((t) => t.userId === userId && dueIn(t, w));
  if (!due.length) return null;
  return Math.round((due.filter((t) => doneIn(t, w)).length / due.length) * 100);
}

/** The team's score: the average of everyone who had tactics that week. */
export function teamScore(tactics: readonly Tactic[], people: readonly number[], w: number) {
  const s = people.map((u) => scoreOf(tactics, u, w)).filter((x): x is number => x !== null);
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
}

/** Average over weeks 1 to `upTo`, for one person or (userId null) the team. */
export function avgScore(tactics: readonly Tactic[], people: readonly number[], userId: number | null, upTo: number) {
  const s: number[] = [];
  for (let w = 1; w <= Math.min(12, upTo); w++) {
    const v = userId === null ? teamScore(tactics, people, w) : scoreOf(tactics, userId, w);
    if (v !== null) s.push(v);
  }
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
}

export const scoreTone = (v: number | null, win = WIN) => (v === null ? "none" : v >= win ? "win" : v >= 65 ? "mid" : "low");

/** How far a goal has come from its start to its target, 0 to 100. */
export function goalPct(base: number, target: number, now: number) {
  if (target === base) return now >= target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((now - base) / (target - base)) * 100)));
}

/** Where a goal would be on a straight line by this week. */
export const expectedPct = (w: number) => Math.max(0, Math.min(100, Math.round((Math.max(0, Math.min(12, w)) / 12) * 100)));

export const fmtGoal = (unit: string, v: number) => (unit === "naira" ? money(v, "NGN", true) : unit === "%" ? `${v}%` : (Number(v) || 0).toLocaleString("en-GB"));

/** [1,2,3,5,7,8] to "1 to 3, 5, 7 to 8". */
export function compactWeeks(ws: readonly number[]) {
  const a = [...ws].sort((x, y) => x - y);
  const out: string[] = [];
  let s: number | null = null;
  let p = 0;
  for (const n of a) {
    if (s === null) s = p = n;
    else if (n === p + 1) p = n;
    else {
      out.push(s === p ? `${s}` : `${s} to ${p}`);
      s = p = n;
    }
  }
  if (s !== null) out.push(s === p ? `${s}` : `${s} to ${p}`);
  return out.join(", ");
}
export const weeksText = (ws: readonly number[]) => (ws.length === 12 ? "Every week" : `Week${ws.length === 1 ? "" : "s"} ${compactWeeks(ws)}`);

/** "1, 3, 5-8" to [1,3,5,6,7,8], keeping weeks 1 to 12 only. */
export function parseWeeks(s: string) {
  const out = new Set<number>();
  for (const p of String(s ?? "").split(/[,\s]+/)) {
    const m = p.match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2] ?? m[1]);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= 12) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

/** The weeks a new or edited tactic runs: every week, from this week on, or picked. */
export function weeksFor(when: string, picked: string, thisWeek: number) {
  const w = Math.max(1, Math.min(12, thisWeek));
  if (when === "all") return Array.from({ length: 12 }, (_, i) => i + 1);
  if (when === "rest") return Array.from({ length: 12 - w + 1 }, (_, i) => w + i);
  return parseWeeks(picked);
}

/** Who leads the plan: sets up cycles and goals. */
export const leadsPlan = (roles: readonly string[]) => roles.some((r) => r === "Owner" || r === "Admin" || r === "Operations (EA)");
