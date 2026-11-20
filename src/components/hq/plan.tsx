"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import {
  activateCycle,
  closeCycle,
  deleteGoal,
  removeTactic,
  saveCycle,
  saveCycleReview,
  saveGoal,
  saveTactic,
  saveWeekReview,
  startCycle,
  tacticToTask,
  tickTactic,
  updateGoalProgress,
} from "@/app/admin/(hq)/plan/actions";
import type { PlanData } from "@/app/admin/(hq)/plan/load";
import { Button, Field, Panel, fieldClass } from "@/components/desk/ui";
import {
  CYCLE_STATUSES,
  type Cycle,
  GOAL_SOURCES,
  GOAL_UNITS,
  type Goal,
  MAX_GOALS,
  PLAN_AREAS,
  type Review,
  type Tactic,
  areaOf,
  avgScore,
  compactWeeks,
  doneIn,
  dueIn,
  expectedPct,
  fmtGoal,
  goalPct,
  scoreOf,
  scoreTone,
  sourceLabel,
  teamScore,
  weekEnd,
  weekStart,
  weeksText,
} from "@/lib/hq/plan-model";
import { cn } from "@/lib/utils";
import { Avatar, CardHead, Dialog, EmptyNote, Pill, type Tone, useRun } from "./kit";
import { SubTabs } from "./subtabs";

