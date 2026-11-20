import { canUse } from "./access";
import { type Finance, OPEX, addMonth, catLabel, monthName, pctChange } from "./finance-model";
import { money } from "./money";
import { CLIENT_STATUS, COUNTED_TOUCHES, HEALTH, LIVE, SALES_STAGES, SOURCES, label } from "./sales-model";
import { DEAL_STAGES } from "./talent-model";
import { KPI_PERIODS, addDays, formatKpi } from "./work";

// Monthly reports: HQ's buildReport (r-reports.js), ported. A report is a snapshot of slides,
// filed once and never changed after the fact unless someone rebuilds it. Pure: the server
// gathers the month's data, this turns it into slides.

export const REP_TYPES = [
  ["overview", "Business summary"],
  ["finance", "Finance"],
  ["marketing", "Marketing"],
  ["sales", "Sales and CRM"],
  ["clients", "Clients"],
  ["talent", "Talent"],
  ["team", "Team and KPIs"],
] as const;
export type RepType = (typeof REP_TYPES)[number][0];
export const repLabel = (t: string) => label(REP_TYPES, t, "Report");
export const isRepType = (t: unknown): t is RepType => REP_TYPES.some(([k]) => k === t);

/** Which reports someone can make and open: each follows its area. */
export function repCan(roles: readonly string[], t: string) {
  if (t === "finance") return canUse(roles, "finance");
  if (t === "overview") return canUse(roles, "overview");
  if (t === "sales") return canUse(roles, "crm");
  if (t === "team") return canUse(roles, "kpis");
  if (t === "marketing" || t === "clients" || t === "talent") return canUse(roles, t);
  return false;
}

/* ── Slides ──────────────────────────────────────────────────────────── */

export type StatItem = { k: string; v: string; s?: string };
export type BarRow = { label: string; value: number; display: string; color: string };
export type Slide =
  | { kind: "cover"; title: string; sub: string }
  | { kind: "close"; title: string; sub: string }
  | { kind: "stats"; title: string; items: StatItem[] }
  | { kind: "cols"; title: string; labels: string[]; series: { name: string; color: string; values: number[] }[]; money: boolean }
  | { kind: "bars"; title: string; rows: BarRow[]; note?: string; max?: number }
  | { kind: "table"; title: string; head: string[]; rows: string[][]; bold?: number[] }
  | { kind: "notes"; title: string; blocks: { h: string; items: string[] }[] };
export type Report = { type: RepType; month: string; title: string; slides: Slide[] };

const PINK = "#EC1763";
const BLUE = "#5568AF";
const ORANGE = "#F37826";
const RED = "#C42B3C";
const GREEN = "#1E7A4C";

/* ── What the builder reads ──────────────────────────────────────────── */

export type ReportData = {
  today: string;
  monthlyGoal: number;
  /** null without Finance access: money lines are left out */
  f: Finance | null;
  toNGN: (a: number, cur?: string | null) => number | null;
  people: { id: number; name: string }[];
  tasks: { assigneeId: number | null; status: string; doneDay: string; due: string; clientId: string | null }[];
  contacts: { id: string; kind: string; name: string; company: string; stage: string; createdAt: string; wonAt: string; source: string; value: number | null; currency: string; nextDate: string; ownerId: number | null }[];
  /** CRM activity: who did what to which contact, and the Lagos day */
  touches: { userId: number | null; refId: string; type: string; day: string }[];
  clients: { id: string; name: string; service: string; status: string; health: string; endDate: string; fee: number | null; currency: string; billing: string }[];
  deals: { talentId: string | null; brand: string; stage: string; fee: number | null; currency: string; commissionPct: number | null; updatedAt: string }[];
  talents: { id: string; name: string }[];
  kpis: { id: string; title: string; ownerId: number | null; unit: string; target: number; period: string; direction: string; source: string; weight: number | null }[];
  kpiLogs: { kpiId: string; periodKey: string; value: number }[];
  mkt: {
    accounts: { id: string; platform: string; handle: string }[];
    stats: { accountId: string; month: string; followers: number | null; reach?: number | null; engagements?: number | null; posts?: number | null; leads?: number | null }[];
    posts: { title: string; platform: string; date: string; status: string; reach: number | null; engagements: number | null }[];
    ads: { name: string; status: string; currency: string; spend: number | null; leads: number | null; revenue: number | null; budget: number | null; clicks: number | null; impressions: number | null }[];
    web: Record<string, { sessions?: number | null; users?: number | null; newUsers?: number | null; engagementRate?: number | null; keyEvents?: number | null }>;
    platformName: (k: string) => string;
  };
};

