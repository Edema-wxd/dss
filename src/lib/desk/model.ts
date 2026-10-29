// Shared by the admin desk (client and server) and the public website endpoint.

export const TEAM = ["Janefrances", "Aderonke", "Joy"] as const;

export const STATUSES = [
  "New",
  "Qualified",
  "Booked",
  "Held",
  "Review sent",
  "Proposal sent",
  "Won",
  "No-show",
  "Waitlist",
  "Exploring",
  "Not a fit",
] as const;
export type Status = (typeof STATUSES)[number];

/** Statuses that use one of the month's complimentary sessions. No-shows count: the time was reserved. */
export const SLOT_STATUSES: readonly Status[] = ["Booked", "Held", "Review sent", "Proposal sent", "Won", "No-show"];
/** Statuses that are finished, so they drop out of the "Open" filter. */
export const CLOSED_STATUSES: readonly Status[] = ["Won", "Not a fit", "Exploring", "No-show"];

export const STATUS_NOTES: Record<Status, string> = {
  New: "Just applied. Reply within the reply promise.",
  Qualified: "Meets the criteria and is waiting to book.",
  Booked: "Session date and time confirmed.",
  Held: "The session took place.",
  "Review sent": "The one-page review was sent after the session.",
  "Proposal sent": "A Sprint or retainer proposal was sent.",
  Won: "Became a client. Also fills one of the client places.",
  "No-show": "Booked but did not attend. The slot still counts.",
  Waitlist: "Qualified, but this month is full.",
  Exploring: "Chose \"Just exploring\". Nurture by email only.",
  "Not a fit": "Declined politely.",
};

export const BANDS = [
  ["under-800k", "Under ₦800k"],
  ["800k-1.5m", "₦800k to ₦1.5m"],
  ["1.5m-3m", "₦1.5m to ₦3m"],
  ["3m-5m", "₦3m to ₦5m"],
  ["5m-plus", "Above ₦5m"],
  ["foreign", "Foreign currency"],
] as const;
export type Band = (typeof BANDS)[number][0];

export const ROUTES = ["priority", "fit", "exploring", "below-minimum"] as const;
export type Route = (typeof ROUTES)[number];

export type Application = {
  id: string;
  submitted: string;
  name: string;
  role: string;
  company: string;
  site: string;
  email: string;
  whatsapp: string;
  moment: string;
  when: string;
  budget: string;
  decider: string;
  worth: string;
  route: string;
  source: string;
  score: string;
  consent: boolean;
  status: string;
  owner: string;
  sessionDate: string;
  sessionTime: string;
  firstReply: string;
  reviewLink: string;
  outcome: string;
  dealValue: string;
  followUp: string;
  notes: string;
  updated: string;
  version: string;
};

/** The fields the team edits on an application. Everything else comes from the website. */
export const EDIT_KEYS = [
  "status",
  "owner",
  "sessionDate",
  "sessionTime",
  "firstReply",
  "reviewLink",
  "outcome",
  "dealValue",
  "followUp",
  "notes",
] as const;
export type EditKey = (typeof EDIT_KEYS)[number];
export type ApplicationEdit = Record<EditKey, string>;

export type Lead = {
  id: number;
  at: string;
  name: string;
  email: string;
  moment: string;
  source: string;
  email1: boolean;
  email2: boolean;
  applied: boolean;
  notes: string;
};
export const LEAD_FLAGS = ["email1", "email2", "applied"] as const;
export type LeadFlag = (typeof LEAD_FLAGS)[number];

export const SETTING_KEYS = [
  "sessions_per_month",
  "applications_open",
  "current_month",
  "sessions_booked",
  "sessions_remaining",
  "minimum_monthly_budget",
  "priority_from_band",
  "session_value",
  "reply_promise_hours",
  "waitlist_when_full",
  "booking_link",
  "site_seats_line",
  "whatsapp_number",
  "client_slots_total",
  "client_period_start",
  "clients_won_from_sessions",
  "clients_won_other_routes",
  "client_slots_left",
  "site_clients_line",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Partial<Record<SettingKey, string>>;

/** Settings the team edits. The rest are worked out from the applications. */
export const EDITABLE_SETTINGS = [
  "sessions_per_month",
  "applications_open",
  "waitlist_when_full",
  "minimum_monthly_budget",
  "priority_from_band",
  "session_value",
  "reply_promise_hours",
  "booking_link",
  "whatsapp_number",
  "client_slots_total",
  "client_period_start",
  "clients_won_other_routes",
] as const satisfies readonly SettingKey[];
export type EditableSetting = (typeof EDITABLE_SETTINGS)[number];

export type DeskData = {
  apps: Application[];
  leads: Lead[];
  settings: Settings;
  loadedAt: number;
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const nowStamp = (d = new Date()) => `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const today = () => isoDate(new Date());
export const thisMonth = () => today().slice(0, 7);
export const monthOf = (s: string) => String(s || "").slice(0, 7);

export function parseWhen(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : d;
}
export const toDateInput = (v: string) => {
  const d = parseWhen(v);
  return d ? isoDate(d) : "";
};
export const hoursSince = (s: string) => {
  const d = parseWhen(s);
  return d ? (Date.now() - d.getTime()) / 36e5 : 0;
};
export const truthy = (v: unknown) => String(v).toUpperCase() === "TRUE";
export const digits = (v: unknown) => String(v ?? "").replace(/[^\d]/g, "");
export const amount = (v: unknown) => Number(String(v ?? "").replace(/[^\d.]/g, "")) || 0;
export const naira = (n: unknown) => "₦" + Math.round(amount(n)).toLocaleString("en-NG");
export const bandLabel = (v: string) => BANDS.find((b) => b[0] === v)?.[1] ?? (v || "Not given");
export const bandRank = (v: string) => BANDS.findIndex((b) => b[0] === v);

export const monthName = (key: string) =>
  key ? new Date(`${key}-01T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "";

/** First three letters of a company, for the slot blocks. */
export const initials = (a: Pick<Application, "company" | "name">) =>
  (a.company || a.name || "").slice(0, 3).toUpperCase();

/** Values the website and desk both treat as "on" when a setting has never been written. */
export const SETTING_DEFAULTS: Settings = {
  sessions_per_month: "8",
  applications_open: "TRUE",
  minimum_monthly_budget: "800000",
  priority_from_band: "3m-5m",
  session_value: "250000",
  reply_promise_hours: "24",
  waitlist_when_full: "TRUE",
  client_slots_total: "5",
  clients_won_other_routes: "0",
  client_period_start: "2026-10-01",
  booking_link: "https://calendly.com/digitalsavvystudios/30min",
  whatsapp_number: "",
};