const D = (d: string) => new Date(`${d}T12:00:00Z`);
const fmt = (d: string, year = false) =>
  D(d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
const first = (n: string) => n.split(" ")[0] || n;
const clampWk = (w: number) => Math.max(1, Math.min(12, w));

const AREA_TONE: Record<string, Tone> = {
  rose: "rose",
  sky: "sky",
  sunset: "sunset",
  lime: "lime",
  aqua: "aqua",
  ink: "plain",
};
const AREA_DOT: Record<string, string> = {
  rose: "bg-pink",
  sky: "bg-[#5d6db3]",
  sunset: "bg-orange",
  lime: "bg-lime",
  aqua: "bg-[#5fb4c0]",
  ink: "bg-ink",
};
const RING: Record<string, string> = {
  win: "#9aa31c",
  mid: "#f37826",
  low: "#ec1763",
  none: "#ece6dc",
};
const BAR: Record<string, string> = { win: "bg-lime", mid: "bg-orange", low: "bg-pink", none: "bg-paper" };
const CELL: Record<string, string> = {
  win: "bg-lime/70",
  mid: "bg-peach",
  low: "bg-pink-soft",
  none: "bg-paper",
};

function Ring({ value, label, win, small }: { value: number | null; label?: string; win: number; small?: boolean }) {
  const tone = scoreTone(value, win);
  return (
    <span
      className={cn("grid flex-none place-items-center rounded-full", small ? "size-14" : "size-24")}
      style={{
        background: `conic-gradient(${RING[tone]} ${(value ?? 0) * 3.6}deg, #ece6dc 0)`,
      }}
      role="img"
      aria-label={`${label ?? "Score"}: ${value === null ? "no tactics" : `${value}%`}`}
    >
      <span className={cn("grid place-items-center rounded-full bg-white text-center leading-tight text-ink", small ? "size-11" : "size-19")}>
        <b className={cn("tabular-nums", small ? "text-sm" : "text-xl")}>{value === null ? "-" : `${value}%`}</b>
        {label && !small && <span className="text-[10px] text-slate">{label}</span>}
      </span>
    </span>
  );
}

type Tab = "week" | "goals" | "board" | "reviews" | "setup";

export function PlanView({ d, tab }: { d: PlanData; tab: Tab }) {
  const [tactic, setTactic] = useState<Partial<Tactic> | null>(null);
  if (!d.cycle) return <NoCycle lead={d.lead} again={d.closed > 0} />;
  const c = d.cycle;
  const w = d.week;
  const ids = d.people.map((p) => p.id);
  const ts = avgScore(d.tactics, ids, null, Math.min(12, w - 1)) ?? teamScore(d.tactics, ids, clampWk(w));
  const daysLeft = Math.max(0, Math.round((D(weekEnd(c.start, 12)).getTime() - D(d.today).getTime()) / 864e5));
  const withTactics = d.people.filter((p) => d.tactics.some((t) => t.userId === p.id)).length;
  const tabs: [Tab, string, string][] = [
    ["week", "This week", "/admin/plan"],
    ["goals", "Goals", "/admin/plan?tab=goals"],
    ["board", "Scoreboard", "/admin/plan?tab=board"],
    ["reviews", "Reviews", "/admin/plan?tab=reviews"],
    ...(d.lead ? ([["setup", "Plan setup", "/admin/plan?tab=setup"]] as [Tab, string, string][]) : []),
  ];
  const t: Tab = tabs.some(([k]) => k === tab) ? tab : "week";
  const open = c.status !== "closed" && w <= 12;
  return (
    <>
      <section className="mb-5 grid gap-4 rounded-[22px] border-2 border-ink bg-ink p-4 text-white sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center lg:p-5">
        <div className="flex items-center gap-4 sm:block sm:text-center">
          <span className="block text-xs font-bold tracking-[0.06em] text-lime uppercase">{w < 1 ? "Starts in" : w > 13 ? "Finished" : w === 13 ? "Review week" : "Week"}</span>
          <b className="block font-display text-5xl leading-none tabular-nums">
            {w < 1 ? `${Math.round((D(c.start).getTime() - D(d.today).getTime()) / 864e5)}d` : w > 13 ? "✓" : w}
          </b>
          <span className="block text-xs text-white/70">{w < 1 ? `on ${fmt(c.start)}` : w > 13 ? "cycle complete" : w === 13 ? "plan the next 12" : "of 12"}</span>
        </div>
        <div className="grid min-w-0 gap-3">
          <p className="text-sm text-white/80">
            <b className="text-white">{c.name}</b> · {fmt(c.start, true)} to {fmt(weekEnd(c.start, 12), true)}
            {c.status === "draft" && (
              <Pill tone="sunset" className="ml-2">
                Draft
              </Pill>
            )}
          </p>
          {c.vision && <p className="font-display text-lg leading-snug">&ldquo;{c.vision}&rdquo;</p>}
          <div className="grid grid-cols-13 gap-1" role="img" aria-label={`Week ${Math.max(0, w)} of 12`}>
            {Array.from({ length: 13 }, (_, i) => {
              const n = i + 1;
              const s = n <= 12 && n <= w ? teamScore(d.tactics, ids, n) : null;
              return (
                <span
                  key={n}
                  title={n === 13 ? "Week 13: review" : `Week ${n}: ${fmt(weekStart(c.start, n))}${s !== null ? ` · team ${s}%` : ""}`}
                  className={cn(
                    "grid h-7 place-items-center rounded-md text-[11px] font-bold",
                    n === w ? "ring-2 ring-lime" : "",
                    n <= w && n <= 12 ? cn(CELL[scoreTone(s, c.target)], "text-ink") : "bg-white/10 text-white/60",
                  )}
                >
                  {n === 13 ? "R" : n}
                </span>
              );
            })}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/75">
            <span>
              {c.goals.length} goal{c.goals.length === 1 ? "" : "s"}
            </span>
            <span>{daysLeft} days left</span>
            {!d.solo && (
              <span>
                {withTactics} of {d.people.length} people with tactics
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 sm:grid sm:justify-items-center sm:gap-1">
          <Ring value={ts} label={d.solo ? "my score" : "team score"} win={c.target} />
          <span className="text-xs text-white/70">Target {c.target}%</span>
          {open && (
            <Button tone="primary" size="sm" className="ml-auto sm:ml-0" onClick={() => setTactic({})}>
              <Plus className="size-4" aria-hidden /> Tactic
            </Button>
          )}
        </div>
      </section>
      <SubTabs label="12-week plan" tabs={tabs} current={t} />
      {t === "week" && <WeekTab d={d} c={c} onEdit={setTactic} />}
      {t === "goals" && <GoalsTab d={d} c={c} />}
      {t === "board" && <Board d={d} c={c} />}
      {t === "reviews" && <Reviews d={d} c={c} />}
      {t === "setup" && d.lead && <Setup d={d} c={c} />}
      <TacticDialog d={d} c={c} tactic={tactic} onClose={() => setTactic(null)} />
    </>
  );
}

function NoCycle({ lead, again }: { lead: boolean; again: boolean }) {
  const { run, pending } = useRun();
  return (
    <section className="grid gap-4 rounded-[22px] border-2 border-ink bg-white p-5 lg:p-6">
      <p className="text-xs font-bold tracking-[0.06em] text-[#b8114a] uppercase">How it works</p>
      <h2 className="font-display text-2xl leading-tight">One year&apos;s ambition, run as 12-week sprints.</h2>
      <ol className="grid max-w-[68ch] list-decimal gap-2 pl-5 text-sm">
        <li>
          <b>Set 1 to 3 goals</b> for the next 12 weeks, each with a number.
        </li>
        <li>
          <b>Everyone writes weekly tactics</b>: the actions that move those numbers, set to the weeks they happen.
        </li>
        <li>
          <b>Score every week.</b> Tick tactics as you go. 85% or better is a winning week.
        </li>
        <li>
          <b>Week 13 is for review</b>: what worked, what to carry forward, then plan the next 12.
        </li>
      </ol>
      {lead ? (
        <div>
          <Button tone="primary" disabled={pending} onClick={() => run(startCycle)}>
            {again ? "Start the next 12 weeks" : "Start the first 12 weeks"} <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate">The owner sets the goals. Once they&apos;re set, your weekly tactics live here.</p>
      )}
    </section>
  );
}

/* ── A tactic ────────────────────────────────────────────────────────── */

export function TacticRow({
  t,
  goal,
  week,
  mine,
  canTick,
  tasked,
  setBy,
  onEdit,
}: {
  t: Tactic;
  goal?: Goal;
  week: number;
  mine: boolean;
  canTick: boolean;
  tasked: boolean;
  setBy?: string;
  onEdit?: (t: Tactic) => void;
}) {
  const { run, pending } = useRun();
  const done = doneIn(t, week);
  const a = goal ? areaOf(goal.area) : null;
  const due = dueIn(t, week);
  return (
    <div className={cn("flex items-center gap-3 border-b border-ink/10 py-2 last:border-b-0", done && "text-slate")}>
      <button
        type="button"
        disabled={!canTick || !due || pending}
        aria-pressed={done}
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${t.title}, week ${week}`}
        onClick={() => run(() => tickTactic(t.id, week, !done))}
        className={cn("grid size-7 flex-none place-items-center rounded-lg border-2 border-ink disabled:opacity-40", done ? "bg-lime" : "bg-white")}
      >
        {done && <Check className="size-4" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold", done && "line-through decoration-ink/40")}>{t.title}</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate">
          {goal && a && (
            <>
              <i className={cn("inline-block size-2 rounded-full", AREA_DOT[a[2]])} aria-hidden /> {goal.title} ·
            </>
          )}
          <span>{weeksText(t.weeks)}</span>
          {setBy && <span>· set by {first(setBy)}</span>}
        </p>
      </div>
      {mine && due && !done && !tasked && (
        <Button size="sm" tone="ghost" disabled={pending} onClick={() => run(() => tacticToTask(t.id, week))} title="Put it on your task list for this week">
          <ListTodo className="size-4" aria-hidden /> Task
        </Button>
      )}
      {mine && tasked && !done && <Pill tone="sky">On your tasks</Pill>}
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(t)}
          aria-label={`Edit tactic: ${t.title}`}
          className="grid size-8 flex-none place-items-center rounded-full border-2 border-ink/15 hover:border-ink"
        >
          <Pencil className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/* ── This week ───────────────────────────────────────────────────────── */

function WeekTab({ d, c, onEdit }: { d: PlanData; c: Cycle; onEdit: (t: Partial<Tactic>) => void }) {
  const [review, setReview] = useState<number | null>(null);
  const w = d.week;
  const wk = clampWk(w);
  const name = (id: number | null) => d.everyone.find((p) => p.id === id)?.name ?? d.people.find((p) => p.id === id)?.name ?? "";
  const goal = (id: string | null) => c.goals.find((g) => g.id === id);
  const all = d.tactics.filter((t) => t.userId === d.me);
  const row = (t: Tactic, week: number) => (
    <TacticRow
      key={t.id}
      t={t}
      goal={goal(t.goalId)}
      week={week}
      mine
      canTick={week <= Math.max(1, w)}
      tasked={d.tasked.includes(`${t.id}:${week}`)}
      setBy={t.byId && t.byId !== t.userId ? name(t.byId) : undefined}
      onEdit={onEdit}
    />
  );
  if (w > 12) return <Reviews d={d} c={c} />;
  const mine = all.filter((t) => dueIn(t, wk));
  const sc = scoreOf(d.tactics, d.me, wk);
  const dow = D(d.today).getUTCDay();
  const reviewed = d.reviews.some((r) => r.userId === d.me && r.week === wk);
  const toGo = mine.filter((t) => !doneIn(t, wk)).length;
  return (
    <div className="grid gap-4">
      {w < 1 && (
        <EmptyNote title={`The cycle starts on ${fmt(c.start, true)}.`}>
          Use the time to add your tactics so week 1 starts strong.
          <Button size="sm" tone="primary" className="mt-2" onClick={() => onEdit({})}>
            <Plus className="size-4" aria-hidden /> Add a tactic
          </Button>
        </EmptyNote>
      )}
      {w >= 1 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel title={`My tactics · week ${wk}`} aside={`${fmt(weekStart(c.start, wk))} to ${fmt(weekEnd(c.start, wk))}`}>
            {mine.length ? (
              mine.map((t) => row(t, wk))
            ) : (
              <EmptyNote title="No tactics for this week.">
                Tactics are the weekly actions that move a goal: &ldquo;Send 10 pitches&rdquo;, &ldquo;Post 4 Reels&rdquo;, &ldquo;Follow up every open proposal&rdquo;.
                <Button size="sm" tone="primary" className="mt-2" onClick={() => onEdit({})}>
                  <Plus className="size-4" aria-hidden /> Add a tactic
                </Button>
              </EmptyNote>
            )}
          </Panel>
          <Panel title="My week">
            <div className="flex items-center gap-4">
              <Ring value={sc} label="this week" win={c.target} />
              <div className="text-sm">
                <p className="font-semibold">
                  {sc === null ? "Add tactics to get a score." : sc >= c.target ? "Winning week. Keep it there." : `${toGo} to go for a winning week (${c.target}%).`}
                </p>
                <p className="text-slate">Cycle average {avgScore(d.tactics, [d.me], d.me, wk) ?? "-"}%</p>
              </div>
            </div>
            {reviewed ? (
              <p className="mt-3 text-sm">✓ Week {wk} reviewed.</p>
            ) : (
              <div className={cn("mt-3 flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm", dow >= 5 || dow === 0 ? "bg-aqua/60" : "bg-cream")}>
                <span className="flex-1">
                  {dow >= 5 || dow === 0 ? "It's the end of the week. Score it while it's fresh." : "Ten minutes on Friday: score the week, name a win, decide one change."}
                </span>
                <Button size="sm" onClick={() => setReview(wk)}>
                  Weekly review
                </Button>
              </div>
            )}
          </Panel>
        </div>
      )}
      {w >= 1 && !d.solo && (
        <Panel title="Team this week">
          <ul className="grid">
            {d.people.map((p) => {
              const s = scoreOf(d.tactics, p.id, wk);
              const n = d.tactics.filter((t) => t.userId === p.id && dueIn(t, wk));
              return (
                <li key={p.id} className="flex items-center gap-3 border-b border-ink/10 py-2 last:border-b-0">
                  <Avatar name={p.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {p.name}
                      {p.id === d.me && " (you)"}
                    </p>
                    <p className="text-xs text-slate">{n.length ? `${n.filter((t) => doneIn(t, wk)).length} of ${n.length} tactics done` : "No tactics this week"}</p>
                  </div>
                  <span className="hidden h-2 w-28 overflow-hidden rounded-full bg-paper sm:block" aria-hidden>
                    <i className={cn("block h-full", BAR[scoreTone(s, c.target)])} style={{ width: `${s ?? 0}%` }} />
                  </span>
                  <b className="w-11 text-right text-sm tabular-nums">{s === null ? "-" : `${s}%`}</b>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      {all.length > 0 && (
        <Panel title="All my tactics this cycle" className="bg-cream">
          {all.map((t) => row(t, wk))}
        </Panel>
      )}
      <ReviewDialog d={d} c={c} week={review} onClose={() => setReview(null)} />
    </div>
  );
}

/* ── Goals ───────────────────────────────────────────────────────────── */

function GoalsTab({ d, c }: { d: PlanData; c: Cycle }) {
  const [update, setUpdate] = useState<Goal | null>(null);
  if (!c.goals.length)
    return (
      <EmptyNote title="No goals set yet.">
        {d.lead ? (
          <>
            Pick 1 to 3 measurable goals for these 12 weeks in{" "}
            <Link href="/admin/plan?tab=setup" className="font-semibold text-ink underline">
              Plan setup
            </Link>
            .
          </>
        ) : (
          "The owner sets the cycle's goals."
        )}
      </EmptyNote>
    );
  const exp = expectedPct(d.week);
  const name = (id: number | null) => d.everyone.find((p) => p.id === id)?.name ?? d.people.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {c.goals.map((g) => {
        const a = areaOf(g.area);
        const now = d.now[g.id] ?? g.current;
        const pct = goalPct(g.base, g.target, now);
        const tac = d.tactics.filter((t) => t.goalId === g.id);
        const canUpdate = g.source === "manual" && (d.lead || g.owner === d.me);
        return (
          <article key={g.id} className="grid content-start gap-2.5 rounded-[20px] border-2 border-ink bg-white p-4 lg:p-5">
            <div className="flex items-center gap-2">
              <Pill tone={AREA_TONE[a[2]]}>{a[1]}</Pill>
              <span className="flex-1" />
              {g.owner && (
                <span title={`Goal owner: ${name(g.owner)}`}>
                  <Avatar name={name(g.owner) || "?"} />
                </span>
              )}
            </div>
            <h3 className="font-display text-xl leading-snug">{g.title}</h3>
            {g.measure && <p className="text-sm text-slate">{g.measure}</p>}
            <div className="relative h-3 rounded-full bg-paper" role="img" aria-label={`${pct}% of the way. A straight line would be at ${exp}%.`}>
              <i className="block h-full rounded-full bg-pink" style={{ width: `${pct}%` }} />
              <b className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${exp}%` }} title="Where you'd be on a straight line" />
            </div>
            <p className="flex items-baseline gap-1.5 text-sm">
              <span className="text-slate">{fmtGoal(g.unit, g.base)}</span>
              <span className="flex-1" />
              <b className="tabular-nums">{fmtGoal(g.unit, now)}</b>
              <span className="text-slate">of {fmtGoal(g.unit, g.target)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill tone={pct >= exp ? "ok" : "warn"}>{pct}% there</Pill>
              <span className="text-slate">
                {pct >= exp ? "On pace" : "Behind the straight line"} · {sourceLabel(g.source)}
              </span>
              <span className="flex-1" />
              {canUpdate && (
                <Button size="sm" onClick={() => setUpdate(g)}>
                  Update
                </Button>
              )}
            </div>
            <h4 className="mt-1 text-xs font-bold text-slate">
              {tac.length} tactic{tac.length === 1 ? "" : "s"} driving it
            </h4>
            {tac.length ? (
              <ul className="grid gap-1">
                {tac.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <Avatar name={name(t.userId) || "?"} />
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-slate">{t.weeks.length === 12 ? "weekly" : compactWeeks(t.weeks)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate">No tactics yet. Add one from This week.</p>
            )}
          </article>
        );
      })}
      <ProgressDialog c={c} goal={update} now={update ? (d.now[update.id] ?? update.current) : 0} onClose={() => setUpdate(null)} />
    </div>
  );
}

