"use client";

import { cn } from "@/lib/utils";
import { BANDS, bandLabel, initials, monthName, naira, truthy, today } from "@/lib/desk/model";
import { attention, averageReplyHours, clientStats, monthStats, overdueReplies, replyHours, wonValue } from "@/lib/desk/logic";
import { saveSettings } from "@/app/admin/actions";
import { useDesk } from "./desk";
import { Empty, Panel, RouteTag, StatusPill, Stepper, Toggle, ago, fmtDay } from "./ui";

const HELD = ["Held", "Review sent", "Proposal sent", "Won"];

export function Overview() {
  const { data, run, pending, go, open } = useDesk();
  const { apps, leads, settings: s } = data;
  const ms = monthStats(apps, s);
  const cs = clientStats(apps, s);
  const att = attention(apps, s, ago, fmtDay);
  const overdue = overdueReplies(apps, s);

  const monthApps = apps.filter((a) => a.submitted.slice(0, 7) === ms.month);
  const steps: [string, number][] = [
    ["Applied", monthApps.length],
    ["Qualified", monthApps.filter((a) => !["New", "Not a fit", "Exploring"].includes(a.status)).length],
    ["Booked", monthApps.filter((a) => ["Booked", "No-show", ...HELD].includes(a.status)).length],
    ["Held", monthApps.filter((a) => HELD.includes(a.status)).length],
    ["Proposal sent", monthApps.filter((a) => ["Proposal sent", "Won"].includes(a.status)).length],
    ["Won", monthApps.filter((a) => a.status === "Won").length],
  ];
  const funnelMax = Math.max(1, steps[0][1]);

  const upcoming = apps
    .filter((a) => a.status === "Booked" && a.sessionDate >= today())
    .sort((x, y) => (x.sessionDate + x.sessionTime).localeCompare(y.sessionDate + y.sessionTime));
  const held = apps.filter((a) => HELD.includes(a.status)).length;
  const noShows = apps.filter((a) => a.status === "No-show").length;
  const won = apps.filter((a) => a.status === "Won").length;
  const avgReply = averageReplyHours(apps);
  const value = wonValue(apps);

  const bands = BANDS.map(([v, l]) => [l, apps.filter((a) => a.budget === v).length] as const).filter(([, n]) => n);
  const sourceCounts = new Map<string, number>();
  for (const a of apps) sourceCounts.set(a.source || "Not given", (sourceCounts.get(a.source || "Not given") ?? 0) + 1);
  const sources = [...sourceCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);

  const pipCount = Math.min(ms.per, 16);
  const placeCount = Math.min(cs.total, 12);

  return (
    <>
      <div className="mb-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid gap-4">
          <section aria-labelledby="slots-h" className="grid gap-4 rounded-[24px] border-2 border-ink bg-ink p-5 text-white shadow-hard-md lg:p-6">
            <p className="text-xs font-bold tracking-[0.12em] text-white/60 uppercase">Complimentary sessions · {monthName(ms.month)}</p>
            <h1 id="slots-h" className="text-[clamp(1.6rem,3.4vw,2.3rem)] leading-[1.05] font-bold">
              <span className="text-lime">
                {ms.booked.length} of {ms.per}
              </span>{" "}
              sessions booked. {ms.remaining ? `${ms.remaining} still open.` : "This month is full."}
            </h1>
            <Pips
              count={pipCount}
              cells={ms.booked.slice(0, pipCount).map((a) => ({ label: initials(a), title: a.company || a.name, tone: a.status === "No-show" ? "miss" : "on" }))}
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-white/60">Sessions this month</span>
              <Stepper dark disabled={pending} label="sessions this month" value={ms.per} onChange={(n) => run(() => saveSettings({ sessions_per_month: n }))} />
              <span className="ml-auto">
                <Toggle
                  dark
                  disabled={pending}
                  checked={ms.open}
                  onChange={(v) => run(() => saveSettings({ applications_open: v }))}
                  label={`Applications ${ms.open ? "open" : "closed"}`}
                />
              </span>
            </div>
            <SiteLine label="Your website currently says">{s.site_seats_line}</SiteLine>
          </section>

          <section aria-labelledby="clients-h" className="grid gap-3 rounded-[24px] border-2 border-ink bg-maroon p-5 text-white lg:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-bold tracking-[0.12em] text-white/60 uppercase">
                Client places{cs.start ? ` since ${fmtDay(cs.start)}` : ""}
              </p>
              <span className="text-xs text-white/60">Separate from the free sessions</span>
            </div>
            <h2 id="clients-h" className="text-[clamp(1.3rem,2.6vw,1.7rem)] leading-[1.1] font-bold">
              {cs.left ? (
                <>
                  <span className="text-lime">
                    {cs.left} of {cs.total}
                  </span>{" "}
                  client places open.
                </>
              ) : (
                `All ${cs.total} client places are filled.`
              )}
            </h2>
            <Pips
              small
              count={placeCount}
              cells={[
                ...cs.won.map((a) => ({ label: initials(a), title: a.company || a.name, tone: "on" as const })),
                ...Array.from({ length: cs.other }, () => ({ label: "REF", title: "Onboarded another way", tone: "on" as const })),
              ].slice(0, placeCount)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-white/60">Places this period</span>
              <Stepper dark disabled={pending} label="client places" value={cs.total} onChange={(n) => run(() => saveSettings({ client_slots_total: n }))} />
              <span className="ml-auto text-sm text-white/60">Clients from other routes</span>
              <Stepper dark disabled={pending} label="clients from other routes" value={cs.other} onChange={(n) => run(() => saveSettings({ clients_won_other_routes: n }))} />
            </div>
            <SiteLine label="Client line for the website">{s.site_clients_line}</SiteLine>
          </section>
        </div>

        <div className="grid grid-cols-2 content-start gap-3">
          <Tile tone="bg-orange" n={apps.filter((a) => a.status === "New").length} label="Awaiting a reply" onClick={() => go("applications", { status: "New" })}>
            {overdue.length ? `${overdue.length} past the ${replyHours(s)} h promise` : "All within the reply promise"}
          </Tile>
          <Tile tone="bg-aqua" n={apps.filter((a) => a.status === "Qualified").length} label="Qualified, not booked" onClick={() => go("applications", { status: "Qualified" })}>
            {apps.filter((a) => a.status === "Waitlist").length} on the waitlist
          </Tile>
          <Tile tone="bg-lime" n={upcoming.length} label="Sessions coming up" onClick={() => go("applications", { status: "Booked" })}>
            {upcoming[0] ? `Next: ${upcoming[0].company || upcoming[0].name}, ${fmtDay(upcoming[0].sessionDate)}` : "Nothing booked yet"}
          </Tile>
          <Tile tone="bg-pink" n={`${held ? Math.round((won / held) * 100) : 0}%`} label="Sessions to clients" onClick={() => go("applications", { status: "Won" })}>
            {won} won{value ? `, ${naira(value)} a month` : ""}
          </Tile>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid min-w-0 content-start gap-5">
          <Panel title="Needs attention" aside={`${att.length} item${att.length === 1 ? "" : "s"}`}>
            {att.length ? (
              <ul>
                {att.slice(0, 12).map((x, i) => (
                  <Row key={`${x.a.id}-${i}`} onClick={() => open({ kind: "edit", id: x.a.id })} title={`${x.a.name}${x.a.company ? `, ${x.a.company}` : ""}`} badge={<Badge hot={x.hot}>{x.why}</Badge>}>
                    <StatusPill status={x.a.status} />
                    <RouteTag route={x.a.route} />
                    <span>{bandLabel(x.a.budget)}</span>
                    {x.a.owner && <span>{x.a.owner}</span>}
                  </Row>
                ))}
              </ul>
            ) : (
              <Empty>Nothing needs attention right now.</Empty>
            )}
          </Panel>
          <Panel title="Coming up">
            {upcoming.length ? (
              <ul>
                {upcoming.slice(0, 8).map((a) => (
                  <Row key={a.id} onClick={() => open({ kind: "edit", id: a.id })} title={a.company || a.name} badge={<Badge>{`${fmtDay(a.sessionDate)}${a.sessionTime ? `, ${a.sessionTime}` : ""}`}</Badge>}>
                    <span>{a.name}</span>
                    <span>{a.moment}</span>
                    {a.owner && <span>{a.owner}</span>}
                  </Row>
                ))}
              </ul>
            ) : (
              <Empty>No sessions booked.</Empty>
            )}
          </Panel>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Panel title={`${monthName(ms.month).split(" ")[0]} pipeline`} aside="By month applied">
            <div className="grid gap-2">
              {steps.map(([label, n]) => (
                <Bar key={label} label={label} n={n} max={funnelMax} tone={label === "Won" ? "bg-lime" : "bg-[#5568af]"} wide />
              ))}
            </div>
          </Panel>
          <Panel title="Service health">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate">Average first reply</dt>
              <dd className="text-right">
                {avgReply === null ? "Not enough data" : `${avgReply < 1 ? `${Math.round(avgReply * 60)} min` : `${avgReply.toFixed(1)} h`} (promise ${replyHours(s)} h)`}
              </dd>
              <dt className="text-slate">No-show rate</dt>
              <dd className="text-right">{held + noShows ? `${Math.round((noShows / (held + noShows)) * 100)}%` : "Not enough data"}</dd>
              <dt className="text-slate">Exploring</dt>
              <dd className="text-right">{apps.filter((a) => a.status === "Exploring").length} on the nurture list</dd>
              <dt className="text-slate">Checklist leads</dt>
              <dd className="text-right">
                {leads.length} total, {leads.filter((l) => truthy(l.applied)).length} applied
              </dd>
            </dl>
          </Panel>
          <Panel title="Budgets applying">
            {bands.length ? (
              <div className="grid gap-2">
                {bands.map(([l, n]) => (
                  <Bar key={l} label={l} n={n} max={Math.max(...bands.map((b) => b[1]))} tone="bg-pink" />
                ))}
              </div>
            ) : (
              <Empty>No applications yet.</Empty>
            )}
          </Panel>
          <Panel title="Where they came from">
            {sources.length ? (
              <div className="grid gap-2">
                {sources.map(([l, n]) => (
                  <Bar key={l} label={l} n={n} max={sources[0][1]} tone="bg-orange" />
                ))}
              </div>
            ) : (
              <Empty>No sources yet.</Empty>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function Pips({ count, cells, small }: { count: number; cells: { label: string; title: string; tone: "on" | "miss" }[]; small?: boolean }) {
  return (
    <div aria-hidden className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, count)}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => {
        const c = cells[i];
        return (
          <i
            key={i}
            title={c?.title ?? "Open"}
            className={cn(
              "grid place-items-center rounded-[10px] font-mono text-[11px] not-italic",
              small ? "h-8" : "h-11",
              !c && "border border-dashed border-white/25 bg-white/5 text-white/50",
              c?.tone === "on" && "bg-lime font-semibold text-ink",
              c?.tone === "miss" && "bg-[#ff8c7f] text-ink",
            )}
          >
            {c ? c.label : i + 1}
          </i>
        );
      })}
    </div>
  );
}

function SiteLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm">
      <b className="mb-0.5 block text-[10px] tracking-[0.12em] text-white/55 uppercase">{label}</b>
      {children || "Not set yet"}
    </p>
  );
}

