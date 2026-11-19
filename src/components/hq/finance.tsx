"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  copyRecurringAction,
  markRetainerReceived,
  removeAsset,
  removeExpense,
  removeIncome,
  saveAssetAction,
  saveBudgetAction,
  saveExpenseAction,
  saveFinanceFigures,
  saveIncomeAction,
  setRetainerSkipAction,
} from "@/app/admin/(hq)/finance/actions";
import { Button, Field, btn, fieldClass } from "@/components/desk/ui";
import {
  ACCTS,
  CAT_GROUPS,
  CURRENCIES,
  EXP_CATS,
  EXP_METHODS,
  FIN_RANGES,
  INC_TYPES,
  OPEX,
  TAXR,
  type Asset,
  type Books,
  type Expense,
  type Income,
  type PL,
  addMonth,
  buckets,
  catGroup,
  catLabel,
  finAlerts,
  finTxns,
  finWindow,
  finance,
  monthEnd,
  monthKey,
  monthName,
  monthsBetween,
  monthsIn,
  payeMonthly,
  pctChange,
  prevWindow,
  retainerRows,
  sumPL,
} from "@/lib/hq/finance-model";
import { cell, money } from "@/lib/hq/money";
import { addDays } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Bar, CardHead, Dialog, EmptyNote, Pill, useRun } from "./kit";

const TABS = [
  ["overview", "Overview"],
  ["budget", "Budget"],
  ["spend", "Spend"],
  ["pl", "Profit and loss"],
  ["projections", "Projections"],
  ["tax", "Tax"],
] as const;
type Tab = (typeof TABS)[number][0];

const BLUE = "#5568AF";
const ORANGE = "#F37826";

export type FinanceProps = { books: Books; clients: { id: string; name: string }[]; goal: number; canInvoices: boolean };
type Editing = { kind: "expense"; e: Partial<Expense> & { life?: number | null } } | { kind: "income"; x: Partial<Income> } | { kind: "asset"; a: Partial<Asset> } | null;

/* ── Small pieces ────────────────────────────────────────────────────── */

function Stat({ l, v, s, delta, spark, invert }: { l: string; v: React.ReactNode; s?: React.ReactNode; delta?: number | null; spark?: number[]; invert?: boolean }) {
  const good = delta === null || delta === undefined ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <div className="grid content-start gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
      <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{l}</span>
      <span className="flex flex-wrap items-baseline gap-2">
        <b className="font-display text-3xl tabular-nums">{v}</b>
        {delta !== null && delta !== undefined && (
          <Pill tone={good ? "ok" : "bad"}>
            {delta >= 0 ? "+" : ""}
            {Math.round(delta)}%
          </Pill>
        )}
      </span>
      {s && <span className="text-sm text-slate">{s}</span>}
      {spark && spark.length > 1 && <Spark values={spark} />}
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-1 h-8 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-pink" />
    </svg>
  );
}

