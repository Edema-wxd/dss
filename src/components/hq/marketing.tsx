"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Plus, Settings2 } from "lucide-react";
import {
  addNewsAction,
  movePost,
  removeAccount,
  removeAd,
  removeNews,
  removePost,
  saveAccountAction,
  saveAdAction,
  saveMonthStatsAction,
  savePillars,
  savePostAction,
} from "@/app/savvy-hq/(hq)/marketing/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { Account, Ad, MonthStatRow, NewsItem, Post, SyncState, WebMonth } from "@/lib/hq/marketing";
import {
  AD_OBJ,
  AD_PLATFORMS,
  AD_STATUS,
  BASIS_NOTE,
  CONNECTED,
  MKT_LEAD_SOURCES,
  NEWS_SOURCES,
  NEWS_TAGS,
  PLATFORMS,
  POST_FORMATS,
  POST_STATUS,
  RANGES,
  type DailyStat,
  type RangeKey,
  accountTotals,
  basisOf,
  buckets,
  engagementRate,
  monthLabel,
  previousWindow,
  rangeWindow,
  shiftMonth,
} from "@/lib/hq/marketing-model";
import { label } from "@/lib/hq/sales-model";
import { addDays, compactNaira, relDay } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Bar, Dialog, EmptyNote, Pill, useRun } from "./kit";
import type { WorkProps } from "./tasks";

const compact = (n: number | null | undefined) => (n === null || n === undefined ? "-" : n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n.toLocaleString("en-GB"));
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const platformName = (k: string) => label(PLATFORMS, k);

function Stat({ l, v, s }: { l: string; v: React.ReactNode; s?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
      <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{l}</span>
      <b className="font-display text-3xl tabular-nums">{v}</b>
      {s && <span className="text-sm text-slate">{s}</span>}
    </div>
  );
}

function MonthPicker({ month, setMonth, today }: { month: string; setMonth: (m: string) => void; today: string }) {
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(today.slice(0, 7), -i));
  return (
    <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
      {months.map((m) => (
        <option key={m} value={m}>
          {monthLabel(m)}
        </option>
      ))}
    </select>
  );
}

/* ── Overview ────────────────────────────────────────────────────────── */

export type Lead = { source: string; createdAt: string; won: boolean };
type OverviewProps = { accounts: Account[]; stats: MonthStatRow[]; daily: DailyStat[]; posts: Post[]; ads: Ad[]; leads: Lead[]; today: string; addAccountHref: string };

