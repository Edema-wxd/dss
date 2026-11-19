"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import {
  createRetainersAction,
  deleteDraftInvoice,
  markPayoutPaidAction,
  recordPaymentAction,
  retainerPreview,
  saveInvoiceAction,
  setInvoiceVoid,
} from "@/app/admin/(hq)/invoices/actions";
import { Button, Field, btn, copyText, fieldClass, useToast } from "@/components/desk/ui";
import type { Payout, TalentBank } from "@/lib/hq/finance";
import {
  INV_KINDS,
  INV_STATUS,
  PAY_METHODS,
  QUICK_LINES,
  type Invoice,
  type InvoiceSettings,
  type InvStatus,
  bankFor,
  blankInvoice,
  invCalc,
  invMessage,
  invStatus,
  nextInvNo,
} from "@/lib/hq/invoice-model";
import { money } from "@/lib/hq/money";
import { addDays, longDate } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { InvoicePaper } from "./invoice-paper";
import { Dialog, EmptyNote, Pill, useRun } from "./kit";

type Party = { id: string; name: string };
export type BillSource = {
  clients: (Party & { contactName: string; email: string; phone: string; currency: string; fee: number | null; service: string; billing: string })[];
  brands: (Party & { company: string; email: string; phone: string })[];
  talents: (Party & { email: string; phone: string })[];
};
export type InvoicesProps = {
  invoices: Invoice[];
  payouts: Payout[];
  settings: InvoiceSettings;
  sources: BillSource;
  banks: Record<string, TalentBank>;
  stats: { collected: number; outstanding: number; open: number; overdue: number; payoutsDue: number; missing: boolean };
  today: string;
  openId?: string;
};

