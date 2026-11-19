import { addDays } from "./work";

// Clients, CRM and contracts: HQ's constants and rules (c-core.js, f-crm.js, s-ops.js), kept
// word for word where the copy shows in the app. Pure, shared by server and browser.

export const SERVICES = [
  "Brand Strategy Consulting",
  "Social Media and Content Consultancy",
  "Go-To-Market Strategy and Execution",
  "Visibility Sprint (90 days)",
  "Social Media Management",
  "AI Automation",
  "Meta Ads Management",
  "Mobile Content Production",
  "The Spotlight (PR)",
  "Web Design and Development",
  "Visibility Session",
  "Other",
] as const;

type Pairs = readonly (readonly [string, string])[];
export const label = (list: Pairs, k: string | null | undefined, fallback = "") => list.find(([x]) => x === k)?.[1] ?? (k || fallback);

export const SALES_STAGES = [
  ["new", "New lead"],
  ["research", "Researching"],
  ["contacted", "Contacted"],
  ["discovery", "Discovery call"],
  ["proposal", "Proposal sent"],
  ["negotiating", "Negotiating"],
  ["won", "Won"],
  ["lost", "Lost or not now"],
] as const;
export const TALENT_STAGES = [
  ["topitch", "To pitch"],
  ["pitched", "Pitched"],
  ["talks", "In talks"],
  ["live", "Deal live"],
  ["partner", "Past or repeat partner"],
  ["nofit", "Not a fit"],
] as const;
export const stagesFor = (kind: string): Pairs => (kind === "talent" ? TALENT_STAGES : SALES_STAGES);

export const REL_TYPES = ["Brand", "Agency", "PR and media", "Event or promoter", "Production", "Other"] as const;
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD"] as const;
export const SOURCES = ["Referral", "Visibility Session", "Website", "Instagram", "LinkedIn", "Event", "Cold outreach", "Imported list", "Other"] as const;

export const CLIENT_STATUS = [
  ["onboarding", "Onboarding"],
  ["active", "Active"],
  ["offboarding", "Notice period"],
  ["paused", "Paused"],
  ["ended", "Ended"],
] as const;
/** Clients we're working for now. */
export const LIVE = ["active", "onboarding", "offboarding"];

export const HEALTH = [
  ["good", "On track"],
  ["watch", "Watch"],
  ["risk", "At risk"],
] as const;

export const TOUCH_TYPES = [
  ["call", "Call"],
  ["whatsapp", "WhatsApp"],
  ["email", "Email"],
  ["meeting", "Meeting"],
  ["note", "Note"],
] as const;
/** Touches that count as follow-ups for KPIs and reports. Notes don't. */
export const COUNTED_TOUCHES = ["call", "whatsapp", "email", "meeting"];

/** Today's "Log:" buttons: [key, label, activity type, text, days to next follow-up]. */
export const QUICK_TOUCHES = [
  ["spoke", "Spoke", "call", "Spoke on the phone", 7],
  ["noanswer", "No answer", "call", "Called, no answer", 1],
  ["messaged", "Messaged", "whatsapp", "Sent a WhatsApp message", 3],
  ["emailed", "Emailed", "email", "Sent an email", 3],
] as const;

export const FOLLOW_UP_IN = [
  ["1", "Tomorrow"],
  ["3", "In 3 days"],
  ["7", "Next week"],
  ["14", "In 2 weeks"],
  ["30", "In a month"],
  ["keep", "Keep current date"],
  ["none", "No more follow-ups"],
] as const;

/** A touch on a fresh contact moves it along: sales "new" or "research" to contacted, talent "topitch" to pitched. */
export function stageAfterTouch(kind: string, stage: string, type: string) {
  if (type === "note") return stage;
  if (kind === "talent") return stage === "topitch" ? "pitched" : stage;
  return ["new", "research"].includes(stage) ? "contacted" : stage;
}

/** A follow-up is due when its date has come and the contact isn't finished with. */
export const followUpDue = (c: { nextDate: string; stage: string }, today: string) => Boolean(c.nextDate) && c.nextDate <= today && !["won", "lost", "nofit"].includes(c.stage);

/* ── Onboarding ──────────────────────────────────────────────────────── */

export type OnbStep = { t: string; day: number; who: "lead" | "point"; taskId?: string | null; done?: boolean; doneBy?: number | null; doneAt?: string | null };
export type Onboarding = {
  steps: OnbStep[];
  status: "in_progress" | "submitted" | "changes" | "approved";
  startedAt?: string;
  submittedAt?: string;
  submittedBy?: number;
  approvedAt?: string;
  approvedBy?: number;
  note?: string;
};

