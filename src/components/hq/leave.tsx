"use client";

import { useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import {
  addHoliday,
  askShift,
  cancelLeave,
  changeRelief,
  decideLeave,
  decidePattern,
  reliefReply,
  removeHoliday,
  requestLeave,
  savePattern,
  setAllowance,
  shiftReply,
  withdrawShift,
} from "@/app/admin/(hq)/team/leave/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { TeamPerson } from "@/lib/hq/leave";
import {
  DAY_MODES,
  type DayKind,
  type LeaveItem,
  LV_TYPES,
  type Pattern,
  WEEK,
  covers,
  dateSpan,
  dayMode,
  fmtDays,
  isShift,
  leaveTaken,
  lvLabel,
  modeLabel,
  onLeave,
  readyForOwner,
  reliefState,
  usualMode,
  weekDays,
  workdays,
} from "@/lib/hq/leave-model";
import { addDays, addMonths } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Avatar, CardHead, Dialog, EmptyNote, Pill, type Tone, useRun } from "./kit";

type Props = {
  me: { id: number; name: string; owner: boolean };
  today: string;
  people: TeamPerson[];
  items: LeaveItem[];
  myTasks: { id: string; title: string; due: string }[];
  taskTitles: Record<string, string>;
};

const D = (d: string) => new Date(`${d}T12:00:00Z`);
const fmt = (d: string) => D(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtLong = (d: string) => D(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dow = (d: string) => D(d).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
const first = (n: string) => n.split(" ")[0] || n;

const TYPE_TONE: Record<string, Tone> = { leave: "rose", sick: "sunset", training: "sky", unavailable: "ink", holiday: "aqua" };
const TYPE_BG: Record<string, string> = { leave: "bg-pink", sick: "bg-[#f08a4b]", training: "bg-sky", unavailable: "bg-ink", holiday: "bg-aqua" };
const MODE_BG: Record<string, string> = { full: "bg-[#cfe8d8]", half: "bg-[linear-gradient(135deg,#cfe8d8_50%,#f4efe6_50%)]", off: "bg-paper" };

export function LeaveView({ me, today, people, items, myTasks, taskTitles }: Props) {
  const { run, pending } = useRun();
  const [offset, setOffset] = useState(0);
  const [dialog, setDialog] = useState<"request" | "holiday" | "shift" | null>(null);
  const [reason, setReason] = useState<{ title: string; label: string; go: (t: string) => void } | null>(null);
  const [reliefFor, setReliefFor] = useState<LeaveItem | null>(null);

  const name = (id: number | null) => people.find((p) => p.id === id)?.name ?? "Someone";
  const patternOf = (id: number) => people.find((p) => p.id === id)?.pattern ?? null;
  const mode = (id: number, d: string): DayKind => dayMode(items, id, patternOf(id)!, d);
  const lv = items.filter((l) => !isShift(l));
  const shifts = items.filter(isShift);

  const out = people.filter((p) => mode(p.id, today) !== "full");
  const askedMe = lv.filter((l) => l.reliefId === me.id && l.status === "pending" && reliefState(l) === "waiting");
  const myShifts = shifts.filter((s) => s.userId === me.id && s.status === "requested");
  const forOwner = me.owner ? lv.filter(readyForOwner).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const stuck = me.owner ? lv.filter((l) => l.status === "pending" && ["waiting", "declined"].includes(reliefState(l))) : [];
  const patReqs = me.owner ? people.filter((p) => p.patternReq?.status === "pending") : [];
  const sentShifts = me.owner ? shifts.filter((s) => s.status !== "accepted" && s.start >= today).sort((a, b) => a.start.localeCompare(b.start)) : [];
  const mine = lv.filter((l) => l.userId === me.id).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 8);
  const holidays = lv.filter((l) => l.userId === null && (l.end || l.start) >= today).sort((a, b) => a.start.localeCompare(b.start));

  const detail = (l: LeaveItem) => (
    <>
      {l.doneText && (
        <p className="text-sm">
          <b>Done:</b> {l.doneText}
        </p>
      )}
      {l.todoText && (
        <p className="text-sm">
          <b>Still to do:</b> {l.todoText}
        </p>
      )}
      {l.handover.length > 0 && (
        <p className="text-sm text-slate">
          Tasks to hand over: {l.handover.map((id) => taskTitles[id]).filter(Boolean).join(", ") || "none still open"}
        </p>
      )}
    </>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-60 flex-1 text-sm text-slate">
          {out.length ? (
            <>
              <b className="text-ink">Today:</b>{" "}
              {out
                .map((p) => {
                  const m = mode(p.id, today);
                  return `${first(p.name)} (${m === "leave" ? lvLabel(onLeave(items, p.id, today)?.type ?? "").toLowerCase() : m === "half" ? "half day" : "off"})`;
                })
                .join(", ")}
            </>
          ) : (
            "Everyone is in for a full day today."
          )}
        </p>
        {me.owner && (
          <>
            <Button size="sm" onClick={() => setDialog("shift")}>
              <CalendarDays className="size-4" aria-hidden /> Change someone&apos;s day
            </Button>
            <Button size="sm" onClick={() => setDialog("holiday")}>
              <Plus className="size-4" aria-hidden /> Public holiday
            </Button>
          </>
        )}
        <Button size="sm" tone="primary" onClick={() => setDialog("request")}>
          <Plus className="size-4" aria-hidden /> Request time off
        </Button>
      </div>

      <Availability people={people} items={items} today={today} mode={mode} />

      {myShifts.length > 0 && (
        <ActionCard title="The owner has asked you to change a day" n={myShifts.length}>
          {myShifts.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-cream p-3">
              <span className="min-w-48 flex-1 text-sm">
                <b>{fmtLong(s.start)}</b>: {modeLabel(s.shiftFrom).toLowerCase()} to <b>{modeLabel(s.shiftTo).toLowerCase()}</b>
                {s.note && <span className="block text-slate">{s.note}</span>}
              </span>
              <Button size="sm" tone="ghost" disabled={pending} onClick={() => setReason({ title: "Can't do this day", label: "Tell the owner why (optional)", go: (t) => run(() => shiftReply(s.id, false, t)) })}>
                Can&apos;t
              </Button>
              <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => shiftReply(s.id, true))}>
                <Check className="size-4" aria-hidden /> Accept
              </Button>
            </div>
          ))}
        </ActionCard>
      )}

      {askedMe.length > 0 && (
        <ActionCard title="Asked to be relief officer" n={askedMe.length}>
          {askedMe.map((l) => (
            <div key={l.id} className="grid gap-2 rounded-2xl bg-cream p-3">
              <div className="flex items-center gap-2">
                <Avatar name={name(l.userId)} />
                <span className="text-sm">
                  <b>{first(name(l.userId))}</b> is off {dateSpan(l, fmtLong)} · {fmtDays(workdays(items, l.start, l.end, l.userId, patternOf(l.userId!)))}
                </span>
              </div>
              {detail(l)}
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" tone="ghost" disabled={pending} onClick={() => setReason({ title: `Can't cover for ${first(name(l.userId))}`, label: "Tell them why", go: (t) => run(() => reliefReply(l.id, false, t)) })}>
                  I can&apos;t cover
                </Button>
                <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => reliefReply(l.id, true))}>
                  <Check className="size-4" aria-hidden /> I&apos;ll cover
                </Button>
              </div>
            </div>
          ))}
        </ActionCard>
      )}

      {patReqs.length > 0 && (
        <ActionCard title="Work-day changes to approve" n={patReqs.length}>
          {patReqs.map((p) => {
            const nw = p.patternReq!.pattern;
            return (
              <div key={p.id} className="grid gap-2 rounded-2xl bg-cream p-3">
                <span className="text-sm">
                  <b>{first(p.name)}</b> wants a new usual week: {fmtDays(weekDays(nw))} a week, now {fmtDays(weekDays(p.pattern))}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK.map(([k, l]) => (
                    <Pill key={k} tone={nw[k] === "full" ? "ok" : nw[k] === "half" ? "warn" : "plain"} className={cn(nw[k] !== p.pattern[k] && "ring-2 ring-pink")}>
                      {l} {modeLabel(nw[k]).replace(" day", "")}
                    </Pill>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" tone="ghost" disabled={pending} onClick={() => setReason({ title: `Decline ${first(p.name)}'s new week`, label: "Tell them why", go: (t) => run(() => decidePattern(p.id, false, t)) })}>
                    Decline
                  </Button>
                  <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => decidePattern(p.id, true))}>
                    <Check className="size-4" aria-hidden /> Approve
                  </Button>
                </div>
              </div>
            );
          })}
        </ActionCard>
      )}

      {forOwner.length > 0 && (
        <ActionCard title="Ready for your decision" n={forOwner.length}>
          {forOwner.map((l) => (
            <div key={l.id} className="grid gap-2 rounded-2xl bg-cream p-3">
              <div className="flex items-center gap-2">
                <Avatar name={name(l.userId)} />
                <span className="text-sm">
                  <b>{first(name(l.userId))}</b>: {lvLabel(l.type)}, {dateSpan(l, fmtLong)} · {fmtDays(workdays(items, l.start, l.end, l.userId, patternOf(l.userId!)))}
                  {l.reliefId && <b className="text-[#1e7a4c]"> · {first(name(l.reliefId))} agreed to cover</b>}
                  {l.note && <span className="text-slate"> · {l.note}</span>}
                </span>
              </div>
              {detail(l)}
              <div className="flex justify-end gap-2">
                <Button size="sm" tone="ghost" disabled={pending} onClick={() => setReason({ title: "Decline this request", label: `Tell ${first(name(l.userId))} why`, go: (t) => run(() => decideLeave(l.id, false, t)) })}>
                  Decline
                </Button>
                <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => decideLeave(l.id, true))}>
                  <Check className="size-4" aria-hidden /> Approve{l.handover.length ? " and hand over tasks" : ""}
                </Button>
              </div>
            </div>
          ))}
        </ActionCard>
      )}
      {stuck.length > 0 && (
        <p className="text-sm text-slate">
          {stuck
            .map((l) => `${first(name(l.userId))}'s request is ${reliefState(l) === "declined" ? `stuck: ${first(name(l.reliefId))} can't cover` : `waiting for ${first(name(l.reliefId))} to agree to cover`}`)
            .join(". ")}
          . It comes to you once the relief officer agrees.
        </p>
      )}

      <MonthGrid people={people} items={items} today={today} offset={offset} setOffset={setOffset} />

      <div className="grid gap-4 lg:grid-cols-2">
        <MyWeek me={me} person={people.find((p) => p.id === me.id)} />
        <Panel>
          <CardHead title="My requests" />
          {mine.length ? (
            <ul className="grid gap-2">
              {mine.map((l) => {
                const r = reliefState(l);
                return (
                  <li key={l.id} className="flex flex-wrap items-start gap-2 border-t border-ink/10 pt-2 first:border-t-0 first:pt-0">
                    <Pill tone={TYPE_TONE[l.type] ?? "plain"}>{lvLabel(l.type)}</Pill>
                    <span className="min-w-40 flex-1 text-sm">
                      <b className="block">{dateSpan(l, fmtLong)}</b>
                      <span className="text-slate">
                        {fmtDays(workdays(items, l.start, l.end, me.id, patternOf(me.id)))}
                        {l.reliefId && ` · relief: ${first(name(l.reliefId))}`}
                        {l.reply && ` · Owner: ${l.reply}`}
                        {r === "declined" && l.reliefNote && ` · ${first(name(l.reliefId))}: ${l.reliefNote}`}
                      </span>
                      {l.status === "pending" && r === "declined" && (
                        <Button size="sm" tone="primary" className="mt-1.5" onClick={() => setReliefFor(l)}>
                          Choose another relief officer
                        </Button>
                      )}
                    </span>
                    <StatusPill l={l} reliefName={first(name(l.reliefId))} />
                    {(l.status === "pending" || l.start > today) && (
                      <button type="button" aria-label="Cancel request" disabled={pending} onClick={() => confirm("Cancel this time off? It comes off the calendar.") && run(() => cancelLeave(l.id))} className="grid size-8 place-items-center rounded-full hover:bg-paper">
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyNote title="No time off booked.">Ask early so your relief officer can plan.</EmptyNote>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <CardHead title="Team work patterns" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate">
                  <th className="py-1 text-left font-semibold">Person</th>
                  {WEEK.map(([k, l]) => (
                    <th key={k} className="py-1 text-center font-semibold">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-t border-ink/10">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{first(p.name)}</td>
                    {WEEK.map(([k]) => (
                      <td key={k} className="py-1.5 text-center">
                        <span className={cn("inline-block rounded-md px-1.5 text-xs font-semibold", p.pattern[k] === "full" ? "bg-[#e0f1e7] text-[#1e7a4c]" : p.pattern[k] === "half" ? "bg-[#fcedd9] text-[#a35c0a]" : "text-slate")}>
                          {p.pattern[k] === "full" ? "Full" : p.pattern[k] === "half" ? "Half" : "Off"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sentShifts.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-sm font-bold">Day changes you&apos;ve asked for</h3>
              <ul className="grid gap-1.5">
                {sentShifts.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1">
                      <b>{first(name(s.userId))}</b>: {fmtLong(s.start)}, {modeLabel(s.shiftTo).toLowerCase()}
                      <span className="block text-xs text-slate">{s.status === "declined" ? `Can't do it${s.reply ? `: ${s.reply}` : ""}` : "Waiting for them to accept"}</span>
                    </span>
                    <button type="button" aria-label="Withdraw" disabled={pending} onClick={() => run(() => withdrawShift(s.id))} className="grid size-8 place-items-center rounded-full hover:bg-paper">
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
        <Panel>
          <CardHead title={`Annual leave in ${today.slice(0, 4)}`} />
          <ul className="grid gap-2.5">
            {people.map((p) => {
              const used = leaveTaken(items, p.id, p.pattern, today.slice(0, 4));
              const al = p.leaveDays ?? 0;
              return (
                <li key={p.id} className="flex items-center gap-2">
                  <Avatar name={p.name} />
                  <span className="min-w-0 flex-1 text-sm">
                    <b className="block truncate">{p.name}</b>
                    <span className="text-slate">
                      {fmtDays(used)} taken{al ? ` of ${al}` : ""}
                    </span>
                    {al > 0 && (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper">
                        <i className={cn("block h-full rounded-full", used > al ? "bg-[#c42b3c]" : "bg-[#1e7a4c]")} style={{ width: `${Math.min(100, (used / al) * 100)}%` }} />
                      </span>
                    )}
                  </span>
                  {me.owner && (
                    <input
                      type="number"
                      min={0}
                      defaultValue={p.leaveDays ?? ""}
                      placeholder="Days"
                      aria-label={`Annual leave days for ${first(p.name)}`}
                      onBlur={(e) => e.target.value !== String(p.leaveDays ?? "") && run(() => setAllowance(p.id, e.target.value))}
                      className={cn(fieldClass, "w-20 text-right")}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          {me.owner && <p className="mt-3 text-xs text-slate">Type each person&apos;s yearly allowance in working days. Nigeria&apos;s Labour Act sets a minimum of 6 working days after 12 months of service; most teams give more.</p>}
          {holidays.length > 0 && (
            <>
              <h3 className="mt-4 mb-2 text-sm font-bold">Public holidays coming up</h3>
              <ul className="grid gap-1.5">
                {holidays.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 text-sm">
                    <Pill tone="aqua">{dateSpan(h, fmt)}</Pill>
                    <span className="flex-1">{h.note}</span>
                    {me.owner && (
                      <button type="button" aria-label={`Remove ${h.note}`} disabled={pending} onClick={() => run(() => removeHoliday(h.id))} className="grid size-8 place-items-center rounded-full hover:bg-paper">
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <RequestDialog open={dialog === "request"} onClose={() => setDialog(null)} me={me} people={people} myTasks={myTasks} today={today} />
      {me.owner && <HolidayDialog open={dialog === "holiday"} onClose={() => setDialog(null)} today={today} />}
      {me.owner && <ShiftDialog open={dialog === "shift"} onClose={() => setDialog(null)} me={me} people={people} today={today} />}
      <ReasonDialog spec={reason} onClose={() => setReason(null)} />
      {reliefFor && (
        <Dialog open onClose={() => setReliefFor(null)} title="Choose another relief officer">
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const id = Number(new FormData(e.currentTarget).get("relief"));
              if (await run(() => changeRelief(reliefFor.id, id))) setReliefFor(null);
            }}
          >
            <Field label="Relief officer">
              <select name="relief" required className={fieldClass} defaultValue="">
                <option value="" disabled>
                  Choose who covers you
                </option>
                {people
                  .filter((p) => p.id !== me.id && p.id !== reliefFor.reliefId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Button type="submit" tone="primary" disabled={pending}>
              Ask them
            </Button>
          </form>
        </Dialog>
      )}
    </div>
  );
}

/** The first day after leave someone is due to work. */
function backOn(id: number, end: string, mode: (id: number, d: string) => DayKind) {
  let d = addDays(end, 1);
  for (let i = 0; i < 21 && (mode(id, d) === "off" || mode(id, d) === "leave"); i++) d = addDays(d, 1);
  return d;
}

function ActionCard({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <Panel className="border-pink">
      <CardHead title={title} count={n} />
      <div className="grid gap-3">{children}</div>
    </Panel>
  );
}

function StatusPill({ l, reliefName }: { l: LeaveItem; reliefName: string }) {
  if (l.status === "approved") return <Pill tone="ok">Approved</Pill>;
  if (l.status === "declined") return <Pill tone="bad">Declined</Pill>;
  const r = reliefState(l);
  if (r === "waiting") return <Pill tone="sky">Waiting for {reliefName}</Pill>;
  if (r === "declined") return <Pill tone="bad">{reliefName} can&apos;t cover</Pill>;
  return <Pill tone="warn">Waiting for the owner</Pill>;
}

function Availability({ people, items, today, mode }: { people: TeamPerson[]; items: LeaveItem[]; today: string; mode: (id: number, d: string) => DayKind }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const away = people.map((p) => ({ p, l: onLeave(items, p.id, today) })).filter((x) => x.l && x.l.userId !== null);
  return (
    <Panel>
      <CardHead title="Who's available">
        <span className="text-sm text-slate">Next 7 days</span>
      </CardHead>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th />
              {days.map((d) => (
                <th key={d} className={cn("px-1 pb-1 text-center text-xs font-semibold", d === today && "text-pink")}>
                  {d === today ? "Today" : dow(d)}
                  <span className="block font-normal text-slate">{fmt(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="border-t border-ink/10">
                <td className="py-1.5 pr-2 whitespace-nowrap">{first(p.name)}</td>
                {days.map((d) => {
                  const m = mode(p.id, d);
                  const l = m === "leave" ? onLeave(items, p.id, d) : null;
                  const lab = l ? (l.userId === null ? "Holiday" : lvLabel(l.type).split(" ")[0]) : m === "half" ? "Half" : m === "off" ? "Off" : "In";
                  return (
                    <td key={d} className="px-1 py-1.5 text-center">
                      <span
                        title={`${p.name}, ${fmtLong(d)}: ${l ? lvLabel(l.type) : modeLabel(m)}`}
                        className={cn(
                          "inline-block min-w-12 rounded-full px-2 py-0.5 text-xs font-semibold",
                          m === "full" ? "bg-[#e0f1e7] text-[#1e7a4c]" : m === "half" ? "bg-[#fcedd9] text-[#a35c0a]" : m === "off" ? "bg-paper text-slate" : "bg-pink-soft text-[#b8114a]",
                        )}
                      >
                        {lab}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-ink/20">
              <td className="py-1.5 text-xs text-slate">In for a full day</td>
              {days.map((d) => (
                <td key={d} className="py-1.5 text-center text-xs">
                  <b className="tabular-nums">{people.filter((p) => mode(p.id, d) === "full").length}</b>
                  <span className="text-slate">/{people.length}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {away.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {away.map(({ p, l }) => (
            <span key={p.id} className="flex items-center gap-2 rounded-2xl bg-cream px-3 py-2 text-sm">
              <Avatar name={p.name} />
              <span>
                <b>{first(p.name)}</b> · {lvLabel(l!.type)}
                <span className="block text-xs text-slate">
                  Back {fmtLong(backOn(p.id, l!.end || l!.start, mode))}
                  {l!.reliefId && ` · ${first(people.find((x) => x.id === l!.reliefId)?.name ?? "")} is covering`}
                </span>
              </span>
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MonthGrid({ people, items, today, offset, setOffset }: { people: TeamPerson[]; items: LeaveItem[]; today: string; offset: number; setOffset: (n: number) => void }) {
  const base = addMonths(`${today.slice(0, 7)}-01`, offset);
  const days: string[] = [];
  for (let d = base; d.slice(0, 7) === base.slice(0, 7); d = addDays(d, 1)) days.push(d);
  const title = D(base).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const cell = (p: TeamPerson, d: string) => {
    const l = items.find((x) => !isShift(x) && (x.userId === p.id || x.userId === null) && x.status !== "declined" && covers(x, d));
    const sh = items.find((s) => isShift(s) && s.userId === p.id && s.start === d && s.status !== "declined");
    const m = sh && sh.status === "accepted" ? sh.shiftTo : usualMode(p.pattern, d);
    const tip = `${p.name}, ${fmtLong(d)}: ${l ? `${lvLabel(l.type)}${l.status !== "approved" ? " (not approved yet)" : ""}` : modeLabel(m)}${sh?.status === "requested" ? `, owner asked for ${modeLabel(sh.shiftTo).toLowerCase()}` : ""}`;
    return (
      <span
        key={d}
        title={tip}
        className={cn("block h-6 rounded-[5px]", l ? TYPE_BG[l.type] ?? "bg-ink" : MODE_BG[m], l && l.status !== "approved" && "opacity-40", d === today && "ring-2 ring-ink", sh?.status === "requested" && "ring-2 ring-pink")}
      />
    );
  };
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous month" onClick={() => setOffset(offset - 1)} className={cn(btn.base, btn.plain, "px-2")}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <b className="min-w-36 text-center text-lg">{title}</b>
        <button type="button" aria-label="Next month" onClick={() => setOffset(offset + 1)} className={cn(btn.base, btn.plain, "px-2")}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        {offset !== 0 && (
          <Button size="sm" tone="ghost" onClick={() => setOffset(0)}>
            This month
          </Button>
        )}
        <span className="flex-1" />
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate">
          {DAY_MODES.map(([k, l]) => (
            <span key={k} className="flex items-center gap-1">
              <i className={cn("size-3 rounded-[3px] border border-ink/10", MODE_BG[k])} />
              {l}
            </span>
          ))}
          {LV_TYPES.map(([k, l]) => (
            <span key={k} className="flex items-center gap-1">
              <i className={cn("size-3 rounded-[3px]", TYPE_BG[k])} />
              {l}
            </span>
          ))}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[760px] gap-[3px]" style={{ gridTemplateColumns: `110px repeat(${days.length}, minmax(0, 1fr))` }}>
          <span />
          {days.map((d) => (
            <span key={d} className={cn("text-center text-[10px] leading-tight text-slate", [0, 6].includes(D(d).getUTCDay()) && "text-ink/40")}>
              {dow(d)[0]}
              <br />
              {D(d).getUTCDate()}
            </span>
          ))}
          {people.map((p) => [
            <span key={`n${p.id}`} className="truncate pr-2 text-sm">
              {first(p.name)}
            </span>,
            ...days.map((d) => cell(p, d)),
          ])}
        </div>
      </div>
    </Panel>
  );
}

function MyWeek({ me, person }: { me: Props["me"]; person: TeamPerson | undefined }) {
  const { run, pending } = useRun();
  const req = person?.patternReq ?? null;
  const pend = req?.status === "pending";
  const cur = person?.pattern ?? ({} as Pattern);
  const [draft, setDraft] = useState<Pattern | null>(null);
  const shown = draft ?? (pend ? req!.pattern : cur);
  const changed = WEEK.some(([k]) => shown[k] !== cur[k]);
  if (!person) return null;
  return (
    <Panel>
      <CardHead title="My work days">
        {pend && !draft && <Pill tone="warn">Waiting for the owner</Pill>}
        {req?.status === "declined" && !draft && <Pill tone="bad">Declined</Pill>}
      </CardHead>
      <p className="mb-3 text-sm text-slate">{me.owner ? "Set your usual week." : "Choose your usual week and send it to the owner. It goes on the team calendar once approved."}</p>
      {req?.status === "declined" && req.note && !draft && <p className="mb-3 rounded-xl bg-[#fbe3e5] p-2 text-sm">Owner: {req.note}</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-2">
        {WEEK.map(([k, l]) => (
          <fieldset key={k} className="grid gap-1">
            <legend className="text-sm font-bold">{l}</legend>
            <div className="flex overflow-hidden rounded-full border-2 border-ink">
              {DAY_MODES.map(([m]) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={shown[k] === m}
                  aria-label={`${l}: ${modeLabel(m)}`}
                  onClick={() => setDraft({ ...shown, [k]: m })}
                  className={cn("flex-1 px-1 py-1 text-xs font-semibold", shown[k] === m ? "bg-ink text-white" : "bg-white")}
                >
                  {m === "full" ? "Full" : m === "half" ? "Half" : "Off"}
                </button>
              ))}
            </div>
            {shown[k] !== cur[k] && <span className="text-xs text-slate">was {modeLabel(cur[k]).toLowerCase()}</span>}
          </fieldset>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs text-slate">
          {fmtDays(weekDays(shown))} a week{changed ? `, approved week is ${fmtDays(weekDays(cur))}` : ""}.
        </span>
        {draft && (
          <Button size="sm" tone="ghost" onClick={() => setDraft(null)}>
            Undo
          </Button>
        )}
        {draft && changed && (
          <Button size="sm" tone="primary" disabled={pending} onClick={async () => (await run(() => savePattern(draft))) && setDraft(null)}>
            {me.owner ? "Save my week" : "Send for approval"}
          </Button>
        )}
      </div>
    </Panel>
  );
}

function RequestDialog({ open, onClose, me, people, myTasks, today }: { open: boolean; onClose: () => void; me: Props["me"]; people: TeamPerson[]; myTasks: Props["myTasks"]; today: string }) {
  const { run, pending } = useRun();
  const [type, setType] = useState("leave");
  const annual = type === "leave";
  return (
    <Dialog open={open} onClose={onClose} title="Request time off" wide>
      <p className="text-sm text-slate">Annual leave goes to your relief officer first, then to the owner once they agree. Sick leave of 3 days or less is logged straight away; longer sick leave needs approval.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const input = { ...Object.fromEntries(f), handover: f.getAll("handover") };
          if (await run(() => requestLeave(input))) {
            e.currentTarget?.reset();
            setType("leave");
            onClose();
          }
        }}
      >
        <Field label="Type">
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}>
            {LV_TYPES.filter(([k]) => k !== "holiday").map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label={annual ? "Relief officer" : "Relief officer (only for annual leave)"}>
          <select name="reliefId" required={annual} disabled={!annual} className={fieldClass} defaultValue="">
            <option value="">Choose who covers you</option>
            {people
              .filter((p) => p.id !== me.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" name="start" required defaultValue={today} className={fieldClass} />
        </Field>
        <Field label="To (last day off)">
          <input type="date" name="end" className={fieldClass} />
        </Field>
        {annual && (
          <>
            <Field label="Tasks done" full>
              <textarea name="doneText" required rows={2} placeholder="What you've finished and handed over" className={fieldClass} />
            </Field>
            <Field label="Pending to-do" full>
              <textarea name="todoText" required rows={3} placeholder="What's still open, where it is, and what the relief officer needs to do" className={fieldClass} />
            </Field>
            {myTasks.length > 0 && (
              <fieldset className="grid gap-1.5 sm:col-span-2">
                <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Hand to my relief officer when approved</legend>
                {myTasks.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="handover" value={t.id} className="accent-pink" />
                    <span className="flex-1">{t.title}</span>
                    {t.due && <span className="text-xs text-slate">due {fmt(t.due)}</span>}
                  </label>
                ))}
              </fieldset>
            )}
          </>
        )}
        <Field label="Note for the owner" full>
          <textarea name="note" rows={2} placeholder="How to reach you, anything else" className={fieldClass} />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" tone="primary" disabled={pending}>
            Send request
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function HolidayDialog({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  const { run, pending } = useRun();
  return (
    <Dialog open={open} onClose={onClose} title="Add a public holiday">
      <p className="text-sm text-slate">Shows for everyone and doesn&apos;t count against anyone&apos;s leave.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => addHoliday(Object.fromEntries(new FormData(e.currentTarget))))) onClose();
        }}
      >
        <Field label="Holiday" full>
          <input name="note" required placeholder="e.g. Independence Day" className={fieldClass} />
        </Field>
        <Field label="From">
          <input type="date" name="start" required defaultValue={today} className={fieldClass} />
        </Field>
        <Field label="To (last day)">
          <input type="date" name="end" className={fieldClass} />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" tone="primary" disabled={pending}>
            Add holiday
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ShiftDialog({ open, onClose, me, people, today }: { open: boolean; onClose: () => void; me: Props["me"]; people: TeamPerson[]; today: string }) {
  const { run, pending } = useRun();
  return (
    <Dialog open={open} onClose={onClose} title="Change someone's day">
      <p className="text-sm text-slate">Ask someone to work a different kind of day once. They accept or decline in HQ.</p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => askShift(Object.fromEntries(new FormData(e.currentTarget))))) onClose();
        }}
      >
        <Field label="Who">
          <select name="userId" required className={fieldClass} defaultValue="">
            <option value="" disabled>
              Choose someone
            </option>
            {people
              .filter((p) => p.id !== me.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Day">
          <input type="date" name="day" required min={today} defaultValue={addDays(today, 1)} className={fieldClass} />
        </Field>
        <Field label="Make it">
          <select name="to" className={fieldClass} defaultValue="full">
            {DAY_MODES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why (optional)">
          <input name="reason" className={fieldClass} placeholder="e.g. Client shoot" />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" tone="primary" disabled={pending}>
            Send
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ReasonDialog({ spec, onClose }: { spec: { title: string; label: string; go: (t: string) => void } | null; onClose: () => void }) {
  return (
    <Dialog open={!!spec} onClose={onClose} title={spec?.title ?? ""}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          spec?.go(String(new FormData(e.currentTarget).get("why") ?? ""));
          onClose();
        }}
      >
        <Field label={spec?.label ?? ""}>
          <textarea name="why" rows={3} autoFocus className={fieldClass} />
        </Field>
        <Button type="submit" tone="primary">Send</Button>
      </form>
    </Dialog>
  );
}
