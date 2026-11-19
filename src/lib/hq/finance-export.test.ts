import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { finance, monthEnd, ytdProfit, type Books } from "./finance-model";

// Checks the engine against the real HQ export, which never lives in this repository. The books'
// own figures are confidential, so they come from the environment too, never from this file:
//   HQ_EXPORT=~/Downloads/.../hq-database-export.json HQ_EXPECT_PROFIT=<Jan to Oct net profit> \
//   HQ_EXPECT_CASH=<cash at 31 Oct> npx vitest run finance-export
const file = process.env.HQ_EXPORT;
const profit = Number(process.env.HQ_EXPECT_PROFIT);
const cash = Number(process.env.HQ_EXPECT_CASH);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw export documents
type Doc = Record<string, any>;

function booksFromExport(path: string, today: string): Books {
  const docs = JSON.parse(readFileSync(path, "utf8")).docs as Record<string, Doc>;
  const under = (prefix: string) => Object.entries(docs).filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"));
  const id = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  return {
    today,
    fx: docs["settings/general"]?.fx ?? {},
    settings: docs["fin/settings"] ?? {},
    expenses: under("fin/main/expenses/").map(([p, d]) => ({
      id: id(p), date: d.date, amount: Number(d.amount), currency: d.currency || "NGN", cat: d.cat, acct: d.acct || "business",
      description: d.desc ?? "", vendor: d.vendor ?? "", method: d.method ?? "", clientId: d.clientId ?? null, assetId: d.assetId ?? null,
      recurring: !!d.recurring, receipt: d.receipt ?? "", source: d.source ?? "",
    })),
    income: under("fin/main/income/").map(([p, d]) => ({
      id: id(p), date: d.date, amount: Number(d.amount), currency: d.currency || "NGN", type: d.type, acct: d.acct || "business",
      description: d.desc ?? "", from: d.from ?? "", clientId: d.clientId ?? null, period: d.period ?? "", source: d.source ?? "",
    })),
    invoices: [],
    booked: under("fin/main/booked/").map(([p, d]) => ({ month: id(p), locked: !!d.locked, source: d.source ?? "", lines: d.lines ?? [], seen: d.seen ?? [] })),
    assets: under("fin/main/assets/").map(([p, d]) => ({ id: id(p), name: d.name, cost: Number(d.cost), date: d.date ?? "", firstMonth: d.firstMonth ?? "", life: d.life ?? null, notes: d.notes ?? "" })),
    budgets: under("fin/main/budgets/").map(([p, d]) => ({ month: id(p), revenue: d.revenue ?? null, cats: d.cats ?? {} })),
    clients: under("clients/").map(([p, d]) => ({
      id: id(p), name: d.name, status: d.status, health: d.health ?? "", billing: d.billing ?? "", fee: d.fee ?? null, currency: d.currency || "NGN",
      startDate: d.startDate ?? "", endDate: d.endDate ?? "", leavingOn: d.offb?.lastDay ?? "", payMode: d.payMode ?? "invoice", payDay: d.payDay ?? null,
    })),
  };
}

describe.skipIf(!file || !profit || !cash)("finance against the HQ export", () => {
  it("reproduces the books: profit January to October 2026, and cash at 31 October", () => {
    const f = finance(booksFromExport(file!, "2026-11-19"));
    expect(Math.round(ytdProfit(f, "2026-10"))).toBe(profit);
    expect(Math.round(f.plIn("2026-01-01", "2026-10-31").op)).toBe(profit);
    expect(Math.round(f.cashAt("2026-10-31"))).toBe(cash);
    const st = (f.settings.statements ?? {}) as Record<string, number>;
    // and every monthly bank statement, to within 50 kobo
    for (const [m, v] of Object.entries(st)) if (typeof v === "number") expect(Math.abs(f.cashAt(monthEnd(m)) - v)).toBeLessThan(0.5);
  });
});