export const ONB_DEFAULT: readonly Omit<OnbStep, "taskId">[] = [
  { t: "Signed agreement and NDA received", day: 0, who: "lead" },
  { t: "First invoice sent", day: 0, who: "point" },
  { t: "Welcome packet sent", day: 0, who: "point" },
  { t: "Brand assets and logins collected", day: 2, who: "point" },
  { t: "Kick-off call with the founder", day: 3, who: "lead" },
  { t: "Client portal set up in Studio Desk", day: 3, who: "point" },
  { t: "Audit of current channels", day: 7, who: "lead" },
  { t: "30-day plan shared and approved by the client", day: 10, who: "lead" },
  { t: "Reporting rhythm and approval process agreed", day: 10, who: "lead" },
  { t: "First invoice paid", day: 14, who: "point" },
];

export const ONB_STATUS = {
  in_progress: ["In progress", "sky"],
  submitted: ["Waiting for Jane", "warn"],
  changes: ["Sent back", "bad"],
  approved: ["Signed off", "ok"],
} as const;

/** Reads the template textarea: "what | day after start | lead or point", one per line. */
export function parseOnbTemplate(text: string): Omit<OnbStep, "taskId">[] {
  return text
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter(([t]) => t)
    .slice(0, 40)
    .map(([t, day, who]) => ({ t: t.slice(0, 200), day: Math.max(0, Math.min(365, Number(day) || 0)), who: who?.toLowerCase() === "point" ? "point" : "lead" }));
}

/** A step is done when ticked, or when its linked task is done. */
export const stepDone = (s: OnbStep, doneTaskIds: ReadonlySet<string>) => Boolean(s.done) || Boolean(s.taskId && doneTaskIds.has(s.taskId));

/* ── Contracts ───────────────────────────────────────────────────────── */

export const CT_KINDS = [
  ["client", "Client agreement"],
  ["talent", "Talent contract"],
  ["brand", "Brand deal for talent"],
  ["supplier", "Supplier or partner"],
  ["team", "Team member or contractor"],
  ["other", "Other"],
] as const;
export const CT_RENEW = [
  ["manual", "Renew by agreement"],
  ["auto", "Renews automatically"],
  ["fixed", "Ends on the date"],
] as const;
export const CT_STATUS = [
  ["active", "Signed and live"],
  ["draft", "Sent, not signed yet"],
  ["ended", "Ended"],
] as const;

export type CtState = { k: "ended" | "draft" | "open" | "lapsed" | "decide" | "soon" | "ok"; l: string; tone: "plain" | "sky" | "bad" | "warn" | "ok" };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);
const shortDate = (k: string) => new Date(`${k}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Where a contract stands today, as HQ's ctState: lapsed, decide by, ending soon, and so on. */
export function contractState(c: { status: string; end: string; noticeDays: number | null }, today: string): CtState {
  if (c.status === "ended") return { k: "ended", l: "Ended", tone: "plain" };
  if (c.status === "draft") return { k: "draft", l: "Not signed yet", tone: "sky" };
  if (!c.end) return { k: "open", l: "No end date", tone: "plain" };
  const left = days(today, c.end);
  if (left < 0) return { k: "lapsed", l: `Lapsed ${-left} day${left === -1 ? "" : "s"} ago`, tone: "bad" };
  const noticeBy = addDays(c.end, -(c.noticeDays ?? 30));
  const toNotice = days(today, noticeBy);
  if (toNotice <= 14) return toNotice < 0 ? { k: "decide", l: "Notice date passed", tone: "bad" } : { k: "decide", l: `Decide by ${shortDate(noticeBy)}`, tone: "warn" };
  if (left <= 90) return { k: "soon", l: `Ends in ${left} days`, tone: "warn" };
  return { k: "ok", l: `Ends ${shortDate(c.end)}`, tone: "ok" };
}

const ORDER = ["lapsed", "decide", "soon", "draft", "ok", "open", "ended"];
export const contractRank = (s: CtState) => ORDER.indexOf(s.k);

/** "Renewal decision" task timing: three days before the notice date, or today if that's past. */
export const renewalTaskDue = (end: string, noticeDays: number | null, today: string) => {
  const d = addDays(addDays(end, -(noticeDays ?? 30)), -3);
  return d > today ? d : today;
};

/** A renewal runs as long as the last term, or 90 days if that's unknown. */
export function renewedEnd(start: string, end: string) {
  const term = start && end ? Math.max(1, days(start, end)) : 90;
  return addDays(end, term);
}
