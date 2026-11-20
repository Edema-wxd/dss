"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, MessageCircle, Plus } from "lucide-react";
import { addTodayTask, startDay, swapThree } from "@/app/admin/(hq)/today/actions";
import { toggleTask } from "@/app/admin/(hq)/tasks/actions";
import { quickTouch } from "@/app/admin/(hq)/crm/actions";
import { QUICK_TOUCHES } from "@/lib/hq/sales-model";
import { Button, Panel, btn, fieldClass, useToast } from "@/components/desk/ui";
import type { ClientLite, ContactLite, KpiWithState, Standup, Task } from "@/lib/hq/data";
import { formatKpi, minutes, relDay, sortTasks } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { type PlanCard, PlanTodayCard } from "./plan";
import { Bar, CardHead, Dialog, DueChip, EmptyNote, Pill, useRun } from "./kit";
import { TaskEditor, TaskRow, type WorkProps } from "./tasks";

export type TodayProps = {
  w: WorkProps;
  banners: { text: string; href: string; action: string }[];
  cards: { title: string; href: string; items: { title: string; sub: string }[] }[];
  greeting: string;
  tasks: Task[];
  standup: Standup | null;
  calls: ContactLite[];
  clients: ClientLite[];
  kpis: KpiWithState[];
  hours: number;
  plan: PlanCard;
};

/** The moving strip. HQ keeps it to Today and the sign-in screen; working pages stay calm. */
export function Tape({ words }: { words: string[] }) {
  const run = words.map((w, i) => (
    <span key={i} className="px-5 font-display text-sm font-bold whitespace-nowrap">
      {w} <span className="text-pink">✦</span>
    </span>
  ));
  return (
    <div aria-hidden className="mb-5 overflow-hidden rounded-full bg-ink py-2 text-white">
      <div className="flex w-max animate-marquee">
        {run}
        {run}
        {run}
        {run}
      </div>
    </div>
  );
}

