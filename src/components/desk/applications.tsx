"use client";

import { CLOSED_STATUSES, ROUTES, STATUSES, bandLabel, hoursSince } from "@/lib/desk/model";
import { replyHours } from "@/lib/desk/logic";
import { cn } from "@/lib/utils";
import { useDesk } from "./desk";
import { Button, RouteTag, StatusPill, ago, fieldClass, fmtDay } from "./ui";

export type AppFilter = { status: string; q: string; owner: string; route: string };

const isOpen = (status: string) => !CLOSED_STATUSES.includes(status as never);

export function Applications({ filter: f, setFilter }: { filter: AppFilter; setFilter: (f: AppFilter) => void }) {
  const { data, team, open } = useDesk();
  const { apps, settings } = data;
  const q = f.q.trim().toLowerCase();
  const list = apps.filter((a) => {
    if (f.status === "open" && !isOpen(a.status)) return false;
    if (f.status !== "open" && f.status !== "all" && a.status !== f.status) return false;
    if (f.owner && a.owner !== f.owner) return false;
    if (f.route && a.route !== f.route) return false;
    if (q && ![a.name, a.company, a.email, a.site, a.id].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
  const chips: [string, string, number][] = [
    ["open", "Open", apps.filter((a) => isOpen(a.status)).length],
    ["all", "All", apps.length],
    ...STATUSES.map((s) => [s, s, apps.filter((a) => a.status === s).length] as [string, string, number]),
  ];
  const limit = replyHours(settings);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Applications</h1>
        <Button tone="primary" onClick={() => open({ kind: "new" })}>
          Add an application
        </Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search"
          placeholder="Search name, company, email"
          value={f.q}
          onChange={(e) => setFilter({ ...f, q: e.target.value })}
          className={cn(fieldClass, "w-auto min-w-56 flex-1 rounded-full sm:flex-none")}
        />
        <select aria-label="Owner" value={f.owner} onChange={(e) => setFilter({ ...f, owner: e.target.value })} className={cn(fieldClass, "w-auto rounded-full")}>
          <option value="">Any owner</option>
          {team.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select aria-label="Route" value={f.route} onChange={(e) => setFilter({ ...f, route: e.target.value })} className={cn(fieldClass, "w-auto rounded-full")}>
          <option value="">Any route</option>
          {ROUTES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map(([v, label, n]) => (
          <button
            key={v}
            type="button"
            aria-pressed={f.status === v}
            onClick={() => setFilter({ ...f, status: v })}
            className="rounded-full border-2 border-ink/20 bg-white px-3 py-1 text-[13px] font-semibold text-slate aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
          >
            {label} <span className="font-mono">{n}</span>
          </button>
        ))}
      </div>

      {list.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Founder", "Moment", "Budget", "Route", "Status", "Owner", "Session", "Applied"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const late = a.status === "New" && !a.firstReply && hoursSince(a.submitted) > limit;
                return (
                  <tr
                    key={a.id}
                    tabIndex={0}
                    onClick={() => open({ kind: "edit", id: a.id })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open({ kind: "edit", id: a.id });
                      }
                    }}
                    className="cursor-pointer border-b border-ink/10 align-top last:border-b-0 hover:bg-cream focus-visible:bg-cream focus-visible:outline-none"
                  >
                    <td className="px-3 py-3">
                      <b className="block font-semibold">{a.name}</b>
                      <small className="text-slate">
                        {a.role}
                        {a.company && `, ${a.company}`}
                      </small>
                    </td>
                    <td className="px-3 py-3">
                      {a.moment}
                      <br />
                      <small className="text-slate">{a.when}</small>
                    </td>
                    <td className="px-3 py-3">{bandLabel(a.budget)}</td>
                    <td className="px-3 py-3">
                      <RouteTag route={a.route} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="px-3 py-3">{a.owner || <small className="text-slate">Unassigned</small>}</td>
                    <td className="px-3 py-3">
                      {a.sessionDate ? (
                        <>
                          {fmtDay(a.sessionDate)}
                          <br />
                          <small className="text-slate">{a.sessionTime}</small>
                        </>
                      ) : (
                        <small className="text-slate">Not booked</small>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {ago(a.submitted)} ago
                      {late && <small className="block font-semibold text-pink">Past reply promise</small>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-[24px] border-2 border-dashed border-ink/30 bg-white px-6 py-10 text-center">
          <h2 className="text-xl font-bold">No applications here</h2>
          <p className="max-w-[56ch] text-slate">
            {apps.length
              ? "Try another filter."
              : "Every application from the Visibility Session form lands here. You can also add one by hand, for example from an event conversation."}
          </p>
        </div>
      )}
    </>
  );
}
