// Invoices: HQ's maths and rules (g-invoices.js invCalc, invStatus, nextInvNo), exactly.
// Pure, shared by the editor, the PDF, Finance and the tests.

export const INV_KINDS = [
  ["client", "Client services"],
  ["talent", "Talent deal (billed to brand)"],
  ["commission", "Commission (billed to talent)"],
] as const;
export const INV_STATUS = {
  draft: ["Draft", "plain"],
  sent: ["Sent", "warn"],
  part: ["Part paid", "sky"],
  paid: ["Paid", "ok"],
  overdue: ["Overdue", "bad"],
  void: ["Void", "plain"],
} as const;
export type InvStatus = keyof typeof INV_STATUS;
export const PAY_METHODS = ["Bank transfer", "Paystack", "Cash", "Other"] as const;

export type InvItem = { d: string; q: number; p: number; off?: number };
export type InvPayment = { amt: number; wht: number; date: string; method: string; note: string };
export type InvoiceLike = {
  status: string;
  dueDate: string;
  items: InvItem[];
  vat: boolean;
  vatRate: number | null;
  discType: string;
  discValue: number | null;
  payments: InvPayment[];
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Line discounts first, then the invoice discount, then VAT on what's left. WHT counts as paid. */
export function invCalc(i: Pick<InvoiceLike, "items" | "vat" | "vatRate" | "discType" | "discValue" | "payments">) {
  let gross = 0;
  let lineDisc = 0;
  for (const it of i.items) {
    const g = (Number(it.q) || 0) * (Number(it.p) || 0);
    const net = g * (1 - clamp(Number(it.off) || 0, 0, 100) / 100);
    gross += g;
    lineDisc += g - net;
  }
  const sub = gross - lineDisc;
  const dv = Math.max(0, Number(i.discValue) || 0);
  const disc = !dv ? 0 : i.discType === "amt" ? Math.min(dv, sub) : (sub * Math.min(dv, 100)) / 100;
  const net = sub - disc;
  const vat = i.vat ? net * ((Number(i.vatRate) || 7.5) / 100) : 0;
  const total = net + vat;
  const paid = i.payments.reduce((s, p) => s + (Number(p.amt) || 0) + (Number(p.wht) || 0), 0);
  return { gross, lineDisc, sub, disc, net, vat, total, paid, balance: Math.max(0, total - paid) };
}

/** Draft, sent and void are stored; part paid, paid and overdue are worked out, in HQ's order. */
export function invStatus(i: InvoiceLike, today: string): InvStatus {
  if (i.status === "void") return "void";
  const c = invCalc(i);
  if (c.total > 0 && c.paid >= c.total - 0.005) return "paid";
  if (i.status === "draft") return "draft";
  if (i.dueDate && i.dueDate < today) return "overdue";
  if (c.paid > 0) return "part";
  return "sent";
}

const PREFIX: Record<string, string> = { client: "INV", talent: "TAL", commission: "COM" };

/** DSS-INV-2026-001, DSS-TAL-2026-001, DSS-COM-2026-001: one more than the highest used this year. */
export function nextInvNo(kind: string, year: string, used: readonly string[]) {
  const stem = `DSS-${PREFIX[kind] ?? "INV"}-${year}-`;
  const top = used.filter((n) => n.startsWith(stem)).reduce((m, n) => Math.max(m, Number(n.slice(stem.length)) || 0), 0);
  return `${stem}${String(top + 1).padStart(3, "0")}`;
}

/** When a brand pays a talent invoice in full: DSS keeps the commission, the talent gets the rest. */
export function payoutFor(i: InvoiceLike & { commissionPct: number | null }) {
  const c = invCalc(i);
  const gross = c.total - c.vat;
  const pct = Number(i.commissionPct) || 0;
  const commission = (gross * pct) / 100;
  return { gross, commissionPct: pct, commission, net: gross - commission };
}

/** The share of a payment that is revenue: before VAT, and for a talent invoice only the commission. */
export function revenueShareOfPayment(i: InvoiceLike & { kind: string; commissionPct: number | null }, p: InvPayment) {
  const c = invCalc(i);
  const preVat = c.total ? c.net / c.total : 1;
  const amount = ((Number(p.amt) || 0) + (Number(p.wht) || 0)) * preVat;
  return i.kind === "talent" ? (amount * (Number(i.commissionPct) || 0)) / 100 : amount;
}

/* ── The full invoice, settings and what prints on it ────────────────── */

export type BillTo = { name?: string; contact?: string; email?: string; address?: string; phone?: string };
export type Invoice = InvoiceLike & {
  id: string;
  no: string;
  kind: string;
  currency: string;
  issueDate: string;
  wht: boolean;
  discLabel: string;
  notes: string;
  billTo: BillTo;
  clientId: string | null;
  period: string;
  talentId: string | null;
  dealId: string | null;
  commissionPct: number | null;
  talentLine: string;
  payBank: boolean;
  payPaystack: boolean;
  bankId: string;
  payLink: string;
  sentAt: string;
  createdAt: string;
};

export type Bank = { id: string; label: string; currency: string; bank: string; name: string; number: string; extraLabel: string; extra: string; isDefault: boolean };
export type InvoiceSettings = {
  company?: { name?: string; rc?: string; email?: string; phone?: string; address?: string; website?: string; signName?: string; signTitle?: string };
  banks?: Bank[];
  paystack?: { link?: string; allCurrencies?: boolean };
  terms?: number;
  vatRate?: number;
  vatDefault?: boolean;
  footer?: string;
  whtText?: string;
};

export const INV_DEFAULTS = {
  company: "Digital Savvy Studios",
  email: "hello@digitalsavvystudios.com",
  website: "www.digitalsavvystudios.com",
  signName: "Janefrances C. Obiajulu",
  signTitle: "Founder and Creative Director",
  footer: "Payment is due by the date above. Late payments may pause delivery. Thank you for choosing Digital Savvy Studios.",
  terms: "Payment due by the date above. Thank you for your business.",
  wht: "Where withholding tax is deducted at source, please send the WHT credit note to hello@digitalsavvystudios.com.",
};
export const QUICK_LINES = ["Brand Strategy Consulting", "Social Media and Content Consultancy", "Visibility Sprint (90 days)"];

/** The account an invoice prints: the one picked, else the default for its currency, else the first. */
export function bankFor(i: Pick<Invoice, "bankId" | "currency">, s: InvoiceSettings) {
  const banks = s.banks ?? [];
  return (
    banks.find((b) => b.id === i.bankId && b.currency === i.currency) ??
    banks.find((b) => b.currency === i.currency && b.isDefault) ??
    banks.find((b) => b.currency === i.currency) ??
    null
  );
}

/** The Paystack link an invoice prints, if any. */
export function paystackFor(i: Pick<Invoice, "payLink" | "payPaystack" | "currency">, s: InvoiceSettings) {
  if (!i.payPaystack) return "";
  if (i.payLink) return i.payLink;
  return s.paystack?.link && (i.currency === "NGN" || s.paystack.allCurrencies) ? s.paystack.link : "";
}

export function blankInvoice(kind: string, today: string, s: InvoiceSettings, addDays: (k: string, n: number) => string): Omit<Invoice, "id" | "no" | "createdAt"> {
  return {
    kind,
    status: "draft",
    currency: "NGN",
    issueDate: today,
    dueDate: addDays(today, Number(s.terms) || 14),
    items: [{ d: "", q: 1, p: 0 }],
    vat: !!s.vatDefault,
    vatRate: Number(s.vatRate) || 7.5,
    wht: false,
    discType: "pct",
    discValue: null,
    discLabel: "",
    notes: s.footer ?? INV_DEFAULTS.footer,
    billTo: {},
    clientId: null,
    period: "",
    talentId: null,
    dealId: null,
    commissionPct: null,
    talentLine: "",
    payBank: true,
    payPaystack: false,
    bankId: "",
    payLink: "",
    payments: [],
    sentAt: "",
  };
}

const money = (n: number, cur: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: cur || "NGN", maximumFractionDigits: cur === "NGN" ? 0 : 2 }).format(n);
export { money as invMoney };

