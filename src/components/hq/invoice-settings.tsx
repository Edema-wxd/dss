"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { removeBank, saveBank, saveInvoiceDetails } from "@/app/admin/(hq)/invoices/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import { type Bank, type InvoiceSettings, INV_DEFAULTS } from "@/lib/hq/invoice-model";
import { cn } from "@/lib/utils";
import { Dialog, Pill, useRun } from "./kit";

// Settings > Invoice details: what prints on every invoice. Invoices access only.

export function InvoiceDetails({ s }: { s: InvoiceSettings }) {
  const { run, pending } = useRun();
  const [bank, setBank] = useState<Partial<Bank> | null>(null);
  const co = s.company ?? {};
  const [d, setD] = useState({
    name: co.name ?? "",
    rc: co.rc ?? "",
    email: co.email ?? "",
    phone: co.phone ?? "",
    address: co.address ?? "",
    website: co.website ?? "",
    signName: co.signName ?? "",
    link: s.paystack?.link ?? "",
    allCurrencies: s.paystack?.allCurrencies ? "yes" : "no",
    terms: String(s.terms ?? 14),
    vatRate: String(s.vatRate ?? 7.5),
    vatDefault: s.vatDefault ? "yes" : "no",
    footer: s.footer ?? INV_DEFAULTS.footer,
    whtText: s.whtText ?? INV_DEFAULTS.wht,
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  const save = () =>
    run(() =>
      saveInvoiceDetails({
        company: { name: d.name, rc: d.rc, email: d.email, phone: d.phone, address: d.address, website: d.website, signName: d.signName },
        paystack: { link: d.link, allCurrencies: d.allCurrencies },
        terms: d.terms,
        vatRate: d.vatRate,
        vatDefault: d.vatDefault,
        footer: d.footer,
        whtText: d.whtText,
      }),
    );
  const banks = s.banks ?? [];
  return (
    <Panel>
      <div id="invoice-details" className="scroll-mt-24">
        <h2 className="text-lg font-bold">Invoice details</h2>
        <p className="mb-4 text-sm text-slate">Printed on every invoice. Only people with Invoices access see this section.</p>

        <h3 className="mb-2 text-sm font-bold">Bank accounts</h3>
        {banks.length ? (
          <ul className="mb-3 grid gap-2">
            {banks.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-ink/15 px-3 py-2 text-sm">
                <b>{b.label || b.bank}</b>
                <Pill tone="sky">{b.currency}</Pill>
                {b.isDefault && <Pill tone="ok">Default</Pill>}
                <span className="text-slate">
                  {b.bank} · {b.name} · ****{b.number.slice(-4)}
                </span>
                <span className="flex-1" />
                <Button size="sm" tone="ghost" onClick={() => setBank(b)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  tone="ghost"
                  className="text-pink"
                  disabled={pending}
                  onClick={() => window.confirm("Remove this bank account? Invoices already sent keep the details printed on them.") && run(() => removeBank(b.id))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-slate">Add each account you get paid into: naira accounts and any domiciliary (USD, GBP, EUR) accounts. Each invoice prints the account for its currency.</p>
        )}
        <Button size="sm" className="mb-5" onClick={() => setBank({ currency: "NGN", name: d.name || INV_DEFAULTS.company })}>
          <Plus className="size-4" aria-hidden /> Add account
        </Button>

        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save())}>
          <Field label="Company name">
            <input className={fieldClass} placeholder={INV_DEFAULTS.company} {...bind("name")} />
          </Field>
          <Field label="RC number">
            <input className={fieldClass} {...bind("rc")} />
          </Field>
          <Field label="Email on invoices">
            <input type="email" className={fieldClass} placeholder={INV_DEFAULTS.email} {...bind("email")} />
          </Field>
          <Field label="Phone">
            <input className={fieldClass} {...bind("phone")} />
          </Field>
          <Field label="Address" full>
            <input className={fieldClass} {...bind("address")} />
          </Field>
          <Field label="Website">
            <input className={fieldClass} placeholder={INV_DEFAULTS.website} {...bind("website")} />
          </Field>
          <Field label="Signed by">
            <input className={fieldClass} placeholder={INV_DEFAULTS.signName} {...bind("signName")} />
          </Field>
          <Field label="Default Paystack payment page">
            <input type="url" placeholder="https://paystack.com/pay/…" className={fieldClass} {...bind("link")} />
          </Field>
          <Field label="Show it on foreign currency invoices">
            <select className={fieldClass} {...bind("allCurrencies")}>
              <option value="no">No, naira only</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Field label="Payment terms (days)">
            <input type="number" min={0} max={120} className={fieldClass} {...bind("terms")} />
          </Field>
          <Field label="VAT rate (%)">
            <input type="number" min={0} max={50} step="0.5" className={fieldClass} {...bind("vatRate")} />
          </Field>
          <Field label="Add VAT by default">
            <select className={fieldClass} {...bind("vatDefault")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </Field>
          <Field label="Default terms and notes" full>
            <textarea rows={2} className={fieldClass} {...bind("footer")} />
          </Field>
          <Field label="Withholding tax note" full>
            <textarea rows={2} className={fieldClass} {...bind("whtText")} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
            Save invoice details
          </button>
        </form>
      </div>
      <Dialog open={bank !== null} onClose={() => setBank(null)} title={bank?.id ? "Edit bank account" : "Add account"}>
        {bank && <BankForm b={bank} first={!banks.some((x) => x.currency === bank.currency && x.id !== bank.id)} onDone={() => setBank(null)} />}
      </Dialog>
    </Panel>
  );
}

function BankForm({ b, first, onDone }: { b: Partial<Bank>; first: boolean; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    id: b.id ?? "",
    label: b.label ?? "",
    currency: b.currency ?? "NGN",
    bank: b.bank ?? "",
    name: b.name ?? "",
    number: b.number ?? "",
    extraLabel: b.extraLabel ?? "",
    extra: b.extra ?? "",
    isDefault: b.isDefault ?? first,
  });
  const bind = (k: Exclude<keyof typeof d, "isDefault">) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveBank(d)).then((ok) => ok && onDone()))}>
      <Field label="Nickname">
        <input className={fieldClass} placeholder="e.g. Main naira account" {...bind("label")} />
      </Field>
      <Field label="Currency">
        <select className={fieldClass} {...bind("currency")}>
          {["NGN", "USD", "GBP", "EUR", "CAD"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Bank">
        <input required className={fieldClass} {...bind("bank")} />
      </Field>
      <Field label="Account name">
        <input required className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="Account number">
        <input required inputMode="numeric" className={fieldClass} {...bind("number")} />
      </Field>
      <Field label="Extra detail label">
        <input className={fieldClass} placeholder="Sort code / SWIFT" {...bind("extraLabel")} />
      </Field>
      <Field label="Extra detail">
        <input className={fieldClass} {...bind("extra")} />
      </Field>
      <label className="flex items-center gap-2 self-end text-sm font-semibold">
        <input type="checkbox" className="size-4 accent-ink" checked={d.isDefault} onChange={(e) => setD((x) => ({ ...x, isDefault: e.target.checked }))} />
        Default account for this currency
      </label>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Save account
      </button>
    </form>
  );
}
