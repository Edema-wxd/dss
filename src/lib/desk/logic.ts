// The numbers the desk and the website work out from the applications. Pure, so both sides agree.

import {
  type Application,
  type Band,
  type Route,
  type Settings,
  SETTING_DEFAULTS,
  SLOT_STATUSES,
  amount,
  bandRank,
  hoursSince,
  monthName,
  monthOf,
  parseWhen,
  thisMonth,
  toDateInput,
  today,
  truthy,
} from "./model";

const setting = (s: Settings, k: keyof Settings) => s[k] || SETTING_DEFAULTS[k] || "";

export const isSlot = (a: Application) => SLOT_STATUSES.includes(a.status as never);

export function monthStats(apps: Application[], s: Settings, month = thisMonth()) {
  const per = Number(setting(s, "sessions_per_month")) || 0;
  const booked = apps
    .filter((a) => isSlot(a) && monthOf(a.sessionDate) === month)
    .sort((x, y) => x.sessionDate.localeCompare(y.sessionDate));
  return {
    month,
    per,
    booked,
    remaining: Math.max(0, per - booked.length),
    open: truthy(setting(s, "applications_open")),
    waitlist: truthy(setting(s, "waitlist_when_full")),
  };
}

export function clientStats(apps: Application[], s: Settings) {
  const total = Number(setting(s, "client_slots_total")) || 0;
  const start = toDateInput(setting(s, "client_period_start"));
  // a Won founder counts when their session date falls in the current period
  const won = apps.filter((a) => a.status === "Won" && a.sessionDate && (!start || toDateInput(a.sessionDate) >= start));
  const other = Number(setting(s, "clients_won_other_routes")) || 0;
  return { total, start, won, other, left: Math.max(0, total - won.length - other) };
}

export const replyHours = (s: Settings) => Number(setting(s, "reply_promise_hours")) || 24;

export const awaitingReply = (apps: Application[]) => apps.filter((a) => a.status === "New" && !a.firstReply);
export const overdueReplies = (apps: Application[], s: Settings) =>
  awaitingReply(apps).filter((a) => hoursSince(a.submitted) > replyHours(s));

export type AttentionItem = { a: Application; why: string; hot?: boolean };

export function attention(apps: Application[], s: Settings, ago: (s: string) => string, fmtDay: (s: string) => string) {
  const t = today();
  const limit = replyHours(s);
  const out: AttentionItem[] = [];
  for (const a of awaitingReply(apps)) {
    const h = hoursSince(a.submitted);
    out.push(h > limit ? { a, why: `No reply after ${ago(a.submitted)}`, hot: true } : { a, why: `Reply within ${Math.max(0, Math.round(limit - h))} h` });
  }
  for (const a of apps) {
    const follow = toDateInput(a.followUp);
    const session = toDateInput(a.sessionDate);
    if (a.status === "Qualified" && hoursSince(a.firstReply || a.submitted) > 72) out.push({ a, why: "Qualified but not booked for 3+ days" });
    if (a.status === "Held" && !a.reviewLink) out.push({ a, why: "Session held, review not sent", hot: hoursSince(a.sessionDate) > 48 });
    if ((a.status === "Review sent" || a.status === "Proposal sent") && !follow) out.push({ a, why: "No follow-up date set" });
    if (follow && follow <= t && !["Won", "Not a fit", "Exploring"].includes(a.status))
      out.push({ a, why: `Follow-up due ${fmtDay(follow)}`, hot: follow < t });
    if (a.status === "Booked" && session && session < t) out.push({ a, why: "Session date passed. Mark as Held or No-show", hot: true });
  }
  return out.sort((x, y) => Number(!!y.hot) - Number(!!x.hot));
}

/** Fills in the settings that are worked out from the applications, such as the website lines. */
export function derivedSettings(apps: Application[], s: Settings): Settings {
  const ms = monthStats(apps, s);
  const cs = clientStats(apps, s);
  const month = monthName(ms.month).split(" ")[0];
  return {
    ...SETTING_DEFAULTS,
    ...s,
    current_month: ms.month,
    sessions_booked: String(ms.booked.length),
    sessions_remaining: String(ms.remaining),
    site_seats_line: !ms.open
      ? "Applications are closed for now"
      : ms.remaining
        ? `${ms.remaining} of ${ms.per} sessions open in ${month}`
        : ms.waitlist
          ? `All ${ms.per} sessions in ${month} are booked. Join the waitlist`
          : `All ${ms.per} sessions in ${month} are booked`,
    clients_won_from_sessions: String(cs.won.length),
    client_slots_left: String(cs.left),
    site_clients_line: cs.left ? `Taking on ${cs.left} more clients this period` : "Not taking on new clients this period",
  };
}

/** How the website files an application, from the budget band and timing. */
export function routeFor(budget: Band | string, when: string, s: Settings): Route {
  if (budget === "under-800k") return "below-minimum";
  if (/exploring/i.test(when)) return "exploring";
  if (budget !== "foreign" && bandRank(budget) >= bandRank(setting(s, "priority_from_band"))) return "priority";
  return "fit";
}

export function statusForRoute(route: Route) {
  return route === "exploring" ? "Exploring" : route === "below-minimum" ? "Not a fit" : "New";
}

export const wonValue = (apps: Application[]) => apps.filter((a) => a.status === "Won").reduce((n, a) => n + amount(a.dealValue), 0);

export function averageReplyHours(apps: Application[]) {
  const hours = apps
    .map((a) => {
      const sent = parseWhen(a.submitted);
      const reply = parseWhen(a.firstReply);
      return sent && reply ? (reply.getTime() - sent.getTime()) / 36e5 : -1;
    })
    .filter((h) => h >= 0);
  return hours.length ? hours.reduce((x, y) => x + y, 0) / hours.length : null;
}