/** Grouped columns with an optional line, for money over time. */
function Columns({ labels, series, line, title }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; line?: { name: string; values: number[] }; title: string }) {
  const all = [...series.flatMap((s) => s.values), ...(line?.values ?? []), 0];
  const max = Math.max(...all);
  const min = Math.min(...all);
  const span = max - min || 1;
  const H = 160;
  const y = (v: number) => H - ((v - min) / span) * H;
  const W = 100 / labels.length;
  const bw = (W * 0.7) / series.length;
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 100 ${H + 18}`} preserveAspectRatio="none" className="h-52 w-full" role="img" aria-label={title}>
        <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.2" vectorEffect="non-scaling-stroke" />
        {labels.map((l, i) =>
          series.map((s, j) => {
            const v = s.values[i] ?? 0;
            return <rect key={`${l}-${s.name}`} x={i * W + W * 0.15 + j * bw} width={bw * 0.92} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0)) || 0.5} fill={s.color} rx="0.6" />;
          }),
        )}
        {line && (
          <polyline
            points={line.values.map((v, i) => `${i * W + W / 2},${y(v)}`).join(" ")}
            fill="none"
            stroke="#0d0d10"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="grid text-center text-[11px] text-slate" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-3 text-xs text-slate">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <i className="size-2.5 rounded-sm" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
        {line && (
          <span className="inline-flex items-center gap-1.5">
            <i className="h-0.5 w-3 bg-ink" /> {line.name}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function Card({ title, aside, children, className }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[20px] border-2 border-ink bg-white p-4", className)}>
      {title && <CardHead title={title}>{aside}</CardHead>}
      {children}
    </section>
  );
}

const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label: string }) => (
  <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border-2 border-ink bg-white p-0.5">
    {options.map(([k, l]) => (
      <button
        key={k}
        type="button"
        aria-pressed={value === k}
        onClick={() => onChange(k)}
        className={cn("rounded-full px-3 py-1 text-sm font-semibold text-slate", value === k && "bg-ink text-white")}
      >
        {l}
      </button>
    ))}
  </div>
);

/* ── The page ────────────────────────────────────────────────────────── */

export function FinanceView({ books, clients, goal, canInvoices }: FinanceProps) {
  const f = useMemo(() => finance(books), [books]);
  const today = books.today;
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState("month");
  const [m, setM] = useState(monthKey(today));
  const [editing, setEditing] = useState<Editing>(null);
  const w = finWindow(range, m, today);
  const months = Array.from({ length: 12 }, (_, i) => addMonth(monthKey(today), -i));
  const S = books.settings;

  const newExpense = () => setEditing({ kind: "expense", e: { date: today, cat: "ops", currency: "NGN", acct: "business", method: "Bank transfer" } });
  const newIncome = () => setEditing({ kind: "income", x: { date: today, type: "services", currency: "NGN", acct: "business" } });

  const picker = (
    <select aria-label="Month" value={m} onChange={(e) => setM(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
      {months.map((x) => (
        <option key={x} value={x}>
          {monthName(x)}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Finance" className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k ? "page" : undefined}
              onClick={() => setTab(k)}
              className={cn("rounded-full border-2 border-transparent px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-slate hover:text-ink", tab === k && "border-ink bg-ink text-white hover:text-white")}
            >
              {l}
            </button>
          ))}
        </nav>
        <button type="button" onClick={newExpense} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Expense
        </button>
      </div>
      {(tab === "overview" || tab === "spend" || tab === "pl" || tab === "budget") && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {tab !== "budget" && <Seg label="Period" value={range} options={FIN_RANGES} onChange={setRange} />}
          {(range === "month" || tab === "budget") && picker}
        </div>
      )}
      {S.importedFrom && (
        <p className="mb-4 rounded-2xl bg-paper px-4 py-2.5 text-sm text-slate">
          January to {monthName(S.booksTo || "2026-10")} comes from your books ({S.importedFrom}), reconciled to the bank. From {monthName(addMonth(S.booksTo || "2026-10", 1))}, HQ keeps the books as you log money here.
        </p>
      )}

      {tab === "overview" && <Overview f={f} books={books} w={w} goal={goal} onExpense={newExpense} onIncome={newIncome} onPL={() => setTab("pl")} onBudget={() => setTab("budget")} canInvoices={canInvoices} />}
      {tab === "budget" && <Budget key={m} f={f} m={m} goal={goal} />}
      {tab === "spend" && <Spend f={f} books={books} w={w} onEdit={setEditing} />}
      {tab === "pl" && <ProfitLoss f={f} books={books} w={w} onAsset={(a) => setEditing({ kind: "asset", a })} />}
      {tab === "projections" && <Projections f={f} books={books} goal={goal} />}
      {tab === "tax" && <TaxTab f={f} books={books} />}

      <Dialog open={editing?.kind === "expense"} onClose={() => setEditing(null)} title={editing?.kind === "expense" && editing.e.id ? "Edit expense" : "Add an expense"} wide>
        {editing?.kind === "expense" && <ExpenseForm e={editing.e} clients={clients} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={editing?.kind === "income"} onClose={() => setEditing(null)} title={editing?.kind === "income" && editing.x.id ? "Edit income" : "Add income"} wide>
        {editing?.kind === "income" && <IncomeForm x={editing.x} clients={clients} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={editing?.kind === "asset"} onClose={() => setEditing(null)} title={editing?.kind === "asset" && editing.a.id ? "Edit asset" : "Add an asset"}>
        {editing?.kind === "asset" && <AssetForm a={editing.a} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

type F = ReturnType<typeof finance>;
type W = ReturnType<typeof finWindow>;

/* ── Overview ────────────────────────────────────────────────────────── */

function Overview({ f, books, w, goal, onExpense, onIncome, onPL, onBudget, canInvoices }: { f: F; books: Books; w: W; goal: number; onExpense: () => void; onIncome: () => void; onPL: () => void; onBudget: () => void; canInvoices: boolean }) {
  const cur = f.plIn(w.from, w.to);
  const pw = prevWindow(w);
  const prev = f.plIn(pw.from, pw.to);
  const bm = w.month || f.thisMonth;
  const bs = buckets(w);
  const per = bs.map((b) => f.plIn(b.from, b.to));
  const cash = f.cashAt(books.today);
  const reserve = (Math.max(0, cur.op) * f.taxRateFor(bm)) / 100;
  const vs = w.month ? "vs last month" : `vs the ${w.short} before`;
  const txns = finTxns(books, w.from, w.to).slice(0, 9);
  const alerts = finAlerts(f, books, bm);
  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-[24px] border-2 border-ink bg-ink p-5 text-white">
        <span className="text-xs font-bold tracking-[0.08em] text-lime uppercase">Net profit · {w.label}</span>
        <span className="flex flex-wrap items-baseline gap-3">
          <b className="font-display text-5xl tabular-nums">{money(cur.op)}</b>
          {cur.margin !== null && <Pill tone={cur.op >= 0 ? "lime" : "bad"}>{Math.round(cur.margin)}% margin</Pill>}
        </span>
        <span className="text-sm text-white/75">
          Revenue {money(cur.rev)} · Costs {money(cur.cos + cur.totalOpex)}
          {Math.abs(cur.setup) > 0.5 && ` · Before one-off costs ${money(cur.preSetup)}`}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onExpense} className={cn(btn.base, "border-white bg-white text-ink")}>
            Expense
          </button>
          <button type="button" onClick={onIncome} className={cn(btn.base, "border-white/50 bg-transparent text-white")}>
            Income
          </button>
          <button type="button" onClick={onPL} className={cn(btn.base, "border-white/50 bg-transparent text-white")}>
            Profit and loss
          </button>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          l="Revenue"
          v={money(cur.rev, "NGN", true)}
          delta={pctChange(cur.rev, prev.rev)}
          s={`${money(cur.r.retainers, "NGN", true)} retainers · ${money(cur.r.commission, "NGN", true)} commission · ${vs}${goal && w.month ? ` · ${Math.round((cur.rev / goal) * 100)}% of goal` : ""}`}
          spark={per.map((p) => p.rev)}
        />
        <Stat l="Running costs" v={money(cur.opex, "NGN", true)} delta={pctChange(cur.opex, prev.opex)} invert s={vs} spark={per.map((p) => p.opex)} />
        <Stat l="Cash at bank" v={money(cash, "NGN", true)} s={`Business account today · set aside ${money(reserve, "NGN", true)} for tax`} spark={bs.map((b) => f.cashAt(b.to < books.today ? b.to : books.today))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card title="Money flow">
          <Columns
            title={`Revenue and costs for ${w.label}`}
            labels={bs.map((b) => b.label)}
            series={[
              { name: "Revenue", color: BLUE, values: per.map((p) => p.rev) },
              { name: "Costs", color: ORANGE, values: per.map((p) => p.cos + p.totalOpex) },
            ]}
            line={{ name: "Net profit", values: per.map((p) => p.op) }}
          />
        </Card>
        <Card title="Money in and out">
          {txns.length ? (
            <ul className="grid gap-1.5">
              {txns.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2 text-sm">
                  <span className="w-14 flex-none text-xs text-slate">{shortDay(t.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.label}
                    {t.personal && <span className="text-slate"> · personal account</span>}
                  </span>
                  <b className={cn("tabular-nums", t.amount < 0 ? "text-ink" : "text-[#1e7a4c]")}>
                    {t.amount < 0 ? "-" : "+"}
                    {money(Math.abs(t.amount), t.currency)}
                  </b>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title={`Nothing logged in ${w.label}.`}>Add expenses and income as they happen. Invoice payments appear here on their own.</EmptyNote>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RetainerCard f={f} books={books} m={bm} canInvoices={canInvoices} />
        <BudgetCard f={f} w={w} bm={bm} onBudget={onBudget} />
        <Card title="Needs attention">
          {alerts.length ? (
            <ul className="grid gap-2">
              {alerts.map((a) => (
                <li key={a.title} className="flex gap-2 text-sm">
                  <i className={cn("mt-1.5 size-2 flex-none rounded-full", a.tone === "bad" ? "bg-[#c42b3c]" : a.tone === "warn" ? "bg-[#e7a33a]" : "bg-sky")} aria-hidden />
                  <span>
                    <b className="font-semibold">{a.title}</b>
                    {a.detail && <span className="block text-slate">{a.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title="All clear.">Spend is inside budget and nothing is overdue.</EmptyNote>
          )}
        </Card>
      </div>
    </div>
  );
}

const shortDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function RetainerCard({ f, books, m, canInvoices }: { f: F; books: Books; m: string; canInvoices: boolean }) {
  const { run, pending } = useRun();
  const booked = books.booked.find((b) => b.month === m);
  if (booked?.source === "books") {
    return (
      <Card title={`Client fees, ${monthName(m)}`} aside={<Pill tone="sky">{money(f.revenueFor(m).services, "NGN", true)}</Pill>}>
        <p className="text-sm text-slate">This month is closed from your books, so client fees count when they were received, not as retainers.</p>
      </Card>
    );
  }
  const rows = retainerRows(f, books, m);
  const total = rows.filter((r) => !r.skip).reduce((t, r) => t + (f.toNGN(r.fee, r.currency) ?? 0), 0);
  const locked = !!booked?.locked;
  return (
    <Card title="Confirmed monthly revenue" aside={<Pill tone="sky">{money(total, "NGN", true)}</Pill>}>
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.clientId} className="grid gap-1 border-b border-ink/10 pb-2 last:border-0">
              <span className="flex items-baseline gap-2 text-sm">
                <b className={cn("min-w-0 flex-1 truncate font-semibold", r.skip && "text-slate line-through")}>{r.name}</b>
                <span className="tabular-nums">{money(r.fee, r.currency)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Pill tone={r.tone}>{r.status}</Pill>
                <span className="flex-1" />
                {!locked && (
                  <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => setRetainerSkipAction(r.clientId, m, !r.skip))}>
                    {r.skip ? "Count" : "Skip"}
                  </Button>
                )}
                {r.auto && !r.skip && r.paid < r.fee - 1 && (
                  <Button size="sm" disabled={pending} onClick={() => run(() => markRetainerReceived(r.clientId, m))}>
                    Mark received
                  </Button>
                )}
                {!r.auto && !r.skip && !r.invoiced && canInvoices && (
                  <Link href="/admin/invoices" className={cn(btn.base, btn.sm)}>
                    Invoice
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote title="No retainers counting this month.">Active clients billed monthly and On track count here as revenue.</EmptyNote>
      )}
    </Card>
  );
}

function BudgetCard({ f, w, bm, onBudget }: { f: F; w: W; bm: string; onBudget: () => void }) {
  const cur = f.plIn(w.from, w.to);
  const budget = f.budgetTotal(bm);
  const used = cur.opex;
  const pct = budget ? (used / budget) * 100 : 0;
  const cats = Object.entries(cur.s.byCat)
    .filter(([k, v]) => v > 0 && ["opex", "cos", "setup"].includes(catGroup(k)))
    .sort((a, b) => b[1] - a[1]);
  const top = cats.slice(0, 6);
  const rest = cats.slice(6).reduce((t, [, v]) => t + v, 0);
  const max = Math.max(1, ...top.map(([, v]) => v), rest);
  return (
    <Card title={w.month ? "Budget used" : "Where the money went"}>
      {w.month &&
        (budget ? (
          <div className="mb-3 grid gap-1.5">
            <span className="flex items-baseline gap-2">
              <b className="font-display text-2xl tabular-nums">{money(used, "NGN", true)}</b>
              <span className="text-sm text-slate">of {money(budget, "NGN", true)}</span>
              <span className="flex-1" />
              <Pill tone={pct > 100 ? "bad" : pct > 85 ? "warn" : "ok"}>{Math.round(pct)}%</Pill>
            </span>
            <Bar pct={pct} tone={pct > 100 ? "bad" : pct > 85 ? "warn" : "ok"} label="Budget used" />
            <span className="text-sm text-slate">{budget >= used ? `${money(budget - used, "NGN", true)} left` : `${money(used - budget, "NGN", true)} over`}</span>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate">
            No budget for {monthName(bm)}.
            <Button size="sm" onClick={onBudget}>
              Set the budget
            </Button>
          </div>
        ))}
      {top.length ? (
        <ul className="grid gap-1.5">
          {[...top, ...(rest ? ([["__rest", rest]] as [string, number][]) : [])].map(([k, v]) => (
            <li key={k} className="grid gap-0.5 text-sm">
              <span className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{k === "__rest" ? "Everything else" : catLabel(k)}</span>
                <b className="tabular-nums">{money(v, "NGN", true)}</b>
              </span>
              <span className="block h-1.5 rounded-full bg-paper">
                <i className="block h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: ORANGE }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate">No spending in {w.label}.</p>
      )}
    </Card>
  );
}

/* ── Budget ──────────────────────────────────────────────────────────── */

function Budget({ f, m, goal }: { f: F; m: string; goal: number }) {
  const { run, pending } = useRun();
  const bud = f.budgetFor(m);
  const [vals, setVals] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(OPEX.map((k) => [k, bud[k] === undefined ? "" : String(bud[k])])),
    __revenue: String(f.budgetRevenue(m) ?? ""),
  }));
  const s = f.spendFor(m);
  const r = f.revenueFor(m);
  const total = OPEX.reduce((t, k) => t + (Number(vals[k]) || 0), 0);
  const prev = f.budgetFor(addMonth(m, -1));
  const target = Number(vals.__revenue) || goal;
  const save = (next: Record<string, string>) => run(() => saveBudgetAction(m, next));
  const set = (k: string, v: string) => setVals((x) => ({ ...x, [k]: v }));
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Stat l="Budget" v={money(total, "NGN", true)} s={`Running costs for ${monthName(m)}`} />
        <Stat l="Spent so far" v={money(s.opex, "NGN", true)} s={total ? `${Math.round((s.opex / total) * 100)}% of budget` : "no budget set"} />
        <Stat l="Revenue target" v={money(r.total, "NGN", true)} s={`${target ? Math.round((r.total / target) * 100) : 0}% of ${money(target, "NGN", true)}`} />
      </div>
      <Card
        title={`Budget for ${monthName(m)}`}
        aside={
          Object.keys(prev).length > 0 && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                const next = { ...vals, ...Object.fromEntries(OPEX.map((k) => [k, prev[k] === undefined ? "" : String(prev[k])])) };
                setVals(next);
                save(next);
              }}
            >
              Copy last month
            </Button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                <th className="py-2 font-bold">Category</th>
                <th className="py-2 font-bold">Budget</th>
                <th className="py-2 text-right font-bold">Spent</th>
                <th className="w-40 py-2 font-bold">Used</th>
                <th className="py-2 text-right font-bold">Left</th>
              </tr>
            </thead>
            <tbody>
              {OPEX.map((k) => {
                const b = Number(vals[k]) || 0;
                const a = s.byCat[k] ?? 0;
                return (
                  <tr key={k} className="border-t border-ink/10">
                    <td className="py-1.5 pr-2">{catLabel(k)}</td>
                    <td className="py-1.5 pr-2">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`Budget for ${catLabel(k)}`}
                        className={cn(fieldClass, "w-36 py-1")}
                        value={vals[k]}
                        onChange={(e) => set(k, e.target.value)}
                        onBlur={(e) => String(bud[k] ?? "") !== e.target.value && save({ ...vals, [k]: e.target.value })}
                      />
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{cell(a)}</td>
                    <td className="py-1.5 pl-3">{b ? <Bar pct={(a / b) * 100} tone={a > b ? "bad" : a > b * 0.85 ? "warn" : "ok"} label={`${catLabel(k)} used`} /> : null}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", b && a > b && "text-[#c42b3c]")}>{b ? cell(b - a) : "-"}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-ink font-bold">
                <td className="py-2">Total running costs</td>
                <td className="py-2 tabular-nums">{cell(total)}</td>
                <td className="py-2 text-right tabular-nums">{cell(s.opex)}</td>
                <td />
                <td className="py-2 text-right tabular-nums">{total ? cell(total - s.opex) : "-"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="Revenue target for the month">
            <input
              type="number"
              min={0}
              className={fieldClass}
              placeholder={String(goal || 20000000)}
              value={vals.__revenue}
              onChange={(e) => set("__revenue", e.target.value)}
              onBlur={(e) => save({ ...vals, __revenue: e.target.value })}
            />
          </Field>
        </div>
      </Card>
    </div>
  );
}

/* ── Spend ───────────────────────────────────────────────────────────── */

function Spend({ f, books, w, onEdit }: { f: F; books: Books; w: W; onEdit: (e: Editing) => void }) {
  const { run, pending } = useRun();
  const [group, setGroup] = useState("all");
  const p = f.plIn(w.from, w.to);
  const o = f.ownerIn(w.from, w.to);
  const inWin = (d: string) => d >= w.from && d <= w.to;
  const exps = books.expenses.filter((e) => inWin(e.date)).sort((a, b) => b.date.localeCompare(a.date));
  const groups = CAT_GROUPS.filter(([g]) => exps.some((e) => catGroup(e.cat) === g));
  const shown = exps.filter((e) => group === "all" || catGroup(e.cat) === group);
  const incs = books.income.filter((x) => inWin(x.date)).sort((a, b) => b.date.localeCompare(a.date));
  const atCost = books.assets.reduce((t, a) => t + a.cost, 0);
  const incLabel = (t: string) => INC_TYPES.find(([k]) => k === t)?.[1] ?? t;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l="Running costs" v={money(p.opex, "NGN", true)} s={`${exps.filter((e) => catGroup(e.cat) === "opex").length} entries`} />
        <Stat l="One-off and cost of sales" v={money(p.setup + p.cos, "NGN", true)} />
        <Stat l="Capital purchases" v={money(p.capex, "NGN", true)} s={`${money(atCost, "NGN", true)} on the register at cost`} />
        <Stat l="Taken out by you" v={money(o.takenOut, "NGN", true)} s={`${money(o.putIn, "NGN", true)} put in · not counted as costs`} />
      </div>
      <Card title="Money out" aside={<Seg label="Group" value={group} onChange={setGroup} options={[["all", `Everything ${exps.length}`] as const, ...groups.map(([g, l]) => [g, `${l} ${exps.filter((e) => catGroup(e.cat) === g).length}`] as const)]} />}>
        {shown.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                  {["Date", "What", "Category", "Paid from", "Amount"].map((h) => (
                    <th key={h} className={cn("py-2 font-bold", h === "Amount" && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 300).map((e) => (
                  <tr key={e.id} className="cursor-pointer border-t border-ink/10 hover:bg-paper/60" onClick={() => onEdit({ kind: "expense", e })}>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate">{shortDay(e.date)}</td>
                    <td className="py-1.5 pr-2">
                      {e.description}
                      {e.vendor && <span className="block text-xs text-slate">{e.vendor}</span>}
                    </td>
                    <td className="py-1.5 pr-2">{catLabel(e.cat)}</td>
                    <td className="py-1.5 pr-2">{e.acct === "personal" ? "Personal" : "Business"}</td>
                    <td className="py-1.5 text-right tabular-nums">{e.amount < 0 ? `+${money(-e.amount, e.currency)}` : money(e.amount, e.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2">
            <EmptyNote title={`Nothing here for ${w.label}.`} />
            {w.month && (
              <Button disabled={pending} onClick={() => run(() => copyRecurringAction(w.month!))}>
                Copy regular monthly costs
              </Button>
            )}
          </div>
        )}
      </Card>
      <Card title="Money in" aside={<Button size="sm" onClick={() => onEdit({ kind: "income", x: { date: books.today, type: "services", currency: "NGN", acct: "business" } })}>Income</Button>}>
        {incs.length ? (
          <ul className="grid gap-1.5">
            {incs.slice(0, 200).map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => onEdit({ kind: "income", x })} className="flex w-full items-baseline gap-2 rounded-lg px-1 py-0.5 text-left text-sm hover:bg-paper">
                  <span className="w-14 flex-none text-xs text-slate">{shortDay(x.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {x.description}
                    <span className="text-slate"> · {incLabel(x.type)}</span>
                  </span>
                  <b className="tabular-nums">{money(x.amount, x.currency)}</b>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote title={`Nothing extra in ${w.label}.`}>Invoice payments count on their own. Log other money in here.</EmptyNote>
        )}
      </Card>
    </div>
  );
}

/* ── Profit and loss ─────────────────────────────────────────────────── */

function ProfitLoss({ f, books, w, onAsset }: { f: F; books: Books; w: W; onAsset: (a: Partial<Asset>) => void }) {
  const { run, pending } = useRun();
  const end = w.month || f.thisMonth;
  const yr = end.slice(0, 4);
  const cols = monthsIn(`${yr}-01`, end);
  const pls = cols.map((m) => f.plFor(m));
  const ytd = sumPL(pls);
  const reserve = pls.reduce((t, p) => t + (Math.max(0, p.op) * f.taxRateFor(p.m!)) / 100, 0);
  const active = pls.filter((p) => p.rev || p.totalOpex);
  const best = active.reduce<PL | null>((b, p) => (!b || p.op > b.op ? p : b), null);
  const S = books.settings;
  const usedOpex = OPEX.filter((k) => pls.some((p) => Math.abs(p.s.byCat[k] ?? 0) > 0.5));
  const usedSetup = EXP_CATS.filter((c) => c[2] === "setup" && pls.some((p) => Math.abs(p.s.byCat[c[0]] ?? 0) > 0.5)).map((c) => c[0]);
  const owners = cols.map((m) => f.ownerFor(m));
  const stmts = S.statements ?? {};
  const hasStmt = cols.some((m) => typeof stmts[m] === "number");
  const cashEnd = f.cashAt(monthEnd(end) < books.today ? monthEnd(end) : books.today);
  const nbv = books.assets.reduce((t, a) => t + f.assetNBV(a, end), 0);
  const loan = Number(S.loanBalance) || 0;
  const exit = Number(S.targets?.exit) || 4000000;
  const streak = (() => {
    let best = 0;
    let run = 0;
    for (const p of pls) {
      run = p.op >= exit ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  })();
  const atExit = pls.filter((p) => p.op >= exit).length;

  type Row = { l: string; get: (p: PL, i: number) => number; bold?: boolean; pct?: boolean; head?: boolean; indent?: boolean };
  const rows: Row[] = [
    { l: "Revenue", get: () => 0, head: true },
    { l: "Client fees", get: (p) => p.r.services + p.r.retainers, indent: true },
    { l: "of which confirmed retainers", get: (p) => p.r.retainers, indent: true },
    { l: "Talent commission earned", get: (p) => p.r.commission, indent: true },
    { l: "Other income", get: (p) => p.r.other, indent: true },
    { l: "Total revenue", get: (p) => p.rev, bold: true },
    { l: "Cost of sales", get: () => 0, head: true },
    { l: "Co-manager commission share", get: (p) => p.cos, indent: true },
    { l: "Gross profit", get: (p) => p.gross, bold: true },
    { l: "Gross margin", get: (p) => p.gm ?? 0, pct: true },
    { l: "Operating expenses", get: () => 0, head: true },
    ...usedOpex.map((k) => ({ l: catLabel(k), get: (p: PL) => p.s.byCat[k] ?? 0, indent: true })),
    { l: "Running costs", get: (p) => p.opex, bold: true },
    ...usedSetup.map((k) => ({ l: catLabel(k), get: (p: PL) => p.s.byCat[k] ?? 0, indent: true })),
    { l: "One-off setup costs", get: (p) => p.setup, bold: true },
    { l: "Depreciation and amortisation", get: (p) => p.dep, indent: true },
    { l: "Total operating expenses", get: (p) => p.totalOpex, bold: true },
    { l: "Net profit", get: (p) => p.op, bold: true },
    { l: "Profit before one-off setup costs", get: (p) => p.preSetup },
    { l: "Net margin", get: (p) => p.margin ?? 0, pct: true },
    { l: "Suggested tax reserve", get: (p) => (Math.max(0, p.op) * f.taxRateFor(p.m!)) / 100 },
    { l: "Owner, assets and loan (not in profit)", get: () => 0, head: true },
    { l: "Put in by you", get: (_, i) => owners[i]?.putIn ?? 0, indent: true },
    { l: "Taken out by you", get: (_, i) => owners[i]?.takenOut ?? 0, indent: true },
    { l: "Capital purchases", get: (p) => p.capex, indent: true },
    { l: "Loan repayments", get: (_, i) => owners[i]?.loanOut ?? 0, indent: true },
    { l: "Cash check, business account", get: () => 0, head: true },
    { l: "Opening cash", get: (p) => f.cashAt(addDays(`${p.m}-01`, -1)), indent: true },
    { l: "Net cash movement", get: (p) => f.cashAt(monthEnd(p.m!)) - f.cashAt(addDays(`${p.m}-01`, -1)), indent: true },
    { l: "Closing cash", get: (p) => f.cashAt(monthEnd(p.m!)), bold: true },
    ...(hasStmt
      ? [
          { l: "Closing cash, per statement", get: (p: PL) => Number(stmts[p.m!] ?? 0), indent: true },
          { l: "Difference", get: (p: PL) => (typeof stmts[p.m!] === "number" ? f.cashAt(monthEnd(p.m!)) - Number(stmts[p.m!]) : 0), indent: true },
        ]
      : []),
  ];
  const ytdOf = (r: Row) => {
    if (r.pct) return r.l === "Gross margin" ? (ytd.gm ?? 0) : (ytd.margin ?? 0);
    if (r.l.startsWith("Opening")) return f.cashAt(addDays(`${cols[0]}-01`, -1));
    if (r.l === "Closing cash" || r.l.startsWith("Closing cash, per") || r.l === "Difference") return r.get(pls[pls.length - 1], pls.length - 1);
    return pls.reduce((t, p, i) => t + r.get(p, i), 0);
  };

  const range = !w.month ? f.plIn(w.from, w.to) : null;
  const rangeOwner = !w.month ? f.ownerIn(w.from, w.to) : null;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l={`Revenue ${yr} so far`} v={money(ytd.rev)} />
        <Stat l="Net profit" v={money(ytd.op)} s={`${ytd.margin === null ? "-" : `${Math.round(ytd.margin)}%`} margin · ${money(ytd.preSetup, "NGN", true)} before one-off costs`} />
        <Stat l="Tax reserve so far" v={money(reserve, "NGN", true)} />
        <Stat l="Average month" v={money(active.length ? ytd.op / active.length : 0, "NGN", true)} s={best ? `Best: ${monthName(best.m!)}, ${money(best.op, "NGN", true)}` : undefined} />
      </div>
      {range && rangeOwner && (
        <Card title={`Statement for ${w.label}`}>
          <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
            {(
              [
                ["Revenue", range.rev],
                ["Cost of sales", range.cos],
                ["Running costs", range.opex],
                ["One-off setup costs", range.setup],
                ["Depreciation", range.dep],
                ["Net profit", range.op],
                ["Put in by you", rangeOwner.putIn],
                ["Taken out by you", rangeOwner.takenOut],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className="flex justify-between gap-2 border-b border-ink/10 py-1">
                <dt>{l}</dt>
                <dd className="font-semibold tabular-nums">{money(v)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <Card title={`Profit and loss, ${yr}`}>
        <Columns
          title={`Revenue and costs by month in ${yr}`}
          labels={cols.map((m) => monthName(m, true).slice(0, 3))}
          series={[
            { name: "Revenue", color: BLUE, values: pls.map((p) => p.rev) },
            { name: "Costs", color: ORANGE, values: pls.map((p) => p.cos + p.totalOpex) },
          ]}
          line={{ name: "Net profit", values: pls.map((p) => p.op) }}
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${260 + (cols.length + 1) * 84}px` }}>
            <thead>
              <tr className="text-[11px] tracking-[0.08em] text-slate uppercase">
                <th className="sticky left-0 bg-white py-2 text-left font-bold" />
                {cols.map((m) => (
                  <th key={m} className="py-2 text-right font-bold">
                    {monthName(m, true).slice(0, 3)}
                  </th>
                ))}
                <th className="py-2 pl-3 text-right font-bold">Year to date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) =>
                r.head ? (
                  <tr key={r.l}>
                    <th colSpan={cols.length + 2} className="pt-4 pb-1 text-left text-xs font-bold tracking-[0.06em] text-slate uppercase">
                      {r.l}
                    </th>
                  </tr>
                ) : (
                  <tr key={r.l} className={cn("border-t border-ink/10", r.bold && "font-bold", r.l === "Net profit" && "border-t-2 border-ink")}>
                    <td className={cn("sticky left-0 bg-white py-1 pr-3", r.indent && "pl-3")}>{r.l}</td>
                    {pls.map((p, i) => {
                      const v = r.get(p, i);
                      return (
                        <td key={p.m} className={cn("py-1 text-right tabular-nums", v < -0.5 && "text-[#c42b3c]")}>
                          {r.pct ? (p.rev ? `${Math.round(v)}%` : "-") : cell(v)}
                        </td>
                      );
                    })}
                    <td className="py-1 pl-3 text-right tabular-nums">{r.pct ? (ytd.rev ? `${Math.round(ytdOf(r))}%` : "-") : cell(ytdOf(r))}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Position at ${monthName(end)}`}>
          <dl className="grid gap-1.5 text-sm">
            {(
              [
                ["Cash at bank", cashEnd],
                ["Assets at cost", books.assets.reduce((t, a) => t + a.cost, 0)],
                ["Assets, net book value", nbv],
                ["Loan owed", loan],
                ["Net assets", cashEnd + nbv - loan],
              ] as const
            ).map(([l, v]) => (
              <div key={l} className={cn("flex justify-between gap-2 border-b border-ink/10 py-1", l === "Net assets" && "font-bold")}>
                <dt>{l}</dt>
                <dd className="tabular-nums">{money(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-slate">
            Target net profit {money(Number(S.targets?.netProfit) || 3000000, "NGN", true)} a month. Months at or above {money(exit, "NGN", true)}: {atExit}
            {streak >= 2 ? " (two in a row reached)" : ""}.
          </p>
          <form
            className="mt-3 grid gap-2 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = Object.fromEntries(new FormData(e.currentTarget));
              run(() => saveFinanceFigures({ ...fd, statementMonth: end }));
            }}
          >
            <Field label="Loan owed">
              <input name="loanBalance" type="number" min={0} defaultValue={loan || ""} className={fieldClass} />
            </Field>
            <Field label={`Bank statement closing, ${monthName(end, true)}`}>
              <input name="statement" type="number" step="0.01" defaultValue={typeof stmts[end] === "number" ? String(stmts[end]) : ""} className={fieldClass} />
            </Field>
            <button type="submit" disabled={pending} className={cn(btn.base, btn.sm, "justify-self-start")}>
              Save figures
            </button>
          </form>
        </Card>
        <Card title="Asset register" aside={<Button size="sm" onClick={() => onAsset({ date: books.today, life: 36 })}>Asset</Button>}>
          {books.assets.length ? (
            <ul className="grid gap-2">
              {books.assets.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onAsset(a)} className="flex w-full items-baseline gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-paper">
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold">{a.name}</b>
                      <span className="block text-xs text-slate">
                        {a.date ? shortDay(a.date) : "No date"} · {money(a.cost)} over {Math.round(((a.life || 36) / 12) * 10) / 10} years · {money(f.assetMonthly(a))} a month
                      </span>
                    </span>
                    <b className="tabular-nums">{money(f.assetNBV(a, end))}</b>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyNote title="Nothing on the register.">Capital purchases you log go here on their own, and are written down a month at a time.</EmptyNote>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ── Projections ─────────────────────────────────────────────────────── */

function Projections({ f, books, goal }: { f: F; books: Books; goal: number }) {
  const { run, pending } = useRun();
  const now = f.thisMonth;
  const T = books.settings.tax ?? {};
  const closed = [1, 2, 3].map((n) => f.plFor(addMonth(now, -n))).filter((p) => p.rev || p.opex);
  const base = closed.length ? closed : [f.plFor(now)];
  const avgRev = base.reduce((t, p) => t + p.rev, 0) / base.length;
  const avgOpex = base.reduce((t, p) => t + p.opex, 0) / base.length;
  const costBase = f.budgetTotal(addMonth(now, 1)) || f.budgetTotal(now) || avgOpex;
  const target = (Number(T.targetMargin) || 30) / 100;
  const tr = f.taxRateFor(now) / 100;
  const runway = avgOpex ? (Number(T.cash) || f.cashAt(books.today)) / avgOpex : null;
  const recurring = f.recurring();
  const ahead = monthsIn(addMonth(now, 1), addMonth(now, 6)).map((m) => {
    const rev = Math.max(recurring, avgRev);
    const cost = f.budgetTotal(m) || costBase;
    return { m, rev, cost, net: rev - cost };
  });
  const gap = Math.max(0, goal - recurring);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l="Break-even revenue" v={money(costBase, "NGN", true)} s="a month, to cover running costs" />
        <Stat l={`For a ${Math.round(target * 100)}% margin`} v={money(costBase / (1 - target), "NGN", true)} s={`${money(costBase / (1 - target / (1 - tr)), "NGN", true)} to keep it after tax`} />
        <Stat l="Runway" v={runway === null ? "-" : `${runway.toFixed(1)} months`} s="cash over average running costs" />
        <Stat l="Monthly revenue goal" v={money(goal, "NGN", true)} s={gap ? `${money(gap, "NGN", true)} short: about ${Math.ceil(gap / 800000)} clients at ₦800k or ${Math.ceil(gap / 1500000)} at ₦1.5M` : "covered by retainers"} />
      </div>
      <Card title="The next six months">
        <Columns
          title="Projected revenue and costs for the next six months"
          labels={ahead.map((a) => monthName(a.m, true).slice(0, 3))}
          series={[
            { name: "Revenue", color: BLUE, values: ahead.map((a) => a.rev) },
            { name: "Costs", color: ORANGE, values: ahead.map((a) => a.cost) },
          ]}
          line={{ name: "Net profit", values: ahead.map((a) => a.net) }}
        />
        <p className="mt-2 text-sm text-slate">
          Revenue is the higher of today&apos;s retainers ({money(recurring, "NGN", true)}) and the last {base.length} month average ({money(avgRev, "NGN", true)}). Costs are each month&apos;s budget, or {money(costBase, "NGN", true)}.
        </p>
      </Card>
      <Card title="Assumptions">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveFinanceFigures(Object.fromEntries(new FormData(e.currentTarget))));
          }}
        >
          <Field label="Target margin (%)">
            <input name="targetMargin" type="number" min={0} max={95} defaultValue={T.targetMargin ?? 30} className={fieldClass} />
          </Field>
          <Field label="Cash to plan with" hint="Leave empty to use cash at bank">
            <input name="cash" type="number" min={0} defaultValue={T.cash ?? ""} className={fieldClass} />
          </Field>
          <Field label="Net profit target a month">
            <input name="netProfit" type="number" min={0} defaultValue={books.settings.targets?.netProfit ?? 3000000} className={fieldClass} />
          </Field>
          <Field label="Exit target a month">
            <input name="exit" type="number" min={0} defaultValue={books.settings.targets?.exit ?? 4000000} className={fieldClass} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.sm, "justify-self-start")}>
            Save assumptions
          </button>
        </form>
        <p className="mt-2 text-xs text-slate">The monthly revenue goal is set in Settings.</p>
      </Card>
    </div>
  );
}

/* ── Tax ─────────────────────────────────────────────────────────────── */

function TaxTab({ f, books }: { f: F; books: Books }) {
  const { run, pending } = useRun();
  const T = books.settings.tax ?? {};
  const tp = f.taxPeriod();
  const sc = f.smallCo();
  const now = f.thisMonth;
  const today = books.today;
  const yr = now.slice(0, 4);
  const preEnd = T.incorporated ? addMonth(T.incorporated.slice(0, 7), -1) : now;
  const pre = T.incorporated && preEnd >= `${yr}-01` ? monthsIn(`${yr}-01`, preEnd).map((m) => f.plFor(m)) : [];
  const rr = Number(T.reserveRate ?? 20);
  const periodMonths = monthsIn(tp.start, now < tp.end.slice(0, 7) ? now : tp.end);
  const pls = periodMonths.map((m) => f.plFor(m));
  const profit = pls.reduce((t, p) => t + (p.rev - p.opex), 0);
  const closed = [1, 2, 3].map((n) => f.plFor(addMonth(now, -n)));
  const avgOp = closed.reduce((t, p) => t + p.op, 0) / closed.length;
  const monthsLeft = Math.max(0, monthsBetween(now, tp.end.slice(0, 7)));
  const proj = profit + Math.max(0, avgOp) * monthsLeft;
  const cit = sc.small ? 0 : (proj * TAXR.cit) / 100;
  const levy = sc.small ? 0 : (proj * TAXR.levy) / 100;
  const wht = pls.reduce((t, p) => t + p.r.wht, 0);
  const due = Math.max(0, cit - wht) + levy;
  const daysToDue = Math.round((Date.parse(`${tp.due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5);
  const toDue = Math.max(1, monthsBetween(now, tp.due.slice(0, 7)));
  const vatMonths = monthsIn(addMonth(now, -5), now).map((m) => ({ m, v: f.revenueFor(m).vat }));
  const lastM = addMonth(now, -1);
  const salaries = books.expenses.filter((e) => e.cat === "salaries" && e.date.slice(0, 7) === lastM);
  const anySalaries = books.expenses.some((e) => e.cat === "salaries");
  const coming = [
    ...(anySalaries ? [{ when: `10 ${monthName(addMonth(now, 1))}`, what: "PAYE for this month's salaries" }] : []),
    { when: `21 ${monthName(addMonth(now, 1))}`, what: "VAT and WHT returns for this month" },
    { when: longD(tp.due), what: `First company tax return${tp.provisional ? " (estimated: add the incorporation date)" : ""}` },
  ];
  return (
    <div className="grid gap-4">
      {pre.length > 0 && (
        <Card title={`Before incorporation, ${monthName(`${yr}-01`, true).slice(0, 3)} to ${monthName(preEnd, true).slice(0, 3)}`}>
          <p className="text-sm">
            Profit {money(pre.reduce((t, p) => t + p.op, 0))}. Set aside {money(pre.reduce((t, p) => t + Math.max(0, p.op), 0) * (rr / 100))} at {rr}% for personal income tax on it.
          </p>
        </Card>
      )}
      <section className="grid gap-2 rounded-[24px] border-2 border-ink bg-ink p-5 text-white">
        <span className="text-xs font-bold tracking-[0.08em] text-lime uppercase">First company tax return due</span>
        <b className="font-display text-4xl">{longD(tp.due)}</b>
        <span className="text-sm text-white/75">
          {Math.max(0, Math.floor(daysToDue / 30))} months to go · estimated bill {money(due)} · put aside {money(due / toDue)} a month
        </span>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l="Revenue this tax period" v={money(pls.reduce((t, p) => t + p.rev, 0), "NGN", true)} />
        <Stat l="Assessable profit" v={money(profit, "NGN", true)} s={`about ${money(proj, "NGN", true)} by ${monthName(tp.end.slice(0, 7))}`} />
        <Stat l="Company tax and levy" v={money(cit + levy, "NGN", true)} s={sc.small ? "small company: 0%" : `${TAXR.cit}% plus ${TAXR.levy}% levy`} />
        <Stat l="WHT credits" v={money(wht, "NGN", true)} s="taken off the company tax" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Rate tests">
          <ul className="grid gap-1.5 text-sm">
            <li>Turnover {money(sc.annual, "NGN", true)} a year {sc.annual <= 100e6 ? "is" : "isn't"} under ₦100M.</li>
            <li>Fixed assets {money(sc.fixed, "NGN", true)} {sc.fixed <= 250e6 ? "are" : "aren't"} under ₦250M.</li>
            <li>{sc.prof ? "Professional services don't qualify as a small company." : "Not a professional services firm."}</li>
            <li>
              <b>{sc.small ? "Small company: 0% company tax." : `Company tax at ${TAXR.cit}% plus the ${TAXR.levy}% development levy.`}</b>
            </li>
          </ul>
        </Card>
        <Card title="Coming up">
          <ul className="grid gap-1.5 text-sm">
            {coming.map((c) => (
              <li key={c.what} className="flex gap-3">
                <b className="w-32 flex-none">{c.when}</b>
                {c.what}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="VAT collected">
          <ul className="grid gap-1 text-sm">
            {vatMonths.map(({ m, v }) => (
              <li key={m} className="flex justify-between">
                <span>{monthName(m)}</span>
                <b className="tabular-nums">{cell(v)}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`PAYE, ${monthName(lastM)}`}>
          {salaries.length ? (
            <ul className="grid gap-1 text-sm">
              {salaries.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="truncate">{e.description}</span>
                  <span className="tabular-nums">
                    {money(e.amount)} · PAYE {money(payeMonthly(e.amount))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">No salaries logged last month.</p>
          )}
        </Card>
      </div>
      <Card title="Tax details">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveFinanceFigures(Object.fromEntries(new FormData(e.currentTarget))));
          }}
        >
          <Field label="Incorporated on">
            <input name="incorporated" type="date" defaultValue={T.incorporated ?? ""} className={fieldClass} />
          </Field>
          <Field label="First accounting period ends">
            <input name="periodEnd" type="date" defaultValue={T.periodEnd ?? ""} className={fieldClass} />
          </Field>
          <Field label="Return due (if your adviser says otherwise)">
            <input name="dueOverride" type="date" defaultValue={T.dueOverride ?? ""} className={fieldClass} />
          </Field>
          <Field label="Reserve before incorporation (%)">
            <input name="reserveRate" type="number" min={0} max={100} defaultValue={T.reserveRate ?? 20} className={fieldClass} />
          </Field>
          <Field label="Professional services firm?">
            <select name="professional" defaultValue={T.professional === false ? "no" : "yes"} className={fieldClass}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Treatment">
            <select name="treatment" defaultValue={T.treatment ?? ""} className={fieldClass}>
              <option value="">Work it out</option>
              <option value="small">Small company</option>
              <option value="standard">Standard rate</option>
            </select>
          </Field>
          <Field label="TIN">
            <input name="tin" defaultValue={T.tin ?? ""} className={fieldClass} />
          </Field>
          <Field label="Tax adviser">
            <input name="adviser" defaultValue={T.adviser ?? ""} className={fieldClass} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.sm, "justify-self-start self-end")}>
            Save tax details
          </button>
        </form>
      </Card>
    </div>
  );
}

const longD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/* ── Forms ───────────────────────────────────────────────────────────── */

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function ExpenseForm({ e, clients, onDone }: { e: Partial<Expense> & { life?: number | null }; clients: { id: string; name: string }[]; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    description: s(e.description),
    amount: s(e.amount),
    currency: e.currency ?? "NGN",
    cat: e.cat ?? "ops",
    date: s(e.date),
    acct: e.acct ?? "business",
    vendor: s(e.vendor),
    method: e.method ?? "Bank transfer",
    clientId: s(e.clientId),
    receipt: s(e.receipt),
    life: s(e.life ?? 36),
    recurring: !!e.recurring,
  });
  const bind = (k: Exclude<keyof typeof d, "recurring">) => ({ value: d[k], onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: ev.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => (ev.preventDefault(), run(() => saveExpenseAction(e.id ?? null, d)).then((ok) => ok && onDone()))}>
      <Field label="What was it for?" full>
        <input required autoFocus className={fieldClass} {...bind("description")} />
      </Field>
      <Field label="Amount" hint="A refund is a negative amount">
        <input required type="number" step="0.01" className={fieldClass} {...bind("amount")} />
      </Field>
      <Field label="Currency">
        <select className={fieldClass} {...bind("currency")}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Category" full>
        <select className={fieldClass} {...bind("cat")}>
          {CAT_GROUPS.map(([g, gl]) => (
            <optgroup key={g} label={gl}>
              {EXP_CATS.filter((c) => c[2] === g).map((c) => (
                <option key={c[0]} value={c[0]}>
                  {c[1]}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {catGroup(d.cat) === "capex" && (
        <Field label="Useful life (months)" hint="It goes on the asset register and is written down over this time">
          <input type="number" min={1} max={240} className={fieldClass} {...bind("life")} />
        </Field>
      )}
      <Field label="Date">
        <input required type="date" className={fieldClass} {...bind("date")} />
      </Field>
      <Field label="Paid from">
        <select className={fieldClass} {...bind("acct")}>
          {ACCTS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Paid to">
        <input className={fieldClass} {...bind("vendor")} />
      </Field>
      <Field label="How">
        <select className={fieldClass} {...bind("method")}>
          {EXP_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="For a client?">
        <select className={fieldClass} {...bind("clientId")}>
          <option value="">No, general business cost</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Receipt link">
        <input type="url" placeholder="https://" className={fieldClass} {...bind("receipt")} />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" checked={d.recurring} onChange={(ev) => setD((x) => ({ ...x, recurring: ev.target.checked }))} className="size-4 accent-ink" />
        A regular monthly cost
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          {e.id ? "Save" : "Add expense"}
        </button>
        <span className="flex-1" />
        {e.id && (
          <Button tone="ghost" className="text-pink" onClick={() => window.confirm("Delete this expense?") && run(() => removeExpense(e.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function IncomeForm({ x, clients, onDone }: { x: Partial<Income>; clients: { id: string; name: string }[]; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    description: s(x.description),
    amount: s(x.amount),
    currency: x.currency ?? "NGN",
    type: x.type ?? "services",
    date: s(x.date),
    acct: x.acct ?? "business",
    from: s(x.from),
    clientId: s(x.clientId),
    period: s(x.period),
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((y) => ({ ...y, [k]: ev.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => (ev.preventDefault(), run(() => saveIncomeAction(x.id ?? null, d)).then((ok) => ok && onDone()))}>
      <p className="text-sm text-slate sm:col-span-2">Only for money that didn&apos;t come through an HQ invoice, so it isn&apos;t counted twice.</p>
      <Field label="What was it for?" full>
        <input required autoFocus className={fieldClass} {...bind("description")} />
      </Field>
      <Field label="Amount">
        <input required type="number" step="0.01" className={fieldClass} {...bind("amount")} />
      </Field>
      <Field label="Currency">
        <select className={fieldClass} {...bind("currency")}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Type" full>
        <select className={fieldClass} {...bind("type")}>
          {INC_TYPES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input required type="date" className={fieldClass} {...bind("date")} />
      </Field>
      <Field label="Paid into">
        <select className={fieldClass} {...bind("acct")}>
          {ACCTS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="From">
        <input className={fieldClass} {...bind("from")} />
      </Field>
      <Field label="From a client?">
        <select className={fieldClass} {...bind("clientId")}>
          <option value="">No</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          {x.id ? "Save" : "Add income"}
        </button>
        <span className="flex-1" />
        {x.id && (
          <Button tone="ghost" className="text-pink" onClick={() => window.confirm("Delete this income?") && run(() => removeIncome(x.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function AssetForm({ a, onDone }: { a: Partial<Asset>; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({ name: s(a.name), date: s(a.date), cost: s(a.cost), life: s(a.life ?? 36), notes: s(a.notes) });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setD((y) => ({ ...y, [k]: ev.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => (ev.preventDefault(), run(() => saveAssetAction(a.id ?? null, d)).then((ok) => ok && onDone()))}>
      <Field label="Name" full>
        <input required autoFocus className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="Bought on">
        <input required type="date" className={fieldClass} {...bind("date")} />
      </Field>
      <Field label="Cost in ₦">
        <input required type="number" min={0} className={fieldClass} {...bind("cost")} />
      </Field>
      <Field label="Useful life (months)">
        <input type="number" min={1} max={240} className={fieldClass} {...bind("life")} />
      </Field>
      <Field label="Notes" full>
        <input className={fieldClass} {...bind("notes")} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          Save asset
        </button>
        <span className="flex-1" />
        {a.id && (
          <Button tone="ghost" className="text-pink" onClick={() => window.confirm("Remove this asset from the register?") && run(() => removeAsset(a.id!)).then((ok) => ok && onDone())}>
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}
