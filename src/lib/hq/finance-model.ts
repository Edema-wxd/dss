import { invCalc, invStatus, type InvoiceLike } from "./invoice-model";
import { addDays } from "./work";

// The Finance engine: HQ's revenueFor, spendFor, plFor, ownerFor, cashAt, depreciation and tax
// (f-finance.js, HQ version 24), ported formula for formula so the numbers match the books.
// Pure: it takes everything as data, so the server, the reports and the tests share it.
// Nothing is rounded here; rounding is for display only.

/* ── Constants ───────────────────────────────────────────────────────── */

export const EXP_CATS = [
  ["salaries", "Salaries and wages", "opex", "rose"],
  ["contractors", "Freelancers and contractors", "opex", "sky"],
  ["transport", "Transport and fuel", "opex", "sunset"],
  ["data", "Phone, data and airtime", "opex", "aqua"],
  ["subs", "Software and subscriptions", "opex", "sky"],
  ["supplies", "Office supplies and small equipment", "opex", "lime"],
  ["bizdev", "Business development and events", "opex", "rose"],
  ["marketing", "Marketing and content", "opex", "rose"],
  ["ads", "Paid ads", "opex", "sunset"],
  ["ops", "Operations and admin", "opex", "ink"],
  ["workspace", "Workspace, power and internet", "opex", "aqua"],
  ["professional", "Accounting and ongoing compliance", "opex", "ink"],
  ["bank", "Bank charges and stamp duty", "opex", "faint"],
  ["training", "Training and courses", "opex", "lime"],
  ["other", "Other business expenses", "opex", "faint"],
  ["cos", "Co-manager commission share", "cos", "sky"],
  ["setup_design", "One-off: design and web development", "setup", "rose"],
  ["setup_legal", "One-off: legal, trademark and registration", "setup", "ink"],
  ["capital", "Capital: equipment and devices", "capex", "sky"],
  ["capital_brand", "Capital: website, trademark and brand assets", "capex", "rose"],
  ["taxes", "Taxes and levies paid", "tax", "bad"],
  ["loan", "Loan repayments", "financing", "faint"],
  ["talent_payout", "Talent payout (their share of a deal)", "pass", "faint"],
  ["owner_draw", "Owner: transfer to your personal account", "owner", "faint"],
  ["owner_personal", "Owner: personal spending from the business account", "owner", "faint"],
  ["owner_savings", "Owner: savings and investments", "owner", "faint"],
  ["suspense", "To confirm (not sure yet)", "suspense", "faint"],
] as const;
export type CatGroup = (typeof EXP_CATS)[number][2];
export const OPEX = EXP_CATS.filter((c) => c[2] === "opex").map((c) => c[0]) as string[];
export const CAT_GROUPS: readonly [CatGroup, string][] = [
  ["opex", "Running costs"],
  ["cos", "Cost of sales"],
  ["setup", "One-off setup costs"],
  ["capex", "Capital purchases"],
  ["tax", "Tax"],
  ["financing", "Loan"],
  ["pass", "Talent pass-through"],
  ["owner", "Owner movements (not a cost)"],
  ["suspense", "To confirm"],
];
const CAT = new Map<string, (typeof EXP_CATS)[number]>(EXP_CATS.map((c) => [c[0], c]));
/** Unknown categories count as "other", a running cost, as HQ did. */
export const catOf = (key: string) => CAT.get(key) ?? CAT.get("other")!;
export const catGroup = (key: string): CatGroup => catOf(key)[2];
export const catLabel = (key: string) => catOf(key)[1];

export const INC_TYPES = [
  ["services", "Client fees"],
  ["commission", "Talent commission"],
  ["products", "Digital products"],
  ["speaking", "Speaking and training"],
  ["other", "Other income"],
  ["talent_receipt", "Talent deal money in (HQ keeps the commission, the rest goes out as a payout)"],
  ["owner", "Owner top-up (money you put in)"],
  ["loan", "Loan received"],
] as const;
export const NOT_REVENUE = ["talent_receipt", "owner", "loan"];
export const isRev = (x: { type: string }) => !NOT_REVENUE.includes(x.type);
export const ACCTS = [
  ["business", "Business account"],
  ["personal", "Your personal account"],
] as const;
export const EXP_METHODS = ["Bank transfer", "Card", "Cash", "Paystack", "Other"] as const;
export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD"] as const;
export const TAXR = { cit: 30, levy: 4 };
const LIVE = ["active", "onboarding", "offboarding"];