export function MarketingOverview(p: OverviewProps) {
  const [range, setRange] = useState<RangeKey>("month");
  const [month, setMonth] = useState(p.today.slice(0, 7));
  const w = rangeWindow(range, p.today, month);
  const prev = previousWindow(w, range);
  const sum = (win: typeof w) => {
    const per = p.accounts.map((a) => ({ a, t: accountTotals(a, win, p.stats, p.daily, p.posts) }));
    const total = per.reduce((s, { t }) => ({ reach: s.reach + t.reach, engagements: s.engagements + t.engagements, followers: s.followers + (t.followers ?? 0), leads: s.leads + t.leads, posts: s.posts + t.posts }), { reach: 0, engagements: 0, followers: 0, leads: 0, posts: 0 });
    return { per, total, basis: basisOf(per.map(({ t }) => t.basis)) };
  };
  const now = useMemo(() => sum(w), [w.from, w.to, p]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => sum(prev), [prev.from, prev.to, p]); // eslint-disable-line react-hooks/exhaustive-deps
  const inW = (d: string) => d.slice(0, 10) >= w.from && d.slice(0, 10) <= w.to;
  const crmLeads = p.leads.filter((l) => MKT_LEAD_SOURCES.includes(l.source) && inW(l.createdAt));
  const chart = buckets(w).map((b) => {
    const bw = { ...w, from: b.from, to: b.to, days: Math.round((Date.parse(b.to) - Date.parse(b.from)) / 864e5) + 1 };
    const t = p.accounts.reduce((s, a) => {
      const x = accountTotals(a, bw, p.stats, p.daily, p.posts);
      return { reach: s.reach + x.reach, engagements: s.engagements + x.engagements };
    }, { reach: 0, engagements: 0 });
    return { ...b, ...t };
  });
  const maxReach = Math.max(1, ...chart.map((c) => c.reach));
  const published = p.posts.filter((x) => x.status === "published" && inW(x.date) && x.reach);
  const best = [...published].sort((a, b) => (b.engagements ?? 0) / (b.reach || 1) - (a.engagements ?? 0) / (a.reach || 1)).slice(0, 5);
  const upcoming = p.posts.filter((x) => x.status !== "published" && x.date >= p.today).slice(0, 5);
  const alerts: [string, string][] = [];
  const thisMonth = p.today.slice(0, 7);
  for (const a of p.accounts) {
    if (!p.stats.some((s) => s.accountId === a.id && s.month === shiftMonth(thisMonth, -1))) alerts.push([`${platformName(a.platform)}: no numbers for ${monthLabel(shiftMonth(thisMonth, -1))}`, "Log them from the platform's insights."]);
  }
  if (!p.posts.some((x) => x.status !== "published" && x.date >= p.today && x.date <= addDays(p.today, 7))) alerts.push(["Nothing planned for the next 7 days", "Add posts to the content planner."]);
  const stale = p.posts.filter((x) => x.status === "scheduled" && x.date && x.date < p.today).length;
  if (stale) alerts.push([`${stale} planned post${stale === 1 ? "" : "s"} not marked published`, "Publish, reschedule or mark them done."]);
  for (const ad of p.ads.filter((a) => a.status === "live" && a.budget && (a.spend ?? 0) > a.budget)) alerts.push([`${ad.name} is over budget`, `${Math.round(((ad.spend ?? 0) / (ad.budget || 1)) * 100)}% of budget spent`]);

  if (!p.accounts.length)
    return (
      <EmptyNote title="Add DSS's social accounts to start.">
        Instagram, LinkedIn, TikTok and the rest. Then log each month&apos;s numbers from the platform insights.{" "}
        <a href={p.addAccountHref} className="font-semibold text-pink underline">
          Add an account
        </a>
      </EmptyNote>
    );

  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs ${range === "month" ? "last month" : `the ${w.short} before`}` : `vs ${range === "month" ? "last month" : `the ${w.short} before`}`);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Period" className="flex rounded-full border-2 border-ink bg-white p-0.5">
          {RANGES.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)} className={cn("rounded-full px-3 py-1 text-sm font-semibold", range === k && "bg-ink text-white")}>
              {l}
            </button>
          ))}
        </div>
        {range === "month" && <MonthPicker month={month} setMonth={setMonth} today={p.today} />}
      </div>
      <p className="mb-4 text-sm text-slate">
        {w.label[0].toUpperCase() + w.label.slice(1)}: {w.from} to {w.to}. {BASIS_NOTE[now.basis]}
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l="Total followers" v={compact(now.total.followers)} s={before.total.followers ? `${now.total.followers - before.total.followers >= 0 ? "+" : ""}${compact(now.total.followers - before.total.followers)} in ${w.short}` : "latest count"} />
        <Stat l="Reach" v={compact(now.total.reach)} s={delta(now.total.reach, before.total.reach)} />
        <Stat l="Engagement rate" v={pct(engagementRate(now.total))} s={`${compact(now.total.engagements)} engagements`} />
        <Stat l="Leads from marketing" v={crmLeads.length + now.total.leads} s={`${crmLeads.length} in CRM, ${crmLeads.filter((l) => l.won).length} won, ${now.total.posts} posts out`} />
      </div>
      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Reach and engagement</h2>
          <div className="flex h-44 items-end gap-1" role="img" aria-label={`Reach by ${chart.length > 14 ? "period" : "day"}`}>
            {chart.map((c) => (
              <div key={c.from} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${c.label}: ${c.reach} reach, ${c.engagements} engagements`}>
                <span className="w-full rounded-t bg-sky" style={{ height: `${(c.reach / maxReach) * 100}%` }} />
                <span className="truncate text-[10px] text-slate">{c.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate">
            {p.posts.filter((x) => x.status === "published" && inW(x.date)).length} posts published and {crmLeads.length} marketing leads added to the CRM in this period.
          </p>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Needs attention</h2>
          {alerts.length ? (
            <ul className="grid gap-2">
              {alerts.slice(0, 6).map(([t, s]) => (
                <li key={t} className="text-sm">
                  <b className="block font-semibold">{t}</b>
                  <span className="text-slate">{s}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">All clear. Numbers are in and the planner is full.</p>
          )}
        </Panel>
      </div>
      <Panel className="mb-4">
        <h2 className="mb-3 text-lg font-bold">Platform performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Platform", "Followers", "Reach", "Engagement", "Rate", "Posts", "Growth"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-2 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {now.per.map(({ a, t }) => {
                const was = before.per.find((x) => x.a.id === a.id)?.t.followers ?? null;
                return (
                  <tr key={a.id} className="border-b border-ink/10">
                    <td className="px-2 py-2 font-medium">
                      {platformName(a.platform)} <span className="text-slate">{a.handle}</span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{compact(t.followers)}</td>
                    <td className="px-2 py-2 tabular-nums">{compact(t.reach)}</td>
                    <td className="px-2 py-2 tabular-nums">{compact(t.engagements)}</td>
                    <td className="px-2 py-2 tabular-nums">{pct(engagementRate(t))}</td>
                    <td className="px-2 py-2 tabular-nums">{t.posts}</td>
                    <td className="px-2 py-2 tabular-nums">{t.followers !== null && was !== null ? `${t.followers - was >= 0 ? "+" : ""}${compact(t.followers - was)}` : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-2 text-lg font-bold">Best posts in {w.label}</h2>
          {best.length ? (
            best.map((x) => (
              <div key={x.id} className="flex gap-2 border-t border-ink/10 py-2 text-sm first:border-t-0">
                <span className="flex-1">{x.title}</span>
                <span className="text-slate">{pct(engagementRate({ reach: x.reach ?? 0, engagements: x.engagements ?? 0 }))}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate">No published posts with results in this period yet.</p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-2 text-lg font-bold">Coming up</h2>
          {upcoming.length ? (
            upcoming.map((x) => (
              <div key={x.id} className="flex gap-2 border-t border-ink/10 py-2 text-sm first:border-t-0">
                <span className="flex-1">{x.title}</span>
                <Pill>{platformName(x.platform)}</Pill>
                <span className="text-slate">{relDay(x.date, p.today)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate">Nothing planned yet.</p>
          )}
        </Panel>
      </div>
    </>
  );
}

/* ── Accounts and insights ───────────────────────────────────────────── */

type AccountsProps = { accounts: Account[]; stats: MonthStatRow[]; sync: SyncState[]; pillars: string[]; w: WorkProps; dataFeedUrl: string | null };

export function MarketingAccounts({ accounts, stats, sync, pillars, w, dataFeedUrl }: AccountsProps) {
  const { run, pending } = useRun();
  const [editAcc, setEditAcc] = useState<Partial<Account> | null>(null);
  const [statFor, setStatFor] = useState<{ a: Account; month: string } | null>(null);
  const [pill, setPill] = useState(pillars.join(", "));
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(w.today.slice(0, 7), i - 5));
  return (
    <>
      <Panel className="mb-4">
        <h2 className="mb-1 text-lg font-bold">Live connections</h2>
        <p className="mb-3 text-sm text-slate">Synced every morning.</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {CONNECTED.map(([k, l]) => {
            const s = sync.find((x) => x.platform === k);
            return (
              <div key={k} className="rounded-2xl bg-paper/70 p-3 text-sm">
                <b className="block">{l}</b>
                {!s ? (
                  <>
                    <Pill>Waiting for setup</Pill>
                    <span className="mt-1 block text-xs text-slate">Your developer connects this through the platform&apos;s API.</span>
                  </>
                ) : s.status === "ok" ? (
                  <>
                    <Pill tone="ok">Connected</Pill>
                    <span className="mt-1 block text-xs text-slate">
                      Last synced {s.lastSuccessAt.slice(0, 10)}
                      {s.rows !== null ? `, ${s.rows} rows` : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <Pill tone="bad">Needs attention</Pill>
                    <span className="mt-1 block text-xs text-slate">{s.message || "The last sync failed."}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate">Numbers marked Auto come straight from the platform. You can still type numbers for any account that isn&apos;t connected.</p>
        {dataFeedUrl && (
          <a href={dataFeedUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pink underline">
            Open the data feed <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </Panel>
      <div className="mb-3 flex items-center gap-2">
        <p className="flex-1 text-sm text-slate">Log each account&apos;s numbers once a month from its insights. Tap a month to fill it in.</p>
        <Button tone="primary" onClick={() => setEditAcc({ platform: "instagram", ownerId: w.me.id })}>
          <Plus className="size-4" aria-hidden /> Add account
        </Button>
      </div>
      {accounts.length ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => {
            const mine = stats.filter((s) => s.accountId === a.id).sort((x, y) => y.month.localeCompare(x.month));
            const latest = mine[0];
            return (
              <Panel key={a.id}>
                <div className="mb-2 flex items-center gap-2">
                  <Pill tone="sky">{platformName(a.platform)}</Pill>
                  <b className="flex-1 truncate">{a.handle}</b>
                  {latest?.source === "api" && <Pill tone="lime">Auto</Pill>}
                  <button type="button" aria-label={`Edit ${a.handle || platformName(a.platform)}`} onClick={() => setEditAcc(a)} className="grid size-8 place-items-center rounded-full hover:bg-paper">
                    <Settings2 className="size-4" aria-hidden />
                  </button>
                </div>
                <b className="font-display text-3xl tabular-nums">{compact(latest?.followers)}</b>
                <span className="block text-sm text-slate">followers{a.goal ? `, goal ${compact(a.goal)}` : ""}</span>
                {a.goal && latest?.followers ? (
                  <span className="mt-1 block">
                    <Bar pct={(latest.followers / a.goal) * 100} label="Towards the follower goal" />
                  </span>
                ) : null}
                {latest && (
                  <span className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate">
                    <span>Reach {compact(latest.reach)}</span>
                    <span>Rate {pct(engagementRate({ reach: latest.reach ?? 0, engagements: latest.engagements ?? 0 }))}</span>
                    <span>Posts {compact(latest.posts)}</span>
                    <span>Link clicks {compact(latest.linkClicks)}</span>
                  </span>
                )}
                <div className="mt-3 flex flex-wrap gap-1">
                  {months.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setStatFor({ a, month: m })}
                      className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", mine.some((s) => s.month === m) ? "border-ink bg-ink text-white" : "border-ink/30 bg-white")}
                    >
                      {new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
                    </button>
                  ))}
                </div>
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-pink underline">
                    Open profile
                  </a>
                )}
              </Panel>
            );
          })}
        </div>
      ) : (
        <div className="mb-4">
          <EmptyNote title="No accounts yet." />
        </div>
      )}
      <Panel>
        <h2 className="mb-1 text-lg font-bold">Content pillars</h2>
        <p className="mb-2 text-sm text-slate">Used to tag posts in the planner, so you can see which themes earn the most.</p>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => (e.preventDefault(), run(() => savePillars(pill)))}>
          <input value={pill} onChange={(e) => setPill(e.target.value)} aria-label="Content pillars, separated by commas" className={cn(fieldClass, "min-w-[240px] flex-1")} />
          <Button type="submit" disabled={pending}>
            Save
          </Button>
        </form>
      </Panel>

      <Dialog open={editAcc !== null} onClose={() => setEditAcc(null)} title={editAcc?.id ? "Edit account" : "Add an account"}>
        {editAcc && (
          <AccountForm a={editAcc} w={w} onDone={() => setEditAcc(null)} />
        )}
      </Dialog>
      <Dialog open={statFor !== null} onClose={() => setStatFor(null)} title={statFor ? `${platformName(statFor.a.platform)} ${statFor.a.handle}, ${monthLabel(statFor.month)}` : "Numbers"}>
        {statFor && <StatForm a={statFor.a} month={statFor.month} existing={stats.find((s) => s.accountId === statFor.a.id && s.month === statFor.month)} onDone={() => setStatFor(null)} />}
      </Dialog>
    </>
  );
}

function AccountForm({ a, w, onDone }: { a: Partial<Account>; w: WorkProps; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({ platform: a.platform ?? "instagram", handle: a.handle ?? "", url: a.url ?? "", goal: a.goal ? String(a.goal) : "", ownerId: a.ownerId ? String(a.ownerId) : "" });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveAccountAction(a.id ?? null, d)).then((ok) => ok && onDone()))}>
      <Field label="Platform">
        <select className={fieldClass} {...bind("platform")}>
          {PLATFORMS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Handle or name">
        <input placeholder="@digitalsavvystudios" className={fieldClass} {...bind("handle")} />
      </Field>
      <Field label="Profile link">
        <input type="url" className={fieldClass} {...bind("url")} />
      </Field>
      <Field label="Follower goal">
        <input type="number" min={0} className={fieldClass} {...bind("goal")} />
      </Field>
      <Field label="Looked after by">
        <select className={fieldClass} {...bind("ownerId")}>
          <option value="">No one yet</option>
          {w.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          Save account
        </button>
        <span className="flex-1" />
        {a.id && (
          <Button tone="ghost" className="text-pink" onClick={() => window.confirm("Remove this account?") && run(() => removeAccount(a.id!)).then((ok) => ok && onDone())}>
            Remove account
          </Button>
        )}
      </div>
    </form>
  );
}

function StatForm({ a, month, existing, onDone }: { a: Account; month: string; existing?: MonthStatRow; onDone: () => void }) {
  const { run, pending } = useRun();
  const keys = [
    ["followers", "Followers at month end"],
    ["reach", "Accounts reached"],
    ["impressions", "Impressions or views"],
    ["engagements", "Engagements"],
    ["posts", "Posts published"],
    ["profileVisits", "Profile visits"],
    ["linkClicks", "Link clicks"],
    ["leads", "Leads or enquiries"],
  ] as const;
  const [d, setD] = useState<Record<string, string>>(Object.fromEntries(keys.map(([k]) => [k, existing?.[k] === null || existing?.[k] === undefined ? "" : String(existing[k])])));
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveMonthStatsAction(a.id, month, d)).then((ok) => ok && onDone()))}>
      <p className="text-sm text-slate sm:col-span-2">Copy these from the platform&apos;s insights for the whole month.</p>
      {keys.map(([k, l]) => (
        <Field key={k} label={l} hint={k === "leads" ? "DMs or emails that asked about working with DSS" : undefined}>
          <input type="number" min={0} required={k === "followers"} value={d[k]} onChange={(e) => setD((x) => ({ ...x, [k]: e.target.value }))} className={fieldClass} />
        </Field>
      ))}
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Save numbers
      </button>
    </form>
  );
}

/* ── Website ─────────────────────────────────────────────────────────── */

export function MarketingWebsite({ web, today, connected }: { web: Record<string, WebMonth>; today: string; connected: boolean }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const m = web[month];
  const p = web[shiftMonth(month, -1)];
  const delta = (a?: number | null, b?: number | null) => (a && b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs last month` : undefined);
  return (
    <>
      <div className="mb-4 flex">
        <MonthPicker month={month} setMonth={setMonth} today={today} />
      </div>
      {!connected && (
        <p className="mb-4 rounded-2xl bg-[#eceef8] p-3 text-sm">
          <b>Google Analytics isn&apos;t connected yet.</b> Once your developer links digitalsavvystudios.com, visits, top pages, traffic sources and enquiries appear here every morning.
        </p>
      )}
      {!m ? (
        <EmptyNote title={`No website numbers for ${monthLabel(month)}.`}>This page fills itself from Google Analytics.</EmptyNote>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat l="Visits" v={compact(m.sessions)} s={delta(m.sessions, p?.sessions)} />
            <Stat l="Visitors" v={compact(m.users)} s={`${compact(m.newUsers)} new`} />
            <Stat l="Engagement rate" v={m.engagementRate !== null && m.engagementRate !== undefined ? pct(m.engagementRate * 100) : "-"} s={m.avgEngagementSeconds ? `${Math.floor(m.avgEngagementSeconds / 60)}m ${Math.round(m.avgEngagementSeconds % 60)}s average time` : undefined} />
            <Stat l="Enquiries" v={compact(m.keyEvents)} s={m.topKeyEvent} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="mb-2 text-lg font-bold">Top pages</h2>
              {m.pages?.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {m.pages.slice(0, 12).map((pg) => (
                      <tr key={pg.path} className="border-b border-ink/10 last:border-b-0">
                        <td className="py-1.5">{pg.title || pg.path}</td>
                        <td className="py-1.5 text-right tabular-nums">{compact(pg.views)}</td>
                        <td className="py-1.5 text-right text-slate tabular-nums">{compact(pg.users)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate">No page data yet.</p>
              )}
            </Panel>
            <Panel>
              <h2 className="mb-2 text-lg font-bold">Traffic sources</h2>
              {m.sources?.length ? (
                <div className="grid gap-2">
                  {m.sources.slice(0, 8).map((s) => (
                    <div key={s.source} className="grid grid-cols-[120px_1fr_48px] items-center gap-2 text-sm">
                      <span className="truncate">{s.source}</span>
                      <Bar pct={(s.sessions / Math.max(1, m.sources![0].sessions)) * 100} tone="ink" label={s.source} />
                      <span className="text-right tabular-nums">{compact(s.sessions)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate">No source data yet.</p>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

/* ── Content planner ─────────────────────────────────────────────────── */

export function ContentPlanner({ posts, pillars, w }: { posts: Post[]; pillars: string[]; w: WorkProps }) {
  const { run } = useRun();
  const [view, setView] = useState<"calendar" | "board" | "list">("calendar");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Partial<Post> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const month = shiftMonth(w.today.slice(0, 7), offset);
  const first = `${month}-01`;
  const lead = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead));
  const chip = (x: Post) => (
    <button
      key={x.id}
      type="button"
      draggable
      onDragStart={() => setDragId(x.id)}
      onClick={() => setEditing(x)}
      className={cn("block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold", x.status === "published" ? "bg-lime/50" : x.status === "scheduled" ? "bg-aqua" : "bg-paper")}
    >
      {x.title}
    </button>
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="View" className="flex rounded-full border-2 border-ink bg-white p-0.5">
          {(["calendar", "board", "list"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-full px-3.5 py-1 text-sm font-semibold capitalize", view === v && "bg-ink text-white")}>
              {v}
            </button>
          ))}
        </div>
        {view === "calendar" && (
          <>
            <Button size="sm" aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}>
              ‹
            </Button>
            <b>{monthLabel(month)}</b>
            <Button size="sm" aria-label="Next month" onClick={() => setOffset((o) => o + 1)}>
              ›
            </Button>
            {offset !== 0 && (
              <Button size="sm" tone="ghost" onClick={() => setOffset(0)}>
                This month
              </Button>
            )}
          </>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => setEditing({ date: w.today, status: "idea", platform: "instagram", format: "Reel", ownerId: w.me.id })} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Post
        </button>
      </div>
      {view === "calendar" ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-1">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <b key={d} className="px-1 text-xs text-slate">
                {d}
              </b>
            ))}
            {days.map((d) => {
              const items = posts.filter((x) => x.date === d);
              return (
                <div
                  key={d}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId) run(() => movePost(dragId, { date: d }));
                    setDragId(null);
                  }}
                  className={cn("grid min-h-[92px] content-start gap-0.5 rounded-xl bg-white p-1 ring-1 ring-ink/10", d.slice(0, 7) !== month && "opacity-40", d === w.today && "ring-2 ring-pink")}
                >
                  <button type="button" onClick={() => setEditing({ date: d, status: "idea", platform: "instagram", format: "Reel", ownerId: w.me.id })} aria-label={`Add a post on ${d}`} className="justify-self-start px-1 text-xs font-bold hover:text-pink">
                    {Number(d.slice(8))}
                  </button>
                  {items.slice(0, 4).map(chip)}
                  {items.length > 4 && <span className="px-1 text-[10px] text-slate">+{items.length - 4} more</span>}
                </div>
              );
            })}
          </div>
        </div>
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {POST_STATUS.map(([k, l]) => {
            const items = posts.filter((x) => x.status === k).slice(0, 40);
            return (
              <section
                key={k}
                aria-label={l}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) run(() => movePost(dragId, { status: k }));
                  setDragId(null);
                }}
                className="grid w-[220px] flex-none content-start gap-2 rounded-[20px] bg-paper/70 p-2.5"
              >
                <h2 className="flex items-center gap-2 px-1 text-sm font-bold">
                  {l} <Pill>{items.length}</Pill>
                  <button type="button" aria-label={`Add to ${l}`} onClick={() => setEditing({ status: k, platform: "instagram", format: "Reel", ownerId: w.me.id })} className="ml-auto">
                    <Plus className="size-4" aria-hidden />
                  </button>
                </h2>
                {items.map((x) => (
                  <button key={x.id} type="button" draggable onDragStart={() => setDragId(x.id)} onClick={() => setEditing(x)} className="grid gap-1 rounded-2xl border-2 border-ink/15 bg-white p-2.5 text-left text-sm hover:border-ink">
                    <b>{x.title}</b>
                    <span className="text-xs text-slate">
                      {platformName(x.platform)}
                      {x.date ? `, ${relDay(x.date, w.today)}` : ""}
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      ) : posts.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Date", "Post", "Platform", "Pillar", "Status", "Reach", "Rate"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-3 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...posts].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((x) => (
                <tr key={x.id} onClick={() => setEditing(x)} className="cursor-pointer border-b border-ink/10 hover:bg-paper/50">
                  <td className="px-3 py-2">{x.date || "-"}</td>
                  <td className="px-3 py-2">{x.title}</td>
                  <td className="px-3 py-2">{platformName(x.platform)}</td>
                  <td className="px-3 py-2">{x.pillar}</td>
                  <td className="px-3 py-2">
                    <Pill>{label(POST_STATUS, x.status)}</Pill>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{compact(x.reach)}</td>
                  <td className="px-3 py-2 tabular-nums">{x.reach ? pct(engagementRate({ reach: x.reach, engagements: x.engagements ?? 0 })) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote title="No posts yet." />
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit post" : "Plan a post"} wide>
        {editing && <PostForm p={editing} pillars={pillars} w={w} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function PostForm({ p, pillars, w, onDone }: { p: Partial<Post>; pillars: string[]; w: WorkProps; onDone: () => void }) {
  const { run, pending } = useRun();
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [d, setD] = useState({
    title: s(p.title),
    platform: p.platform ?? "instagram",
    format: p.format ?? "Reel",
    date: s(p.date),
    time: s(p.time),
    status: p.status ?? "idea",
    pillar: s(p.pillar),
    ownerId: s(p.ownerId),
    link: s(p.link),
    caption: s(p.caption),
    reach: s(p.reach),
    engagements: s(p.engagements),
    saves: s(p.saves),
    leads: s(p.leads),
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => savePostAction(p.id ?? null, d)).then((ok) => ok && onDone()))}>
      <Field label="Post idea or hook" full>
        <input required autoFocus className={fieldClass} {...bind("title")} />
      </Field>
      <Field label="Platform">
        <select className={fieldClass} {...bind("platform")}>
          {PLATFORMS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Format">
        <select className={fieldClass} {...bind("format")}>
          {POST_FORMATS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input type="date" className={fieldClass} {...bind("date")} />
      </Field>
      <Field label="Time">
        <input type="time" className={fieldClass} {...bind("time")} />
      </Field>
      <Field label="Status">
        <select className={fieldClass} {...bind("status")}>
          {POST_STATUS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pillar">
        <select className={fieldClass} {...bind("pillar")}>
          <option value="">None</option>
          {pillars.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <Field label="Who's making it">
        <select className={fieldClass} {...bind("ownerId")}>
          <option value="">No one yet</option>
          {w.people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Draft or live link">
        <input type="url" className={fieldClass} {...bind("link")} />
      </Field>
      <Field label="Caption notes" full>
        <textarea rows={2} className={fieldClass} {...bind("caption")} />
      </Field>
      <Field label="Reach" hint="After it's published">
        <input type="number" min={0} className={fieldClass} {...bind("reach")} />
      </Field>
      <Field label="Engagements" hint="Likes, comments, saves, shares">
        <input type="number" min={0} className={fieldClass} {...bind("engagements")} />
      </Field>
      <Field label="Saves">
        <input type="number" min={0} className={fieldClass} {...bind("saves")} />
      </Field>
      <Field label="Leads or DMs">
        <input type="number" min={0} className={fieldClass} {...bind("leads")} />
      </Field>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          {p.id ? "Save" : "Add post"}
        </button>
        <span className="flex-1" />
        {p.id && (
          <Button tone="ghost" className="text-pink" onClick={() => window.confirm("Delete this post?") && run(() => removePost(p.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

/* ── Ads ─────────────────────────────────────────────────────────────── */

export function AdsView({ ads, clients, money, fin }: { ads: Ad[]; clients: { id: string; name: string }[]; money: boolean; fin: boolean }) {
  const [editing, setEditing] = useState<Partial<Ad> | null>(null);
  const ngn = ads.filter((a) => a.status !== "planned" && a.currency === "NGN");
  const t = ngn.reduce((s, a) => ({ spend: s.spend + (a.spend ?? 0), leads: s.leads + (a.leads ?? 0), clicks: s.clicks + (a.clicks ?? 0), imp: s.imp + (a.impressions ?? 0), rev: s.rev + (a.revenue ?? 0) }), { spend: 0, leads: 0, clicks: 0, imp: 0, rev: 0 });
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat l="Ad spend" v={money ? compactNaira(t.spend) : "-"} s={`${ads.filter((a) => a.status === "live").length} live campaign${ads.filter((a) => a.status === "live").length === 1 ? "" : "s"}`} />
        <Stat l="Leads from ads" v={t.leads} s={t.leads && money ? `${compactNaira(t.spend / t.leads)} per lead` : "no leads logged yet"} />
        <Stat l="Click-through rate" v={t.imp ? pct((t.clicks / t.imp) * 100) : "-"} s={t.clicks && money ? `${compactNaira(t.spend / t.clicks)} per click` : undefined} />
        <Stat l="Return on ad spend" v={t.spend ? `${Math.round((t.rev / t.spend) * 10) / 10}x` : "-"} s={t.rev && money ? `${compactNaira(t.rev)} revenue tracked` : "add revenue won from ads"} />
      </div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setEditing({ status: "planned", platform: "instagram", objective: "Leads", currency: "NGN" })} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Campaign
        </button>
      </div>
      {ads.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Campaign", "Status", "Spend", "Impressions", "CTR", "CPC", "Leads", "Cost per lead", "ROAS"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-3 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ads.map((a) => (
                <tr key={a.id} onClick={() => setEditing(a)} className="cursor-pointer border-b border-ink/10 hover:bg-paper/50">
                  <td className="px-3 py-2">
                    <b>{a.name}</b>
                    <span className="block text-xs text-slate">
                      {[a.clientId ? `For ${clients.find((c) => c.id === a.clientId)?.name ?? "a client"}` : "", a.objective, [a.start, a.end].filter(Boolean).join(" to ")].filter(Boolean).join(", ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Pill tone={a.status === "live" ? "ok" : "plain"}>{label(AD_STATUS, a.status)}</Pill>
                  </td>
                  <td className="px-3 py-2">
                    {money ? `${a.currency} ${(a.spend ?? 0).toLocaleString("en-GB")}` : "-"}
                    {money && a.budget ? <span className="block text-xs text-slate">of {a.budget.toLocaleString("en-GB")}</span> : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{compact(a.impressions)}</td>
                  <td className="px-3 py-2 tabular-nums">{a.impressions ? pct(((a.clicks ?? 0) / a.impressions) * 100) : "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{money && a.clicks ? ((a.spend ?? 0) / a.clicks).toFixed(0) : "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{a.leads ?? "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{money && a.leads ? ((a.spend ?? 0) / a.leads).toFixed(0) : "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{a.spend ? `${Math.round(((a.revenue ?? 0) / a.spend) * 10) / 10}x` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote title="No campaigns yet.">Log each Meta, TikTok or LinkedIn campaign with its budget, then update spend and results from Ads Manager.</EmptyNote>
      )}
      <p className="mt-3 text-xs text-slate">{fin ? "New spend you enter here can be logged in Finance under Paid ads, so it shows in the budget and profit and loss." : "Finance logs this spend under Paid ads."}</p>
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Update campaign" : "New ad campaign"} wide>
        {editing && <AdForm a={editing} clients={clients} fin={fin} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function AdForm({ a, clients, fin, onDone }: { a: Partial<Ad>; clients: { id: string; name: string }[]; fin: boolean; onDone: () => void }) {
  const [logFin, setLogFin] = useState(!a.clientId);
  const { run, pending } = useRun();
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const [d, setD] = useState({
    name: s(a.name),
    platform: a.platform ?? "instagram",
    objective: a.objective ?? "Leads",
    status: a.status ?? "planned",
    currency: a.currency ?? "NGN",
    start: s(a.start),
    end: s(a.end),
    budget: s(a.budget),
    spend: s(a.spend),
    impressions: s(a.impressions),
    clicks: s(a.clicks),
    leads: s(a.leads),
    conversions: s(a.conversions),
    revenue: s(a.revenue),
    clientId: s(a.clientId),
    notes: s(a.notes),
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  const numField = (k: keyof typeof d, l: string) => (
    <Field label={l}>
      <input type="number" min={0} className={fieldClass} {...bind(k)} />
    </Field>
  );
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveAdAction(a.id ?? null, { ...d, logFin: fin && logFin })).then((ok) => ok && onDone()))}>
      <Field label="Campaign name" full>
        <input required autoFocus className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="Platform">
        <select className={fieldClass} {...bind("platform")}>
          {AD_PLATFORMS.map((k) => (
            <option key={k} value={k}>
              {platformName(k)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Objective">
        <select className={fieldClass} {...bind("objective")}>
          {AD_OBJ.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select className={fieldClass} {...bind("status")}>
          {AD_STATUS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Run for a client?">
        <select className={fieldClass} {...bind("clientId")}>
          <option value="">DSS&apos;s own ads</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Starts">
        <input type="date" className={fieldClass} {...bind("start")} />
      </Field>
      <Field label="Ends">
        <input type="date" className={fieldClass} {...bind("end")} />
      </Field>
      <Field label="Currency">
        <select className={fieldClass} {...bind("currency")}>
          {["NGN", "USD", "GBP", "EUR", "CAD"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      {numField("budget", "Budget")}
      {numField("spend", "Spent so far")}
      {numField("impressions", "Impressions")}
      {numField("clicks", "Clicks")}
      {numField("leads", "Leads")}
      {numField("conversions", "Clients won")}
      {numField("revenue", "Revenue from it")}
      <Field label="Notes" full>
        <textarea rows={2} className={fieldClass} {...bind("notes")} />
      </Field>
      {fin && (
        <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" className="size-4 accent-ink" checked={logFin} onChange={(e) => setLogFin(e.target.checked)} />
          Log new spend in Finance as Paid ads (only if DSS paid for it)
        </label>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          Save campaign
        </button>
        <span className="flex-1" />
        {a.id && (
          <Button tone="ghost" className="text-pink" onClick={() => window.confirm("Delete this campaign?") && run(() => removeAd(a.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

/* ── News ────────────────────────────────────────────────────────────── */

export function NewsView({ news, me, canRemoveAny }: { news: NewsItem[]; me: number; canRemoveAny: boolean }) {
  const { run, pending } = useRun();
  const [tag, setTag] = useState("");
  const [adding, setAdding] = useState(false);
  const [d, setD] = useState({ title: "", url: "", source: "", tag: NEWS_TAGS[0] as string, summary: "", soWhat: "" });
  const shown = news.filter((n) => !tag || n.tag === tag).slice(0, 30);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {["", ...NEWS_TAGS].map((t) => (
            <button key={t || "all"} type="button" aria-pressed={tag === t} onClick={() => setTag(t)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", tag === t ? "bg-ink text-white" : "bg-white")}>
              {t || "All"}
            </button>
          ))}
          <span className="flex-1" />
          <Button tone="primary" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add a story
          </Button>
        </div>
        {shown.length ? (
          <div className="grid gap-3">
            {shown.map((n) => (
              <Panel key={n.id}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <Pill tone={n.tag === "Nigeria and Africa" ? "lime" : "plain"}>{n.tag}</Pill>
                  <span className="text-slate">{n.date}</span>
                  <span className="flex-1" />
                  {(canRemoveAny || n.addedBy === String(me)) && (
                    <Button size="sm" tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm("Remove this story?") && run(() => removeNews(n.id))}>
                      Remove
                    </Button>
                  )}
                </div>
                <h3 className="font-bold">
                  {n.url ? (
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {n.title}
                    </a>
                  ) : (
                    n.title
                  )}
                </h3>
                {n.summary && <p className="mt-1 text-sm">{n.summary}</p>}
                {n.soWhat && (
                  <p className="mt-1 text-sm">
                    <b>For DSS:</b> {n.soWhat}
                  </p>
                )}
                {n.source && <p className="mt-1 text-xs text-slate">{n.source}</p>}
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyNote title="No stories here yet.">Anyone on the team can add one they spot.</EmptyNote>
        )}
      </div>
      <Panel className="content-start">
        <h2 className="mb-2 font-bold">Sources worth checking</h2>
        <ul className="grid gap-1.5 text-sm">
          {NEWS_SOURCES.map(([l, u]) => (
            <li key={u}>
              <a href={u} target="_blank" rel="noopener noreferrer" className="text-pink underline">
                {l}
              </a>
            </li>
          ))}
        </ul>
      </Panel>
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a story" wide>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addNewsAction(d)).then((ok) => {
              if (ok) {
                setAdding(false);
                setD({ title: "", url: "", source: "", tag: NEWS_TAGS[0], summary: "", soWhat: "" });
              }
            });
          }}
        >
          <Field label="Headline" full>
            <input required value={d.title} onChange={(e) => setD((x) => ({ ...x, title: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="Link">
            <input type="url" value={d.url} onChange={(e) => setD((x) => ({ ...x, url: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="Source">
            <input value={d.source} onChange={(e) => setD((x) => ({ ...x, source: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="Topic">
            <select value={d.tag} onChange={(e) => setD((x) => ({ ...x, tag: e.target.value }))} className={fieldClass}>
              {NEWS_TAGS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="What happened" full>
            <textarea rows={2} value={d.summary} onChange={(e) => setD((x) => ({ ...x, summary: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="What it means for DSS or clients" full>
            <textarea rows={2} value={d.soWhat} onChange={(e) => setD((x) => ({ ...x, soWhat: e.target.value }))} className={fieldClass} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
            Add story
          </button>
        </form>
      </Dialog>
    </div>
  );
}
