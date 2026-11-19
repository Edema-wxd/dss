import { addDays } from "./work";

// The Marketing dashboard: HQ's constants (q-marketing.js), its period views (p-finance.js
// finWindow and buckets), and the data feed sheet rules (scheduled task 02). Pure functions.

export const PLATFORMS = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["linkedin", "LinkedIn"],
  ["youtube", "YouTube"],
  ["x", "X"],
  ["facebook", "Facebook"],
  ["threads", "Threads"],
  ["substack", "Substack"],
  ["website", "Website"],
  ["email", "Email list"],
] as const;
export const AD_PLATFORMS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "x"];
export const CONNECTED = [
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["tiktok", "TikTok"],
  ["website", "Google Analytics"],
] as const;
export const POST_STATUS = [
  ["idea", "Idea"],
  ["drafting", "Drafting"],
  ["review", "In review"],
  ["scheduled", "Scheduled"],
  ["published", "Published"],
] as const;
export const POST_FORMATS = ["Reel", "Carousel", "Single image", "Story", "Video", "Live", "Text post", "Article", "Newsletter", "Thread"] as const;
export const AD_OBJ = ["Awareness", "Traffic", "Engagement", "Leads", "Sales", "Followers", "Messages"] as const;
export const AD_STATUS = [
  ["planned", "Planned"],
  ["live", "Live"],
  ["paused", "Paused"],
  ["ended", "Ended"],
] as const;
export const NEWS_TAGS = ["Social platforms", "Ads", "AI and tools", "Nigeria and Africa", "Brand and strategy", "Creators and talent"] as const;
/** CRM lead sources that count as marketing leads. */
export const MKT_LEAD_SOURCES = ["Instagram", "LinkedIn", "Website", "Visibility Session", "Event"];
export const DEFAULT_PILLARS = ["Authority and point of view", "Proof and client results", "Behind the scenes", "Education", "Offers and invitations"];
export const NEWS_SOURCES = [
  ["Social Media Today", "https://www.socialmediatoday.com"],
  ["Meta newsroom", "https://about.fb.com/news/"],
  ["TikTok newsroom", "https://newsroom.tiktok.com"],
  ["LinkedIn news", "https://news.linkedin.com"],
  ["Marketing Week", "https://www.marketingweek.com"],
  ["Adweek", "https://www.adweek.com"],
  ["TechCabal", "https://techcabal.com"],
  ["Marketing Edge Nigeria", "https://marketingedge.com.ng"],
] as const;

/* ── Period views ────────────────────────────────────────────────────── */

export const RANGES = [
  ["7d", "7 days"],
  ["14d", "14 days"],
  ["month", "Month"],
  ["90d", "90 days"],
  ["6m", "6 months"],
] as const;
export type RangeKey = (typeof RANGES)[number][0];
export type Window = { from: string; to: string; label: string; short: string; days: number };

const monthEnd = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5) + 1;
export const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const shiftMonth = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 15));
  return d.toISOString().slice(0, 7);
};

/** The dates a period view covers. "month" is the chosen calendar month; the rest end today. */
export function rangeWindow(range: RangeKey, today: string, month = today.slice(0, 7)): Window {
  const make = (from: string, to: string, label: string, short: string) => ({ from, to, label, short, days: daysBetween(from, to) });
  if (range === "7d") return make(addDays(today, -6), today, "the last 7 days", "7 days");
  if (range === "14d") return make(addDays(today, -13), today, "the last 14 days", "14 days");
  if (range === "90d") return make(addDays(today, -89), today, "the last 90 days", "90 days");
  if (range === "6m") return make(`${shiftMonth(today.slice(0, 7), -5)}-01`, today, "the last 6 months", "6 months");
  return make(`${month}-01`, monthEnd(month), monthLabel(month), "month");
}

/** The same length of time just before, to compare against. */
export function previousWindow(w: Window, range: RangeKey): Window {
  if (range === "month") {
    const m = shiftMonth(w.from.slice(0, 7), -1);
    return { from: `${m}-01`, to: monthEnd(m), label: monthLabel(m), short: "month", days: daysBetween(`${m}-01`, monthEnd(m)) };
  }
  const to = addDays(w.from, -1);
  return { from: addDays(to, -(w.days - 1)), to, label: "", short: w.short, days: w.days };
}

/** Chart buckets: by day up to two weeks, by week up to about three months, then by month. */
export function buckets(w: Window): { from: string; to: string; label: string }[] {
  const out: { from: string; to: string; label: string }[] = [];
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
  if (w.days <= 14) {
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) out.push({ from: d, to: d, label: w.days <= 7 ? fmt(d, { weekday: "short" }) : fmt(d, { day: "numeric" }) });
  } else if (w.days <= 100) {
    for (let d = w.from; d <= w.to; d = addDays(d, 7)) {
      const e = addDays(d, 6) > w.to ? w.to : addDays(d, 6);
      out.push({ from: d, to: e, label: fmt(d, { day: "numeric", month: "short" }) });
    }
  } else {
    for (let m = w.from.slice(0, 7); m <= w.to.slice(0, 7); m = shiftMonth(m, 1))
      out.push({ from: `${m}-01` < w.from ? w.from : `${m}-01`, to: monthEnd(m) > w.to ? w.to : monthEnd(m), label: fmt(`${m}-15`, { month: "short" }) });
  }
  return out;
}