const N = (v: number) => money(v, "NGN", true);
const shortN = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n)));
const inMonth = (d: string, m: string) => (d || "").slice(0, 7) === m;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function delta(a: number, b: number) {
  const d = pctChange(a, b);
  return d === null ? "no comparison yet" : `${d >= 0 ? "Up" : "Down"} ${Math.abs(Math.round(d))}% on last month`;
}

/* ── KPIs over a month ───────────────────────────────────────────────── */

/** A KPI's percent of target over a calendar month, as HQ's kpiMonthPct. null when nothing to score. */
export function kpiMonthPct(k: ReportData["kpis"][number], m: string, d: ReportData): number | null {
  const per = k.period || "month";
  const tgt = Number(k.target) || 0;
  if (!tgt) return null;
  const scale = per === "week" ? 52 / 12 : per === "quarter" ? 1 / 3 : 1;
  let actual = 0;
  if (k.source === "auto_tasks") actual = d.tasks.filter((x) => x.assigneeId === k.ownerId && x.status === "done" && inMonth(x.doneDay, m)).length;
  else if (k.source === "auto_touches") actual = d.touches.filter((a) => a.userId === k.ownerId && COUNTED_TOUCHES.includes(a.type) && inMonth(a.day, m)).length;
  else if (k.source === "auto_won") actual = d.contacts.filter((c) => c.stage === "won" && c.ownerId === k.ownerId && inMonth(c.wonAt, m)).length;
  else if (k.source === "auto_revenue") actual = d.f ? d.f.revenueFor(m).total : 0;
  else {
    const logs = d.kpiLogs.filter((l) => l.kpiId === k.id && l.periodKey.slice(per.length + 1, per.length + 8) === m);
    if (!logs.length) return null;
    if (k.unit === "percent") {
      const v = avg(logs.map((l) => Number(l.value)));
      return k.direction === "down" ? (v <= 0 ? 100 : (tgt / v) * 100) : (v / tgt) * 100;
    }
    actual = logs.reduce((t, l) => t + (Number(l.value) || 0), 0);
    if (per === "week") return k.direction === "down" ? (actual <= 0 ? 100 : ((tgt * logs.length) / actual) * 100) : (actual / (tgt * logs.length)) * 100;
  }
  const goal = tgt * scale;
  return k.direction === "down" ? (actual <= 0 ? 100 : (goal / actual) * 100) : (actual / goal) * 100;
}

/** Someone's weighted KPI score for a month, each KPI capped at 120%. */
export function teamScoreMonth(u: number, m: string, d: ReportData) {
  let w = 0;
  let s = 0;
  for (const k of d.kpis.filter((x) => x.ownerId === u)) {
    const p = kpiMonthPct(k, m, d);
    if (p === null) continue;
    const wt = Number(k.weight) || 1;
    w += wt;
    s += Math.min(120, p) * wt;
  }
  return w ? Math.round(s / w) : null;
}

/* ── Marketing over a month ──────────────────────────────────────────── */