export function TodayView(p: TodayProps) {
  const { w, standup: sd } = p;
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [swapping, setSwapping] = useState(false);
  const open = p.tasks.filter((t) => t.status !== "done");
  const overdue = sortTasks(open.filter((t) => t.due && t.due < w.today));
  const dueToday = sortTasks(open.filter((t) => t.due === w.today));
  const doneToday = p.tasks.filter((t) => t.status === "done" && t.doneDay === w.today);
  const topIds = sd?.top ?? [];
  const tops = topIds.map((id) => p.tasks.find((t) => t.id === id)).filter((t): t is Task => Boolean(t));
  const nextUp = tops.find((t) => t.status !== "done");
  const rest = sortTasks([...overdue, ...dueToday].filter((t) => !topIds.includes(t.id)));
  const planned = [...new Set([...tops.filter((t) => t.status !== "done"), ...dueToday, ...overdue])].reduce((s, t) => s + (t.estimate || 0), 0);
  const pct = Math.round((planned / (p.hours * 60)) * 100);
  const sub = sd
    ? sd.closedAt
      ? "Day closed. Rest well."
      : `${tops.filter((t) => t.status === "done").length} of ${tops.length} done, ${doneToday.length} finished today`
    : "Pick your three before anything else.";

  return (
    <>
      <div className="mb-4">
        <p className="mb-2 font-display text-[13px] font-bold tracking-[0.05em] text-[#b8114a]">Digital Savvy Studios</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
          {p.greeting}, <em className="text-pink">{w.me.name.split(" ")[0]}.</em>
        </h1>
        <p className="mt-1 text-slate">{sub}</p>
      </div>
      <Tape words={["Excellence, made visible", "One thing at a time", "Done beats perfect", "Protect your focus", "Make the call"]} />
      {p.banners.map((b) => (
        <div key={b.href + b.text} className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-[#eceef8] p-3 text-sm">
          <span className="flex-1">{b.text}</span>
          <Link href={b.href} className={cn(btn.base, btn.plain, btn.sm)}>
            {b.action}
          </Link>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          {!sd ? (
            <StartDay w={w} open={open} />
          ) : nextUp ? (
            <section aria-labelledby="first-h" className="rounded-[22px] border-2 border-ink bg-lime/50 p-5">
              <span className="text-xs font-bold tracking-[0.08em] uppercase">Do this first</span>
              <h2 id="first-h" className="mt-1 text-2xl font-bold tracking-[-0.02em]">
                {nextUp.title}
              </h2>
              <p className="mt-1 text-sm text-ink/70">
                {[nextUp.estimate ? `about ${minutes(nextUp.estimate)}` : "", nextUp.due ? `due ${relDay(nextUp.due, w.today).toLowerCase()}` : ""].filter(Boolean).join(", ")}
              </p>
              <DoneOrDetails task={nextUp} onOpen={setEditing} />
            </section>
          ) : (
            <section className="rounded-[22px] border-2 border-ink bg-lime/50 p-5">
              <span className="text-xs font-bold tracking-[0.08em] uppercase">{sd.closedAt ? "Day closed" : "All three done"}</span>
              <h2 className="mt-1 text-2xl font-bold">{sd.closedAt ? "That's a wrap. See you tomorrow." : "Your three are done. That's a good day."}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {!sd.closedAt && (
                  <Link href="/admin/today/end" className={cn(btn.base, btn.primary)}>
                    Close my day
                  </Link>
                )}
                <Button onClick={() => setSwapping(true)}>Pick three more</Button>
              </div>
            </section>
          )}

          {sd && tops.length > 0 && (
            <Panel>
              <CardHead title="Your three">
                <Button size="sm" tone="ghost" onClick={() => setSwapping(true)}>
                  Change
                </Button>
              </CardHead>
              {tops.map((t, i) => (
                <div key={t.id} className="flex items-start gap-2">
                  <span className="mt-2.5 w-4 font-display font-bold text-pink">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <TaskRow task={t} w={w} onOpen={setEditing} />
                  </div>
                </div>
              ))}
            </Panel>
          )}

          <Panel>
            <CardHead title={rest.length ? "Also on your plate" : "Your plate"} count={rest.length}>
              <Link href="/admin/tasks" className="text-sm font-semibold text-pink underline">
                All my tasks
              </Link>
            </CardHead>
            {rest.length ? (
              <>
                {rest.slice(0, 12).map((t) => (
                  <TaskRow key={t.id} task={t} w={w} onOpen={setEditing} />
                ))}
                {overdue.length > 0 && <p className="mt-2 text-xs text-slate">Red dates were carried over. Move them to a new day or finish them.</p>}
              </>
            ) : (
              <EmptyNote title="Nothing else due today.">Capture anything new in the bar at the top.</EmptyNote>
            )}
            {doneToday.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-slate">{doneToday.length} done today</summary>
                {doneToday.map((t) => (
                  <TaskRow key={t.id} task={t} w={w} onOpen={setEditing} />
                ))}
              </details>
            )}
          </Panel>

          {sd && !sd.closedAt && (
            <section className="flex flex-wrap items-center gap-3 rounded-[20px] bg-paper p-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold">Wrapping up?</h2>
                <p className="text-sm text-slate">Two minutes: what you finished, what&apos;s blocked, what&apos;s first tomorrow.</p>
              </div>
              <Link href="/admin/today/end" className={cn(btn.base, btn.primary)}>
                Close my day
              </Link>
            </section>
          )}
        </div>

        <div className="grid content-start gap-4">
          <PlanTodayCard p={p.plan} />
          <Calls calls={p.calls} today={w.today} />
          {p.cards.map((c) => (
            <Panel key={c.title}>
              <CardHead title={c.title} count={c.items.length}>
                <Link href={c.href} className="text-sm font-semibold text-pink underline">
                  Open
                </Link>
              </CardHead>
              {c.items.slice(0, 8).map((x, i) => (
                <div key={i} className="border-t border-ink/10 py-2 first:border-t-0">
                  <b className="block text-sm font-semibold">{x.title}</b>
                  <span className="text-xs text-slate">{x.sub}</span>
                </div>
              ))}
            </Panel>
          ))}
          <Panel>
            <CardHead title="Today's load">
              <span className="text-sm text-slate">
                {minutes(planned) || "0m"} of {p.hours}h
              </span>
            </CardHead>
            <Bar pct={pct} tone={pct > 85 ? "bad" : "ok"} label="Planned time against your day" />
            <p className="mt-2 text-xs text-slate">
              {planned > p.hours * 60 ? "You've planned more than your day. Move something to tomorrow." : planned === 0 ? "Add time estimates to tasks to see your load." : "Room to breathe. Protect it."}
            </p>
          </Panel>
          {p.clients.length > 0 && (
            <Panel>
              <CardHead title="Clients needing you" />
              {p.clients.map((c) => (
                <div key={c.id} className="flex items-center gap-2 border-t border-ink/10 py-2 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block font-medium">{c.name}</b>
                    <span className="text-xs text-slate">
                      {c.nextDeliverable || "Check in"}
                      {c.nextDate ? `, ${relDay(c.nextDate, w.today).toLowerCase()}` : ""}
                    </span>
                  </div>
                  {c.health === "risk" && <Pill tone="bad">At risk</Pill>}
                </div>
              ))}
            </Panel>
          )}
          {p.kpis.length > 0 && (
            <Panel>
              <CardHead title="My KPIs">
                <Link href="/admin/kpis" className="text-sm font-semibold text-pink underline">
                  Update numbers
                </Link>
              </CardHead>
              <div className="grid gap-3">
                {p.kpis.map((k) => (
                  <div key={k.id} className="grid gap-1.5">
                    <div className="flex gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{k.title}</span>
                      <span className="text-slate tabular-nums">
                        {formatKpi(k.unit, k.actual)} / {formatKpi(k.unit, k.target)}
                      </span>
                    </div>
                    <Bar pct={k.pct} label={k.title} />
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <TaskEditor task={editing} w={w} onClose={() => setEditing(null)} />
      <SwapThree open={swapping} onClose={() => setSwapping(false)} tasks={open} current={topIds} />
    </>
  );
}

function DoneOrDetails({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const { run, pending } = useRun();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={pending} onClick={() => run(() => toggleTask(task.id))} className={cn(btn.base, btn.primary)}>
        <Check className="size-4" aria-hidden /> Done
      </button>
      <Button onClick={() => onOpen(task)}>Details</Button>
    </div>
  );
}

function StartDay({ w, open }: { w: WorkProps; open: Task[] }) {
  const { run, pending } = useRun();
  const [energy, setEnergy] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const cands = sortTasks(open).slice(0, 40);
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));

  return (
    <section aria-labelledby="sd-h" className="grid gap-4 rounded-[22px] border-2 border-ink bg-aqua/50 p-5">
      <div>
        <Pill tone="plain">{relDay(w.today, w.today)}</Pill>
        <h2 id="sd-h" className="mt-2 text-2xl font-bold tracking-[-0.02em]">
          Start your day. <em className="text-pink">Choose three.</em>
        </h2>
        <p className="text-sm text-slate">Three things that would make today a good day. Everything else can wait.</p>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-xs font-bold tracking-[0.04em] text-slate">How&apos;s your energy?</legend>
        <div className="flex gap-2">
          {["Low", "Steady", "High"].map((e) => (
            <button key={e} type="button" aria-pressed={energy === e} onClick={() => setEnergy(e)} className={cn("rounded-full border-2 border-ink px-3.5 py-1 text-sm font-semibold", energy === e ? "bg-ink text-white" : "bg-white")}>
              {e}
            </button>
          ))}
        </div>
      </fieldset>
      {cands.length ? (
        <div role="group" aria-label="Your open tasks" className="grid max-h-[320px] gap-1 overflow-y-auto rounded-2xl bg-white p-2">
          {cands.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-paper has-checked:bg-lime/40">
              <input type="checkbox" checked={pick.includes(t.id)} onChange={() => toggle(t.id)} disabled={!pick.includes(t.id) && pick.length >= 3} className="size-4 accent-pink" />
              <span className="min-w-0 flex-1">{t.title}</span>
              <DueChip due={t.due} today={w.today} />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate">No open tasks yet. Add your first one below.</p>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = title.trim();
          if (!t) return;
          run(async () => {
            const r = await addTodayTask(t);
            if (r.ok && r.id) setPick((p) => (p.length < 3 ? [...p, r.id!] : p));
            return r;
          }).then((ok) => ok && setTitle(""));
        }}
      >
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add something new for today" aria-label="New task for today" className={fieldClass} />
        <Button type="submit" disabled={pending}>
          <Plus className="size-4" aria-hidden /> Add
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!pick.length || pending} onClick={() => run(() => startDay(pick, energy))} className={cn(btn.base, btn.primary)}>
          Start my day <ArrowRight className="size-4" aria-hidden />
        </button>
        <span className="text-sm text-slate">{pick.length}/3 chosen</span>
      </div>
    </section>
  );
}

function SwapThree({ open, onClose, tasks, current }: { open: boolean; onClose: () => void; tasks: Task[]; current: string[] }) {
  const { run, pending } = useRun();
  const [pick, setPick] = useState<string[]>(current.filter((id) => tasks.some((t) => t.id === id)));
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));
  return (
    <Dialog open={open} onClose={onClose} title="Your three">
      <p className="text-sm text-slate">Pick up to three open tasks.</p>
      <div className="grid max-h-[50dvh] gap-1 overflow-y-auto">
        {sortTasks(tasks).map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-paper has-checked:bg-lime/40">
            <input type="checkbox" checked={pick.includes(t.id)} onChange={() => toggle(t.id)} disabled={!pick.includes(t.id) && pick.length >= 3} className="size-4 accent-pink" />
            {t.title}
          </label>
        ))}
      </div>
      <button type="button" disabled={!pick.length || pending} onClick={() => run(() => swapThree(pick)).then((ok) => ok && onClose())} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Save my three
      </button>
    </Dialog>
  );
}

function Calls({ calls, today }: { calls: ContactLite[]; today: string }) {
  const toast = useToast();
  const { run, pending } = useRun();
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select the number and copy it by hand.");
    }
  };
  return (
    <Panel>
      <CardHead title="Calls and follow-ups" count={calls.length} />
      {calls.length ? (
        <div className="grid gap-2">
          {calls.slice(0, 8).map((c) => {
            const number = c.whatsapp || c.phone;
            return (
              <div key={c.id} className="grid gap-1.5 rounded-2xl bg-paper/70 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate font-semibold">
                      {c.name}
                      {c.company && <span className="font-normal text-slate">, {c.company}</span>}
                    </b>
                    <span className="text-xs text-slate">
                      {c.nextAction || "Follow up"}, {relDay(c.nextDate, today).toLowerCase()}
                    </span>
                  </div>
                  <Pill tone={c.kind === "talent" ? "sky" : "lime"}>{c.kind === "talent" ? "Talent" : "Sales"}</Pill>
                </div>
                {(number || c.email) && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="tabular-nums">{number || c.email}</span>
                    <Button size="sm" onClick={() => copy(number || c.email)}>
                      <Copy className="size-3.5" aria-hidden /> Copy
                    </Button>
                    {c.whatsapp && (
                      <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.plain, btn.sm)}>
                        <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
                      </a>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate">Log:</span>
                  {QUICK_TOUCHES.map(([k, l]) => (
                    <Button key={k} size="sm" disabled={pending} onClick={() => run(() => quickTouch(c.id, k))}>
                      {l}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyNote title="No follow-ups due.">Set a next follow-up on any contact and it lands here on the day.</EmptyNote>
      )}
    </Panel>
  );
}