function Tile({ tone, n, label, children, onClick }: { tone: string; n: number | string; label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="relative grid gap-0.5 overflow-hidden rounded-[18px] border-2 border-ink bg-white py-3.5 pr-3 pl-5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-hard-sm">
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", tone)} />
      <span className="font-display text-[2rem] leading-none font-bold tabular-nums">{n}</span>
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-slate">{children}</span>
    </button>
  );
}

function Row({ title, badge, children, onClick }: { title: string; badge: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <li className="border-t border-ink/10 first:border-t-0">
      <button type="button" onClick={onClick} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl px-1.5 py-2.5 text-left hover:bg-cream">
        <span className="truncate font-semibold">{title}</span>
        {badge}
        <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate">{children}</span>
      </button>
    </li>
  );
}

function Badge({ hot, children }: { hot?: boolean; children: React.ReactNode }) {
  return <span className={cn("rounded-md px-2 py-0.5 font-mono text-[11px] whitespace-nowrap", hot ? "bg-pink-soft text-pink" : "bg-paper")}>{children}</span>;
}

function Bar({ label, n, max, tone, wide }: { label: string; n: number; max: number; tone: string; wide?: boolean }) {
  return (
    <div className={cn("grid items-center gap-2.5 text-sm", wide ? "grid-cols-[110px_minmax(0,1fr)_32px]" : "grid-cols-[130px_minmax(0,1fr)_28px]")}>
      <span className="truncate">{label}</span>
      <span className={cn("overflow-hidden rounded-md bg-paper", wide ? "h-5" : "h-3")}>
        <i className={cn("block h-full rounded-md", tone)} style={{ width: `${(n / max) * 100}%` }} />
      </span>
      <span className="text-right font-mono text-xs text-slate tabular-nums">{n}</span>
    </div>
  );
}