const FILTERS: [string, string][] = [
  ["all", "All"],
  ["draft", "Draft"],
  ["sent", "Sent"],
  ["part", "Part paid"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
];

function Stat({ l, v, s }: { l: string; v: React.ReactNode; s?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
      <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{l}</span>
      <b className="font-display text-3xl tabular-nums">{v}</b>
      {s && <span className="text-sm text-slate">{s}</span>}
    </div>
  );
}

export function InvoicesView(p: InvoicesProps) {
  const { run, pending } = useRun();
  const [tab, setTab] = useState<"invoices" | "payouts">("invoices");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Invoice | null>(() => (p.openId ? (p.invoices.find((i) => i.id === p.openId) ?? null) : null));
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [payout, setPayout] = useState<Payout | null>(null);
  const [retainers, setRetainers] = useState<{ names: string[]; month: string } | null>(null);
  const toast = useToast();
  const status = (i: Invoice) => invStatus(i, p.today);
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, k === "all" ? p.invoices.length : p.invoices.filter((i) => status(i) === k).length]));
  const needle = q.trim().toLowerCase();
  const list = p.invoices
    .filter((i) => filter === "all" || status(i) === filter)
    .filter((i) => !needle || [i.no, i.billTo.name ?? "", ...i.items.map((it) => it.d)].join(" ").toLowerCase().includes(needle));

  const newInvoice = () => {
    const base = blankInvoice("client", p.today, p.settings, addDays);
    setEditing({ ...base, id: "", no: nextInvNo("client", p.today.slice(0, 4), p.invoices.map((i) => i.no)), createdAt: "" });
  };

  const askRetainers = async () => {
    const r = await retainerPreview();
    if (!r.ok || !r.data) return;
    if (!r.data.names.length) return toast(`Every monthly client already has an invoice for ${r.data.month}.`);
    setRetainers(r.data);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button onClick={askRetainers}>This month&apos;s retainers</Button>
        <button type="button" onClick={newInvoice} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> New invoice
        </button>
      </div>
      {!(p.settings.banks ?? []).length && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-ink bg-peach/40 px-4 py-3 text-sm">
          <span className="flex-1">
            <b>Add your bank accounts first.</b> Your account details and Paystack link print on every invoice.
          </span>
          <Link href="/admin/settings#invoice-details" className={cn(btn.base, btn.sm)}>
            Open settings
          </Link>
        </div>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l="Collected this month" v={money(p.stats.collected, "NGN", true)} s="DSS revenue, talent commission only" />
        <Stat l="Outstanding" v={money(p.stats.outstanding, "NGN", true)} s={`${p.stats.open} invoice${p.stats.open === 1 ? "" : "s"} open${p.stats.missing ? " · set FX rates" : ""}`} />
        <Stat l="Overdue" v={p.stats.overdue} s={p.stats.overdue ? "chase today" : "nothing late"} />
        <Stat l="Talent payouts due" v={p.stats.payoutsDue} s="after brands pay DSS" />
      </div>

      <nav aria-label="Invoices" className="mb-4 flex gap-1">
        {(
          [
            ["invoices", "Invoices"],
            ["payouts", "Talent payouts"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-current={tab === k ? "page" : undefined}
            onClick={() => setTab(k)}
            className={cn("rounded-full border-2 border-transparent px-3.5 py-1.5 text-sm font-semibold text-slate hover:text-ink", tab === k && "border-ink bg-ink text-white hover:text-white")}
          >
            {l}
            {k === "payouts" && p.stats.payoutsDue > 0 && <Pill tone="rose" className="ml-1.5">{p.stats.payoutsDue}</Pill>}
          </button>
        ))}
      </nav>

      {tab === "invoices" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Status" className="inline-flex flex-wrap gap-1 rounded-full border-2 border-ink bg-white p-0.5">
              {FILTERS.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1 text-sm font-semibold text-slate", filter === k && "bg-ink text-white")}>
                  {l} <span className="opacity-70">{counts[k]}</span>
                </button>
              ))}
            </div>
            <label className="relative ml-auto min-w-[220px] flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoices" aria-label="Search invoices" className={cn(fieldClass, "pl-9")} />
            </label>
          </div>
          {list.length ? (
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((i) => {
                const c = invCalc(i);
                const st = status(i);
                return (
                  <li key={i.id}>
                    <button type="button" onClick={() => setEditing(i)} className="grid w-full gap-1.5 rounded-[20px] border-2 border-ink bg-white p-4 text-left transition-transform hover:-translate-y-px">
                      <span className="flex items-baseline gap-2">
                        <b className="min-w-0 flex-1 truncate">{i.billTo.name || "No client"}</b>
                        <b className="font-display text-lg tabular-nums">{money(c.total, i.currency)}</b>
                      </span>
                      <span className="truncate text-sm text-slate">{i.items[0]?.d || "No lines yet"}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-mono text-slate">{i.no}</span>
                        <Pill tone={INV_STATUS[st][1]}>{INV_STATUS[st][0]}</Pill>
                        {i.kind === "talent" && <Pill tone="rose">Talent</Pill>}
                        {i.kind === "commission" && <Pill tone="sky">Commission</Pill>}
                        {st === "part" && <span className="text-slate">{money(c.balance, i.currency)} left</span>}
                        <span className="flex-1" />
                        {i.dueDate && st !== "paid" && st !== "void" && <span className={cn(st === "overdue" ? "text-[#c42b3c]" : "text-slate")}>Due {shortD(i.dueDate)}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyNote title="No invoices here.">Create one, or generate this month&apos;s retainers in one go.</EmptyNote>
          )}
        </>
      ) : (
        <Payouts payouts={p.payouts} sources={p.sources} banks={p.banks} onPay={setPayout} />
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? editing.no : "New invoice"} xl>
        {editing && (
          <Editor
            key={editing.id || "new"}
            inv={editing}
            p={p}
            onDone={() => setEditing(null)}
            onPay={(i) => {
              setEditing(null);
              setPaying(i);
            }}
          />
        )}
      </Dialog>
      <Dialog open={paying !== null} onClose={() => setPaying(null)} title={paying ? `Record payment · ${paying.no}` : ""}>
        {paying && <PaymentForm inv={paying} today={p.today} onDone={() => setPaying(null)} />}
      </Dialog>
      <Dialog open={payout !== null} onClose={() => setPayout(null)} title={payout ? `Pay ${p.sources.talents.find((t) => t.id === payout.talentId)?.name ?? "the talent"}` : ""}>
        {payout && <PayoutForm po={payout} bank={payout.talentId ? p.banks[payout.talentId] : undefined} today={p.today} onDone={() => setPayout(null)} />}
      </Dialog>
      <Dialog open={retainers !== null} onClose={() => setRetainers(null)} title={retainers ? `Create ${retainers.names.length} retainer invoice${retainers.names.length === 1 ? "" : "s"}?` : ""}>
        {retainers && (
          <div className="grid gap-4">
            <p className="text-sm">
              Drafts for {retainers.names.join(", ")} for {retainers.month}. You can review each one before marking it sent.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                className={cn(btn.base, btn.primary)}
                onClick={() =>
                  run(createRetainersAction).then((ok) => {
                    if (!ok) return;
                    setRetainers(null);
                    setFilter("draft");
                    setTab("invoices");
                  })
                }
              >
                Create drafts
              </button>
              <Button tone="ghost" onClick={() => setRetainers(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

const shortD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/* ── Payouts ─────────────────────────────────────────────────────────── */

function Payouts({ payouts, sources, banks, onPay }: { payouts: Payout[]; sources: BillSource; banks: Record<string, TalentBank>; onPay: (p: Payout) => void }) {
  if (!payouts.length) return <EmptyNote title="No payouts yet.">When a brand pays a talent invoice in full, the talent&apos;s share appears here to pay out.</EmptyNote>;
  return (
    <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
            {["Talent", "Invoice", "Brand paid", "Commission", "Pay talent", "Status", ""].map((h) => (
              <th key={h} className="border-b-2 border-ink px-3 py-2 font-bold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payouts.map((po) => {
            const name = sources.talents.find((t) => t.id === po.talentId)?.name ?? "Talent";
            return (
              <tr key={po.id} className="border-b border-ink/10">
                <td className="px-3 py-2 font-semibold">
                  {name}
                  {po.talentId && !banks[po.talentId]?.number && <span className="block text-xs font-normal text-slate">No payout account yet</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{po.invoiceNo}</td>
                <td className="px-3 py-2 tabular-nums">{money(po.gross, po.currency)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {money(po.commission, po.currency)} <span className="text-slate">({po.commissionPct ?? 0}%)</span>
                </td>
                <td className="px-3 py-2 font-bold tabular-nums">{money(po.net, po.currency)}</td>
                <td className="px-3 py-2">
                  {po.status === "paid" ? <Pill tone="ok">Paid {shortD(po.paidAt)}</Pill> : <Pill tone="warn">Due</Pill>}
                  {po.ref && <span className="block text-xs text-slate">{po.ref}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {po.status !== "paid" && (
                    <Button size="sm" onClick={() => onPay(po)}>
                      Mark paid
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayoutForm({ po, bank, today, onDone }: { po: Payout; bank?: TalentBank; today: string; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({ paidAt: today, ref: "" });
  return (
    <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), run(() => markPayoutPaidAction(po.id, d)).then((ok) => ok && onDone()))}>
      <p className="text-sm">
        {bank?.number ? (
          <>
            Send <b>{money(po.net, po.currency)}</b> to {bank.name || "the talent"}, {bank.bank} {bank.number}.
          </>
        ) : (
          <>
            Send <b>{money(po.net, po.currency)}</b>. Add their payout account on their Talent profile so it shows here.
          </>
        )}
      </p>
      <Field label="Date paid">
        <input required type="date" value={d.paidAt} onChange={(e) => setD({ ...d, paidAt: e.target.value })} className={fieldClass} />
      </Field>
      <Field label="Transfer reference">
        <input value={d.ref} onChange={(e) => setD({ ...d, ref: e.target.value })} className={fieldClass} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Mark as paid
      </button>
    </form>
  );
}

/* ── Record a payment ────────────────────────────────────────────────── */

function PaymentForm({ inv, today, onDone }: { inv: Invoice; today: string; onDone: () => void }) {
  const { run, pending } = useRun();
  const c = invCalc(inv);
  const [d, setD] = useState({ amt: String(Math.round(c.balance * 100) / 100), wht: "", date: today, method: "Bank transfer", note: "" });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => recordPaymentAction(inv.id, d)).then((ok) => ok && onDone()))}>
      <Field label={`Amount received (${inv.currency})`}>
        <input required autoFocus type="number" step="0.01" min={0} className={fieldClass} {...bind("amt")} />
      </Field>
      <Field label="Date received">
        <input required type="date" className={fieldClass} {...bind("date")} />
      </Field>
      <Field label="Method">
        <select className={fieldClass} {...bind("method")}>
          {PAY_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label={`Withholding tax deducted (${inv.currency})`} hint="If the client paid less because they deducted WHT. Keep their credit note: it reduces DSS's company tax.">
        <input type="number" step="0.01" min={0} className={fieldClass} {...bind("wht")} />
      </Field>
      <Field label="Reference or note" full>
        <input className={fieldClass} {...bind("note")} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Record payment
      </button>
    </form>
  );
}

/* ── The editor ──────────────────────────────────────────────────────── */

function Editor({ inv, p, onDone, onPay }: { inv: Invoice; p: InvoicesProps; onDone: () => void; onPay: (i: Invoice) => void }) {
  const { run, pending } = useRun();
  const toast = useToast();
  const [i, setI] = useState<Invoice>(inv);
  const [removed, setRemoved] = useState<number[]>([]);
  const shown: Invoice = { ...i, payments: i.payments.filter((_, n) => !removed.includes(n)) };
  const st = inv.id ? invStatus(inv, p.today) : "draft";
  const c = invCalc(shown);
  const set = <K extends keyof Invoice>(k: K, v: Invoice[K]) => setI((x) => ({ ...x, [k]: v }));
  const bill = (k: keyof Invoice["billTo"], v: string) => setI((x) => ({ ...x, billTo: { ...x.billTo, [k]: v } }));
  const item = (n: number, k: "d" | "q" | "p" | "off", v: string) =>
    setI((x) => ({ ...x, items: x.items.map((it, m) => (m === n ? { ...it, [k]: k === "d" ? v : v === "" ? 0 : Number(v) } : it)) }));
  const banks = (p.settings.banks ?? []).filter((b) => b.currency === i.currency);
  const paystackOk = !!(i.payLink || p.settings.paystack?.link);

  const fill = (v: string) => {
    const [kind, id] = v.split(":");
    if (kind === "client") {
      const cl = p.sources.clients.find((x) => x.id === id);
      if (!cl) return;
      setI((x) => ({
        ...x,
        clientId: cl.id,
        currency: cl.currency || x.currency,
        period: cl.billing === "monthly" ? p.today.slice(0, 7) : x.period,
        billTo: { name: cl.name, contact: cl.contactName, email: cl.email, phone: cl.phone, address: x.billTo.address },
        items: x.items.some((it) => it.d || it.p) ? x.items : [{ d: `${cl.service || "Retainer"}: ${monthLong(p.today)}`, q: 1, p: Number(cl.fee) || 0 }],
      }));
    } else if (kind === "contact") {
      const b = p.sources.brands.find((x) => x.id === id);
      if (b) setI((x) => ({ ...x, billTo: { name: b.company || b.name, contact: b.company ? b.name : "", email: b.email, phone: b.phone } }));
    } else if (kind === "talent") {
      const t = p.sources.talents.find((x) => x.id === id);
      if (t) setI((x) => ({ ...x, talentId: t.id, billTo: { name: t.name, email: t.email, phone: t.phone } }));
    }
  };

  // a new invoice takes the next number for its type; an existing one keeps its number
  const changeKind = (kind: string) => setI((x) => ({ ...x, kind, no: inv.id ? x.no : nextInvNo(kind, p.today.slice(0, 4), p.invoices.map((v) => v.no)) }));

  const save = (send = false) =>
    run(() => saveInvoiceAction(inv.id || null, { ...i, removePayments: removed }, send)).then((ok) => ok && onDone());

  const copy = () => copyText(invMessage(shown, p.settings, longDate), toast, "Message copied. Paste it into WhatsApp or email.");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form className="grid content-start gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save())}>
        {inv.id && (
          <div className="sm:col-span-2">
            <Pill tone={INV_STATUS[st as InvStatus][1]}>{INV_STATUS[st as InvStatus][0]}</Pill>
          </div>
        )}
        <Field label="Type">
          <select className={fieldClass} value={i.kind} onChange={(e) => changeKind(e.target.value)}>
            {INV_KINDS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Invoice number">
          <input required className={fieldClass} value={i.no} onChange={(e) => set("no", e.target.value)} />
        </Field>
        <Field label="Bill to" full>
          <select className={fieldClass} value="" onChange={(e) => fill(e.target.value)}>
            <option value="">Fill from a record…</option>
            <optgroup label="Clients">
              {p.sources.clients.map((x) => (
                <option key={x.id} value={`client:${x.id}`}>
                  {x.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Brands and agencies">
              {p.sources.brands.map((x) => (
                <option key={x.id} value={`contact:${x.id}`}>
                  {x.company || x.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Talent">
              {p.sources.talents.map((x) => (
                <option key={x.id} value={`talent:${x.id}`}>
                  {x.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Name or company">
          <input required className={fieldClass} value={i.billTo.name ?? ""} onChange={(e) => bill("name", e.target.value)} />
        </Field>
        <Field label="Attention">
          <input className={fieldClass} value={i.billTo.contact ?? ""} onChange={(e) => bill("contact", e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" className={fieldClass} value={i.billTo.email ?? ""} onChange={(e) => bill("email", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={fieldClass} value={i.billTo.phone ?? ""} onChange={(e) => bill("phone", e.target.value)} />
        </Field>
        <Field label="Address" full>
          <textarea rows={2} className={fieldClass} value={i.billTo.address ?? ""} onChange={(e) => bill("address", e.target.value)} />
        </Field>
        <Field label="Currency">
          <select className={fieldClass} value={i.currency} onChange={(e) => setI((x) => ({ ...x, currency: e.target.value, bankId: "" }))}>
            {["NGN", "USD", "GBP", "EUR", "CAD"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Link to client">
          <select className={fieldClass} value={i.clientId ?? ""} onChange={(e) => set("clientId", e.target.value || null)}>
            <option value="">None</option>
            {p.sources.clients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue date">
          <input type="date" className={fieldClass} value={i.issueDate} onChange={(e) => set("issueDate", e.target.value)} />
        </Field>
        <Field label="Due date">
          <input type="date" className={fieldClass} value={i.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        {i.kind !== "client" && (
          <Field label="Talent">
            <select className={fieldClass} value={i.talentId ?? ""} onChange={(e) => set("talentId", e.target.value || null)}>
              <option value="">Pick a talent</option>
              {p.sources.talents.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {i.kind === "talent" && (
          <>
            <Field label="DSS commission % (internal)">
              <input type="number" min={0} max={100} className={fieldClass} value={i.commissionPct ?? ""} onChange={(e) => set("commissionPct", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="Line printed above items (optional)" full>
              <input className={fieldClass} value={i.talentLine} placeholder="e.g. Talent: Toby Forge · Campaign: Summer launch · Usage: 3 months organic" onChange={(e) => set("talentLine", e.target.value)} />
            </Field>
          </>
        )}

        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Line items</legend>
          {i.items.map((it, n) => {
            const g = (Number(it.q) || 0) * (Number(it.p) || 0);
            const off = Number(it.off) || 0;
            return (
              <div key={n} className="grid gap-1.5 rounded-xl bg-paper p-2">
                <div className="flex gap-1.5">
                  <input aria-label={`Line ${n + 1} description`} placeholder="Description" className={cn(fieldClass, "flex-1")} value={it.d} onChange={(e) => item(n, "d", e.target.value)} />
                  <button
                    type="button"
                    aria-label={`Remove line ${n + 1}`}
                    className="rounded-lg px-2 text-slate hover:text-pink"
                    onClick={() => setI((x) => ({ ...x, items: x.items.length > 1 ? x.items.filter((_, m) => m !== n) : [{ d: "", q: 1, p: 0 }] }))}
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <input aria-label={`Line ${n + 1} quantity`} type="number" step="any" min={0} placeholder="Qty" className={fieldClass} value={it.q || ""} onChange={(e) => item(n, "q", e.target.value)} />
                  <input aria-label={`Line ${n + 1} price`} type="number" step="0.01" min={0} placeholder="Price" className={fieldClass} value={it.p || ""} onChange={(e) => item(n, "p", e.target.value)} />
                  <input aria-label={`Line ${n + 1} percent off`} type="number" min={0} max={100} placeholder="% off" className={fieldClass} value={it.off || ""} onChange={(e) => item(n, "off", e.target.value)} />
                </div>
                {off > 0 && (
                  <span className="text-xs text-slate">
                    {money(g, i.currency)} less {off}% is {money(g * (1 - off / 100), i.currency)}
                  </span>
                )}
              </div>
            );
          })}
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => setI((x) => ({ ...x, items: [...x.items, { d: "", q: 1, p: 0 }] }))}>
              + Line
            </Button>
            {QUICK_LINES.map((l) => (
              <Button key={l} size="sm" tone="ghost" onClick={() => setI((x) => ({ ...x, items: [...x.items.filter((it) => it.d || it.p), { d: l, q: 1, p: 0 }] }))}>
                + {l}
              </Button>
            ))}
          </div>
        </fieldset>

        <Field label="Discount" hint={c.disc > 0 ? `Takes ${money(c.disc, i.currency)} off. The client sees the original prices, the discount, then the new total.` : "Leave empty for no discount."}>
          <div className="flex gap-1.5">
            <select aria-label="Discount type" className={cn(fieldClass, "w-auto")} value={i.discType} onChange={(e) => set("discType", e.target.value)}>
              <option value="pct">Percentage off</option>
              <option value="amt">Amount off ({i.currency})</option>
            </select>
            <input aria-label="Discount amount" type="number" min={0} className={fieldClass} value={i.discValue ?? ""} onChange={(e) => set("discValue", e.target.value === "" ? null : Number(e.target.value))} />
          </div>
        </Field>
        <Field label="Reason for the discount">
          <input className={fieldClass} placeholder="Reason, e.g. Loyalty discount" value={i.discLabel} onChange={(e) => set("discLabel", e.target.value)} />
        </Field>
        <div className="flex flex-wrap items-center gap-4 text-sm font-semibold sm:col-span-2">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-ink" checked={i.vat} onChange={(e) => set("vat", e.target.checked)} /> Add VAT
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="number" min={0} max={50} step="0.5" aria-label="VAT rate" className={cn(fieldClass, "w-20 py-1")} value={i.vatRate ?? 7.5} onChange={(e) => set("vatRate", Number(e.target.value))} />%
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-ink" checked={i.wht} onChange={(e) => set("wht", e.target.checked)} /> Withholding tax note
          </label>
        </div>

        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Payment methods on this invoice</legend>
          <div className="flex flex-wrap gap-4 text-sm font-semibold">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-ink" checked={i.payBank} onChange={(e) => set("payBank", e.target.checked)} /> Bank transfer
            </label>
            <label className={cn("inline-flex items-center gap-2", !paystackOk && "opacity-60")}>
              <input type="checkbox" className="size-4 accent-ink" disabled={!paystackOk} checked={i.payPaystack} onChange={(e) => set("payPaystack", e.target.checked)} /> Paystack
              {!paystackOk && <span className="font-normal text-slate">(add a Paystack link below or in Settings first)</span>}
            </label>
          </div>
          {i.payBank && !banks.length && (
            <p className="flex flex-wrap items-center gap-2 rounded-xl bg-peach/40 px-3 py-2 text-sm">
              No {i.currency} bank account saved yet, so the invoice says &quot;Account details to follow&quot;.
              <Link href="/admin/settings#invoice-details" className={cn(btn.base, btn.sm)}>
                Add in Settings
              </Link>
            </p>
          )}
          {i.payBank && banks.length > 0 && (
            <Field label="Pay into">
              <select className={fieldClass} value={i.bankId || bankFor(i, p.settings)?.id || ""} onChange={(e) => set("bankId", e.target.value)}>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label || b.bank} · ****{b.number.slice(-4)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Paystack link (optional)">
            <input type="url" className={fieldClass} placeholder={p.settings.paystack?.link || "https://paystack.com/pay/…"} value={i.payLink} onChange={(e) => set("payLink", e.target.value)} />
          </Field>
        </fieldset>

        <Field label="Terms and notes" full>
          <textarea rows={3} className={fieldClass} value={i.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>

        {i.payments.length > 0 && (
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-xs font-bold tracking-[0.04em] text-slate">Payments</span>
            {i.payments.map((pay, n) =>
              removed.includes(n) ? null : (
                <div key={n} className="flex items-center gap-2 rounded-xl bg-paper px-3 py-1.5 text-sm">
                  <span className="flex-1">
                    {shortD(pay.date)} · {money(pay.amt, i.currency)}
                    {pay.wht ? ` + WHT ${money(pay.wht, i.currency)}` : ""} · {pay.method}
                    {pay.note && <span className="text-slate"> · {pay.note}</span>}
                  </span>
                  <button
                    type="button"
                    className="text-slate hover:text-pink"
                    aria-label="Remove this payment"
                    onClick={() => {
                      setRemoved((r) => [...r, n]);
                      toast("Payment removed. Save to keep the change.");
                    }}
                  >
                    ×
                  </button>
                </div>
              ),
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-ink/10 pt-3 sm:col-span-2">
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
            {inv.id ? "Save" : "Save draft"}
          </button>
          {i.status === "draft" && (
            <Button disabled={pending} onClick={() => save(true)}>
              Mark as sent
            </Button>
          )}
          {inv.id && st !== "paid" && st !== "draft" && st !== "void" && (
            <Button disabled={pending} onClick={() => onPay(inv)}>
              Record payment
            </Button>
          )}
          <Button onClick={copy}>Copy message</Button>
          {inv.id ? (
            <a href={`/admin/invoices/${inv.id}/pdf`} className={cn(btn.base, btn.plain)}>
              <Download className="size-4" aria-hidden /> Download PDF
            </a>
          ) : (
            <span className="self-center text-xs text-slate">Save it to download the PDF.</span>
          )}
          <span className="flex-1" />
          {inv.id && i.status === "draft" && !inv.payments.length && (
            <Button tone="ghost" className="text-pink" onClick={() => window.confirm(`Delete draft ${inv.no}?`) && run(() => deleteDraftInvoice(inv.id)).then((ok) => ok && onDone())}>
              Delete
            </Button>
          )}
          {inv.id && i.status !== "draft" && (
            <Button
              tone="ghost"
              className="text-pink"
              onClick={() =>
                run(() => setInvoiceVoid(inv.id, i.status !== "void")).then((ok) => ok && onDone())
              }
            >
              {i.status === "void" ? "Restore" : "Void"}
            </Button>
          )}
        </div>
      </form>
      <aside className="grid content-start gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">Preview</span>
          <b className="tabular-nums">Total {money(c.total, i.currency)}</b>
        </div>
        <div className="overflow-hidden rounded-xl border-2 border-ink/15 bg-paper p-2">
          <InvoicePaper i={shown} s={p.settings} today={p.today} />
        </div>
      </aside>
    </div>
  );
}

const monthLong = (today: string) => new Date(`${today.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
