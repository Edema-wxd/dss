import { describe, expect, it } from "vitest";
import { invCalc, invStatus, nextInvNo, payoutFor, revenueShareOfPayment } from "./invoice-model";

const inv = (over: Record<string, unknown> = {}) => ({
  status: "sent",
  dueDate: "2026-12-01",
  items: [
    { d: "Strategy", q: 1, p: 100000, off: 10 },
    { d: "Content", q: 2, p: 50000 },
  ],
  vat: true,
  vatRate: 7.5,
  discType: "pct",
  discValue: 5,
  payments: [] as { amt: number; wht: number; date: string; method: string; note: string }[],
  ...over,
});

describe("invoice maths", () => {
  it("takes line discounts, then the invoice discount, then adds VAT", () => {
    const c = invCalc(inv());
    expect(c.gross).toBe(200000);
    expect(c.lineDisc).toBe(10000);
    expect(c.sub).toBe(190000);
    expect(c.disc).toBe(9500);
    expect(c.net).toBe(180500);
    expect(c.vat).toBeCloseTo(13537.5);
    expect(c.total).toBeCloseTo(194037.5);
  });
  it("caps an amount discount at the subtotal and a percent at 100", () => {
    expect(invCalc(inv({ discType: "amt", discValue: 999999, vat: false })).total).toBe(0);
    expect(invCalc(inv({ discValue: 150, vat: false })).total).toBe(0);
  });
  it("counts WHT as paid", () => {
    const c = invCalc(inv({ vat: false, discValue: 0, payments: [{ amt: 180000, wht: 10000, date: "", method: "", note: "" }] }));
    expect(c.paid).toBe(190000);
    expect(c.balance).toBe(0);
  });
});

describe("invoice status", () => {
  const pay = (amt: number) => [{ amt, wht: 0, date: "", method: "", note: "" }];
  it("follows HQ's order", () => {
    expect(invStatus(inv({ status: "void" }), "2026-11-19")).toBe("void");
    expect(invStatus(inv({ status: "draft", vat: false, discValue: 0, payments: pay(190000) }), "2026-11-19")).toBe("paid");
    expect(invStatus(inv({ status: "draft" }), "2026-11-19")).toBe("draft");
    expect(invStatus(inv({ payments: pay(1) }), "2026-12-02")).toBe("overdue");
    expect(invStatus(inv({ payments: pay(1) }), "2026-11-19")).toBe("part");
    expect(invStatus(inv(), "2026-11-19")).toBe("sent");
  });
});

describe("numbers, payouts and revenue", () => {
  it("numbers by kind and year", () => {
    expect(nextInvNo("client", "2026", ["DSS-INV-2026-001", "DSS-INV-2026-009", "DSS-TAL-2026-020", "DSS-INV-2025-050"])).toBe("DSS-INV-2026-010");
    expect(nextInvNo("talent", "2026", [])).toBe("DSS-TAL-2026-001");
    expect(nextInvNo("commission", "2027", [])).toBe("DSS-COM-2027-001");
  });
  it("splits a paid talent invoice into commission and payout, before VAT", () => {
    const t = { ...inv({ discValue: 0, items: [{ d: "Deal", q: 1, p: 1000000 }] }), commissionPct: 20 };
    expect(payoutFor(t)).toEqual({ gross: 1000000, commissionPct: 20, commission: 200000, net: 800000 });
  });
  it("counts only the pre-VAT share of a payment, and only commission on talent invoices", () => {
    const base = { ...inv({ discValue: 0, items: [{ d: "x", q: 1, p: 100000 }] }), commissionPct: 20 };
    const p = { amt: 107500, wht: 0, date: "", method: "", note: "" };
    expect(revenueShareOfPayment({ ...base, kind: "client" }, p)).toBeCloseTo(100000);
    expect(revenueShareOfPayment({ ...base, kind: "talent" }, p)).toBeCloseTo(20000);
  });
});
