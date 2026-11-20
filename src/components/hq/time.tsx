"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clock3, Coffee, Download, LogOut, NotebookPen } from "lucide-react";
import { type EodPrep, breakAction, clockInAction, clockOutAction, eodPrep } from "@/app/admin/(hq)/time/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import { type DayKind, type LeaveItem, type Pattern, dayMode, lvLabel, onLeave } from "@/lib/hq/leave-model";
import { MOODS, type TimeDay, type Workday, expectedMin, fmtHM, hhmm, hrsText, segMins, weekOf, workedMin } from "@/lib/hq/time-model";
import { addDays, longDate, relDay } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Avatar, CardHead, Dialog, EmptyNote, Pill, type Tone, useRun } from "./kit";

const D = (d: string) => new Date(`${d}T12:00:00Z`);
const fmt = (d: string) => D(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const first = (n: string) => n.split(" ")[0] || n;

/** Ticks every 30 seconds, starting from the server's clock so the first paint matches. */
function useNow(serverNow: string) {
  const [now, setNow] = useState(() => new Date(serverNow));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ── The clock in the top bar ────────────────────────────────────────── */

export function Clock({ day, missed, serverNow }: { day: TimeDay | null; missed: string | null; serverNow: string }) {
  const { run, pending } = useRun();
  const now = useNow(serverNow);
  const [menu, setMenu] = useState(false);
  const [eod, setEod] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  const base = "flex min-h-10 items-center gap-2 rounded-full border-2 border-ink px-3.5 text-sm font-semibold whitespace-nowrap";
  let button: React.ReactNode;
  if (missed)
    button = (
      <button type="button" onClick={() => setEod(missed)} className={cn(base, "bg-[#fcedd9]")} title={`You didn't clock out on ${fmt(missed)}`}>
        <AlertTriangle className="size-4" aria-hidden /> Close {fmt(missed)}
      </button>
    );
  else if (!day)
    button = (
      <button type="button" disabled={pending} onClick={() => run(clockInAction)} className={cn(base, "bg-pink text-white")}>
        <Clock3 className="size-4" aria-hidden /> Clock in
      </button>
    );
  else {
    const b = day.breaks[day.breaks.length - 1];
    const label =
      day.status === "in" ? (
        <>
          <i className="size-2 animate-pulse rounded-full bg-[#1e7a4c]" aria-hidden /> Working · <b className="tabular-nums">{fmtHM(workedMin(day, now))}</b>
        </>
      ) : day.status === "break" ? (
        <>
          <Coffee className="size-4" aria-hidden /> Break · <b className="tabular-nums">{fmtHM((now.getTime() - Date.parse(b?.start ?? now.toISOString())) / 60000)}</b>
        </>
      ) : (
        <>✓ Done · <b className="tabular-nums">{fmtHM(workedMin(day, now))}</b></>
      );
    button = (
      <button type="button" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)} className={cn(base, day.status === "in" ? "bg-[#e0f1e7]" : day.status === "break" ? "bg-[#fcedd9]" : "bg-white")}>
        {label}
      </button>
    );
  }
  const item = "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-cream";
  return (
    <div ref={box} className="relative flex-none">
      {button}
      {menu && day && (
        <div role="menu" className="absolute right-0 z-40 mt-2 grid w-64 gap-0.5 rounded-2xl border-2 border-ink bg-white p-1.5 shadow-lg">
          <p className="px-3 pt-1 pb-1.5 text-xs text-slate">{day.status === "out" ? `Clocked out at ${hhmm(day.segs[day.segs.length - 1]?.out)}` : `In since ${hhmm(day.segs[0]?.in)}`}</p>
          {day.status === "in" && (
            <button role="menuitem" type="button" className={item} disabled={pending} onClick={() => (setMenu(false), run(breakAction))}>
              <Coffee className="size-4" aria-hidden /> Take a break
            </button>
          )}
          {day.status !== "in" && (
            <button role="menuitem" type="button" className={item} disabled={pending} onClick={() => (setMenu(false), run(clockInAction))}>
              <Clock3 className="size-4" aria-hidden /> {day.status === "break" ? "I'm back, start the clock" : "Clock back in"}
            </button>
          )}
          {day.status !== "out" && (
            <button role="menuitem" type="button" className={item} onClick={() => (setMenu(false), setEod(day.day))}>
              <LogOut className="size-4" aria-hidden /> Clock out and send my report
            </button>
          )}
          <Link role="menuitem" href="/admin/time" className={item} onClick={() => setMenu(false)}>
            <NotebookPen className="size-4" aria-hidden /> My hours and reports
          </Link>
        </div>
      )}
      <EodDialog day={eod} onClose={() => setEod(null)} />
    </div>
  );
}

