"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule } from "@/lib/desk/auth";
import { isOwner } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import { notify, ownerId } from "@/lib/hq/notify";
import * as plan from "@/lib/hq/plan";
import { completeTask } from "@/lib/hq/task-ops";
import * as time from "@/lib/hq/time";
import { MOODS, fmtHM, hhmm, lagosStamp, workedMin } from "@/lib/hq/time-model";
import { addDays, lagosToday } from "@/lib/hq/work";

// Clocking in and out. Each person only ever writes their own days, and every time is the server's.

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 4000) => String(v ?? "").slice(0, max).trim();
const first = (n: string) => n.split(" ")[0] || n;

export async function clockInAction(): Promise<ActionResult> {
  const user = await requireModule("time");
  const today = lagosToday();
  const r = await time.clockIn(user.id, today);
  if (!r.ok) return fail(r.error);
  if (r.late && !isOwner(user.ownRoles ?? user.roles))
    await notify(await ownerId(), `${user.name} clocked in ${fmtHM(r.late)} late`, `Clocked in at ${hhmm(r.day.segs[0]?.in)}. Start time is ${(await time.workday()).start}.`, "time", user.id);
  refresh();
  const back = r.day.segs.length > 1;
  return { ok: true, message: back ? "The clock is running again." : r.late ? `Clocked in, ${fmtHM(r.late)} after the start time.` : "You're clocked in. Have a good day." };
}

export async function breakAction(): Promise<ActionResult> {
  const user = await requireModule("time");
  if (!(await time.takeBreak(user.id, lagosToday()))) return fail("You're not clocked in.");
  refresh();
  return { ok: true, message: "Enjoy your break. Tap the clock when you're back." };
}

export type EodPrep = {
  day: string;
  isToday: boolean;
  mins: number;
  expected: number;
  mode: string;
  firstIn: string;
  breaks: number;
  late: number;
  done: string[];
  open: { id: string; title: string }[];
  /** this week's 12-week plan tactics */
  tactics: { id: string; title: string; done: boolean }[];
  tacticWeek: number;
};

/** What the end-of-day report shows: the day so far, what got done, and today's three still open. */
export async function eodPrep(d?: string): Promise<EodPrep | null> {
  const user = await requireModule("time");
  const today = lagosToday();
  const missed = await time.openPastDays(user.id, today);
  const target = d && d !== today ? missed.find((x) => x.day === d)?.day : today;
  if (!target) return null;
  const [row, tasks, standups, w, tac] = await Promise.all([
    time.getDay(user.id, target),
    data.listTasks({ assigneeId: user.id, doneSince: target }),
    data.getStandups(target),
    time.workday(),
    plan.tacticsDueOn(user.id, target),
  ]);
  const top = target === today ? (standups.get(user.id)?.top ?? []) : [];
  const mode = row?.mode || (await time.modeFor(user.id, target));
  return {
    day: target,
    isToday: target === today,
    mins: workedMin(row),
    expected: row?.expectedMin ?? (mode === "full" ? w.fullHours * 60 : mode === "half" ? w.halfHours * 60 : 0),
    mode,
    firstIn: row?.segs[0]?.in ?? "",
    breaks: row?.breaks.length ?? 0,
    late: row?.late ?? 0,
    done: tasks.filter((t) => t.status === "done" && t.doneDay === target).map((t) => t.title),
    open: top.map((id) => tasks.find((t) => t.id === id)).filter((t): t is data.Task => !!t && t.status !== "done").map((t) => ({ id: t.id, title: t.title })),
    tactics: tac.tactics.map((t) => ({ id: t.id, title: t.title, done: !!t.done[String(tac.week)] })),
    tacticWeek: tac.week,
  };
}

/** Clock out with the end-of-day report, for today or a day someone forgot to close. */
export async function clockOutAction(d: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("time");
  const today = lagosToday();
  const isToday = d === today;
  if (!isToday && !(await time.openPastDays(user.id, today)).some((x) => x.day === d)) return fail("That day is already closed.");
  const doneText = text(input.doneText);
  if (!doneText) return fail("Say what you got done.");
  const end = isToday ? null : lagosStamp(d, text(input.endTime, 5));
  // ticked-off tasks from today's three: only the person's own, still open
  const ids = Array.isArray(input.close) ? input.close.map(String) : [];
  const closed: string[] = [];
  for (const id of ids) {
    const t = await data.getTask(id);
    if (t && t.assigneeId === user.id && t.status !== "done") {
      await completeTask(t, user);
      closed.push(t.title);
    }
  }
  // this week's tactics ticked off in the report: only the person's own, due this week
  const tacIds = Array.isArray(input.tac) ? input.tac.map(String) : [];
  let tactics = 0;
  if (tacIds.length) {
    const due = await plan.tacticsDueOn(user.id, d);
    for (const t of due.tactics)
      if (tacIds.includes(t.id) && !t.done[String(due.week)]) {
        await plan.setTacticWeek(t.id, due.week, true);
        tactics++;
      }
  }
  const already = (await data.listTasks({ assigneeId: user.id, doneSince: d })).filter((t) => t.status === "done" && t.doneDay === d && !closed.includes(t.title)).map((t) => t.title);
  const eod = {
    doneText,
    blockers: text(input.blockers),
    tomorrow: text(input.tomorrow, 300),
    mood: (MOODS as readonly string[]).includes(String(input.mood)) ? String(input.mood) : "",
    tasksDone: [...already, ...closed].slice(0, 40),
    tactics,
  };
  const r = await time.closeDay(user.id, d, eod, end);
  // the day's check-in closes too, so the Team page and Command centre show it
  const sd = (await data.getStandups(d)).get(user.id);
  await data.saveStandup(user.id, d, { ...(sd ? {} : { startedAt: r.firstIn, energy: "", top: [] }), closedAt: r.end, doneText, blockers: eod.blockers, tomorrow: eod.tomorrow });
  if (eod.tomorrow && input.addTomorrow) await data.createTask({ title: eod.tomorrow, assigneeId: user.id, due: isToday ? addDays(today, 1) : today, priority: "top" }, user.id);
  if (!isOwner(user.ownRoles ?? user.roles))
    await notify(
      await ownerId(),
      `${user.name} clocked out · ${fmtHM(r.worked)}`,
      `${eod.tasksDone.length} task${eod.tasksDone.length === 1 ? "" : "s"} finished.${eod.blockers ? ` Blocked on: ${eod.blockers.slice(0, 160)}` : ""} Read the full report on the Attendance page.`,
      "time",
      user.id,
    );
  refresh();
  return { ok: true, message: isToday ? `Clocked out after ${fmtHM(r.worked)}. Switch off properly, ${first(user.name)}.` : "That day is closed." };
}