function ProgressDialog({ c, goal, now, onClose }: { c: Cycle; goal: Goal | null; now: number; onClose: () => void }) {
  const { run, pending } = useRun();
  return (
    <Dialog open={!!goal} onClose={onClose} title="Update progress">
      {goal && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("current");
            if (await run(() => updateGoalProgress(c.id, goal.id, v))) onClose();
          }}
        >
          <Field label={`${goal.title}: where are you now?`}>
            <input name="current" type="number" step="any" required defaultValue={now} className={fieldClass} autoFocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ── Scoreboard ──────────────────────────────────────────────────────── */

function Board({ d, c }: { d: PlanData; c: Cycle }) {
  const upTo = Math.min(12, Math.max(0, d.week));
  const ids = d.people.map((p) => p.id);
  const cell = (v: number | null, k: string) => (
    <td key={k} className={cn("h-9 min-w-11 border border-white text-center text-xs font-semibold tabular-nums", CELL[scoreTone(v, c.target)])}>
      {v === null ? "" : `${v}%`}
    </td>
  );
  const avg = (u: number | null) => {
    const v = avgScore(d.tactics, ids, u, upTo);
    return v === null ? "-" : `${v}%`;
  };
  return (
    <Panel title="Weekly execution scores" aside={`${c.target}% or better is a winning week`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-slate">
              <th className="sticky left-0 z-10 bg-white py-2 pr-3 text-left font-semibold">Person</th>
              {Array.from({ length: 12 }, (_, i) => (
                <th key={i} className={cn("px-1 font-semibold", i + 1 === d.week && "text-pink")}>
                  W{i + 1}
                </th>
              ))}
              <th className="pl-2 font-semibold">Avg</th>
            </tr>
          </thead>
          <tbody>
            {d.people.map((p) => (
              <tr key={p.id}>
                <td className="sticky left-0 z-10 bg-white py-1 pr-3">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Avatar name={p.name} /> {first(p.name)}
                  </span>
                </td>
                {Array.from({ length: 12 }, (_, i) => cell(i + 1 <= upTo ? scoreOf(d.tactics, p.id, i + 1) : null, `${p.id}-${i}`))}
                <td className="pl-2 text-right font-bold tabular-nums">{avg(p.id)}</td>
              </tr>
            ))}
            {!d.solo && (
              <tr className="border-t-2 border-ink">
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 font-bold">Team</td>
                {Array.from({ length: 12 }, (_, i) => cell(i + 1 <= upTo ? teamScore(d.tactics, ids, i + 1) : null, `team-${i}`))}
                <td className="pl-2 text-right font-bold tabular-nums">{avg(null)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
        {[
          ["win", `${c.target}% and up`],
          ["mid", `65 to ${c.target - 1}%`],
          ["low", "under 65%"],
          ["none", "no tactics"],
        ].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5">
            <i className={cn("inline-block size-3 rounded", CELL[k])} aria-hidden /> {l}
          </span>
        ))}
      </p>
    </Panel>
  );
}

/* ── Reviews ─────────────────────────────────────────────────────────── */

function Reviews({ d, c }: { d: PlanData; c: Cycle }) {
  const [review, setReview] = useState<number | null>(null);
  const { run, pending } = useRun();
  const [closing, setClosing] = useState(false);
  const wk = clampWk(d.week);
  const name = (id: number) => d.everyone.find((p) => p.id === id)?.name ?? d.people.find((p) => p.id === id)?.name ?? "Someone";
  return (
    <div className="grid gap-4">
      {d.week >= 12 && d.lead && (
        <Panel title="Week 13: review the cycle" className="bg-lime/25">
          <p className="mb-3 text-sm text-slate">Look at the goals and the scoreboard, write down what to keep, then plan the next 12 weeks.</p>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              run(() => saveCycleReview(c.id, f));
            }}
          >
            <Field label="What worked">
              <textarea name="worked" rows={2} defaultValue={c.review.worked ?? ""} className={fieldClass} />
            </Field>
            <Field label="What to stop or change">
              <textarea name="stop" rows={2} defaultValue={c.review.stop ?? ""} className={fieldClass} />
            </Field>
            <Field label="Carry into the next 12 weeks">
              <textarea name="carry" rows={2} defaultValue={c.review.carry ?? ""} className={fieldClass} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="submit" disabled={pending}>
                Save the review
              </Button>
              <Button tone="primary" onClick={() => setClosing(true)}>
                Close this cycle and plan the next <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </form>
        </Panel>
      )}
      {d.week >= 1 && (
        <div>
          <Button size="sm" onClick={() => setReview(wk)}>
            <Pencil className="size-4" aria-hidden /> Review week {wk}
          </Button>
        </div>
      )}
      {d.reviews.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {d.reviews.map((r) => (
            <article key={`${r.userId}-${r.week}`} className="grid content-start gap-1.5 rounded-[20px] border-2 border-ink bg-white p-4">
              <div className="flex items-center gap-2">
                <Avatar name={name(r.userId)} />
                <b className="flex-1 text-sm">
                  {r.userId === d.me ? "You" : first(name(r.userId))} · week {r.week}
                </b>
                <Pill tone={r.score === null ? "plain" : r.score >= c.target ? "ok" : r.score >= 65 ? "warn" : "bad"}>{r.score === null ? "-" : `${r.score}%`}</Pill>
              </div>
              {r.wins && (
                <p className="text-sm">
                  <b>Win:</b> {r.wins}
                </p>
              )}
              {r.lessons && (
                <p className="text-sm">
                  <b>Learned:</b> {r.lessons}
                </p>
              )}
              {r.change && (
                <p className="text-sm">
                  <b>Next week:</b> {r.change}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyNote title="No weekly reviews yet.">Ten minutes on Friday: score the week, name a win, decide one change.</EmptyNote>
      )}
      <ReviewDialog d={d} c={c} week={review} onClose={() => setReview(null)} />
      <Dialog open={closing} onClose={() => setClosing(false)} title="Close this cycle?">
        <p className="text-sm">
          The scores and reviews stay on record. A new draft cycle starts next Monday with these goals copied in, starting from where they got to, ready to adjust.
        </p>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={() => setClosing(false)}>
            Not yet
          </Button>
          <Button tone="primary" disabled={pending} onClick={async () => (await run(() => closeCycle(c.id))) && setClosing(false)}>
            Close and plan the next
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function ReviewDialog({ d, c, week, onClose }: { d: PlanData; c: Cycle; week: number | null; onClose: () => void }) {
  const { run, pending } = useRun();
  const r: Partial<Review> = (week && d.reviews.find((x) => x.userId === d.me && x.week === week)) || {};
  const sc = week ? scoreOf(d.tactics, d.me, week) : null;
  return (
    <Dialog open={week !== null} onClose={onClose} title={`Week ${week ?? ""} review`}>
      {week !== null && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => saveWeekReview(c.id, week, Object.fromEntries(new FormData(e.currentTarget))))) onClose();
          }}
        >
          <div className="flex items-center gap-4">
            <Ring value={sc} label="score" win={c.target} />
            <p className="text-sm text-slate">
              {sc === null
                ? "You had no tactics this week."
                : sc >= c.target
                  ? "A winning week. What made it work?"
                  : `Below ${c.target}%. No judgement: what got in the way, and what will you change?`}
            </p>
          </div>
          <Field label="A win from this week">
            <textarea name="wins" rows={2} defaultValue={r.wins ?? ""} className={fieldClass} />
          </Field>
          <Field label="What I learned or what got in the way">
            <textarea name="lessons" rows={2} defaultValue={r.lessons ?? ""} className={fieldClass} />
          </Field>
          <Field label="One change for next week">
            <input name="change" defaultValue={r.change ?? ""} className={fieldClass} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button tone="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              Save review
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ── Plan setup ──────────────────────────────────────────────────────── */

function Setup({ d, c }: { d: PlanData; c: Cycle }) {
  const { run, pending } = useRun();
  const [goal, setGoal] = useState<Partial<Goal> | null>(null);
  const name = (id: number | null) => d.everyone.find((p) => p.id === id)?.name ?? "";
  return (
    <div className="grid gap-4">
      <Panel title="The cycle">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            run(() => saveCycle(c.id, f));
          }}
        >
          <Field label="Name">
            <input name="name" defaultValue={c.name} className={fieldClass} />
          </Field>
          <Field label="Week 1 starts (a Monday)">
            <input name="start" type="date" required defaultValue={c.start} className={fieldClass} />
          </Field>
          <Field label="Winning week score (%)">
            <input name="target" type="number" min={50} max={100} required defaultValue={c.target} className={fieldClass} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={c.status} className={fieldClass}>
              {CYCLE_STATUSES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why these 12 weeks matter (the team sees this at the top)" full>
            <textarea name="vision" rows={2} defaultValue={c.vision} className={fieldClass} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" tone="primary" disabled={pending}>
              Save the cycle
            </Button>
          </div>
        </form>
        {c.status === "draft" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-aqua/60 p-3 text-sm">
            <span className="flex-1">The team can add tactics now. Make it active when you&apos;re happy with the goals, and everyone gets an email.</span>
            <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => activateCycle(c.id))}>
              Make it active
            </Button>
          </div>
        )}
      </Panel>
      <Panel>
        <CardHead title={`Goals · ${c.goals.length} of 3`}>
          <Button size="sm" disabled={c.goals.length >= MAX_GOALS} onClick={() => setGoal({})}>
            <Plus className="size-4" aria-hidden /> Goal
          </Button>
        </CardHead>
        <p className="mb-3 text-sm text-slate">Fewer is better. Each goal needs a start number and a target so progress is never a matter of opinion.</p>
        {c.goals.length ? (
          <ul className="grid">
            {c.goals.map((g) => {
              const a = areaOf(g.area);
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setGoal(g)}
                    className="flex w-full items-center gap-3 border-b border-ink/10 py-2.5 text-left last:border-b-0 hover:bg-cream"
                  >
                    <i className={cn("size-2.5 flex-none rounded-full", AREA_DOT[a[2]])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm">{g.title}</b>
                      <span className="text-xs text-slate">
                        {a[1]} · {fmtGoal(g.unit, g.base)} to {fmtGoal(g.unit, g.target)}
                        {g.owner ? ` · owned by ${first(name(g.owner))}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate">No goals yet.</p>
        )}
      </Panel>
      <GoalDialog d={d} c={c} goal={goal} onClose={() => setGoal(null)} />
    </div>
  );
}

function GoalDialog({ d, c, goal, onClose }: { d: PlanData; c: Cycle; goal: Partial<Goal> | null; onClose: () => void }) {
  const { run, pending } = useRun();
  const g = goal ?? {};
  return (
    <Dialog open={!!goal} onClose={onClose} title={g.id ? "Edit goal" : "New goal"} wide>
      {goal && (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => saveGoal(c.id, g.id ?? null, Object.fromEntries(new FormData(e.currentTarget))))) onClose();
          }}
        >
          <Field label="Goal" full>
            <input name="title" required autoFocus defaultValue={g.title ?? ""} placeholder="e.g. Reach ₦3M confirmed monthly revenue" className={fieldClass} />
          </Field>
          <Field label="Area">
            <select name="area" defaultValue={g.area ?? "revenue"} className={fieldClass}>
              {PLAN_AREAS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Owner">
            <select name="owner" defaultValue={g.owner ?? d.me} className={fieldClass}>
              {d.everyone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="How you'll measure it" full>
            <input name="measure" defaultValue={g.measure ?? ""} placeholder="e.g. Confirmed retainers on the Finance page" className={fieldClass} />
          </Field>
          <Field label="Progress comes from">
            <select name="source" defaultValue={g.source ?? "manual"} className={fieldClass}>
              {GOAL_SOURCES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Unit">
            <select name="unit" defaultValue={g.unit ?? "count"} className={fieldClass}>
              {GOAL_UNITS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Where you're starting">
            <input name="base" type="number" step="any" required defaultValue={g.base ?? ""} className={fieldClass} />
          </Field>
          <Field label="Target by week 12">
            <input name="target" type="number" step="any" required defaultValue={g.target ?? ""} className={fieldClass} />
          </Field>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            {g.id && (
              <Button tone="ghost" disabled={pending} className="text-[#c42b3c]" onClick={async () => (await run(() => deleteGoal(c.id, g.id!))) && onClose()}>
                <Trash2 className="size-4" aria-hidden /> Remove goal
              </Button>
            )}
            <span className="flex-1" />
            <Button tone="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              {g.id ? "Save" : "Add goal"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ── Adding and editing a tactic ─────────────────────────────────────── */

function TacticDialog({ d, c, tactic, onClose }: { d: PlanData; c: Cycle; tactic: Partial<Tactic> | null; onClose: () => void }) {
  const { run, pending } = useRun();
  const t = tactic ?? {};
  const w = clampWk(d.week);
  const [when, setWhen] = useState<string | null>(null);
  const picked = when ?? (t.id ? (t.weeks?.length === 12 ? "all" : "pick") : "all");
  const close = () => (setWhen(null), onClose());
  return (
    <Dialog open={!!tactic} onClose={close} title={t.id ? "Edit tactic" : "New tactic"}>
      {tactic && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = {
              ...Object.fromEntries(new FormData(e.currentTarget)),
              when: picked,
              cycleId: c.id,
            };
            if (await run(() => saveTactic(t.id ?? null, f))) close();
          }}
        >
          <Field label="The weekly action">
            <input name="title" required autoFocus defaultValue={t.title ?? ""} placeholder="e.g. Send 10 personalised pitches" className={fieldClass} />
          </Field>
          <Field label="Moves which goal?">
            <select name="goalId" defaultValue={t.goalId ?? ""} className={fieldClass}>
              <option value="">General</option>
              {c.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </Field>
          {d.owner && !t.id && !d.solo && (
            <Field label="Whose tactic">
              <select name="userId" defaultValue={d.me} className={fieldClass}>
                {d.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id === d.me ? " (you)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">When</legend>
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "Every week"],
                ["rest", `Week ${w} to 12`],
                ["pick", "Pick weeks"],
              ].map(([k, l]) => (
                <label key={k} className="flex cursor-pointer items-center rounded-full border-2 border-ink/15 px-3 py-1 text-sm has-checked:border-ink has-checked:bg-aqua/40">
                  <input type="radio" name="whenPick" value={k} checked={picked === k} onChange={() => setWhen(k)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          {picked === "pick" && (
            <Field label="Weeks" hint="Numbers from 1 to 12, like 1, 3, 5-8">
              <input name="weeks" required defaultValue={t.weeks ? compactWeeks(t.weeks).replace(/ to /g, "-") : ""} placeholder="e.g. 1, 3, 5-8" className={fieldClass} />
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {t.id && (
              <Button tone="ghost" disabled={pending} className="text-[#c42b3c]" onClick={async () => (await run(() => removeTactic(t.id!))) && close()}>
                <Trash2 className="size-4" aria-hidden /> Remove
              </Button>
            )}
            <span className="flex-1" />
            <Button tone="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" tone="primary" disabled={pending}>
              {t.id ? "Save" : "Add tactic"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

/* ── The card on Today ───────────────────────────────────────────────── */

export type PlanCard = {
  cycle: Pick<Cycle, "id" | "name" | "start" | "target" | "goals">;
  week: number;
  mine: Tactic[];
  all: number;
  tasked: string[];
} | null;

export function PlanTodayCard({ p }: { p: PlanCard }) {
  if (!p || p.week > 13) return null;
  const { cycle: c, week: w } = p;
  const head = (label: string) => (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-xs font-bold tracking-[0.06em] text-[#b8114a] uppercase">{label}</span>
      <span className="flex-1" />
      <Link href="/admin/plan" className="text-sm font-semibold underline">
        Open
      </Link>
    </div>
  );
  if (w < 1)
    return (
      <Panel>
        {head("12-week plan")}
        <p className="text-sm">
          {c.name} starts {fmt(c.start)}. {p.all ? `You have ${p.all} tactic${p.all > 1 ? "s" : ""} ready.` : "Add your tactics before then."}
        </p>
      </Panel>
    );
  if (w === 13)
    return (
      <Panel>
        {head("12-week plan · review week")}
        <p className="text-sm">The 12 weeks are done. This week is for reviewing and planning the next cycle.</p>
      </Panel>
    );
  const sc = p.mine.length ? Math.round((p.mine.filter((t) => doneIn(t, w)).length / p.mine.length) * 100) : null;
  return (
    <Panel>
      {head(`12-week plan · week ${w}`)}
      {p.mine.length ? (
        <>
          <div className="mb-1 flex items-center gap-3">
            <Ring value={sc} win={c.target} small />
            <p className="text-sm">
              <b>
                {p.mine.filter((t) => doneIn(t, w)).length} of {p.mine.length}
              </b>{" "}
              done this week.{" "}
              <span className="text-slate">{sc !== null && sc >= c.target ? "A winning week." : `${c.target}% wins the week.`}</span>
            </p>
          </div>
          {p.mine.slice(0, 4).map((t) => (
            <TacticRow key={t.id} t={t} goal={c.goals.find((g) => g.id === t.goalId)} week={w} mine canTick tasked={p.tasked.includes(`${t.id}:${w}`)} />
          ))}
        </>
      ) : (
        <p className="text-sm text-slate">
          No tactics for you this week.{" "}
          <Link href="/admin/plan" className="font-semibold text-ink underline">
            Add one
          </Link>
        </p>
      )}
    </Panel>
  );
}
