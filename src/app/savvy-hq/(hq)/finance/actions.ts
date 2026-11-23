"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule } from "@/lib/desk/auth";
import * as fin from "@/lib/hq/finance";
import { ACCTS, CURRENCIES, EXP_CATS, EXP_METHODS, INC_TYPES, OPEX } from "@/lib/hq/finance-model";
import { logActivity } from "@/lib/hq/sales";
import { lagosToday } from "@/lib/hq/work";

// Finance is for the Owner and Finance roles. Every action checks again on the server.

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const month = (v: unknown) => (/^\d{4}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const amount = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const CAT_KEYS = EXP_CATS.map((c) => c[0]) as string[];
const INC_KEYS = INC_TYPES.map((t) => t[0]) as string[];
const ACCT_KEYS = ACCTS.map((a) => a[0]) as string[];

export async function saveExpenseAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("finance");
  const e = {
    description: text(input.description, 300),
    amount: amount(input.amount),
    currency: oneOf(CURRENCIES as readonly string[], input.currency, "NGN"),
    cat: oneOf(CAT_KEYS, input.cat, "ops"),
    date: date(input.date),
    acct: oneOf(ACCT_KEYS, input.acct, "business"),
    vendor: text(input.vendor, 200),
    method: oneOf(EXP_METHODS as readonly string[], input.method, "Bank transfer"),
    receipt: /^https?:\/\//.test(text(input.receipt, 1000)) ? text(input.receipt, 1000) : "",
    recurring: input.recurring === true || input.recurring === "on",
    clientId: text(input.clientId, 60) || null,
    life: Number(input.life) > 0 ? Math.min(240, Math.round(Number(input.life))) : null,
  };
  if (!e.description) return fail("Say what the money was for.");
  if (!Number.isFinite(e.amount) || e.amount === 0) return fail("Enter the amount.");
  if (!e.date) return fail("Pick the date.");
  const r = await fin.saveExpense(id, e, user.id);
  refresh();
  return { ok: true, message: id ? "Expense updated." : r.addedAsset ? "Added, and put on the asset register." : "Expense added." };
}

export async function removeExpense(id: string): Promise<ActionResult> {
  await requireModule("finance");
  await fin.deleteExpense(String(id));
  refresh();
  return { ok: true, message: "Expense deleted." };
}

export async function copyRecurringAction(m: string): Promise<ActionResult> {
  const user = await requireModule("finance");
  if (!month(m)) return fail("Pick a month.");
  const n = await fin.copyRecurring(m, user.id);
  refresh();
  return n ? { ok: true, message: `${n} regular cost${n === 1 ? "" : "s"} copied in.` } : { ok: true, message: "Nothing to copy: every regular cost is already in this month." };
}

export async function saveIncomeAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("finance");
  const x = {
    description: text(input.description, 300),
    amount: amount(input.amount),
    currency: oneOf(CURRENCIES as readonly string[], input.currency, "NGN"),
    type: oneOf(INC_KEYS, input.type, "services"),
    date: date(input.date),
    acct: oneOf(ACCT_KEYS, input.acct, "business"),
    from: text(input.from, 200),
    clientId: text(input.clientId, 60) || null,
    period: month(input.period),
  };
  if (!x.description) return fail("Say what the money was for.");
  if (!Number.isFinite(x.amount) || x.amount === 0) return fail("Enter the amount.");
  if (!x.date) return fail("Pick the date.");
  await fin.saveIncome(id, x, user.id);
  refresh();
  return { ok: true, message: id ? "Income updated." : "Income added." };
}

export async function removeIncome(id: string): Promise<ActionResult> {
  await requireModule("finance");
  await fin.deleteIncome(String(id));
  refresh();
  return { ok: true, message: "Income deleted." };
}

/** "Mark received" on an automatic payer: income for that month's retainer, so it isn't counted twice. */
export async function markRetainerReceived(clientId: string, m: string): Promise<ActionResult> {
  const user = await requireModule("finance");
  if (!month(m)) return fail("Pick a month.");
  const books = await fin.loadBooks({ ledger: true });
  const c = books.clients.find((x) => x.id === clientId);
  if (!c) return fail("That client isn't here any more.");
  const today = lagosToday();
  await fin.saveIncome(
    null,
    { description: `Retainer: ${c.name}`, amount: Number(c.fee) || 0, currency: c.currency || "NGN", type: "services", date: today.slice(0, 7) === m ? today : `${m}-28`, acct: "business", from: c.name, clientId: c.id, period: m },
    user.id,
  );
  await logActivity(user, "client", c.id, "payment", `Automatic payment received for ${m}`);
  refresh();
  return { ok: true, message: `${c.name}'s payment marked received.` };
}