/* ── Inputs ──────────────────────────────────────────────────────────── */

export type Expense = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  cat: string;
  acct: string;
  description: string;
  vendor: string;
  method: string;
  clientId: string | null;
  assetId: string | null;
  recurring: boolean;
  receipt: string;
  source: string;
};
export type Income = {
  id: string;
  date: string;
  amount: number;
  currency: string;
  type: string;
  acct: string;
  description: string;
  from: string;
  clientId: string | null;
  period: string;
  source: string;
};
export type BookedLine = { clientId: string; name: string; fee: number; currency: string; skip?: boolean; backfilled?: boolean };
export type Booked = { month: string; locked: boolean; source: string; lines: BookedLine[]; seen: string[] };
export type Asset = { id: string; name: string; cost: number; date: string; firstMonth: string; life: number | null; notes: string };
export type Budget = { month: string; revenue: number | null; cats: Record<string, number> };
export type FinClient = {
  id: string;
  name: string;
  status: string;
  health: string;
  billing: string;
  fee: number | null;
  currency: string;
  startDate: string;
  endDate: string;
  leavingOn: string;
  payMode: string;
  payDay: number | null;
};
export type FinInvoice = InvoiceLike & {
  id: string;
  no: string;
  billTo?: { name?: string };
  kind: string;
  clientId: string | null;
  currency: string;
  commissionPct: number | null;
  period: string;
  issueDate: string;
};
export type FinSettings = {
  openingCash?: number;
  openingDate?: string;
  statements?: Record<string, number | null>;
  booksTo?: string;
  importedFrom?: string;
  loanBalance?: number;
  targets?: { netProfit?: number; exit?: number };
  tax?: {
    incorporated?: string;
    periodEnd?: string;
    dueOverride?: string;
    reserveRate?: number;
    professional?: boolean;
    treatment?: string;
    fixedAssets?: number;
    targetMargin?: number;
    cash?: number;
    tin?: string;
    adviser?: string;
  };
};
export type Books = {
  today: string;
  fx: Record<string, number | undefined>;
  settings: FinSettings;
  expenses: readonly Expense[];
  income: readonly Income[];
  invoices: readonly FinInvoice[];
  booked: readonly Booked[];
  assets: readonly Asset[];
  budgets: readonly Budget[];
  clients: readonly FinClient[];
};

/* ── Months and windows ──────────────────────────────────────────────── */

