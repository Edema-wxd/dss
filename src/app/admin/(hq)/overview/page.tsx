import { Suspense } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Flag, Phone } from "lucide-react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { Panel } from "@/components/desk/ui";
import { Bar, Pill } from "@/components/hq/kit";
import { ClearBlocker } from "@/components/hq/overview-bits";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canUse, isOwner, seesMoney } from "@/lib/hq/access";
import { getStandups, kpiStates, listClients, listContacts, listKpis, listPeople, listTasks, liveDeals } from "@/lib/hq/data";
import { addDays, compactNaira, lagosToday, longDate, personScore, relDay } from "@/lib/hq/work";

import { listContracts } from "@/lib/hq/sales";
import { LIVE, contractState } from "@/lib/hq/sales-model";
export default function OverviewPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the Command centre…</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}

const SALES_STAGES = [
  ["new", "New lead"],
  ["research", "Researching"],
  ["contacted", "Contacted"],
  ["discovery", "Discovery call"],
  ["proposal", "Proposal sent"],
  ["negotiating", "Negotiating"],
  ["won", "Won"],
] as const;

function Stat({ label, value, sub, children }: { label: string; value: React.ReactNode; sub: string; children?: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
      <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{label}</span>
      <b className="font-display text-3xl tabular-nums">{value}</b>
      <span className="text-sm text-slate">{sub}</span>
      {children}
    </div>
  );
}

