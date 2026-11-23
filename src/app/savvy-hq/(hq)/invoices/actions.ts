"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule } from "@/lib/desk/auth";
import * as fin from "@/lib/hq/finance";
import { monthName } from "@/lib/hq/finance-model";
import { type Bank, INV_KINDS, PAY_METHODS, blankInvoice, nextInvNo } from "@/lib/hq/invoice-model";
import { getDeal, getTalent } from "@/lib/hq/talent";
import { addDays, lagosToday } from "@/lib/hq/work";

// Invoices, payouts and talent bank details: Owner, Admin, Finance and Operations (EA).

type Result<T = undefined> = ActionResult & { id?: string; data?: T };
const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "CAD"];
const KINDS = INV_KINDS.map((k) => k[0]) as string[];

function readInvoice(input: Record<string, unknown>): fin.InvoiceDraft {
  const items = Array.isArray(input.items) ? input.items : [];
  const bill = (input.billTo ?? {}) as Record<string, unknown>;
  const kind = KINDS.includes(String(input.kind)) ? String(input.kind) : "client";
  return {
    no: text(input.no, 40),
    kind,
    status: ["draft", "sent", "void"].includes(String(input.status)) ? String(input.status) : "draft",
    currency: CURRENCIES.includes(String(input.currency)) ? String(input.currency) : "NGN",
    issueDate: date(input.issueDate),
    dueDate: date(input.dueDate),
    items: items.slice(0, 60).map((it: Record<string, unknown>) => ({ d: text(it.d, 500), q: num(it.q), p: num(it.p), off: Math.min(100, Math.max(0, num(it.off))) })),
    vat: input.vat === true,
    vatRate: Math.min(50, Math.max(0, num(input.vatRate) || 7.5)),
    wht: input.wht === true,
    discType: input.discType === "amt" ? "amt" : "pct",
    discValue: input.discValue === "" || input.discValue === null || input.discValue === undefined ? null : Math.max(0, num(input.discValue)),
    discLabel: text(input.discLabel, 120),
    notes: text(input.notes, 4000),
    billTo: { name: text(bill.name, 200), contact: text(bill.contact, 200), email: text(bill.email, 200), address: text(bill.address, 600), phone: text(bill.phone, 60) },
    clientId: text(input.clientId, 60) || null,
    period: /^\d{4}-\d{2}$/.test(String(input.period ?? "")) ? String(input.period) : "",
    talentId: kind === "client" ? null : text(input.talentId, 60) || null,
    dealId: text(input.dealId, 60) || null,
    commissionPct: kind === "talent" ? Math.min(100, Math.max(0, num(input.commissionPct))) : null,
    talentLine: kind === "talent" ? text(input.talentLine, 300) : "",
    payBank: input.payBank !== false,
    payPaystack: input.payPaystack === true,
    bankId: text(input.bankId, 40),
    payLink: /^https?:\/\//.test(text(input.payLink, 500)) ? text(input.payLink, 500) : "",
    payments: [],
  };
}

