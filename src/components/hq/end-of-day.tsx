"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CornerDownRight, Trash2 } from "lucide-react";
import { closeDay } from "@/app/admin/(hq)/today/actions";
import { carryTask, removeTask, toggleTask } from "@/app/admin/(hq)/tasks/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { Standup, Task } from "@/lib/hq/data";
import { relDay, sortTasks } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { CardHead, DueChip, EmptyNote, Pill, useRun } from "./kit";
import type { WorkProps } from "./tasks";

type Props = { w: WorkProps; standup: Standup | null; next: string; done: Task[]; open: Task[] };

/**
 * The end of the day, in one place: tick off what got done, move or drop what's left, then
 * write the short close (done, blockers, first thing tomorrow). It replaces HQ's "Close my day"
 * and Jane's 7pm check-in conversation.
 */
export function EndOfDay({ w, standup, next, done, open }: Props) {
  const { run, pending } = useRun();
  const nextLabel = relDay(next, w.today).toLowerCase();
  const late = sortTasks(open.filter((t) => t.due && t.due <= w.today));
  const later = sortTasks(open.filter((t) => !late.includes(t)));
  const [doneText, setDoneText] = useState(() => done.map((t) => t.title).join("; "));
  const [blockers, setBlockers] = useState(standup?.blockers ?? "");
  const [tomorrow, setTomorrow] = useState(standup?.tomorrow ?? "");
  const [addTomorrow, setAddTomorrow] = useState(true);
  const [carryRest, setCarryRest] = useState(true);

  if (standup?.closedAt)
    return (
      <Panel>
        <h2 className="text-xl font-bold">Your day is closed.</h2>
        <p className="mt-1 text-slate">That&apos;s a wrap. See you {nextLabel}.</p>
        {standup.tomorrow && (
          <p className="mt-3 text-sm">
            <b>First thing {nextLabel}:</b> {standup.tomorrow}
          </p>
        )}
        <Link href="/admin/today" className={cn(btn.base, btn.plain, "mt-4")}>
          Back to Today
        </Link>
      </Panel>
    );

  const row = (t: Task) => (
    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink/10 py-2.5 first:border-t-0">
      <span className="min-w-0 flex-1">
        <b className="block font-medium">{t.title}</b>
        <span className="flex gap-2 text-xs text-slate">
          <DueChip due={t.due} today={w.today} />
          {t.carried > 0 && <span>carried {t.carried}×</span>}
          {standup?.top?.includes(t.id) && <span className="font-semibold text-pink">one of your three</span>}
        </span>
      </span>
      <span className="flex gap-1.5">
        <Button size="sm" disabled={pending} onClick={() => run(() => toggleTask(t.id))}>
          <Check className="size-3.5" aria-hidden /> Done
        </Button>
        <Button size="sm" disabled={pending} onClick={() => run(() => carryTask(t.id))} title={`Move to ${nextLabel}`}>
          <CornerDownRight className="size-3.5" aria-hidden /> {nextLabel === "tomorrow" ? "Tomorrow" : "Next day"}
        </Button>
        <Button size="sm" tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm(`Drop "${t.title}"? It will be deleted.`) && run(() => removeTask(t.id))}>
          <Trash2 className="size-3.5" aria-hidden /> Drop
        </Button>
      </span>
    </li>
  );

  return (
    <div className="grid gap-4">
      <Panel>
        <CardHead title="Done today" count={done.length} />
        {done.length ? (
          <ul className="grid gap-1">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-[#1e7a4c]" aria-hidden /> {t.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">Nothing ticked off yet. Mark anything you finished below.</p>
        )}
      </Panel>

      <Panel>
        <CardHead title="Still open, due today or earlier" count={late.length} />
        {late.length ? <ul>{late.map(row)}</ul> : <EmptyNote title="Nothing overdue.">Everything due today is done.</EmptyNote>}
        {later.length > 0 && (
          <>
            <h3 className="mt-4 mb-1 font-bold">Later this week</h3>
            <ul>{later.map(row)}</ul>
          </>
        )}
      </Panel>

      <Panel>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => closeDay({ doneText, blockers, tomorrow, addTomorrow, carryRest }));
          }}
        >
          <h2 className="text-lg font-bold">Close my day</h2>
          {!standup && <p className="text-sm text-slate">You didn&apos;t start your day in HQ, so this also counts as today&apos;s check-in.</p>}
          <Field label="What did you get done?">
            <textarea rows={3} value={doneText} onChange={(e) => setDoneText(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="Anything blocking you?" hint="Leave blank if you're clear. The owner sees this on the Command centre.">
            <textarea rows={2} value={blockers} onChange={(e) => setBlockers(e.target.value)} className={fieldClass} />
          </Field>
          <Field label={`First thing ${nextLabel}`}>
            <input value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} placeholder="The one thing you'll start with" className={fieldClass} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={addTomorrow} onChange={(e) => setAddTomorrow(e.target.checked)} className="size-4 accent-pink" />
            Add it to {nextLabel}&apos;s tasks
          </label>
          {late.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={carryRest} onChange={(e) => setCarryRest(e.target.checked)} className="size-4 accent-pink" />
              Move the {late.length} still open to {nextLabel} <Pill>carried count goes up</Pill>
            </label>
          )}
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
            Close my day
          </button>
        </form>
      </Panel>
    </div>
  );
}
