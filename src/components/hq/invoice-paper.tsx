import { type Invoice, type InvoiceSettings, INV_DEFAULTS, bankFor, invCalc, invMoney, invStatus, paystackFor } from "@/lib/hq/invoice-model";

// The invoice as the client sees it: HQ's paperHTML, an A4 page. Used for the live preview in the
// editor; the PDF (invoice-pdf.tsx) follows the same layout.

const longDate = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

export function InvoicePaper({ i, s, today }: { i: Invoice; s: InvoiceSettings; today: string }) {
  const c = invCalc(i);
  const m = (n: number) => invMoney(n, i.currency);
  const paid = invStatus(i, today) === "paid";
  const co = s.company ?? {};
  const bank = i.payBank ? bankFor(i, s) : null;
  const link = paystackFor(i, s);
  const anyOff = i.items.some((it) => Number(it.off) > 0);
  const discLine = i.discLabel || "Discount";
  return (
    <article className="relative mx-auto grid w-full max-w-[794px] gap-6 bg-white p-8 text-[13px] leading-snug text-ink shadow-sm sm:p-10" aria-label={`Invoice ${i.no}`}>
      <header className="-mx-8 -mt-8 flex flex-wrap items-start gap-4 bg-ink px-8 py-6 text-white sm:-mx-10 sm:-mt-10 sm:px-10">
        <div className="flex flex-1 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size mark on a printable page */}
          <img src="/images/iconmark-pink.png" alt="" className="size-[34px] rounded-md bg-white object-contain p-0.5" />
          <span>
            <b className="block font-display text-base">Digital Savvy Studios</b>
            <span className="text-[11px] text-white/70">Excellence, made visible</span>
          </span>
        </div>
        <div className="text-right">
          <h2 className="font-display text-3xl font-bold">Invoice.</h2>
          <span className="text-[11px] tracking-[0.08em] text-white/70">NO. {i.no}</span>
        </div>
      </header>

      <div className="flex flex-wrap justify-between gap-4 text-[11px]">
        <div>
          <span className="block font-bold tracking-[0.08em] text-slate">INVOICE DATE</span>
          {longDate(i.issueDate)}
        </div>
        <div>
          <span className="block font-bold tracking-[0.08em] text-slate">DUE DATE</span>
          {i.dueDate ? longDate(i.dueDate) : "On receipt"}
        </div>
        {paid && <span className="self-center rounded-md border-2 border-[#1e7a4c] px-3 py-1 font-display text-lg font-bold text-[#1e7a4c] -rotate-6">PAID</span>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-paper p-4">
          <span className="mb-1 block text-[11px] font-bold tracking-[0.08em] text-slate">Invoice to:</span>
          <b className="block text-sm">{i.billTo.name || "Who is it for?"}</b>
          {i.billTo.contact && <span className="block">Attn: {i.billTo.contact}</span>}
          {i.billTo.email && <span className="block">{i.billTo.email}</span>}
          {i.billTo.phone && <span className="block">{i.billTo.phone}</span>}
          {i.billTo.address && <span className="block whitespace-pre-line">{i.billTo.address}</span>}
        </div>
        <div className="rounded-xl bg-paper p-4">
          <span className="mb-1 block text-[11px] font-bold tracking-[0.08em] text-slate">From:</span>
          <b className="block text-sm">{co.name || INV_DEFAULTS.company}</b>
          {co.rc && <span className="block">RC {co.rc}</span>}
          <span className="block">{co.email || INV_DEFAULTS.email}</span>
          <span className="mt-2 inline-block rounded-full bg-ink px-3 py-1 font-bold text-lime">Total {m(c.total)}</span>
        </div>
      </div>

      {i.kind === "talent" && i.talentLine && <p className="text-[12px] text-slate">{i.talentLine}</p>}

      <table className="w-full text-left">
        <thead>
          <tr className="border-b-2 border-ink text-[11px] tracking-[0.06em] text-slate uppercase">
            <th className="py-2">Description</th>
            <th className="py-2 text-right">Price</th>
            <th className="py-2 text-right">Qty</th>
            {anyOff && <th className="py-2 text-right">Discount</th>}
            <th className="py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {i.items.length ? (
            i.items.map((it, n) => {
              const g = (Number(it.q) || 0) * (Number(it.p) || 0);
              const off = Number(it.off) || 0;
              return (
                <tr key={n} className="border-b border-ink/10 align-top">
                  <td className="py-2 pr-2">{it.d || <span className="text-slate">Line {n + 1}</span>}</td>
                  <td className="py-2 text-right tabular-nums">{m(Number(it.p) || 0)}</td>
                  <td className="py-2 text-right tabular-nums">{it.q}</td>
                  {anyOff && <td className="py-2 text-right">{off ? `${off}% off` : ""}</td>}
                  <td className="py-2 text-right tabular-nums">
                    {off > 0 && <s className="mr-1.5 text-slate">{m(g)}</s>}
                    {m(g * (1 - off / 100))}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={5} className="py-3 text-slate">
                Add a line item
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-ink p-4">
          <b className="mb-2 block font-display text-base">How to pay</b>
          {bank && (
            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="col-span-2 text-[11px] font-bold tracking-[0.08em] text-slate">BANK TRANSFER</dt>
              <dt className="text-slate">Bank</dt>
              <dd>{bank.bank}</dd>
              <dt className="text-slate">Account name</dt>
              <dd>{bank.name}</dd>
              <dt className="text-slate">Account number</dt>
              <dd className="font-bold tabular-nums">{bank.number}</dd>
              {bank.extra && (
                <>
                  <dt className="text-slate">{bank.extraLabel || "Sort code / SWIFT"}</dt>
                  <dd>{bank.extra}</dd>
                </>
              )}
            </dl>
          )}
          {link && (
            <p className="mb-2">
              <span className="block text-[11px] font-bold tracking-[0.08em] text-slate">PAYSTACK</span>
              Card, transfer or USSD: <span className="break-all underline">{link}</span>
            </p>
          )}
          {!bank && !link && (
            <p className="mb-2">
              <span className="block text-[11px] font-bold tracking-[0.08em] text-slate">BANK TRANSFER</span>
              Account details to follow
            </p>
          )}
          <p className="text-[12px]">
            Use <b>{i.no}</b> as your payment reference.
          </p>
        </div>
        <dl className="grid content-start gap-1">
          {c.lineDisc > 0 && (
            <>
              <Row l="Before discounts" v={m(c.gross)} />
              <Row l="Line discounts" v={`-${m(c.lineDisc)}`} />
            </>
          )}
          <Row l="Subtotal" v={m(c.sub)} />
          {c.disc > 0 && <Row l={`${discLine}${i.discType === "pct" ? ` (${i.discValue}%)` : ""}`} v={`-${m(c.disc)}`} />}
          {c.disc > 0 && i.vat && <Row l="After discount" v={m(c.net)} />}
          {i.vat && <Row l={`VAT (${Number(i.vatRate) || 7.5}%)`} v={m(c.vat)} />}
          {c.paid > 0 && <Row l="Paid" v={`-${m(c.paid)}`} />}
          <div className="mt-1 flex justify-between rounded-xl bg-ink px-3 py-2 text-white">
            <dt className="font-bold">{c.paid > 0 ? "Balance" : "Total"}</dt>
            <dd className="font-display text-lg font-bold tabular-nums">{m(c.paid > 0 ? c.balance : c.total)}</dd>
          </div>
        </dl>
      </div>

      <section className="grid gap-1">
        <b className="font-display text-base">Terms and notes</b>
        <p className="whitespace-pre-line">{i.notes || INV_DEFAULTS.terms}</p>
        {i.wht && <p className="text-slate">{s.whtText || INV_DEFAULTS.wht}</p>}
      </section>

      <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-ink/15 pt-4 text-[11px] text-slate">
        <div>
          <span className="block">{[co.email || INV_DEFAULTS.email, co.phone].filter(Boolean).join(" · ")}</span>
          {co.address && <span className="block">{co.address}</span>}
          <span className="block">{co.website || INV_DEFAULTS.website}</span>
        </div>
        <div className="text-right">
          <b className="block font-display text-sm text-ink">{co.signName || INV_DEFAULTS.signName}</b>
          {co.signTitle || INV_DEFAULTS.signTitle}
        </div>
      </footer>
    </article>
  );
}

function Row({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 px-3">
      <dt className="text-slate">{l}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