/* ── The end-of-day report ───────────────────────────────────────────── */

export function EodDialog({ day, onClose }: { day: string | null; onClose: () => void }) {
  const { run, pending } = useRun();
  const [prep, setPrep] = useState<EodPrep | null>(null);
  const [loading, start] = useTransition();
  useEffect(() => {
    if (!day) return;
    start(async () => setPrep(await eodPrep(day)));
  }, [day]);
  const p = prep && prep.day === day ? prep : null;
  const pct = p ? (p.expected ? Math.min(100, Math.round((p.mins / p.expected) * 100)) : 100) : 0;
  return (
    <Dialog open={!!day} onClose={onClose} title={p && !p.isToday ? `Close ${fmt(p.day)}` : "End my day"} wide>
      {!p ? (
        <p className="text-sm text-slate">{loading ? "Adding up your day…" : "That day is already closed."}</p>
      ) : (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const input = { ...Object.fromEntries(f), close: f.getAll("close"), tac: f.getAll("tac"), addTomorrow: f.get("addTomorrow") === "on" };
            if (await run(() => clockOutAction(p.day, input))) onClose();
          }}
        >
          <div className="flex items-center gap-4 rounded-2xl bg-cream p-3">
            <span className="grid size-20 flex-none place-items-center rounded-full text-center" style={{ background: `conic-gradient(#ec1763 ${pct * 3.6}deg, #ece6dc 0)` }}>
              <span className="grid size-16 place-items-center rounded-full bg-white leading-tight">
                <b className="text-sm tabular-nums">{fmtHM(p.mins)}</b>
                <span className="text-[10px] text-slate">{p.expected ? `of ${fmtHM(p.expected)}` : "logged"}</span>
              </span>
            </span>
            <span className="text-sm">
              <b className="block text-base">{p.mins >= p.expected || !p.expected ? "Hours done. Nice work." : `${fmtHM(p.expected - p.mins)} short of your ${p.mode === "half" ? "half" : "full"} day`}</b>
              <span className="text-slate">
                {p.firstIn && `In at ${hhmm(p.firstIn)}`}
                {p.breaks > 0 && ` · ${p.breaks} break${p.breaks > 1 ? "s" : ""}`}
                {p.late > 0 && <span className="text-[#c42b3c]"> · {fmtHM(p.late)} late</span>}. The owner sees this report.
              </span>
            </span>
          </div>
          {!p.isToday && (
            <Field label={`What time did you finish on ${fmt(p.day)}?`}>
              <input type="time" name="endTime" required defaultValue="17:00" className={fieldClass} />
            </Field>
          )}
          {p.done.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-bold">Finished in HQ · {p.done.length}</h3>
              <div className="flex flex-wrap gap-1.5">
                {p.done.map((t) => (
                  <Pill key={t} tone="ok">
                    ✓ {t}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {p.open.length > 0 && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-bold">Your three for today, still open</legend>
              {p.open.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="close" value={t.id} className="accent-pink" />
                  <span className="flex-1">{t.title}</span>
                  <span className="text-xs text-slate">tick if done</span>
                </label>
              ))}
            </fieldset>
          )}
          {p.tactics.length > 0 && (
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-bold">12-week plan · week {p.tacticWeek} tactics</legend>
              {p.tactics.map((t) =>
                t.done ? (
                  <p key={t.id} className="flex items-center gap-2 text-sm text-slate">
                    <span aria-hidden>✓</span> <span className="flex-1">{t.title}</span> <span className="text-xs">done this week</span>
                  </p>
                ) : (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="tac" value={t.id} className="accent-pink" />
                    <span className="flex-1">{t.title}</span>
                    <span className="text-xs text-slate">tick if done</span>
                  </label>
                ),
              )}
            </fieldset>
          )}
          <Field label="What did you get done today?">
            <textarea name="doneText" required rows={3} defaultValue={p.done.join("\n")} placeholder="The work that moved, calls made, things shipped" className={fieldClass} />
          </Field>
          <Field label="Anything blocking you, or help you need?">
            <textarea name="blockers" rows={2} placeholder="Leave blank if you're clear" className={fieldClass} />
          </Field>
          <Field label="First thing tomorrow">
            <input name="tomorrow" placeholder="The one thing you'll start with" className={fieldClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="addTomorrow" defaultChecked className="accent-pink" /> Add it to tomorrow&apos;s tasks
          </label>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1.5 text-sm font-bold">How did today feel?</legend>
            {MOODS.map((m, i) => (
              <label key={m} className="flex cursor-pointer items-center gap-1.5 rounded-full border-2 border-ink/15 px-3 py-1 text-sm has-checked:border-ink has-checked:bg-aqua/40">
                <input type="radio" name="mood" value={m} defaultChecked={i === 2} className="sr-only" />
                {m}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button type="button" tone="ghost" onClick={onClose}>
              Not yet
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              {p.isToday ? "Clock out" : "Save and close the day"} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ── The Attendance page ─────────────────────────────────────────────── */

type Person = { id: number; name: string; roles: string[]; pattern: Pattern };
type Props = {
  me: { id: number; owner: boolean };
  lead: boolean;
  today: string;
  serverNow: string;
  workday: Workday;
  people: Person[];
  rows: TimeDay[];
  items: LeaveItem[];
};

export function TimeView({ me, lead, today, serverNow, workday, people, rows, items }: Props) {
  const now = useNow(serverNow);
  const [tab, setTab] = useState<"today" | "reports" | "sheet">("today");
  const [repDay, setRepDay] = useState(today);
  const [week, setWeek] = useState(0);
  const [open, setOpen] = useState<{ id: number; day: string } | null>(null);
  const byKey = new Map(rows.map((r) => [`${r.userId}:${r.day}`, r]));
  const dayOf = (id: number, d: string) => byKey.get(`${id}:${d}`) ?? null;
  const pat = (id: number) => people.find((p) => p.id === id)?.pattern;
  const mode = (id: number, d: string): DayKind => (pat(id) ? dayMode(items, id, pat(id)!, d) : "full");
  const exp = (id: number, d: string) => expectedMin(mode(id, d), workday);
  const name = (id: number) => people.find((p) => p.id === id)?.name ?? "Someone";

  const tabs = [
    ["today", lead ? "Team today" : "My day"],
    ["reports", "End-of-day reports"],
    ["sheet", "Timesheet"],
  ] as const;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn("rounded-full border-2 border-transparent px-3.5 py-1.5 text-sm font-semibold text-slate hover:text-ink", tab === k && "border-ink bg-ink text-white hover:text-white")}>
            {l}
          </button>
        ))}
        <span className="flex-1" />
        {me.owner && (
          <Link href="/admin/settings" className="text-sm font-semibold text-slate underline-offset-2 hover:underline">
            Working hours: {workday.start} start, {workday.grace} min grace
          </Link>
        )}
      </div>

      {tab === "today" &&
        (lead ? (
          <TeamToday people={people} today={today} now={now} workday={workday} dayOf={dayOf} mode={mode} exp={exp} items={items} onOpen={setOpen} />
        ) : (
          <MyDay id={me.id} today={today} now={now} workday={workday} rows={rows.filter((r) => r.userId === me.id)} mode={mode} exp={exp} onOpen={setOpen} />
        ))}

      {tab === "reports" && <Reports people={people} day={repDay} setDay={setRepDay} today={today} now={now} lead={lead} me={me.id} dayOf={dayOf} mode={mode} onOpen={setOpen} />}

      {tab === "sheet" && <Sheet people={people} today={today} now={now} week={week} setWeek={setWeek} workday={workday} dayOf={dayOf} mode={mode} exp={exp} onOpen={setOpen} />}

      <Dialog open={!!open} onClose={() => setOpen(null)} title={open ? `${first(name(open.id))} · ${fmt(open.day)}` : ""}>
        {open && <DayDetail d={dayOf(open.id, open.day)} who={open.id === me.id ? "you clock" : `${first(name(open.id))} clocks`} name={name(open.id)} now={now} />}
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="grid gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
      <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{label}</span>
      <b className="font-display text-3xl tabular-nums">{value}</b>
      <span className="text-sm text-slate">{sub}</span>
    </div>
  );
}

const STATE: Record<string, [string, Tone]> = { in: ["Working", "ok"], break: ["On a break", "warn"], out: ["Clocked out", "ink"], leave: ["On leave today", "sky"], offday: ["Off today", "plain"], notin: ["Not in yet", "bad"] };

function PersonCard({ p, d, kind, now, workday, today, exp, onOpen }: { p: { id: number; name: string; roles: string[] }; d: TimeDay | null; kind: DayKind; now: Date; workday: Workday; today: string; exp: number; onOpen: (x: { id: number; day: string }) => void }) {
  const w = workedMin(d, now);
  const pct = exp ? Math.min(100, Math.round((w / exp) * 100)) : 0;
  const startMin = Number(workday.start.split(":")[0]) * 60 + Number(workday.start.split(":")[1] ?? 0);
  const nowMin = (now.getUTCHours() + 1) * 60 + now.getUTCMinutes();
  const st = d ? d.status : kind === "leave" ? "leave" : kind === "off" ? "offday" : "notin";
  const label = d?.status === "in" ? `Working since ${hhmm(d.segs[0]?.in)}` : d?.status === "out" ? `Clocked out at ${hhmm(d.segs[d.segs.length - 1]?.out)}` : st === "notin" && nowMin > startMin + workday.grace ? "Not clocked in yet" : STATE[st][0];
  return (
    <article className="grid gap-2.5 rounded-[20px] border-2 border-ink bg-white p-4">
      <div className="flex items-center gap-2.5">
        <Avatar name={p.name} size="md" />
        <span className="min-w-0 flex-1">
          <b className="block truncate">{p.name}</b>
          <span className="block truncate text-xs text-slate">
            {p.roles.join(" + ")} · {kind === "half" ? "Half day" : kind === "full" ? "Full day" : kind === "leave" ? "Leave" : "Off"}
          </span>
        </span>
        <span className="grid size-11 flex-none place-items-center rounded-full text-[11px] font-bold" style={{ background: `conic-gradient(#1e7a4c ${pct * 3.6}deg, #ece6dc 0)` }}>
          <span className="grid size-8 place-items-center rounded-full bg-white">{exp ? `${pct}%` : "·"}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Pill tone={STATE[st][1]}>{label}</Pill>
        {d?.late ? <Pill tone="bad">{fmtHM(d.late)} late</Pill> : null}
        {d && d.breaks.length > 0 && (
          <Pill>
            {d.breaks.length} break{d.breaks.length > 1 ? "s" : ""}
          </Pill>
        )}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate">Worked</span>
        <b className="tabular-nums">{fmtHM(w)}</b>
        {exp > 0 && <span className="text-slate">of {fmtHM(exp)}</span>}
        <span className="flex-1" />
        {d?.eod ? (
          <Button size="sm" onClick={() => onOpen({ id: p.id, day: today })}>
            Report
          </Button>
        ) : d && d.status !== "out" ? (
          <span className="text-xs text-slate">Report at clock out</span>
        ) : null}
      </div>
      {d?.eod?.blockers && <p className="rounded-xl bg-[#fcedd9] p-2 text-sm">⚠️ {d.eod.blockers.slice(0, 140)}</p>}
    </article>
  );
}

type Common = { now: Date; dayOf: (id: number, d: string) => TimeDay | null; mode: (id: number, d: string) => DayKind; onOpen: (x: { id: number; day: string }) => void };

function TeamToday({ people, today, now, workday, dayOf, mode, exp, items, onOpen }: Common & { people: Person[]; today: string; workday: Workday; exp: (id: number, d: string) => number; items: LeaveItem[] }) {
  const ds = people.map((p) => ({ p, d: dayOf(p.id, today), m: mode(p.id, today) }));
  const n = (f: (x: (typeof ds)[number]) => boolean) => ds.filter(f).length;
  const order = (s?: string) => ({ in: 0, break: 1, out: 2 })[s ?? ""] ?? 3;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Working now" value={String(n((x) => x.d?.status === "in"))} sub={`${n((x) => x.d?.status === "break")} on a break`} />
        <Stat label="Not in yet" value={String(n((x) => !x.d && (x.m === "full" || x.m === "half")))} sub={`${n((x) => !!x.d?.late)} late today`} />
        <Stat label="Clocked out" value={String(n((x) => x.d?.status === "out"))} sub={`${n((x) => !!x.d?.eod)} report${n((x) => !!x.d?.eod) === 1 ? "" : "s"} in`} />
        <Stat label="Off or on leave" value={String(n((x) => (x.m === "off" || x.m === "leave") && !x.d))} sub={ds.filter((x) => x.m === "leave").map((x) => `${first(x.p.name)} (${lvLabel(onLeave(items, x.p.id, today)?.type ?? "").toLowerCase()})`).join(", ") || "From Leave and availability"} />
      </div>
      {ds.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ds
            .sort((a, b) => order(a.d?.status) - order(b.d?.status))
            .map(({ p, d, m }) => (
              <PersonCard key={p.id} p={p} d={d} kind={m} now={now} workday={workday} today={today} exp={exp(p.id, today)} onOpen={onOpen} />
            ))}
        </div>
      ) : (
        <EmptyNote title="No one to show yet.">People appear here once they&apos;re on the team. The owner appears after using the clock.</EmptyNote>
      )}
    </>
  );
}

