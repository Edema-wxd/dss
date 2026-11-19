import { describe, expect, it } from "vitest";
import { buckets, finance, finWindow, monthsIn, payeMonthly, prevWindow, sumPL, type Books, type Expense, type Income } from "./finance-model";

// Made-up books. None of these names or amounts are real.
const exp = (id: string, date: string, amount: number, cat: string, acct = "business"): Expense => ({
  id, date, amount, currency: "NGN", cat, acct, description: id, vendor: "", method: "Bank transfer", clientId: null, assetId: null, recurring: false, receipt: "", source: "",
});
const inc = (id: string, date: string, amount: number, type: string, more: Partial<Income> = {}): Income => ({
  id, date, amount, currency: "NGN", type, acct: "business", description: id, from: "", clientId: null, period: "", source: "", ...more,
});

const books = (over: Partial<Books> = {}): Books => ({
  today: "2026-03-15",
  fx: { USD: 1500 },
  settings: { openingCash: 100000, openingDate: "2026-01-01", tax: { reserveRate: 20 } },
  expenses: [
    exp("rent", "2026-01-05", 50000, "workspace"),
    exp("laptop", "2026-01-10", 360000, "capital"),
    exp("draw", "2026-01-20", 40000, "owner_draw"),
    exp("fuel", "2026-01-21", 10000, "transport", "personal"),
    exp("refund", "2026-01-22", -5000, "workspace"),
    exp("payout", "2026-01-25", 80000, "talent_payout"),
    exp("logo", "2026-02-02", 30000, "setup_design"),
  ],
  income: [
    inc("fees", "2026-01-15", 300000, "services"),
    inc("deal", "2026-01-24", 100000, "talent_receipt"),
    inc("topup", "2026-01-26", 20000, "owner"),
    inc("retainer-paid", "2026-03-03", 250000, "services", { clientId: "c1", period: "2026-03" }),
  ],
  invoices: [
    {
      id: "i1", no: "DSS-INV-2026-001", kind: "client", clientId: "c2", currency: "USD", commissionPct: null, period: "", issueDate: "2026-02-01",
      status: "sent", dueDate: "2026-02-15", items: [{ d: "Audit", q: 1, p: 100 }], vat: true, vatRate: 7.5, discType: "pct", discValue: 0,
      payments: [{ amt: 107.5, wht: 0, date: "2026-02-10", method: "Bank transfer", note: "" }],
    },
  ],
  booked: [{ month: "2026-02", locked: true, source: "books", lines: [], seen: [] }],
  assets: [{ id: "a1", name: "Laptop", cost: 360000, date: "2026-01-10", firstMonth: "2026-01", life: 36, notes: "" }],
  budgets: [{ month: "2026-01", revenue: null, cats: { workspace: 40000, transport: 5000 } }],
  clients: [
    { id: "c1", name: "Client One", status: "active", health: "good", billing: "monthly", fee: 250000, currency: "NGN", startDate: "2026-01-01", endDate: "", leavingOn: "", payMode: "invoice", payDay: null },
    { id: "c2", name: "Client Two", status: "active", health: "at_risk", billing: "monthly", fee: 900000, currency: "NGN", startDate: "", endDate: "", leavingOn: "", payMode: "invoice", payDay: null },
  ],
  ...over,
});

