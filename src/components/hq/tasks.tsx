"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock, Play, Plus, Search, Trash2, Zap } from "lucide-react";
import { addTask, captureTask, carryTask, removeTask, saveTask, toggleTask } from "@/app/savvy-hq/(hq)/tasks/actions";
import { Button, Field, btn, fieldClass } from "@/components/desk/ui";
import type { ChecklistItem, Task } from "@/lib/hq/data";
import { ESTIMATES, PRIORITIES, REPEATS, TASK_STATUS, addDays, minutes, relDay, sortTasks, weekStart } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { useFocus } from "./focus";
import { Avatar, Dialog, DueChip, EmptyNote, Pill, useRun } from "./kit";

export type Named = { id: number; name: string };
export type ClientOpt = { id: string; name: string };
export type WorkProps = { people: Named[]; clients: ClientOpt[]; me: Named; today: string; ownOnly: boolean };

const nameOf = (people: Named[], id: number | null) => people.find((p) => p.id === id)?.name ?? "";
const clientName = (clients: ClientOpt[], id: string | null) => clients.find((c) => c.id === id)?.name ?? "";

/* ── One task in a list ──────────────────────────────────────────────── */

export function TaskRow({ task, w, onOpen, showWho }: { task: Task; w: WorkProps; onOpen: (t: Task) => void; showWho?: boolean }) {
  const { run, pending } = useRun();
  const done = task.status === "done";
  const ck = task.checklist;
  return (
    <div className="flex items-start gap-3 border-t border-ink/10 py-2.5 first:border-t-0">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark ${task.title} ${done ? "not done" : "done"}`}
        disabled={pending}
        onClick={() => run(() => toggleTask(task.id))}
        className={cn("mt-0.5 grid size-6 flex-none place-items-center rounded-full border-2 border-ink", done ? "bg-ink text-lime" : "bg-white text-transparent hover:text-ink/30")}
      >
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </button>
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <span className={cn("block font-medium", done && "text-slate line-through")}>
          {task.priority === "top" && <Pill tone="rose" className="mr-1.5 align-[1px]">Top</Pill>}
          {task.title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate">
          {task.clientId && <span className="font-semibold text-ink/80">{clientName(w.clients, task.clientId)}</span>}
          <DueChip due={task.due} today={w.today} done={done} />
          {task.estimate ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              {minutes(task.estimate)}
            </span>
          ) : null}
          {ck.length > 0 && (
            <span>
              {ck.filter((c) => c.done).length}/{ck.length}
            </span>
          )}
          {task.carried > 0 && !done && <span>carried {task.carried}×</span>}
        </span>
      </button>
      {showWho && task.assigneeId && <Avatar name={nameOf(w.people, task.assigneeId)} />}
    </div>
  );
}

/* ── New task and edit panel ─────────────────────────────────────────── */

type Draft = {
  title: string;
  assigneeId: string;
  clientId: string;
  due: string;
  estimate: string;
  priority: string;
  repeat: string;
  status: string;
  notes: string;
  checklist: ChecklistItem[];
};

const draftOf = (t: Partial<Task>, me: number): Draft => ({
  title: t.title ?? "",
  assigneeId: t.assigneeId === undefined ? String(me) : t.assigneeId === null ? "" : String(t.assigneeId),
  clientId: t.clientId ?? "",
  due: t.due ?? "",
  estimate: t.estimate ? String(t.estimate) : "",
  priority: t.priority ?? "normal",
  repeat: t.repeat ?? "",
  status: t.status ?? "todo",
  notes: t.notes ?? "",
  checklist: t.checklist ?? [],
});

/** The task form, for a new task (no id) or an existing one. */
export function TaskEditor({ task, w, onClose }: { task: Partial<Task> | null; w: WorkProps; onClose: () => void }) {
  return (
    <Dialog open={task !== null} onClose={onClose} title={task?.id ? "Task" : "New task"} side={Boolean(task?.id)}>
      {task && <TaskForm key={task.id ?? "new"} task={task} w={w} onClose={onClose} />}
    </Dialog>
  );
}

function TaskForm({ task, w, onClose }: { task: Partial<Task>; w: WorkProps; onClose: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState<Draft>(() => draftOf(task, w.me.id));
  const [step, setStep] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const isNew = !task.id;
  const focus = useFocus();
  const canFocus = !isNew && task.status !== "done" && focus;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...d, estimate: d.estimate ? Number(d.estimate) : "" };
    const ok = await run(() => (isNew ? addTask(body) : saveTask(task.id!, body)));
    if (ok) onClose();
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {(canFocus || Boolean(task.focusMins)) && (
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          {canFocus && (
            <button
              type="button"
              onClick={() => {
                onClose();
                focus({ id: task.id!, title: task.title ?? "" });
              }}
              className={cn(btn.base, btn.primary, btn.sm)}
            >
              <Play className="size-4" aria-hidden /> Focus on this
            </button>
          )}
          {Boolean(task.focusMins) && <span className="text-sm text-slate">{minutes(task.focusMins)} focused so far</span>}
        </div>
      )}
      <Field label="What needs doing?" full>
        <input autoFocus={isNew} required value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="Start with a verb: Draft, Send, Call, Review" className={fieldClass} />
      </Field>
      {!isNew && (
        <Field label="Status">
          <select value={d.status} onChange={(e) => set("status", e.target.value)} className={fieldClass}>
            {TASK_STATUS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Who">
        <select value={d.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} disabled={w.ownOnly} className={fieldClass}>
          {!w.ownOnly && <option value="">Unassigned</option>}
          {(w.ownOnly ? [w.me] : w.people).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === w.me.id ? " (you)" : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Client">
        <select value={d.clientId} onChange={(e) => set("clientId", e.target.value)} className={fieldClass}>
          <option value="">No client</option>
          {w.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Due">
        <input type="date" value={d.due} onChange={(e) => set("due", e.target.value)} className={fieldClass} />
      </Field>
      <Field label="Time it needs">
        <select value={d.estimate} onChange={(e) => set("estimate", e.target.value)} className={fieldClass}>
          <option value="">Not sure</option>
          {ESTIMATES.map(([m, l]) => (
            <option key={m} value={m}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Repeats">
        <select value={d.repeat} onChange={(e) => set("repeat", e.target.value)} className={fieldClass}>
          {REPEATS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <fieldset className="grid gap-1 sm:col-span-2">
        <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Priority</legend>
        <div className="flex gap-2">
          {PRIORITIES.map(([k, l]) => (
            <label key={k} className="cursor-pointer rounded-full border-2 border-ink px-3.5 py-1 text-sm font-semibold has-checked:bg-ink has-checked:text-white">
              <input type="radio" name="priority" value={k} checked={d.priority === k} onChange={() => set("priority", k)} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Notes" full>
        <textarea rows={3} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Links, context, what done looks like" className={fieldClass} />
      </Field>
      <fieldset className="grid gap-1.5 sm:col-span-2">
        <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Checklist</legend>
        {d.checklist.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={c.done}
              aria-label={`${c.t} done`}
              onChange={(e) => set("checklist", d.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))}
              className="size-4 accent-pink"
            />
            <span className={cn("flex-1 text-sm", c.done && "text-slate line-through")}>{c.t}</span>
            <button type="button" aria-label={`Remove ${c.t}`} onClick={() => set("checklist", d.checklist.filter((_, j) => j !== i))} className="text-slate hover:text-pink">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={step}
            onChange={(e) => setStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && step.trim()) {
                e.preventDefault();
                set("checklist", [...d.checklist, { t: step.trim(), done: false }]);
                setStep("");
              }
            }}
            placeholder="Add a step and press Enter"
            aria-label="New checklist step"
            className={fieldClass}
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          {isNew ? "Add task" : "Save"}
        </button>
        {!isNew && d.status !== "done" && (
          <Button disabled={pending} onClick={() => run(() => carryTask(task.id!)).then((ok) => ok && onClose())}>
            Move to next working day
          </Button>
        )}
        <span className="flex-1" />
        {!isNew && (
          <Button
            tone="ghost"
            className="text-pink"
            disabled={pending}
            onClick={() => window.confirm(`Delete "${task.title}"?`) && run(() => removeTask(task.id!)).then((ok) => ok && onClose())}
          >
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        )}
      </div>
    </form>
  );
}

/* ── The capture bar ─────────────────────────────────────────────────── */

export function CaptureBar() {
  const { run, pending } = useRun();
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) run(() => captureTask(v)).then((ok) => ok && setV(""));
      }}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-full border-2 border-ink/15 bg-white px-3 focus-within:border-ink"
    >
      <Zap className="size-4 flex-none text-pink" aria-hidden />
      <label htmlFor="capture" className="sr-only">
        Capture a task
      </label>
      <input
        id="capture"
        value={v}
        disabled={pending}
        onChange={(e) => setV(e.target.value)}
        placeholder="Capture a task: add today, tomorrow or a weekday, ! for top priority"
        className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none placeholder:text-[#8a8a8e]"
      />
    </form>
  );
}

/* ── The Tasks page ──────────────────────────────────────────────────── */

const VIEWS = [
  ["board", "Board"],
  ["week", "Week"],
  ["list", "List"],
] as const;

export function TasksView({ tasks, w }: { tasks: Task[]; w: WorkProps }) {
  const { run } = useRun();
  const [view, setView] = useState<(typeof VIEWS)[number][0]>("board");
  const [who, setWho] = useState(String(w.me.id));
  const [client, setClient] = useState("");
  const [q, setQ] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        (who === "all" || (who === "none" ? t.assigneeId === null : t.assigneeId === Number(who))) &&
        (!client || t.clientId === client) &&
        (!s || `${t.title} ${t.notes}`.toLowerCase().includes(s)),
    );
  }, [tasks, who, client, q]);
  const open = list.filter((t) => t.status !== "done");

  const drop = (patch: Record<string, unknown>) => {
    if (dragId) run(() => saveTask(dragId, patch));
    setDragId(null);
  };
  const card = (t: Task) => (
    <article
      key={t.id}
      draggable
      onDragStart={() => setDragId(t.id)}
      onDragEnd={() => setDragId(null)}
      className="cursor-grab rounded-2xl border-2 border-ink/15 bg-white p-3 hover:border-ink active:cursor-grabbing"
    >
      <button type="button" onClick={() => setEditing(t)} className="grid w-full gap-1.5 text-left">
        <span className="flex flex-wrap gap-1">
          {t.priority === "top" && <Pill tone="rose">Top</Pill>}
          {t.priority === "high" && <Pill tone="sunset">High</Pill>}
          {t.clientId && <Pill>{clientName(w.clients, t.clientId)}</Pill>}
        </span>
        <span className="font-medium">{t.title}</span>
        <span className="flex items-center gap-2 text-xs text-slate">
          {t.assigneeId && <Avatar name={nameOf(w.people, t.assigneeId)} />}
          <DueChip due={t.due} today={w.today} done={t.status === "done"} />
          <span className="flex-1" />
          {t.checklist.length > 0 && `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`}
          {t.estimate ? ` ${minutes(t.estimate)}` : ""}
        </span>
      </button>
    </article>
  );

  let body: React.ReactNode;
  if (view === "board") {
    const cutoff = addDays(w.today, -14);
    body = (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUS.map(([k, l]) => {
          const items = sortTasks(list.filter((t) => (t.status || "todo") === k && (k !== "done" || t.doneDay >= cutoff)));
          return (
            <section
              key={k}
              aria-label={l}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => drop({ status: k })}
              className={cn("grid content-start gap-2 rounded-[20px] bg-paper/70 p-2.5", dragId && "outline-2 outline-dashed outline-ink/20")}
            >
              <h2 className="flex items-center gap-2 px-1 text-sm font-bold">
                {l} <Pill>{items.length}</Pill>
                {k === "todo" && (
                  <button type="button" aria-label="Add task" onClick={() => setEditing({ status: "todo" })} className="ml-auto grid size-7 place-items-center rounded-full hover:bg-white">
                    <Plus className="size-4" aria-hidden />
                  </button>
                )}
              </h2>
              {items.map(card)}
              {!items.length && <p className="px-1 text-xs text-slate">{k === "done" ? "Finished in the last two weeks." : "Drop tasks here."}</p>}
            </section>
          );
        })}
      </div>
    );
  } else if (view === "week") {
    const mon = addDays(weekStart(w.today), weekOffset * 7);
    const days = [...Array(7)].map((_, i) => addDays(mon, i));
    const undated = open.filter((t) => !t.due).length;
    body = (
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" aria-label="Previous week" onClick={() => setWeekOffset((n) => n - 1)}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <b>
            {relDay(days[0], "")} to {relDay(days[6], "")}
          </b>
          <Button size="sm" aria-label="Next week" onClick={() => setWeekOffset((n) => n + 1)}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {weekOffset !== 0 && (
            <Button size="sm" tone="ghost" onClick={() => setWeekOffset(0)}>
              This week
            </Button>
          )}
          {undated > 0 && <span className="text-sm text-slate">{undated} open tasks have no date. Drag a card onto a day to schedule it.</span>}
        </div>
        <div className="grid gap-2 md:grid-cols-7">
          {days.map((d) => {
            const items = sortTasks(list.filter((t) => t.due === d));
            return (
              <section
                key={d}
                aria-label={d}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop({ due: d })}
                className={cn("grid content-start gap-2 rounded-[20px] bg-paper/70 p-2", d === w.today && "ring-2 ring-pink")}
              >
                <h2 className="px-1 text-sm font-bold">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })}</h2>
                {items.map(card)}
                <Button size="sm" tone="ghost" onClick={() => setEditing({ due: d })}>
                  <Plus className="size-4" aria-hidden /> Add
                </Button>
              </section>
            );
          })}
        </div>
      </>
    );
  } else {
    const groups: [string, (t: Task) => boolean][] = [
      ["Overdue", (t) => Boolean(t.due) && t.due < w.today],
      ["Today", (t) => t.due === w.today],
      ["This week", (t) => t.due > w.today && t.due <= addDays(w.today, 7)],
      ["Later", (t) => t.due > addDays(w.today, 7)],
      ["No date", (t) => !t.due],
    ];
    const sections = groups.map(([g, f]) => [g, sortTasks(open.filter(f))] as const).filter(([, items]) => items.length);
    body = sections.length ? (
      <div className="grid gap-4">
        {sections.map(([g, items]) => (
          <section key={g} className="rounded-[20px] border-2 border-ink bg-white p-4">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
              {g} <Pill tone={g === "Overdue" ? "bad" : "plain"}>{items.length}</Pill>
            </h2>
            {items.map((t) => (
              <TaskRow key={t.id} task={t} w={w} onOpen={setEditing} showWho={who !== String(w.me.id)} />
            ))}
          </section>
        ))}
      </div>
    ) : (
      <EmptyNote title="No open tasks here.">Use the capture bar or New task to add one.</EmptyNote>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="View" className="flex rounded-full border-2 border-ink bg-white p-0.5">
          {VIEWS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={cn("rounded-full px-3.5 py-1 text-sm font-semibold", view === k && "bg-ink text-white")}>
              {l}
            </button>
          ))}
        </div>
        {!w.ownOnly && (
          <select aria-label="Whose tasks" value={who} onChange={(e) => setWho(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
            <option value={w.me.id}>My tasks</option>
            <option value="all">Everyone</option>
            <option value="none">Unassigned</option>
            {w.people
              .filter((p) => p.id !== w.me.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        )}
        <select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
          <option value="">All clients</option>
          {w.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-full border-2 border-ink bg-white px-3">
          <Search className="size-4 text-slate" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none" />
        </label>
        <button type="button" onClick={() => setEditing({})} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> New task
        </button>
      </div>
      <p className="mb-3 text-sm text-slate">
        {open.length} open{view !== "list" ? ". Drag cards to change " + (view === "week" ? "the day." : "status.") : "."}
      </p>
      {body}
      <TaskEditor task={editing} w={w} onClose={() => setEditing(null)} />
    </>
  );
}