const MKT_LEAD_SOURCES = ["Instagram", "LinkedIn", "Website", "Visibility Session", "Event"];
const statOf = (d: ReportData, acc: string, m: string) => d.mkt.stats.find((s) => s.accountId === acc && s.month === m) ?? null;
function lastStat(d: ReportData, acc: string, m: string) {
  for (let i = 0; i < 12; i++) {
    const s = statOf(d, acc, addMonth(m, -i));
    if (s && s.followers !== null) return s;
  }
  return null;
}
const erOf = (s: { reach?: number | null; engagements?: number | null } | null) => (s && Number(s.reach) ? ((Number(s.engagements) || 0) / Number(s.reach)) * 100 : null);
const postER = (p: { reach?: number | null; engagements?: number | null }) => erOf(p) ?? 0;

export function mktTotals(d: ReportData, m: string) {
  const t = { followers: 0, prevFollowers: 0, reach: 0, engagements: 0, posts: 0, leads: 0, crmLeads: 0, won: 0, er: null as number | null };
  for (const a of d.mkt.accounts) {
    const s = statOf(d, a.id, m);
    t.followers += Number(lastStat(d, a.id, m)?.followers) || 0;
    t.prevFollowers += Number(lastStat(d, a.id, addMonth(m, -1))?.followers) || 0;
    if (s) {
      t.reach += Number(s.reach) || 0;
      t.engagements += Number(s.engagements) || 0;
      t.posts += Number(s.posts) || 0;
      t.leads += Number(s.leads) || 0;
    }
  }
  t.crmLeads = d.contacts.filter((c) => MKT_LEAD_SOURCES.includes(c.source) && inMonth(c.createdAt, m)).length;
  t.won = d.contacts.filter((c) => MKT_LEAD_SOURCES.includes(c.source) && c.stage === "won" && inMonth(c.wonAt, m)).length;
  t.er = t.reach ? (t.engagements / t.reach) * 100 : null;
  return t;
}

function mktAlerts(d: ReportData, m: string) {
  const out: string[] = [];
  for (const a of d.mkt.accounts) {
    const name = `${d.mkt.platformName(a.platform)}${a.handle ? ` ${a.handle}` : ""}`;
    if (!statOf(d, a.id, m)) out.push(`${name}: no numbers for ${monthName(m, true)}`);
    const s = lastStat(d, a.id, m);
    const p = lastStat(d, a.id, addMonth(m, -1));
    if (s && p && Number(s.followers) < Number(p.followers)) out.push(`${name} lost followers`);
  }
  const late = d.mkt.posts.filter((p) => p.date && p.date < d.today && p.status !== "published").length;
  if (late) out.push(`${late} planned post${late > 1 ? "s" : ""} not marked published`);
  return out;
}

/* ── The builder ─────────────────────────────────────────────────────── */