export async function setRetainerSkipAction(clientId: string, m: string, skip: boolean): Promise<ActionResult> {
  await requireModule("finance");
  if (!month(m)) return fail("Pick a month.");
  try {
    await fin.setRetainerSkip(m, String(clientId), !!skip);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't change that.");
  }
  refresh();
  return { ok: true, message: skip ? "Not counted this month." : "Counted this month." };
}

export async function saveBudgetAction(m: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("finance");
  if (!month(m)) return fail("Pick a month.");
  const cats: Record<string, number> = {};
  for (const k of OPEX) {
    const v = amount(input[k]);
    if (input[k] !== "" && input[k] !== undefined && Number.isFinite(v) && v >= 0) cats[k] = v;
  }
  const rev = input.__revenue === "" || input.__revenue === undefined ? null : amount(input.__revenue);
  await fin.saveBudget(m, cats, rev !== null && Number.isFinite(rev) ? rev : null, user.id);
  refresh();
  return { ok: true, message: "Budget saved." };
}

export async function saveAssetAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  await requireModule("finance");
  const a = {
    name: text(input.name, 200),
    date: date(input.date),
    cost: amount(input.cost),
    life: Math.min(240, Math.max(1, Math.round(Number(input.life) || 36))),
    notes: text(input.notes, 2000),
  };
  if (!a.name) return fail("Name the asset.");
  if (!Number.isFinite(a.cost) || a.cost <= 0) return fail("Enter what it cost.");
  if (!a.date) return fail("Pick the date it was bought.");
  await fin.saveAsset(id, { ...a, firstMonth: a.date.slice(0, 7) });
  refresh();
  return { ok: true, message: "Asset saved." };
}

export async function removeAsset(id: string): Promise<ActionResult> {
  await requireModule("finance");
  await fin.deleteAsset(String(id));
  refresh();
  return { ok: true, message: "Asset removed." };
}

/** Finance settings that live on the Finance pages: tax details, targets, loan, statements. */
export async function saveFinanceFigures(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("finance");
  const patch: fin.FinanceSettings = {};
  const n = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : amount(v));
  if ("loanBalance" in input) patch.loanBalance = n(input.loanBalance) ?? 0;
  if ("statementMonth" in input && month(input.statementMonth)) {
    const v = n(input.statement);
    patch.statements = { [String(input.statementMonth)]: v === undefined || !Number.isFinite(v) ? null : v };
  }
  const tax: NonNullable<fin.FinanceSettings["tax"]> = {};
  if ("reserveRate" in input) tax.reserveRate = Math.min(100, Math.max(0, n(input.reserveRate) ?? 20));
  if ("targetMargin" in input) tax.targetMargin = Math.min(95, Math.max(0, n(input.targetMargin) ?? 30));
  if ("cash" in input) tax.cash = n(input.cash);
  if ("incorporated" in input) tax.incorporated = date(input.incorporated) || undefined;
  if ("periodEnd" in input) tax.periodEnd = date(input.periodEnd) || undefined;
  if ("dueOverride" in input) tax.dueOverride = date(input.dueOverride) || undefined;
  if ("professional" in input) tax.professional = input.professional === "yes";
  if ("treatment" in input) tax.treatment = oneOf(["", "small", "standard"], input.treatment, "");
  if ("fixedAssets" in input) tax.fixedAssets = n(input.fixedAssets);
  if ("tin" in input) tax.tin = text(input.tin, 60);
  if ("adviser" in input) tax.adviser = text(input.adviser, 200);
  if (Object.keys(tax).length) patch.tax = tax;
  const targets: NonNullable<fin.FinanceSettings["targets"]> = {};
  if ("netProfit" in input) targets.netProfit = n(input.netProfit);
  if ("exit" in input) targets.exit = n(input.exit);
  if (Object.keys(targets).length) patch.targets = targets;
  await fin.patchFinSettings(patch, user.id);
  refresh();
  return { ok: true, message: "Saved." };
}