/* ── Adding up an account's numbers for a period ─────────────────────── */

export type Metrics = { reach: number; impressions: number; engagements: number; posts: number; leads: number; linkClicks: number };
export type MonthStat = Partial<Metrics> & { accountId: string; month: string; followers: number | null; source?: string };
export type DailyStat = Partial<Metrics> & { accountId: string; date: string; followers: number | null };
export type PostLite = { platform: string; date: string; status: string; reach: number | null; engagements: number | null; leads: number | null };

const zero = (): Metrics => ({ reach: 0, impressions: 0, engagements: 0, posts: 0, leads: 0, linkClicks: 0 });
const add = (a: Metrics, b: Partial<Metrics>, share = 1) => {
  for (const k of Object.keys(a) as (keyof Metrics)[]) a[k] += (Number(b[k]) || 0) * share;
};

/**
 * One account's totals for a period, as HQ's mktIn: daily numbers when the feed covers the
 * period, monthly insights shared across the days for longer periods, otherwise the posts
 * published in it. Also returns the followers at the end and which basis was used.
 */
export function accountTotals(acc: { id: string; platform: string }, w: Window, monthly: readonly MonthStat[], daily: readonly DailyStat[], posts: readonly PostLite[]) {
  const t = zero();
  const days = daily.filter((d) => d.accountId === acc.id && d.date >= w.from && d.date <= w.to).sort((a, b) => a.date.localeCompare(b.date));
  const covered = days.length > 0 && (days[0].date <= w.from || w.days < 28);
  let basis: "daily" | "monthly" | "posts" = "posts";
  if (covered) {
    basis = "daily";
    days.forEach((d) => add(t, d));
  } else if (w.days >= 28 && monthly.some((m) => m.accountId === acc.id && m.month >= w.from.slice(0, 7) && m.month <= w.to.slice(0, 7))) {
    basis = "monthly";
    for (const m of monthly.filter((x) => x.accountId === acc.id && x.month >= w.from.slice(0, 7) && x.month <= w.to.slice(0, 7))) {
      const from = `${m.month}-01` < w.from ? w.from : `${m.month}-01`;
      const end = monthEnd(m.month) > w.to ? w.to : monthEnd(m.month);
      add(t, m, daysBetween(from, end) / daysBetween(`${m.month}-01`, monthEnd(m.month)));
    }
  } else {
    for (const p of posts.filter((x) => x.platform === acc.platform && x.status === "published" && x.date >= w.from && x.date <= w.to)) add(t, { reach: p.reach ?? 0, engagements: p.engagements ?? 0, leads: p.leads ?? 0, posts: 1 });
  }
  for (const k of Object.keys(t) as (keyof Metrics)[]) t[k] = Math.round(t[k]);
  const lastDaily = [...days].reverse().find((d) => d.followers !== null);
  const lastMonthly = monthly.filter((m) => m.accountId === acc.id && m.month <= w.to.slice(0, 7) && m.followers !== null).sort((a, b) => b.month.localeCompare(a.month))[0];
  return { ...t, followers: lastDaily?.followers ?? lastMonthly?.followers ?? null, basis };
}

export const BASIS_NOTE = {
  daily: "Daily numbers from your data feed.",
  mixed: "Daily numbers where the feed sends them, monthly insights elsewhere.",
  monthly: "Monthly insights, shared across the days of the period. Daily numbers arrive once your developer's feed sends them.",
  posts: "Reach and engagement come from the posts published in this period. Account-wide daily numbers arrive once your developer's feed sends them.",
} as const;

export function basisOf(bases: readonly string[]): keyof typeof BASIS_NOTE {
  const set = new Set(bases);
  if (set.size === 1) return [...set][0] as keyof typeof BASIS_NOTE;
  if (set.has("daily")) return "mixed";
  return set.has("monthly") ? "monthly" : "posts";
}

export const engagementRate = (m: { reach: number; engagements: number }) => (m.reach ? (m.engagements / m.reach) * 100 : 0);

/* ── The data feed sheet ─────────────────────────────────────────────── */

/** The example row in every tab of the feed sheet, which the sync always skips. */
export const EXAMPLE_ROW = "2026-11-30T23:10";

/** A tab's rows as objects keyed by its header row; the example row and empty rows are dropped. */
export function sheetRows(values: readonly (readonly unknown[])[] = []) {
  const [head = [], ...rows] = values;
  const keys = head.map((h) => String(h ?? "").trim().toLowerCase());
  return rows
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, String(r[i] ?? "").trim()])) as Record<string, string>)
    .filter((r) => Object.values(r).some(Boolean) && !(r.synced_at ?? "").startsWith(EXAMPLE_ROW));
}

/** Sheet numbers: commas and spaces allowed, blank means unknown. */
export const sheetNum = (v: string | undefined) => {
  const s = String(v ?? "").replace(/[,\s]/g, "");
  return s === "" || !Number.isFinite(Number(s)) ? null : Number(s);
};

/** The first 90 characters of a caption, cut at a word. */
export function captionTitle(caption: string) {
  const c = caption.replace(/\s+/g, " ").trim();
  if (c.length <= 90) return c;
  const cut = c.slice(0, 90);
  return (cut.lastIndexOf(" ") > 40 ? cut.slice(0, cut.lastIndexOf(" ")) : cut).trim();
}