export function buildReport(type: RepType, m: string, d: ReportData): Report {
  const M = monthName(m);
  const prevM = addMonth(m, -1);
  const slides: Slide[] = [{ kind: "cover", title: repLabel(type), sub: M }];
  const notes = (good: string[], watch: string[], next: string[]) =>
    slides.push({
      kind: "notes",
      title: "What it means",
      blocks: [
        { h: "What went well", items: good.length ? good : ["Steady month. Nothing stood out."] },
        { h: "Watch", items: watch.length ? watch : ["Nothing urgent."] },
        { h: "Next month", items: next.length ? next : ["Keep the rhythm."] },
      ],
    });
  const ngn = (v: number | null, cur: string) => d.toNGN(Number(v) || 0, cur) || 0;
  const first = (id: number | null) => (d.people.find((p) => p.id === id)?.name ?? "Someone").split(" ")[0];

  if (type === "finance" && d.f) {
    const f = d.f;
    const c = f.plFor(m);
    const p = f.plFor(prevM);
    const tr = f.taxRateFor(m);
    const b = f.budgetFor(m);
    const bt = f.budgetTotal(m);
    const months = Array.from({ length: 6 }, (_, i) => addMonth(m, i - 5));
    const pls = months.map((x) => f.plFor(x));
    slides.push({
      kind: "stats",
      title: "The month in numbers",
      items: [
        { k: "Revenue", v: N(c.rev), s: delta(c.rev, p.rev) },
        { k: "Running costs", v: N(c.opex), s: bt ? `${Math.round((c.opex / bt) * 100)}% of ${N(bt)} budget` : "no budget set" },
        { k: "Net profit", v: N(c.op), s: c.margin !== null ? `${Math.round(c.margin)}% margin` : "-" },
        { k: "Tax to set aside", v: N((Math.max(0, c.op) * tr) / 100), s: `${tr}% of profit` },
      ],
    });
    slides.push({
      kind: "cols",
      title: "Six months of money",
      labels: months.map((x) => monthName(x, true)),
      series: [
        { name: "Revenue", color: BLUE, values: pls.map((x) => x.rev) },
        { name: "Running costs", color: ORANGE, values: pls.map((x) => x.opex) },
      ],
      money: true,
    });
    const cats = OPEX.map((k) => ({ label: catLabel(k), value: c.s.byCat[k] ?? 0, cap: Number(b[k]) || 0 }))
      .filter((x) => x.value || x.cap)
      .sort((a, z) => z.value - a.value)
      .slice(0, 8);
    if (cats.length)
      slides.push({
        kind: "bars",
        title: "Where the money went",
        rows: cats.map((x) => ({ label: x.label, value: x.value, display: `${N(x.value)}${x.cap ? ` of ${N(x.cap)}` : ""}`, color: x.cap && x.value > x.cap ? RED : PINK })),
        note: "Bars show actual spend. Red means over budget.",
      });
    slides.push({
      kind: "table",
      title: "Profit and loss",
      head: ["", monthName(prevM, true), M],
      rows: [
        ["Client fees", N(p.r.services + p.r.retainers), N(c.r.services + c.r.retainers)],
        ["Talent commission", N(p.r.commission), N(c.r.commission)],
        ["Other income", N(p.r.other), N(c.r.other)],
        ["Total revenue", N(p.rev), N(c.rev)],
        ["Co-manager share", N(p.cos), N(c.cos)],
        ["Running costs", N(p.opex), N(c.opex)],
        ["One-off setup costs", N(p.setup), N(c.setup)],
        ["Depreciation", N(p.dep), N(c.dep)],
        ["Net profit", N(p.op), N(c.op)],
        ["Capital purchases", N(p.capex), N(c.capex)],
      ],
      bold: [3, 8],
    });
    const over = OPEX.filter((k) => Number(b[k]) && (c.s.byCat[k] ?? 0) > Number(b[k])).map(catLabel);
    const nextBudget = f.budgetTotal(addMonth(m, 1));
    notes(
      [
        // HQ said "grew 0%" when last month had no revenue; say what came in instead
        c.rev > p.rev ? (p.rev ? `Revenue grew ${Math.round(pctChange(c.rev, p.rev) ?? 0)}% on ${monthName(prevM, true)}.` : `Revenue of ${N(c.rev)} after none in ${monthName(prevM, true)}.`) : "",
        c.margin !== null && c.margin >= 30 ? `Healthy ${Math.round(c.margin)}% net margin.` : "",
        bt && c.opex <= bt ? "Running costs stayed inside budget." : "",
      ].filter(Boolean),
      [over.length ? `Over budget: ${over.join(", ")}.` : "", c.rev < p.rev ? `Revenue fell ${Math.abs(Math.round(pctChange(c.rev, p.rev) ?? 0))}% on last month.` : "", c.op < 0 ? "The month ran at a loss." : ""].filter(Boolean),
      [nextBudget ? `Next month's budget is ${N(nextBudget)}.` : "Set next month's budget.", `Keep ${N((Math.max(0, c.op) * tr) / 100)} aside for tax. First return due ${longDate(f.taxPeriod().due)}.`],
    );
  }

  if (type === "marketing") {
    const t = mktTotals(d, m);
    const p = mktTotals(d, prevM);
    slides.push({
      kind: "stats",
      title: "The month in numbers",
      items: [
        { k: "Total followers", v: t.followers.toLocaleString("en-GB"), s: delta(t.followers, t.prevFollowers) },
        { k: "Reach", v: shortN(t.reach), s: delta(t.reach, p.reach) },
        { k: "Engagement rate", v: t.er === null ? "-" : `${t.er.toFixed(1)}%`, s: `${shortN(t.engagements)} engagements` },
        { k: "Leads", v: String(t.crmLeads + t.leads), s: `${t.won} became clients` },
      ],
    });
    const rows = d.mkt.accounts.map((a) => {
      const s = statOf(d, a.id, m);
      const l = lastStat(d, a.id, m);
      const er = erOf(s);
      return [
        `${d.mkt.platformName(a.platform)}${a.handle ? ` · ${a.handle}` : ""}`,
        l ? Number(l.followers).toLocaleString("en-GB") : "-",
        s ? shortN(Number(s.reach) || 0) : "-",
        er !== null ? `${er.toFixed(1)}%` : "-",
        s ? String(Number(s.posts) || 0) : "-",
        s ? String(Number(s.leads) || 0) : "-",
      ];
    });
    if (rows.length) slides.push({ kind: "table", title: "Platform performance", head: ["Account", "Followers", "Reach", "Engagement", "Posts", "Leads"], rows });
    const pub = d.mkt.posts
      .filter((x) => x.status === "published" && inMonth(x.date, m) && Number(x.reach))
      .sort((a, z) => postER(z) - postER(a))
      .slice(0, 6);
    if (pub.length)
      slides.push({
        kind: "bars",
        title: "Best posts this month",
        rows: pub.map((x) => ({ label: `${d.mkt.platformName(x.platform)} · ${x.title}`, value: postER(x), display: `${postER(x).toFixed(1)}% · ${shortN(Number(x.reach))} reach`, color: PINK })),
        note: "Ranked by engagement rate.",
      });
    const w = d.mkt.web[m];
    if (w)
      slides.push({
        kind: "stats",
        title: "Website",
        items: [
          { k: "Visits", v: (Number(w.sessions) || 0).toLocaleString("en-GB"), s: delta(Number(w.sessions) || 0, Number(d.mkt.web[prevM]?.sessions) || 0) },
          { k: "Visitors", v: (Number(w.users) || 0).toLocaleString("en-GB"), s: `${(Number(w.newUsers) || 0).toLocaleString("en-GB")} new` },
          { k: "Engagement rate", v: w.engagementRate !== null && w.engagementRate !== undefined ? `${Math.round(w.engagementRate * 100)}%` : "-", s: "of visits" },
          { k: "Enquiries", v: String(Number(w.keyEvents) || 0), s: "from the website" },
        ],
      });
    const ads = d.mkt.ads.filter((a) => a.status !== "planned");
    if (ads.length)
      slides.push({
        kind: "table",
        title: "Ads",
        head: ["Campaign", "Spend", "Leads", "Cost per lead", "ROAS"],
        rows: ads.slice(0, 8).map((a) => {
          const sp = Number(a.spend) || 0;
          const ld = Number(a.leads) || 0;
          const rv = Number(a.revenue) || 0;
          return [a.name, money(sp, a.currency || "NGN", true), String(ld), ld ? money(sp / ld, a.currency || "NGN") : "-", sp && rv ? `${(rv / sp).toFixed(1)}x` : "-"];
        }),
      });
    const planned = d.mkt.posts.filter((x) => inMonth(x.date, addMonth(m, 1))).length;
    notes(
      [
        t.followers > t.prevFollowers ? `Gained ${(t.followers - t.prevFollowers).toLocaleString("en-GB")} followers.` : "",
        pub[0] ? `Top post: "${pub[0].title}" at ${postER(pub[0]).toFixed(1)}% engagement.` : "",
        t.crmLeads ? `${t.crmLeads} new leads came in from marketing channels.` : "",
      ].filter(Boolean),
      mktAlerts(d, m)
        .slice(0, 3)
        .map((a) => `${a}.`),
      [planned ? `${planned} posts already planned for ${monthName(addMonth(m, 1), true)}.` : `Plan ${monthName(addMonth(m, 1), true)}'s content.`, "Repeat the format and pillar of the best post."],
    );
  }

  if (type === "sales") {
    const sales = d.contacts.filter((c) => c.kind !== "talent");
    const nw = sales.filter((c) => inMonth(c.createdAt, m));
    const won = sales.filter((c) => c.stage === "won" && inMonth(c.wonAt, m));
    const touches = d.touches.filter((a) => COUNTED_TOUCHES.includes(a.type) && inMonth(a.day, m)).length;
    const open = sales.filter((c) => !["won", "lost"].includes(c.stage));
    const pipe = open.reduce((t, c) => t + ngn(c.value, c.currency), 0);
    const who = (c: { company: string; name: string }) => c.company || c.name;
    slides.push({
      kind: "stats",
      title: "The month in numbers",
      items: [
        { k: "New leads", v: String(nw.length), s: "added to the CRM" },
        { k: "Follow-ups", v: String(touches), s: "calls, messages, emails, meetings" },
        { k: "Clients won", v: String(won.length), s: won.map(who).slice(0, 3).join(", ") || "-" },
        { k: "Open pipeline", v: N(pipe), s: `${open.length} prospects` },
      ],
    });
    slides.push({
      kind: "bars",
      title: "Pipeline by stage",
      rows: SALES_STAGES.filter(([k]) => k !== "lost").map(([k, l]) => {
        const xs = sales.filter((c) => c.stage === k);
        return { label: l, value: xs.length, display: `${xs.length}${xs.length ? ` · ${N(xs.reduce((t, c) => t + ngn(c.value, c.currency), 0))}` : ""}`, color: k === "won" ? GREEN : BLUE };
      }),
    });
    const src = SOURCES.map((s) => ({ label: s, value: nw.filter((c) => c.source === s).length }))
      .filter((x) => x.value)
      .sort((a, z) => z.value - a.value);
    if (src.length) slides.push({ kind: "bars", title: "Where new leads came from", rows: src.map((x) => ({ ...x, display: String(x.value), color: PINK })) });
    const overdue = d.contacts.filter((c) => c.nextDate && c.nextDate < d.today && !["won", "lost", "nofit"].includes(c.stage)).length;
    notes(won.length ? [`Won ${won.map(who).join(", ")}.`] : [], [`${overdue} follow-ups are overdue.`], ["Follow up every proposal within 3 days.", `${open.filter((c) => c.stage === "proposal").length} proposals are waiting on a decision.`]);
  }

  if (type === "clients") {
    const live = d.clients.filter((c) => LIVE.includes(c.status));
    const rec = d.clients.filter((c) => LIVE.includes(c.status) && c.billing !== "project" && c.fee).reduce((t, c) => t + ngn(c.fee, c.currency), 0);
    const renew = live.filter((c) => c.endDate && c.endDate >= d.today && c.endDate <= addDays(d.today, 45));
    slides.push({
      kind: "stats",
      title: "The month in numbers",
      items: [
        { k: "Live clients", v: String(live.length), s: `${live.filter((c) => c.status === "onboarding").length} onboarding` },
        { k: "Monthly retainers", v: N(rec), s: "signed recurring fees" },
        { k: "At risk", v: String(live.filter((c) => c.health === "risk").length), s: `${live.filter((c) => c.health === "watch").length} to watch` },
        { k: "Renewing soon", v: String(renew.length), s: "in the next 45 days" },
      ],
    });
    if (live.length)
      slides.push({
        kind: "table",
        title: "Client health",
        head: ["Client", "Service", "Status", "Health", "Renews"],
        rows: live.map((c) => [c.name, c.service || "", label(CLIENT_STATUS, c.status), label(HEALTH, c.health || "good"), c.endDate ? shortDate(c.endDate) : "-"]),
      });
    const done = d.tasks.filter((x) => x.clientId && x.status === "done" && inMonth(x.doneDay, m));
    slides.push({
      kind: "bars",
      title: "Work delivered per client",
      rows: live
        .map((c) => ({ label: c.name, value: done.filter((x) => x.clientId === c.id).length }))
        .sort((a, z) => z.value - a.value)
        .map((x) => ({ ...x, display: `${x.value} tasks`, color: BLUE })),
    });
    notes(
      live
        .filter((c) => (c.health || "good") === "good")
        .map((c) => `${c.name} is on track.`)
        .slice(0, 3),
      live.filter((c) => (c.health || "good") !== "good").map((c) => `${c.name}: ${label(HEALTH, c.health)}.`),
      renew.map((c) => `Plan ${c.name}'s renewal conversation (${shortDate(c.endDate)}).`),
    );
  }

  if (type === "talent") {
    const name = (id: string | null) => d.talents.find((t) => t.id === id)?.name ?? "Talent";
    const closed = d.deals.filter((x) => ["contracted", "delivering", "completed"].includes(x.stage) && inMonth(x.updatedAt, m));
    const live = d.deals.filter((x) => ["contracted", "delivering"].includes(x.stage));
    const val = closed.reduce((t, x) => t + ngn(x.fee, x.currency), 0);
    const comm = closed.reduce((t, x) => t + (ngn(x.fee, x.currency) * (Number(x.commissionPct) || 0)) / 100, 0);
    slides.push({
      kind: "stats",
      title: "The month in numbers",
      items: [
        { k: "Deals live", v: String(live.length), s: "contracted or delivering" },
        { k: "Deals moved forward", v: String(closed.length), s: "this month" },
        { k: "Deal value", v: N(val), s: "of deals moved forward" },
        { k: "DSS commission", v: N(comm), s: "on those deals" },
      ],
    });
    slides.push({
      kind: "bars",
      title: "Deals by talent",
      rows: d.talents.map((t) => {
        const xs = d.deals.filter((x) => x.talentId === t.id && x.stage !== "lost");
        return { label: t.name, value: xs.length, display: `${xs.length} deals · ${N(xs.reduce((s, x) => s + ngn(x.fee, x.currency), 0))}`, color: ORANGE };
      }),
    });
    const talentContacts = new Set(d.contacts.filter((c) => c.kind === "talent").map((c) => c.id));
    const pitched = new Set(d.touches.filter((a) => talentContacts.has(a.refId) && inMonth(a.day, m)).map((a) => a.refId)).size;
    notes(
      closed.map((x) => `${name(x.talentId)} x ${x.brand}: ${label(DEAL_STAGES, x.stage)}.`).slice(0, 4),
      d.deals
        .filter((x) => x.stage === "negotiating")
        .map((x) => `${name(x.talentId)} x ${x.brand} still negotiating.`)
        .slice(0, 3),
      [`${pitched} brands and agencies were contacted this month.`],
    );
  }

  if (type === "team") {
    const rows = d.people.map((p) => ({
      p,
      done: d.tasks.filter((x) => x.assigneeId === p.id && x.status === "done" && inMonth(x.doneDay, m)).length,
      od: d.tasks.filter((x) => x.assigneeId === p.id && x.status !== "done" && x.due && x.due < d.today).length,
      sc: teamScoreMonth(p.id, m, d),
    }));
    const scored = rows.map((r) => r.sc).filter((x): x is number => x !== null);
    const a = avg(scored);
    slides.push({
      kind: "stats",
      title: "The month in numbers",
      items: [
        { k: "Average KPI score", v: scored.length ? `${Math.round(a)}%` : "-", s: "across the team" },
        { k: "Tasks completed", v: String(rows.reduce((t, r) => t + r.done, 0)), s: "this month" },
        { k: "Overdue now", v: String(rows.reduce((t, r) => t + r.od, 0)), s: "open tasks past due" },
        { k: "Team", v: String(d.people.length), s: "people with access" },
      ],
    });
    slides.push({
      kind: "bars",
      title: "KPI score by person",
      rows: rows.map((r) => ({ label: r.p.name, value: r.sc ?? 0, display: r.sc === null ? "No KPIs" : `${r.sc}%`, color: (r.sc ?? 0) >= 90 ? GREEN : (r.sc ?? 0) >= 60 ? ORANGE : RED })),
      max: 120,
      note: "100% means every target was met.",
    });
    const ids = new Set(d.people.map((p) => p.id));
    slides.push({
      kind: "table",
      title: "KPIs in detail",
      head: ["Person", "KPI", "Target", "Score"],
      rows: d.kpis
        .filter((k) => k.ownerId !== null && ids.has(k.ownerId))
        .map((k) => {
          const p = kpiMonthPct(k, m, d);
          return [first(k.ownerId), k.title, `${formatKpi(k.unit, k.target)} ${label(KPI_PERIODS, k.period || "month").toLowerCase()}`, p === null ? "Not logged" : `${Math.round(p)}%`];
        })
        .slice(0, 14),
    });
    notes(
      rows.filter((r) => (r.sc ?? 0) >= 100).map((r) => `${first(r.p.id)} hit every target.`),
      [...rows.filter((r) => r.sc !== null && r.sc < 60).map((r) => `${first(r.p.id)} is below 60%. Talk it through this week.`), ...rows.filter((r) => r.sc === null).map((r) => `${first(r.p.id)} has no KPIs logged.`)],
      ["Review KPIs in each 1:1.", "Approve or adjust any proposed KPIs."],
    );
  }

  if (type === "overview") {
    const items: StatItem[] = [];
    if (d.f) {
      const c = d.f.plFor(m);
      items.push({ k: "Revenue", v: N(c.rev), s: `${Math.round((c.rev / (d.monthlyGoal || 20000000)) * 100)}% of goal` }, { k: "Net profit", v: N(c.op), s: c.margin !== null ? `${Math.round(c.margin)}% margin` : "-" });
    }
    const live = d.clients.filter((c) => LIVE.includes(c.status));
    items.push({ k: "Live clients", v: String(live.length), s: `${live.filter((c) => c.health === "risk").length} at risk` });
    items.push({ k: "Clients won", v: String(d.contacts.filter((c) => c.kind !== "talent" && c.stage === "won" && inMonth(c.wonAt, m)).length), s: "this month" });
    if (d.mkt.accounts.length) {
      const t = mktTotals(d, m);
      items.push({ k: "Followers", v: t.followers.toLocaleString("en-GB"), s: delta(t.followers, t.prevFollowers) });
    }
    const scored = d.people.map((p) => teamScoreMonth(p.id, m, d)).filter((x): x is number => x !== null);
    items.push({ k: "Team KPI score", v: scored.length ? `${Math.round(avg(scored))}%` : "-", s: "average" });
    slides.push({ kind: "stats", title: "Digital Savvy Studios this month", items: items.slice(0, 4) });
    if (items.length > 4) slides.push({ kind: "stats", title: "And also", items: items.slice(4) });
    notes([], [], ["Read each area's own report for the detail."]);
  }

  slides.push({ kind: "close", title: "Excellence, made visible.", sub: `${repLabel(type)} report · ${M}` });
  return { type, month: m, title: `${repLabel(type)} report · ${M}`, slides };
}

/** The month a new report defaults to: last month in the first week, otherwise this one. */
export const defaultReportMonth = (today: string) => (Number(today.slice(8)) <= 7 ? addMonth(today.slice(0, 7), -1) : today.slice(0, 7));