function MyDay({ id, today, now, workday, rows, mode, exp, onOpen }: { id: number; today: string; now: Date; workday: Workday; rows: TimeDay[]; mode: (id: number, d: string) => DayKind; exp: (id: number, d: string) => number; onOpen: (x: { id: number; day: string }) => void }) {
  const d = rows.find((r) => r.day === today) ?? null;
  const wk = weekOf(today).filter((x) => x <= today);
  const weekMin = wk.reduce((s, x) => s + workedMin(rows.find((r) => r.day === x), now), 0);
  const weekExp = wk.reduce((s, x) => s + exp(id, x), 0);
  const lateMonth = rows.filter((r) => r.day.slice(0, 7) === today.slice(0, 7) && r.late).length;
  const recent = [...rows].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 10);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Today" value={fmtHM(workedMin(d, now))} sub={exp(id, today) ? `of ${fmtHM(exp(id, today))} · ${mode(id, today) === "half" ? "half day" : "full day"}` : "Not a working day for you"} />
        <Stat label="This week" value={fmtHM(weekMin)} sub={`of ${fmtHM(weekExp)} so far`} />
        <Stat label="Late this month" value={String(lateMonth)} sub={`Start time ${workday.start}, ${workday.grace} min grace`} />
      </div>
      <Panel>
        <CardHead title="Recent days" />
        {recent.length ? (
          <ul>
            {recent.map((r) => (
              <li key={r.day}>
                <button type="button" onClick={() => onOpen({ id, day: r.day })} className="flex w-full items-center gap-3 border-t border-ink/10 py-2.5 text-left first:border-t-0 hover:bg-cream">
                  <span className="flex-1">
                    <b className="block text-sm">{relDay(r.day, today)}</b>
                    <span className="text-xs text-slate">
                      {r.segs[0] && `${hhmm(r.segs[0].in)} to ${r.status === "out" ? hhmm(r.segs[r.segs.length - 1]?.out) : "now"}`}
                      {r.late > 0 && ` · ${fmtHM(r.late)} late`}
                      {r.eod && " · report sent"}
                    </span>
                  </span>
                  <b className="tabular-nums">{fmtHM(workedMin(r, now))}</b>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote title="No days yet.">Clock in from the button at the top of any page. Your days collect here.</EmptyNote>
        )}
      </Panel>
    </>
  );
}

function Reports({ people, day, setDay, today, now, lead, me, dayOf, mode, onOpen }: Common & { people: Person[]; day: string; setDay: (d: string) => void; today: string; lead: boolean; me: number }) {
  const isToday = day === today;
  const sent = people.map((p) => ({ p, d: dayOf(p.id, day) })).filter((x) => x.d?.eod);
  const missing = people.filter((p) => (mode(p.id, day) === "full" || mode(p.id, day) === "half") && !dayOf(p.id, day)?.eod);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))} className={cn(btn.base, btn.plain, "px-2")}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <b>{isToday ? "Today" : longDate(day)}</b>
        <button type="button" aria-label="Next day" disabled={isToday} onClick={() => setDay(addDays(day, 1))} className={cn(btn.base, btn.plain, "px-2 disabled:opacity-40")}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        {!isToday && (
          <Button size="sm" tone="ghost" onClick={() => setDay(today)}>
            Today
          </Button>
        )}
      </div>
      {sent.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {sent.map(({ p, d }) => (
            <article key={p.id} className="rounded-[20px] border-2 border-ink bg-white p-4">
              <ReportBody d={d!} name={p.name} now={now} />
              {p.id !== me && (
                <Button size="sm" tone="ghost" className="mt-2" onClick={() => onOpen({ id: p.id, day })}>
                  Timeline
                </Button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyNote title={`No reports for ${isToday ? "today" : fmt(day)} yet.`}>Reports arrive as people clock out.</EmptyNote>
      )}
      {lead && missing.length > 0 && (
        <Panel>
          <CardHead title="Still to report" />
          <div className="flex flex-wrap gap-1.5">
            {missing.map((p) => {
              const d = dayOf(p.id, day);
              return (
                <Pill key={p.id}>
                  {first(p.name)} · {d?.status === "in" ? "still working" : d?.status === "break" ? "on a break" : "not clocked in"}
                </Pill>
              );
            })}
          </div>
        </Panel>
      )}
    </>
  );
}

function ReportBody({ d, name, now }: { d: TimeDay; name: string; now: Date }) {
  const e = d.eod!;
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2.5">
        <Avatar name={name} size="md" />
        <span className="flex-1">
          <b className="block">{name}</b>
          <span className="text-xs text-slate">
            {hhmm(d.segs[0]?.in)} to {hhmm(d.segs[d.segs.length - 1]?.out)} · {fmtHM(workedMin(d, now))}
            {d.late > 0 && ` · ${fmtHM(d.late)} late`}
          </span>
        </span>
        <span className="text-2xl" title="Mood">
          {e.mood.split(" ")[0]}
        </span>
      </div>
      {e.tasksDone.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {e.tasksDone.slice(0, 12).map((t) => (
            <Pill key={t} tone="ok">
              ✓ {t}
            </Pill>
          ))}
        </div>
      )}
      {e.tactics > 0 && (
        <p className="text-xs text-slate">
          🎯 {e.tactics} 12-week tactic{e.tactics > 1 ? "s" : ""} ticked off
        </p>
      )}
      <p className="text-sm whitespace-pre-line">{e.doneText}</p>
      {e.blockers && (
        <p className="rounded-xl bg-[#fcedd9] p-2 text-sm">
          ⚠️ <b>Blocked:</b> {e.blockers}
        </p>
      )}
      {e.tomorrow && (
        <p className="text-sm text-slate">
          ➡️ <b>Tomorrow:</b> {e.tomorrow}
        </p>
      )}
    </div>
  );
}