export const monthKey = (day: string) => day.slice(0, 7);
export function addMonth(m: string, n: number) {
  const [y, mo] = m.split("-").map(Number);
  const t = y * 12 + (mo - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export const monthEnd = (m: string) => addDays(`${addMonth(m, 1)}-01`, -1);
export const daysIn = (m: string) => Number(monthEnd(m).slice(8));
export function monthsIn(from: string, to: string) {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7) && out.length < 120; m = addMonth(m, 1)) out.push(m);
  return out;
}
export const monthsBetween = (a: string, b: string) => {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const inWin = (d: string, m: string | null, a?: string, b?: string) => !!d && (a ? d >= a && d <= b! : m ? d.slice(0, 7) === m : true);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (m: string, short = false) => `${(short ? MONTHS : MONTHS_LONG)[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

export const FIN_RANGES = [
  ["7d", "7 days"],
  ["14d", "14 days"],
  ["month", "Month"],
  ["90d", "90 days"],
  ["6m", "6 months"],
] as const;
export type Win = { key: string; from: string; to: string; label: string; short: string; month?: string };

export function finWindow(key: string, m: string, today: string): Win {
  const back = (n: number, label: string, short: string) => ({ key, from: addDays(today, -n), to: today, label, short });
  if (key === "7d") return back(6, "the last 7 days", "7 days");
  if (key === "14d") return back(13, "the last 14 days", "14 days");
  if (key === "90d") return back(89, "the last 90 days", "90 days");
  if (key === "6m") return { key, from: `${addMonth(monthKey(today), -5)}-01`, to: today, label: "the last 6 months", short: "6 months" };
  return { key: "month", from: `${m}-01`, to: monthEnd(m), label: monthName(m), short: monthName(m, true), month: m };
}

export function prevWindow(w: Win): Win {
  if (w.month) {
    const m = addMonth(w.month, -1);
    return { key: "month", from: `${m}-01`, to: monthEnd(m), label: monthName(m), short: monthName(m, true), month: m };
  }
  const len = dayDiff(w.from, w.to) + 1;
  return { ...w, from: addDays(w.from, -len), to: addDays(w.from, -1) };
}

export type Bucket = { label: string; from: string; to: string; month?: string };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function buckets(w: Win): Bucket[] {
  if (w.month) return monthsIn(addMonth(w.month, -5), w.month).map((m) => ({ label: MONTHS[Number(m.slice(5)) - 1], from: `${m}-01`, to: monthEnd(m), month: m }));
  const len = dayDiff(w.from, w.to) + 1;
  const out: Bucket[] = [];
  if (len <= 14) {
    for (let d = w.from; d <= w.to; d = addDays(d, 1))
      out.push({ label: len <= 7 ? WEEKDAYS[new Date(`${d}T12:00:00Z`).getUTCDay()] : String(Number(d.slice(8))), from: d, to: d });
  } else if (len <= 100) {
    for (let d = w.from; d <= w.to; d = addDays(d, 7)) {
      const to = addDays(d, 6) < w.to ? addDays(d, 6) : w.to;
      out.push({ label: `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`, from: d, to });
    }
  } else {
    for (const m of monthsIn(w.from, w.to)) {
      const from = `${m}-01` > w.from ? `${m}-01` : w.from;
      const to = monthEnd(m) < w.to ? monthEnd(m) : w.to;
      out.push({ label: MONTHS[Number(m.slice(5)) - 1], from, to, month: m });
    }
  }
  return out;
}

export const pctChange = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : null);

/* ── Results ─────────────────────────────────────────────────────────── */

export type Revenue = {
  services: number;
  retainers: number;
  commission: number;
  other: number;
  vat: number;
  wht: number;
  total: number;
  collected: number;
  missing: boolean;
};
export type Spend = Record<CatGroup | "total", number> & { byCat: Record<string, number>; missing: boolean };
export type PL = {
  m: string | null;
  rev: number;
  r: Revenue;
  s: Spend;
  cos: number;
  gross: number;
  opex: number;
  setup: number;
  dep: number;
  totalOpex: number;
  capex: number;
  op: number;
  preSetup: number;
  margin: number | null;
  gm: number | null;
};
export type Owner = {
  injection: number;
  loanIn: number;
  talentIn: number;
  bankIn: number;
  intoPersonal: number;
  drawings: number;
  personal: number;
  savings: number;
  capex: number;
  suspense: number;
  loanOut: number;
  talentOut: number;
  paidPersonally: number;
  bankOut: number;
  putIn: number;
  takenOut: number;
};

const zeroRev = (): Revenue => ({ services: 0, retainers: 0, commission: 0, other: 0, vat: 0, wht: 0, total: 0, collected: 0, missing: false });
const zeroSpend = (): Spend => ({
  byCat: {},
  opex: 0,
  cos: 0,
  setup: 0,
  capex: 0,
  tax: 0,
  financing: 0,
  pass: 0,
  owner: 0,
  suspense: 0,
  total: 0,
  missing: false,
});
const zeroOwner = (): Owner => ({
  injection: 0,
  loanIn: 0,
  talentIn: 0,
  bankIn: 0,
  intoPersonal: 0,
  drawings: 0,
  personal: 0,
  savings: 0,
  capex: 0,
  suspense: 0,
  loanOut: 0,
  talentOut: 0,
  paidPersonally: 0,
  bankOut: 0,
  putIn: 0,
  takenOut: 0,
});

/** Adds months together and works the margins out again from the totals. */
export function sumPL(list: readonly PL[]): PL {
  const out: PL = { m: null, rev: 0, r: zeroRev(), s: zeroSpend(), cos: 0, gross: 0, opex: 0, setup: 0, dep: 0, totalOpex: 0, capex: 0, op: 0, preSetup: 0, margin: null, gm: null };
  for (const p of list) {
    for (const k of ["rev", "cos", "gross", "opex", "setup", "dep", "totalOpex", "capex", "op", "preSetup"] as const) out[k] += p[k];
    for (const k of Object.keys(out.r) as (keyof Revenue)[]) {
      if (k === "missing") out.r.missing ||= p.r.missing;
      else out.r[k] += p.r[k];
    }
    for (const k of Object.keys(out.s) as (keyof Spend)[]) {
      if (k === "byCat") for (const [c, v] of Object.entries(p.s.byCat)) out.s.byCat[c] = (out.s.byCat[c] ?? 0) + v;
      else if (k === "missing") out.s.missing ||= p.s.missing;
      else out.s[k] += p.s[k];
    }
  }
  out.margin = out.rev ? (out.op / out.rev) * 100 : null;
  out.gm = out.rev ? (out.gross / out.rev) * 100 : null;
  return out;
}

/* ── The engine ──────────────────────────────────────────────────────── */

export function finance(b: Books) {
  const today = b.today;
  const thisMonth = monthKey(today);
  const S = b.settings;
  const T = S.tax ?? {};
  const bookedByMonth = new Map(b.booked.map((d) => [d.month, d]));
  const budgets = new Map(b.budgets.map((d) => [d.month, d]));

  /** Naira for an amount; null when there's no rate for its currency. */
  const toNGN = (a: number, cur?: string | null): number | null => {
    if (!cur || cur === "NGN") return Number(a) || 0;
    const r = Number(b.fx[cur]);
    return r ? (Number(a) || 0) * r : null;
  };

  /* retainers */
  const retainerQualifies = (c: FinClient, m: string) =>
    (["active", "offboarding"].includes(c.status) || (c.status === "ended" && !!c.leavingOn && c.leavingOn >= `${m}-01`)) &&
    (c.health || "good") === "good" &&
    (c.billing || "monthly") === "monthly" &&
    Number(c.fee) > 0 &&
    (!c.startDate || c.startDate <= monthEnd(m)) &&
    (!c.endDate || c.endDate >= `${m}-01`);

  const liveLines = (m: string): BookedLine[] =>
    b.clients.filter((c) => retainerQualifies(c, m)).map((c) => ({ clientId: c.id, name: c.name, fee: Number(c.fee), currency: c.currency || "NGN" }));

  /** The retainers counted for a month: locked or past months as booked, this month live. */
  function bookedFor(m: string): BookedLine[] {
    const d = bookedByMonth.get(m);
    if (d && (d.locked || m < thisMonth)) return d.lines;
    if (m === thisMonth) {
      const skip = new Set((d?.lines ?? []).filter((l) => l.skip).map((l) => l.clientId));
      return liveLines(m).map((l) => (skip.has(l.clientId) ? { ...l, skip: true } : l));
    }
    return d?.lines ?? [];
  }
  const bookedIdsCache = new Map<string, Set<string>>();
  const bookedIds = (m: string) => {
    let s = bookedIdsCache.get(m);
    if (!s) bookedIdsCache.set(m, (s = new Set(bookedFor(m).filter((l) => !l.skip).map((l) => l.clientId))));
    return s;
  };

  function revenueFor(m: string | null, a?: string, bb?: string, frac = 1): Revenue {
    const r = zeroRev();
    if (m) {
      for (const l of bookedFor(m)) {
        if (l.skip) continue;
        const v = toNGN(l.fee, l.currency);
        if (v === null) r.missing = true;
        else r.retainers += v * frac;
      }
    }
    for (const i of b.invoices) {
      if (i.status === "void") continue;
      const c = invCalc(i);
      const net = c.total ? (c.total - c.vat) / c.total : 1;
      const vatShare = c.total ? c.vat / c.total : 0;
      for (const p of i.payments) {
        if (!inWin(p.date, m, a, bb)) continue;
        const gross = (Number(p.amt) || 0) + (Number(p.wht) || 0);
        const part = i.kind === "talent" ? (gross * net * (Number(i.commissionPct) || 0)) / 100 : gross * net;
        const v = toNGN(part, i.currency);
        if (v === null) {
          r.missing = true;
          continue;
        }
        r.collected += v;
        const per = i.period || (i.issueDate || "").slice(0, 7);
        if (i.kind === "client" && i.clientId && per && bookedIds(per).has(i.clientId)) {
          // already counted as a retainer
        } else if (i.kind === "client") r.services += v;
        else r.commission += v;
        r.vat += toNGN(gross * vatShare, i.currency) || 0;
        r.wht += toNGN(Number(p.wht) || 0, i.currency) || 0;
      }
    }
    for (const x of b.income) {
      if (x.type !== "talent_receipt" || !inWin(x.date, m, a, bb)) continue;
      const v = toNGN(x.amount, x.currency);
      if (v === null) {
        r.missing = true;
        continue;
      }
      r.commission += v;
      r.collected += v;
    }
    for (const e of b.expenses) if (e.cat === "talent_payout" && inWin(e.date, m, a, bb)) r.commission -= toNGN(e.amount, e.currency) || 0;
    for (const x of b.income) {
      if (!isRev(x) || !inWin(x.date, m, a, bb)) continue;
      const v = toNGN(x.amount, x.currency);
      if (v === null) {
        r.missing = true;
        continue;
      }
      r.collected += v;
      if (x.clientId && x.period && bookedIds(x.period).has(x.clientId)) continue;
      if (x.type === "commission") r.commission += v;
      else if (x.type === "services") r.services += v;
      else r.other += v;
    }
    r.total = r.retainers + r.services + r.commission + r.other;
    return r;
  }

  function spendFor(m: string | null, a?: string, bb?: string): Spend {
    const s = zeroSpend();
    for (const e of b.expenses) {
      if (!inWin(e.date, m, a, bb)) continue;
      const v = toNGN(e.amount, e.currency);
      if (v === null) {
        s.missing = true;
        continue;
      }
      const cat = CAT.has(e.cat) ? e.cat : "other";
      const g = catGroup(cat);
      s.byCat[cat] = (s.byCat[cat] ?? 0) + v;
      s[g] += v;
      if (g !== "owner" && g !== "suspense" && g !== "pass") s.total += v;
    }
    return s;
  }

  /* depreciation */
  const assetLife = (x: Asset) => Number(x.life) || 36;
  const assetMonthly = (x: Asset) => (Number(x.cost) || 0) / Math.max(1, assetLife(x));
  const assetFirst = (x: Asset) => x.firstMonth || (x.date || "").slice(0, 7);
  const assetOn = (x: Asset, m: string) => {
    const f = assetFirst(x);
    return !!f && m >= f && m <= addMonth(f, assetLife(x) - 1);
  };
  const depFor = (m: string, frac = 1) => b.assets.reduce((t, x) => t + (assetOn(x, m) ? assetMonthly(x) : 0), 0) * frac;
  function assetNBV(x: Asset, asAt: string) {
    const f = assetFirst(x);
    if (!f || asAt < f) return Number(x.cost) || 0;
    const n = Math.min(assetLife(x), monthsBetween(f, asAt) + 1);
    return Math.max(0, (Number(x.cost) || 0) - assetMonthly(x) * n);
  }

  function plFor(m: string, a?: string, bb?: string, frac = 1): PL {
    const r = revenueFor(m, a, bb, frac);
    const s = spendFor(m, a, bb);
    const dep = depFor(m, frac);
    const gross = r.total - s.cos;
    const totalOpex = s.opex + s.setup + dep;
    const net = gross - totalOpex;
    return {
      m,
      rev: r.total,
      r,
      s,
      cos: s.cos,
      gross,
      opex: s.opex,
      setup: s.setup,
      dep,
      totalOpex,
      capex: s.capex,
      op: net,
      preSetup: net + s.setup,
      margin: r.total ? (net / r.total) * 100 : null,
      gm: r.total ? (gross / r.total) * 100 : null,
    };
  }

  /** Splits a date range by month; part months count their share of retainers and depreciation. */
  const clip = (from: string, to: string) =>
    monthsIn(from, to).map((m) => {
      const a = from > `${m}-01` ? from : `${m}-01`;
      const bb = to < monthEnd(m) ? to : monthEnd(m);
      return { m, a, b: bb, frac: (dayDiff(a, bb) + 1) / daysIn(m) };
    });
  const plIn = (from: string, to: string) => sumPL(clip(from, to).map((x) => plFor(x.m, x.a, x.b, x.frac)));

  function ownerFor(m: string | null, a?: string, bb?: string): Owner {
    const o = zeroOwner();
    for (const x of b.income) {
      if (!inWin(x.date, m, a, bb)) continue;
      const v = toNGN(x.amount, x.currency) || 0;
      if (x.type === "owner") o.injection += v;
      else if (x.type === "loan") o.loanIn += v;
      else if (x.type === "talent_receipt") o.talentIn += v;
      if (x.acct === "personal") o.intoPersonal += v;
      else o.bankIn += v;
    }
    for (const e of b.expenses) {
      if (!inWin(e.date, m, a, bb)) continue;
      const v = toNGN(e.amount, e.currency) || 0;
      const g = catGroup(e.cat);
      if (e.cat === "owner_draw") o.drawings += v;
      else if (e.cat === "owner_personal") o.personal += v;
      else if (e.cat === "owner_savings") o.savings += v;
      else if (g === "capex") o.capex += v;
      else if (g === "suspense") o.suspense += v;
      else if (g === "financing") o.loanOut += v;
      else if (g === "pass") o.talentOut += v;
      if (e.acct === "personal") {
        if (v >= 0) o.paidPersonally += v;
        else o.intoPersonal += -v;
      } else if (v >= 0) o.bankOut += v;
      else o.bankIn += -v;
    }
    o.putIn = o.injection + o.paidPersonally;
    o.takenOut = o.drawings + o.personal + o.savings + o.intoPersonal;
    return o;
  }
  function ownerIn(from: string, to: string): Owner {
    const out = zeroOwner();
    for (const x of clip(from, to)) {
      const o = ownerFor(x.m, x.a, x.b);
      for (const k of Object.keys(out) as (keyof Owner)[]) out[k] += o[k];
    }
    return out;
  }

  /** Business account balance at the end of a day, from the opening balance. */
  function cashAt(dateKey: string) {
    const from = S.openingDate || "2026-01-01";
    let c = Number(S.openingCash) || 0;
    const ok = (d: string) => !!d && d >= from && d <= dateKey;
    for (const x of b.income) if (x.acct !== "personal" && ok(x.date)) c += toNGN(x.amount, x.currency) || 0;
    for (const e of b.expenses) if (e.acct !== "personal" && ok(e.date)) c -= toNGN(e.amount, e.currency) || 0;
    for (const i of b.invoices) for (const p of i.payments) if (ok(p.date)) c += toNGN(Number(p.amt) || 0, i.currency) || 0;
    return c;
  }

  /* tax */
  function taxPeriod() {
    const start = T.incorporated || "2026-11-01";
    const end = T.periodEnd || "2027-12-31";
    const a = addMonthsDay(start, 18);
    const bb = addMonthsDay(end, 6);
    const auto = a < bb ? a : bb;
    return { start, end, due: T.dueOverride || auto, provisional: !T.incorporated };
  }
  function smallCo() {
    const start = taxPeriod().start;
    const months = Math.max(1, monthsBetween(monthKey(start), thisMonth) + 1);
    const annual = (monthsIn(start, today).reduce((t, m) => t + revenueFor(m).total, 0) / months) * 12;
    const fixed = Number(T.fixedAssets) || b.expenses.filter((e) => catGroup(e.cat) === "capex").reduce((t, e) => t + (toNGN(e.amount, e.currency) || 0), 0);
    const prof = T.professional !== false;
    let small = annual <= 100e6 && fixed <= 250e6 && !prof;
    if (T.treatment === "small") small = true;
    if (T.treatment === "standard") small = false;
    return { small, annual, fixed, prof };
  }
  const taxRate = () => (smallCo().small ? 0 : TAXR.cit + TAXR.levy);
  const taxRateFor = (m?: string) => (!T.incorporated || (m || thisMonth) < T.incorporated.slice(0, 7) ? Number(T.reserveRate ?? 20) : taxRate());

  /* budgets */
  const budgetFor = (m: string) => budgets.get(m)?.cats ?? {};
  const budgetTotal = (m: string) => OPEX.reduce((t, k) => t + (Number(budgetFor(m)[k]) || 0), 0);
  const budgetRevenue = (m: string) => budgets.get(m)?.revenue ?? null;

  /** Monthly fees from live clients billed monthly. */
  const recurring = () =>
    b.clients.filter((c) => LIVE.includes(c.status) && c.billing !== "project" && c.fee).reduce((t, c) => t + (toNGN(Number(c.fee), c.currency) || 0), 0);

  /** Command centre numbers. */
  function finStats() {
    const rv = revenueFor(thisMonth);
    let outNGN = 0;
    let overdue = 0;
    let open = 0;
    let missing = rv.missing;
    for (const i of b.invoices) {
      const st = invStatus(i, today);
      if (st === "overdue") overdue++;
      if (st === "sent" || st === "part" || st === "overdue") {
        open++;
        const v = toNGN(invCalc(i).balance, i.currency);
        if (v === null) missing = true;
        else outNGN += v;
      }
    }
    return { revNGN: rv.total, cashNGN: rv.collected, retainNGN: rv.retainers, commNGN: rv.commission, outNGN, open, overdue, missing };
  }

  /** What a client has brought in, cost and still owes. */
  function clientMoney(clientId: string) {
    let inAll = 0;
    let inMonth = 0;
    let owed = 0;
    for (const i of b.invoices) {
      if (i.clientId !== clientId || i.status === "void") continue;
      const c = invCalc(i);
      const net = c.total ? (c.total - c.vat) / c.total : 1;
      for (const p of i.payments) {
        const v = toNGN(((Number(p.amt) || 0) + (Number(p.wht) || 0)) * net, i.currency) || 0;
        inAll += v;
        if (p.date?.slice(0, 7) === thisMonth) inMonth += v;
      }
      if (["sent", "part", "overdue"].includes(invStatus(i, today))) owed += toNGN(c.balance, i.currency) || 0;
    }
    for (const x of b.income) {
      if (x.clientId !== clientId) continue;
      const v = toNGN(x.amount, x.currency) || 0;
      inAll += v;
      if (x.date.slice(0, 7) === thisMonth) inMonth += v;
    }
    const out = b.expenses.filter((e) => e.clientId === clientId).reduce((t, e) => t + (toNGN(e.amount, e.currency) || 0), 0);
    const profit = inAll - out;
    return { inAll, inMonth, out, owed, profit, margin: inAll ? (profit / inAll) * 100 : null };
  }

  return {
    today,
    thisMonth,
    settings: S,
    toNGN,
    retainerQualifies,
    liveLines,
    bookedFor,
    bookedIds,
    revenueFor,
    spendFor,
    depFor,
    assetMonthly,
    assetFirst,
    assetNBV,
    plFor,
    plIn,
    ownerFor,
    ownerIn,
    cashAt,
    taxPeriod,
    smallCo,
    taxRate,
    taxRateFor,
    budgetFor,
    budgetTotal,
    budgetRevenue,
    recurring,
    finStats,
    clientMoney,
  };
}
export type Finance = ReturnType<typeof finance>;

/** HQ added months with Date.setMonth, which rolls 31 Jan + 1 month into March. Same here. */
function addMonthsDay(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Year-to-date profit as the books report it: whole months from January to the books month. */
export const ytdProfit = (f: Finance, toMonth: string) => sumPL(monthsIn(`${toMonth.slice(0, 4)}-01`, toMonth).map((m) => f.plFor(m))).op;

/** PAYE on a monthly salary, from Nigeria's annual bands. */
export function payeMonthly(monthly: number) {
  const bands: [number, number][] = [
    [800000, 0],
    [2200000, 15],
    [9000000, 18],
    [13000000, 21],
    [25000000, 23],
    [Infinity, 25],
  ];
  let left = monthly * 12;
  let tax = 0;
  for (const [size, rate] of bands) {
    const part = Math.min(left, size);
    tax += (part * rate) / 100;
    left -= part;
    if (left <= 0) break;
  }
  return tax / 12;
}

/* ── Retainers this month, and what needs attention ──────────────────── */

export type RetainerRow = BookedLine & { status: string; tone: "plain" | "ok" | "sky" | "bad" | "warn"; paid: number; auto: boolean; invoiced: boolean; late: boolean };

/** Each retainer line for a month with where it stands: paid, part paid, invoiced, or not yet. */
export function retainerRows(f: Finance, b: Books, m: string): RetainerRow[] {
  const today = b.today;
  return f.bookedFor(m).map((l) => {
    const c = b.clients.find((x) => x.id === l.clientId);
    const auto = c?.payMode === "auto";
    const invs = b.invoices.filter((i) => i.clientId === l.clientId && i.status !== "void" && (i.period || i.issueDate.slice(0, 7)) === m);
    let paid = 0;
    for (const i of invs) {
      const k = invCalc(i);
      const net = k.total ? (k.total - k.vat) / k.total : 1;
      for (const p of i.payments) if (p.date?.slice(0, 7) === m) paid += (((Number(p.amt) || 0) + (Number(p.wht) || 0)) * net);
    }
    const incomeForPeriod = b.income.filter((x) => x.clientId === l.clientId && x.period === m).reduce((t, x) => t + (Number(x.amount) || 0), 0);
    paid += incomeForPeriod;
    const fee = Number(l.fee) || 0;
    const dueDay = Math.min(28, Number(c?.payDay) || 1);
    const late = auto && m === monthKey(today) && today > addDays(`${m}-${String(dueDay).padStart(2, "0")}`, 3) && incomeForPeriod < fee - 1;
    const base = { ...l, paid, auto, invoiced: invs.length > 0, late };
    if (l.skip) return { ...base, status: "Not counted", tone: "plain" };
    if (paid >= fee - 1) return { ...base, status: auto ? "Received" : "Paid", tone: "ok" };
    if (paid > 0) return { ...base, status: "Part paid", tone: "sky" };
    if (late) return { ...base, status: "Auto payment late", tone: "bad" };
    if (auto) return { ...base, status: `Auto payment due on the ${ordinal(dueDay)}`, tone: "plain" };
    if (invs.length) return { ...base, status: "Invoiced, not paid", tone: "warn" };
    return { ...base, status: "Not invoiced yet", tone: "warn" };
  });
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

export type Alert = { title: string; detail?: string; tone: "bad" | "warn" | "sky" };

/** The "Needs attention" list on the Finance overview, in HQ's order. */
export function finAlerts(f: Finance, b: Books, m: string): Alert[] {
  const out: Alert[] = [];
  const today = b.today;
  const bud = f.budgetFor(m);
  const s = f.spendFor(m);
  for (const k of OPEX) {
    const cap = Number(bud[k]) || 0;
    if (cap > 0 && (s.byCat[k] ?? 0) > cap) out.push({ title: `${catLabel(k)} is over budget`, detail: `Spent ${Math.round(s.byCat[k])} of ${Math.round(cap)}.`, tone: "bad" });
  }
  const next = addMonth(m, 1);
  if (m === monthKey(today) && Number(today.slice(8)) >= 20 && !f.budgetTotal(next)) out.push({ title: "Next month has no budget yet", detail: `Set ${monthName(next)}'s budget before it starts.`, tone: "warn" });
  if (!f.budgetTotal(m)) out.push({ title: `No budget set for ${monthName(m)}`, tone: "warn" });
  const r = f.revenueFor(m);
  if (r.missing || s.missing) out.push({ title: "Some amounts aren't counted", detail: "Add exchange rates in Settings so foreign currency counts.", tone: "warn" });
  if (r.vat > 0) out.push({ title: `VAT of ${Math.round(r.vat).toLocaleString("en-NG")} collected in ${monthName(m, true).slice(0, 3)}`, detail: `Remit by 21 ${monthName(next)}.`, tone: "sky" });
  if (m === monthKey(today)) {
    const rows = retainerRows(f, b, m);
    const late = rows.filter((x) => x.late && !x.skip).length;
    if (late) out.push({ title: `${late} automatic payment${late === 1 ? "" : "s"} not received`, tone: "bad" });
    if (Number(today.slice(8)) >= 3) {
      const notInv = rows.filter((x) => !x.skip && !x.auto && !x.invoiced && x.paid < (Number(x.fee) || 0) - 1).length;
      if (notInv) out.push({ title: `${notInv} confirmed retainer${notInv === 1 ? "" : "s"} not invoiced yet`, detail: "Create them from Invoices, This month's retainers.", tone: "warn" });
    }
  }
  const sus = b.expenses.filter((e) => catGroup(e.cat) === "suspense").length;
  if (sus) out.push({ title: `${sus} item${sus === 1 ? "" : "s"} still to confirm`, detail: "Give each one a category so profit is right.", tone: "warn" });
  const overdue = b.invoices.filter((i) => invStatus(i, today) === "overdue").length;
  if (overdue) out.push({ title: `${overdue} overdue invoice${overdue === 1 ? "" : "s"}`, tone: "bad" });
  return out;
}

/** Every money movement in a window, newest first: expenses out, income in, invoice payments in. */
export function finTxns(b: Books, from: string, to: string) {
  const out: { id: string; date: string; label: string; amount: number; currency: string; kind: "expense" | "income" | "payment"; personal: boolean; ref?: string }[] = [];
  for (const e of b.expenses) if (e.date >= from && e.date <= to) out.push({ id: e.id, date: e.date, label: e.description || catLabel(e.cat), amount: -e.amount, currency: e.currency, kind: "expense", personal: e.acct === "personal" });
  for (const x of b.income) if (x.date >= from && x.date <= to) out.push({ id: x.id, date: x.date, label: x.description || x.from, amount: x.amount, currency: x.currency, kind: "income", personal: x.acct === "personal" });
  for (const i of b.invoices)
    i.payments.forEach((p, n) => {
      if (p.date >= from && p.date <= to) out.push({ id: `${i.id}:${n}`, date: p.date, label: `${i.no} ${i.billTo?.name ?? ""}`.trim(), amount: Number(p.amt) || 0, currency: i.currency, kind: "payment", personal: false, ref: i.id });
    });
  return out.sort((a, c) => c.date.localeCompare(a.date));
}