/** The WhatsApp or email message that goes with an invoice. */
export function invMessage(i: Invoice, s: InvoiceSettings, longDate: (k: string) => string) {
  const c = invCalc(i);
  const company = s.company?.name || INV_DEFAULTS.company;
  const first = (i.billTo.contact || i.billTo.name || "").trim().split(/\s+/)[0] || "there";
  const lines = [`Hello ${first},`, "", `Please find attached invoice ${i.no} from ${company} for ${i.items[0]?.d || "our services"}.`, ""];
  if (c.disc || c.lineDisc) {
    const vatOnGross = i.vat ? c.gross * ((Number(i.vatRate) || 7.5) / 100) : 0;
    lines.push(`Original amount: ${money(c.gross + vatOnGross, i.currency)}`, `${i.discLabel || "Discount"}: you save ${money(c.gross + vatOnGross - c.total, i.currency)}`);
  }
  lines.push(`Amount due: ${money(c.balance || c.total, i.currency)}`, `Due date: ${i.dueDate ? longDate(i.dueDate) : "On receipt"}`, "", `How to pay (${i.currency}):`);
  const bank = i.payBank ? bankFor(i, s) : null;
  const link = paystackFor(i, s);
  if (bank) lines.push(`Bank: ${bank.bank}`, `Account name: ${bank.name}`, `Account number: ${bank.number}`, ...(bank.extra ? [`${bank.extraLabel || "Sort code / SWIFT"}: ${bank.extra}`] : []));
  if (link) lines.push(`Paystack (card, transfer or USSD): ${link}`);
  if (!bank && !link) lines.push("Account details to follow.");
  lines.push("", `Reference: ${i.no}`, "", "Thank you,", s.company?.signName || INV_DEFAULTS.signName, company);
  return lines.join("\n");
}