export async function saveInvoiceAction(id: string | null, input: Record<string, unknown>, send = false): Promise<Result> {
  const user = await requireModule("invoices");
  const draft = readInvoice(input);
  if (id) {
    const cur = await fin.getInvoice(String(id));
    if (!cur) return fail("That invoice isn't here any more.");
    draft.payments = cur.payments; // payments change only through Record payment
    if (Array.isArray(input.removePayments)) draft.payments = cur.payments.filter((_, n) => !(input.removePayments as number[]).includes(n));
  }
  try {
    const iid = await fin.saveInvoice(id ? String(id) : null, draft, user, { send });
    refresh();
    return { ok: true, id: iid, message: send && draft.status === "draft" ? `${draft.no} marked as sent.` : `${draft.no} saved.` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't save the invoice.");
  }
}

export async function setInvoiceVoid(id: string, voided: boolean): Promise<ActionResult> {
  await requireModule("invoices");
  const inv = await fin.getInvoice(String(id));
  if (!inv) return fail("That invoice isn't here any more.");
  await fin.setInvoiceStatus(inv.id, voided ? "void" : "sent");
  refresh();
  return { ok: true, message: voided ? `${inv.no} voided.` : `${inv.no} restored.` };
}

export async function deleteDraftInvoice(id: string): Promise<ActionResult> {
  await requireModule("invoices");
  const inv = await fin.getInvoice(String(id));
  if (!inv) return fail("That invoice isn't here any more.");
  if (inv.status !== "draft" || inv.payments.length) return fail("Only an unpaid draft can be deleted. Void it instead.");
  await fin.deleteInvoice(inv.id);
  refresh();
  return { ok: true, message: `${inv.no} deleted.` };
}

export async function recordPaymentAction(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("invoices");
  const p = {
    amt: Math.max(0, num(input.amt)),
    wht: Math.max(0, num(input.wht)),
    date: date(input.date),
    method: (PAY_METHODS as readonly string[]).includes(String(input.method)) ? String(input.method) : "Bank transfer",
    note: text(input.note, 300),
  };
  if (!p.date) return fail("Pick the date it was received.");
  try {
    const message = await fin.recordPayment(String(id), p, user);
    refresh();
    return { ok: true, message };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't record that.");
  }
}

export async function retainerPreview(): Promise<Result<{ names: string[]; month: string }>> {
  await requireModule("invoices");
  const list = await fin.retainerCandidates();
  const m = lagosToday().slice(0, 7);
  return { ok: true, data: { names: list.map((c) => c.name), month: monthName(m) } };
}

export async function createRetainersAction(): Promise<ActionResult> {
  const user = await requireModule("invoices");
  const m = monthName(lagosToday().slice(0, 7));
  const n = await fin.createRetainerDrafts(await fin.getFinSettings(), user, m);
  refresh();
  return n ? { ok: true, message: `${n} draft${n === 1 ? "" : "s"} created. Review and send them.` } : { ok: true, message: `Every monthly client already has an invoice for ${m}.` };
}

/** "Invoice the brand" or "Invoice talent for commission" from a deal: makes a draft and returns its id. */
export async function invoiceFromDeal(dealId: string): Promise<Result> {
  const user = await requireModule("invoices");
  const deal = await getDeal(String(dealId));
  if (!deal) return fail("That deal isn't here any more.");
  const talent = deal.talentId ? await getTalent(deal.talentId) : null;
  const today = lagosToday();
  const settings = await fin.getFinSettings();
  const pct = Number(deal.commissionPct) || Number(talent?.commission) || 20;
  const fee = Number(deal.fee) || 0;
  const used = await fin.usedInvoiceNumbers();
  const base = blankInvoice("client", today, settings, addDays);
  let draft: fin.InvoiceDraft;
  if (deal.payFlow === "direct") {
    draft = {
      ...base,
      kind: "commission",
      no: nextInvNo("commission", today.slice(0, 4), used),
      currency: deal.currency || "NGN",
      billTo: { name: talent?.name ?? "", email: talent?.email ?? "", phone: talent?.phone ?? "" },
      talentId: deal.talentId,
      dealId: deal.id,
      items: [{ d: `Management commission: ${deal.brand} · ${deal.title} (${pct}% of ${fee.toLocaleString("en-GB")})`, q: 1, p: Math.round(((fee * pct) / 100) * 100) / 100 }],
    };
  } else {
    draft = {
      ...base,
      kind: "talent",
      no: nextInvNo("talent", today.slice(0, 4), used),
      currency: deal.currency || "NGN",
      billTo: { name: deal.brand, contact: deal.contactPerson },
      talentId: deal.talentId,
      dealId: deal.id,
      commissionPct: pct,
      talentLine: [talent ? `Talent: ${talent.name}` : "", deal.title ? `Campaign: ${deal.title}` : "", deal.usage ? `Usage: ${deal.usage.split("\n")[0]}` : ""].filter(Boolean).join(" · "),
      items: [{ d: `${talent?.name ?? "Talent"} x ${deal.brand}: ${deal.title}`, q: 1, p: fee }],
    };
  }
  if (!draft.billTo.name) draft.billTo.name = deal.brand || "To confirm";
  if (!fee) draft.items = [{ d: draft.items[0].d, q: 1, p: 1 }];
  try {
    const id = await fin.saveInvoice(null, draft, user);
    refresh();
    return { ok: true, id, message: `Draft ${draft.no} created.${fee ? "" : " Add the fee before sending."}` };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't make the invoice.");
  }
}

/* ── Payouts and talent bank details ─────────────────────────────────── */

export async function markPayoutPaidAction(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  await requireModule("invoices");
  const d = date(input.paidAt);
  if (!d) return fail("Pick the date it was paid.");
  await fin.markPayoutPaid(String(id), d, text(input.ref, 120));
  refresh();
  return { ok: true, message: "Payout marked as paid." };
}

export async function saveTalentBankAction(talentId: string, input: Record<string, unknown>): Promise<ActionResult> {
  await requireModule("invoices");
  await fin.saveTalentBank(String(talentId), { bank: text(input.bank, 120), name: text(input.name, 200), number: text(input.number, 40) });
  refresh();
  return { ok: true, message: "Payout account saved." };
}

/* ── Settings: Invoice details ───────────────────────────────────────── */

export async function saveInvoiceDetails(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("invoices");
  const c = (input.company ?? {}) as Record<string, unknown>;
  const ps = (input.paystack ?? {}) as Record<string, unknown>;
  await fin.patchFinSettings(
    {
      company: {
        name: text(c.name, 200),
        rc: text(c.rc, 40),
        email: text(c.email, 200),
        phone: text(c.phone, 60),
        address: text(c.address, 600),
        website: text(c.website, 200),
        signName: text(c.signName, 200),
      },
      paystack: { link: /^https?:\/\//.test(text(ps.link, 500)) ? text(ps.link, 500) : "", allCurrencies: ps.allCurrencies === true || ps.allCurrencies === "yes" },
      terms: Math.min(120, Math.max(0, Math.round(num(input.terms)) || 14)),
      vatRate: Math.min(50, Math.max(0, num(input.vatRate) || 7.5)),
      vatDefault: input.vatDefault === true || input.vatDefault === "yes",
      footer: text(input.footer, 2000),
      whtText: text(input.whtText, 1000),
    },
    user.id,
  );
  refresh();
  return { ok: true, message: "Invoice details saved." };
}

export async function saveBank(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("invoices");
  const b: Bank = {
    id: text(input.id, 40) || `b${Date.now().toString(36)}`,
    label: text(input.label, 80),
    currency: CURRENCIES.includes(String(input.currency)) ? String(input.currency) : "NGN",
    bank: text(input.bank, 120),
    name: text(input.name, 200),
    number: text(input.number, 60),
    extraLabel: text(input.extraLabel, 60),
    extra: text(input.extra, 120),
    isDefault: input.isDefault === true,
  };
  if (!b.bank || !b.name || !b.number) return fail("Add the bank, account name and account number.");
  const s = await fin.getFinSettings();
  let banks = (s.banks ?? []).filter((x) => x.id !== b.id);
  if (!banks.some((x) => x.currency === b.currency)) b.isDefault = true;
  if (b.isDefault) banks = banks.map((x) => (x.currency === b.currency ? { ...x, isDefault: false } : x));
  const at = (s.banks ?? []).findIndex((x) => x.id === b.id);
  if (at >= 0) banks.splice(at, 0, b);
  else banks.push(b);
  await fin.patchFinSettings({ banks }, user.id);
  refresh();
  return { ok: true, message: "Bank account saved." };
}

export async function removeBank(id: string): Promise<ActionResult> {
  const user = await requireModule("invoices");
  const s = await fin.getFinSettings();
  await fin.patchFinSettings({ banks: (s.banks ?? []).filter((x) => x.id !== id) }, user.id);
  refresh();
  return { ok: true, message: "Bank account removed." };
}