async function Overview() {
  let v;
  try {
    const user = await requireModule("overview");
    const today = lagosToday();
    const [people, standups, tasks, contacts, clients, deals, kpis] = await Promise.all([
      listPeople(),
      getStandups(today),
      listTasks({ doneSince: addDays(today, -6) }),
      listContacts(),
      listClients(),
      liveDeals(),
      listKpis(),
    ]);
    const contractAlerts = canUse(user.roles, "contracts")
      ? (await listContracts()).map((c) => ({ c, s: contractState(c, today) })).filter(({ s }) => s.k === "decide" || s.k === "lapsed")
      : [];
    v = { user, today, people: people.filter((p) => p.active), standups, tasks, contacts, clients, deals, contractAlerts, kpis: await kpiStates(kpis, today) };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  const { user, today, people, standups, tasks, contacts, clients, deals, kpis, contractAlerts } = v;
  const money = seesMoney(user.roles);
  const open = tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due && t.due < today);
  const doneWeek = tasks.filter((t) => t.status === "done" && t.doneDay >= addDays(today, -6));
  const sales = contacts.filter((c) => c.kind !== "talent");
  const openSales = sales.filter((c) => !["won", "lost"].includes(c.stage));
  const pipeline = openSales.reduce((s, c) => s + (c.currency === "NGN" || !c.currency ? c.value ?? 0 : 0), 0);
  const wonMonth = sales.filter((c) => c.stage === "won" && c.wonAt.slice(0, 7) === today.slice(0, 7));
  const overdueFollowUps = contacts.filter((c) => c.nextDate && c.nextDate < today && !["won", "lost", "nofit"].includes(c.stage));
  const risk = clients.filter((c) => LIVE.includes(c.status) && c.health === "risk");
  const renew = clients.filter((c) => LIVE.includes(c.status) && c.endDate && c.endDate >= today && c.endDate <= addDays(today, 30));
  const checked = people.filter((p) => standups.has(p.id));
  const first = (id: number | null) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone";
  const blocked = people.filter((p) => standups.get(p.id)?.blockers && !standups.get(p.id)?.blockersCleared);
  const funnel = SALES_STAGES.map(([k, l]) => [l, sales.filter((c) => c.stage === k).length] as const);
  const maxF = Math.max(1, ...funnel.map(([, n]) => n));
  const owner = isOwner(user.roles);

  const attention: { icon: React.ReactNode; text: string; sub: string; href?: string; action?: React.ReactNode }[] = [
    ...risk.map((c) => ({ icon: <AlertTriangle className="size-4 text-[#c42b3c]" aria-hidden />, text: `${c.name} is at risk`, sub: "Client" })),
    ...renew.map((c) => ({ icon: <CalendarClock className="size-4 text-[#a35c0a]" aria-hidden />, text: `${c.name} renews ${relDay(c.endDate, today).toLowerCase()}`, sub: "Plan the renewal conversation" })),
    ...contractAlerts.map(({ c, s }) => ({
      icon: <CalendarClock className="size-4 text-[#c42b3c]" aria-hidden />,
      text: `${c.party || clients.find((x) => x.id === c.clientId)?.name || "A contract"}: ${s.l.toLowerCase()}`,
      sub: "Contract needs a decision",
      href: "/admin/contracts",
    })),
    ...(overdueFollowUps.length
      ? [{ icon: <Phone className="size-4 text-[#a35c0a]" aria-hidden />, text: `${overdueFollowUps.length} follow-ups are overdue`, sub: [...new Set(overdueFollowUps.map((c) => first(c.ownerId)))].join(", ") }]
      : []),
    ...(overdue.length
      ? [{ icon: <Flag className="size-4 text-[#a35c0a]" aria-hidden />, text: `${overdue.length} tasks are overdue`, sub: [...new Set(overdue.map((t) => first(t.assigneeId)))].join(", "), href: "/admin/tasks" }]
      : []),
    ...blocked.map((p) => ({
      icon: <AlertTriangle className="size-4 text-[#c42b3c]" aria-hidden />,
      text: `${p.name.split(" ")[0]} is blocked`,
      sub: standups.get(p.id)?.blockers ?? "",
      action: owner ? <ClearBlocker userId={p.id} /> : undefined,
    })),
  ];

  return (
    <>
      <PageHeader title="Command centre" lead={`${longDate(today)}. What needs you, and who's moving.`} />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tasks done this week" value={doneWeek.length} sub="across the team" />
        <Stat label="Overdue tasks" value={overdue.length} sub={overdue.length ? "across the team" : "nothing late"} />
        <Stat label="Open pipeline" value={money ? compactNaira(pipeline) : openSales.length} sub={`${openSales.length} prospects, ${wonMonth.length} won this month`} />
        <Stat label="Checked in today" value={`${checked.length}/${people.length}`} sub={people.length - checked.length ? `${people.length - checked.length} not yet` : "Everyone's in"} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Team today</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                  {["Person", "Checked in", "Their three", "Done today", "Overdue", "KPI score", "Day"].map((h) => (
                    <th key={h} className="border-b-2 border-ink px-2 py-2 font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const sd = standups.get(p.id);
                  const tops = (sd?.top ?? []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
                  const doneT = tasks.filter((t) => t.assigneeId === p.id && t.status === "done" && t.doneDay === today).length;
                  const od = overdue.filter((t) => t.assigneeId === p.id).length;
                  const sc = personScore(kpis.filter((k) => k.ownerId === p.id).map((k) => ({ pct: k.pct, weight: k.weight })));
                  return (
                    <tr key={p.id} className="border-b border-ink/10 last:border-b-0">
                      <td className="px-2 py-2.5 font-medium">{p.name}</td>
                      <td className="px-2 py-2.5">
                        {sd?.startedAt ? (
                          <Pill tone="ok">{new Date(sd.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}</Pill>
                        ) : (
                          <Pill tone="warn">Not yet</Pill>
                        )}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums">{sd ? `${tops.filter((t) => t?.status === "done").length}/${tops.length}` : "-"}</td>
                      <td className="px-2 py-2.5 tabular-nums">{doneT}</td>
                      <td className="px-2 py-2.5">{od ? <Pill tone="bad">{od}</Pill> : <span className="text-slate">0</span>}</td>
                      <td className="px-2 py-2.5">{sc === null ? <span className="text-slate">No KPIs</span> : <Pill tone={sc >= 90 ? "ok" : sc >= 60 ? "warn" : "bad"}>{sc}%</Pill>}</td>
                      <td className="px-2 py-2.5">
                        {sd?.closedAt ? (
                          <CheckCircle2 className="size-4 text-[#1e7a4c]" aria-label="Day closed" />
                        ) : sd?.blockers && !sd.blockersCleared ? (
                          <Pill tone="bad" title={sd.blockers}>
                            Blocked
                          </Pill>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate">Leave and attendance are not in this version of HQ yet, so everyone active counts as working today.</p>
        </Panel>

        <Panel>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
            Needs your attention <Pill tone={attention.length ? "rose" : "ok"}>{attention.length || "All clear"}</Pill>
          </h2>
          {attention.length ? (
            <ul>
              {attention.map((a, i) => (
                <li key={i} className="flex items-start gap-3 border-t border-ink/10 py-2.5 first:border-t-0">
                  <span className="mt-0.5">{a.icon}</span>
                  <span className="min-w-0 flex-1">
                    {a.href ? (
                      <Link href={a.href} className="block font-medium hover:underline">
                        {a.text}
                      </Link>
                    ) : (
                      <b className="block font-medium">{a.text}</b>
                    )}
                    <span className="block truncate text-sm text-slate">{a.sub}</span>
                  </span>
                  {a.action}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">Nothing urgent. Good time for deep work.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Sales pipeline</h2>
          <div className="grid gap-2">
            {funnel.map(([l, n]) => (
              <div key={l} className="grid grid-cols-[120px_1fr_28px] items-center gap-3 text-sm">
                <span className="truncate text-slate">{l}</span>
                <Bar pct={(n / maxF) * 100} tone="ink" label={l} />
                <span className="text-right tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Talent</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Live deals" value={deals.count} sub={money ? `${compactNaira(deals.fees)} in fees` : "negotiating to delivering"} />
            <Stat label="Brands in talks" value={contacts.filter((c) => c.kind === "talent" && c.stage === "talks").length} sub="talent relationships" />
          </div>
        </Panel>
      </div>
    </>
  );
}