describe("profit and loss", () => {
  const f = finance(books());
  it("counts fees, nets talent money into commission and leaves owner money out", () => {
    const p = f.plFor("2026-01");
    expect(p.r.services).toBe(300000);
    expect(p.r.commission).toBe(20000); // 100k in, 80k paid out
    expect(p.rev).toBe(320000);
    // workspace 50k less a 5k refund, plus fuel paid personally (still a cost)
    expect(p.opex).toBe(55000);
    expect(p.dep).toBe(10000);
    expect(p.capex).toBe(360000);
    expect(p.op).toBe(320000 - 55000 - 10000);
  });
  it("counts an invoice payment before VAT, converted at the FX rate", () => {
    const p = f.plFor("2026-02");
    expect(p.r.services).toBeCloseTo(150000);
    expect(p.r.vat).toBeCloseTo(11250);
    expect(p.setup).toBe(30000);
    expect(p.preSetup).toBeCloseTo(p.op + 30000);
  });
  it("counts this month's retainers live, and doesn't count their payment twice", () => {
    const p = f.plFor("2026-03");
    expect(f.bookedFor("2026-03").map((l) => l.clientId)).toEqual(["c1"]); // c2 isn't On track
    expect(p.r.retainers).toBe(250000);
    expect(p.r.services).toBe(0);
    expect(p.r.collected).toBe(250000);
  });
  it("splits part months by days", () => {
    const half = f.plIn("2026-01-01", "2026-01-31");
    expect(half.op).toBeCloseTo(f.plFor("2026-01").op);
    const q = f.plIn("2026-03-01", "2026-03-31");
    expect(q.r.retainers).toBeCloseTo(250000);
    expect(f.plIn("2026-03-01", "2026-03-15").r.retainers).toBeCloseTo((250000 * 15) / 31);
  });
  it("adds months up", () => {
    const all = sumPL(monthsIn("2026-01", "2026-03").map((m) => f.plFor(m)));
    expect(all.rev).toBeCloseTo(320000 + 150000 + 250000);
    expect(all.margin).toBeCloseTo((all.op / all.rev) * 100);
  });
});

describe("cash, owner and assets", () => {
  const f = finance(books());
  it("follows the business account only, including owner and capital money", () => {
    // 100k + 300k + 100k + 20k in; 50k + 360k + 40k - 5k + 80k out; personal fuel left out
    expect(f.cashAt("2026-01-31")).toBe(100000 + 420000 - 525000);
    expect(f.cashAt("2026-02-28")).toBeCloseTo(f.cashAt("2026-01-31") - 30000 + 107.5 * 1500);
  });
  it("shows what the owner put in and took out", () => {
    const o = f.ownerFor("2026-01");
    expect(o.drawings).toBe(40000);
    expect(o.injection).toBe(20000);
    expect(o.paidPersonally).toBe(10000);
    expect(o.putIn).toBe(30000);
    expect(o.takenOut).toBe(40000);
  });
  it("writes assets down a month at a time", () => {
    const a = books().assets[0];
    expect(f.assetNBV(a, "2025-12")).toBe(360000);
    expect(f.assetNBV(a, "2026-03")).toBe(330000);
    expect(f.depFor("2028-12")).toBe(10000);
    expect(f.depFor("2029-01")).toBe(0);
  });
  it("uses the reserve rate before incorporation, the company rate after", () => {
    const g = finance(books({ settings: { tax: { incorporated: "2026-03-05", reserveRate: 20 } } }));
    expect(g.taxRateFor("2026-02")).toBe(20);
    expect(g.taxRateFor("2026-03")).toBe(34);
    expect(g.taxPeriod().due).toBe("2027-09-05");
  });
  it("skips amounts with no FX rate and says so", () => {
    const g = finance(books({ fx: {} }));
    expect(g.plFor("2026-02").r.missing).toBe(true);
    expect(g.plFor("2026-02").r.services).toBe(0);
  });
});

describe("windows and PAYE", () => {
  it("builds period windows and their buckets", () => {
    const w = finWindow("month", "2026-03", "2026-03-15");
    expect(w).toMatchObject({ from: "2026-03-01", to: "2026-03-31", label: "March 2026" });
    expect(prevWindow(w).month).toBe("2026-02");
    expect(buckets(w).map((b) => b.label)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]);
    const d7 = finWindow("7d", "", "2026-03-15");
    expect(prevWindow(d7)).toMatchObject({ from: "2026-03-02", to: "2026-03-08" });
    expect(buckets(d7)).toHaveLength(7);
    expect(buckets(finWindow("90d", "", "2026-03-15"))).toHaveLength(13);
  });
  it("taxes salaries in bands", () => {
    expect(payeMonthly(50000)).toBe(0);
    expect(payeMonthly(250000)).toBeCloseTo(((2200000 * 15) / 100) / 12);
  });
});