function DayDetail({ d, who, name, now }: { d: TimeDay | null; who: string; name: string; now: Date }) {
  if (!d) return <p className="text-sm text-slate">No hours logged on this day.</p>;
  return (
    <div className="grid gap-3">
      {d.eod && <ReportBody d={d} name={name} now={now} />}
      <h3 className="text-sm font-bold">Timeline</h3>
      <ul className="grid gap-1.5">
        {d.segs.map((s) => (
          <li key={s.in} className="flex items-center gap-2 text-sm">
            <Pill tone="ok">Working</Pill>
            <span className="flex-1">
              {hhmm(s.in)} to {s.out ? hhmm(s.out) : "now"}
            </span>
            <b className="tabular-nums">{fmtHM(segMins([s], now))}</b>
          </li>
        ))}
        {d.breaks.map((b) => (
          <li key={b.start} className="flex items-center gap-2 text-sm">
            <Pill tone="warn">Break</Pill>
            <span className="flex-1">
              {hhmm(b.start)} to {b.end ? hhmm(b.end) : "now"}
            </span>
          </li>
        ))}
      </ul>
      {!d.eod && <p className="text-sm text-slate">No report yet. It&apos;s written when {who} out.</p>}
    </div>
  );
}

function Sheet({ people, today, now, week, setWeek, workday, dayOf, mode, exp, onOpen }: Common & { people: Person[]; today: string; week: number; setWeek: (n: number) => void; workday: Workday; exp: (id: number, d: string) => number }) {
  const wk = weekOf(today, week);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label="Previous week" disabled={week <= -8} onClick={() => setWeek(week - 1)} className={cn(btn.base, btn.plain, "px-2 disabled:opacity-40")}>
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <b>Week of {fmt(wk[0])}</b>
        <button type="button" aria-label="Next week" disabled={week >= 0} onClick={() => setWeek(week + 1)} className={cn(btn.base, btn.plain, "px-2 disabled:opacity-40")}>
          <ChevronRight className="size-4" aria-hidden />
        </button>
        {week !== 0 && (
          <Button size="sm" tone="ghost" onClick={() => setWeek(0)}>
            This week
          </Button>
        )}
        <span className="flex-1" />
        <a href={`/admin/time/sheet?week=${week}`} className={cn(btn.base, btn.plain)}>
          <Download className="size-4" aria-hidden /> Download CSV
        </a>
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-xs text-slate">
                <th className="py-1.5 text-left font-semibold">Person</th>
                {wk.map((d) => (
                  <th key={d} className={cn("py-1.5 text-center font-semibold", d === today && "text-pink")}>
                    {D(d).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })} {D(d).getUTCDate()}
                  </th>
                ))}
                <th className="py-1.5 text-right font-semibold">Total</th>
                <th className="py-1.5 text-right font-semibold">Expected</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const tot = wk.reduce((s, d) => s + workedMin(dayOf(p.id, d), now), 0);
                const ex = wk.filter((d) => d <= today).reduce((s, d) => s + exp(p.id, d), 0);
                return (
                  <tr key={p.id} className="border-t border-ink/10">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{p.name}</td>
                    {wk.map((d) => {
                      const x = dayOf(p.id, d);
                      const m = mode(p.id, d);
                      if (!x)
                        return (
                          <td key={d} className={cn("py-1.5 text-center text-xs", m === "leave" ? "text-[#404f8c]" : "text-slate")}>
                            {d > today ? "" : m === "leave" ? "Leave" : m === "off" ? "Off" : "·"}
                          </td>
                        );
                      const w = workedMin(x, now);
                      const ok = !exp(p.id, d) || w >= exp(p.id, d);
                      return (
                        <td key={d} className="py-1 text-center">
                          <button type="button" onClick={() => onOpen({ id: p.id, day: d })} title={`${fmt(d)}: ${fmtHM(w)} of ${fmtHM(exp(p.id, d))}${x.late ? `, ${fmtHM(x.late)} late` : ""}`} className={cn("rounded-lg px-2 py-0.5 font-semibold tabular-nums", ok ? "bg-[#e0f1e7] text-[#1e7a4c]" : "bg-[#fcedd9] text-[#a35c0a]")}>
                            {(w / 60).toFixed(1)}h{x.late ? <i className="ml-1 text-[10px] font-normal text-[#c42b3c] not-italic">late</i> : null}
                          </button>
                        </td>
                      );
                    })}
                    <td className="py-1.5 text-right font-bold tabular-nums">{fmtHM(tot)}</td>
                    <td className={cn("py-1.5 text-right tabular-nums", tot < ex && "text-[#c42b3c]")}>{fmtHM(ex)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate">
          Expected hours follow each person&apos;s approved work pattern: a full day is {hrsText(workday.fullHours)} and a half day {hrsText(workday.halfHours)}. Leave and off days don&apos;t count against anyone.
        </p>
      </Panel>
    </>
  );
}
