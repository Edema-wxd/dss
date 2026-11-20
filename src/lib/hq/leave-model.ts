import { addDays, weekday } from "./work";

// Leave and availability, ported from HQ's s-ops.js (version 24). Pure functions only, shared by
// the server and the browser.
//
// - Work pattern: each person's usual week, full, half or off for each weekday. People send a
//   new week to the owner for approval; the owner sets her own.
// - Day changes ("shift" items): the owner asks someone to work a different kind of day once.
// - Leave: annual leave names a relief officer, who agrees first; then the owner decides.
//   Sick leave of 3 days or less is logged straight away. Public holidays have no person.

export const LV_TYPES = [
  ["leave", "Annual leave"],
  ["sick", "Sick"],
  ["training", "Training or event"],
  ["unavailable", "Unavailable"],
  ["holiday", "Public holiday"],
] as const;
export type LeaveType = (typeof LV_TYPES)[number][0] | "shift";
export const lvLabel = (t: string) => LV_TYPES.find(([k]) => k === t)?.[1] ?? "Out";

export const WEEK = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;
export type WeekKey = (typeof WEEK)[number][0];
const WDKEY: WeekKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const DAY_MODES = [
  ["full", "Full day"],
  ["half", "Half day"],
  ["off", "Off"],
] as const;
export type DayMode = "full" | "half" | "off";
export const modeLabel = (m: string) => DAY_MODES.find(([k]) => k === m)?.[1] ?? m;
export const isMode = (v: unknown): v is DayMode => v === "full" || v === "half" || v === "off";

export type Pattern = Record<WeekKey, DayMode>;
export const DEFAULT_PATTERN: Pattern = { mon: "full", tue: "full", wed: "full", thu: "full", fri: "full", sat: "off", sun: "off" };

/** Someone's usual week, filling any missing day from the default. */
export function patternOf(p: unknown): Pattern {
  const out = { ...DEFAULT_PATTERN };
  if (p && typeof p === "object") for (const [k] of WEEK) if (isMode((p as Record<string, unknown>)[k])) out[k] = (p as Pattern)[k];
  return out;
}

export const weekDays = (p: Pattern) => WEEK.reduce((t, [k]) => t + (p[k] === "full" ? 1 : p[k] === "half" ? 0.5 : 0), 0);

/** "4½ working days" */
export const fmtDays = (n: number) => `${String(n).replace(/\.5$/, "½").replace(/^0½$/, "½")} working day${n === 1 ? "" : "s"}`;

export type PatternReq = { pattern: Pattern; status: "pending" | "approved" | "declined"; note?: string; at?: string };

/** A leave request, public holiday (userId null) or day change (type "shift"). Dates are YYYY-MM-DD, inclusive. */
export type LeaveItem = {
  id: string;
  userId: number | null;
  type: string;
  start: string;
  end: string;
  reliefId: number | null;
  reliefAnswer: "" | "accepted" | "declined";
  reliefNote: string;
  doneText: string;
  todoText: string;
  handover: string[];
  note: string;
  shiftFrom: string;
  shiftTo: string;
  status: string;
  reply: string;
  createdAt: string;
};

const lastDay = (l: Pick<LeaveItem, "start" | "end">) => l.end || l.start;
export const covers = (l: Pick<LeaveItem, "start" | "end">, day: string) => day >= l.start && day <= lastDay(l);

export const isShift = (l: Pick<LeaveItem, "type">) => l.type === "shift";
/** Annual leave needs a relief officer to agree before the owner decides. */
export const needsRelief = (l: Pick<LeaveItem, "type">) => l.type === "leave";

export function reliefState(l: Pick<LeaveItem, "type" | "reliefAnswer">): "none" | "waiting" | "accepted" | "declined" {
  if (!needsRelief(l)) return "none";
  return l.reliefAnswer === "accepted" ? "accepted" : l.reliefAnswer === "declined" ? "declined" : "waiting";
}

/** A request the owner can approve now. */
export const readyForOwner = (l: LeaveItem) => !isShift(l) && l.status === "pending" && (!needsRelief(l) || reliefState(l) === "accepted");

/** Calendar days from start to end, inclusive. */
export const calDays = (a: string, b: string) => Math.round((Date.parse(b || a) - Date.parse(a)) / 864e5) + 1;

/** Sick leave of 3 days or less is logged as approved straight away. Everything else waits. */
export const autoApproved = (type: string, start: string, end: string) => type === "sick" && calDays(start, end) <= 3;

/** Approved time off covering `day` for this person, or a public holiday. */
export function onLeave(items: readonly LeaveItem[], userId: number, day: string) {
  return items.find((l) => !isShift(l) && l.status === "approved" && covers(l, day) && (l.userId === userId || l.userId === null)) ?? null;
}

export type DayKind = DayMode | "leave";

/** What kind of day it is for someone: leave first, then an accepted day change, then their usual week. */
export function dayMode(items: readonly LeaveItem[], userId: number, pattern: Pattern, day: string): DayKind {
  if (onLeave(items, userId, day)) return "leave";
  const sh = items.find((s) => isShift(s) && s.userId === userId && s.start === day && s.status === "accepted");
  if (sh && isMode(sh.shiftTo)) return sh.shiftTo;
  return pattern[WDKEY[weekday(day)]] ?? "full";
}

export const usualMode = (pattern: Pattern, day: string) => pattern[WDKEY[weekday(day)]];

/** Working days in a range for someone, skipping public holidays: a half day counts as half. */
export function workdays(items: readonly LeaveItem[], a: string, b: string, userId: number | null, pattern: Pattern | null) {
  const hol = items.filter((l) => l.userId === null && !isShift(l) && l.status === "approved");
  let n = 0;
  for (let d = a, g = 0; d <= (b || a) && g < 400; d = addDays(d, 1), g++) {
    if (hol.some((h) => covers(h, d))) continue;
    const sh = userId !== null ? items.find((s) => isShift(s) && s.userId === userId && s.start === d && s.status === "accepted") : null;
    const m = sh && isMode(sh.shiftTo) ? sh.shiftTo : pattern ? usualMode(pattern, d) : [0, 6].includes(weekday(d)) ? "off" : "full";
    n += m === "full" ? 1 : m === "half" ? 0.5 : 0;
  }
  return n;
}

/** Approved annual leave taken in a year, in working days. */
export function leaveTaken(items: readonly LeaveItem[], userId: number, pattern: Pattern, year: string) {
  return items
    .filter((l) => l.userId === userId && l.status === "approved" && l.type === "leave" && l.start.slice(0, 4) === year)
    .reduce((t, l) => t + workdays(items, l.start, lastDay(l), userId, pattern), 0);
}

/** Approved leave where this person is the relief on `day`: whose roles they borrow. */
export const coveringFor = (items: readonly LeaveItem[], userId: number, day: string) =>
  items.filter((l) => !isShift(l) && l.status === "approved" && l.reliefId === userId && l.userId !== null && l.userId !== userId && covers(l, day));

/** "3 Dec" or "3 Dec to 7 Dec" */
export function dateSpan(l: Pick<LeaveItem, "start" | "end">, fmt: (d: string) => string) {
  return l.end && l.end !== l.start ? `${fmt(l.start)} to ${fmt(l.end)}` : fmt(l.start);
}
