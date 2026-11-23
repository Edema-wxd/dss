"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import { ownTasksOnly } from "@/lib/hq/access";
import * as A from "@/lib/hq/alerts-model";
import * as data from "@/lib/hq/data";
import { alert } from "@/lib/hq/notify";
import { completeTask } from "@/lib/hq/task-ops";
import { ESTIMATES, PRIORITIES, REPEATS, TASK_STATUS, lagosToday, nextWorkingDay, parseCapture, relDay } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 500) => String(v ?? "").slice(0, max).trim();
const dateOrBlank = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const oneOf = <T extends readonly (readonly [string, string])[]>(list: T, v: unknown, fallback: string) =>
  list.some(([k]) => k === v) ? String(v) : fallback;

const audit = (u: DeskUser, action: string, target: string, summary: string) =>
  store.audit({ actor: u.name, actorEmail: u.email, action, target, summary, changes: null });

/** The task, if this person may touch it. Contractors only reach their own. */
async function reachable(user: DeskUser, id: string) {
  const task = await data.getTask(String(id).slice(0, 40));
  if (!task) return null;
  if (ownTasksOnly(user.roles) && task.assigneeId !== user.id) return null;
  return task;
}

/** Cleans what the task form sends. Only the fields present are returned. */
async function readTask(user: DeskUser, input: Record<string, unknown>): Promise<data.TaskInput | string> {
  const out: data.TaskInput = {};
  if ("title" in input) {
    out.title = text(input.title, 300);
    if (!out.title) return "Give the task a title.";
  }
  if ("assigneeId" in input) {
    const id = input.assigneeId === "" || input.assigneeId === null ? null : Number(input.assigneeId);
    if (ownTasksOnly(user.roles) && id !== user.id) return "You can only give tasks to yourself.";
    if (id !== null && !(await data.listPeople()).some((p) => p.id === id && p.active)) return "That person isn't on the team.";
    out.assigneeId = id;
  }
  if ("due" in input) out.due = dateOrBlank(input.due);
  if ("status" in input) out.status = oneOf(TASK_STATUS, input.status, "todo");
  if ("priority" in input) out.priority = oneOf(PRIORITIES, input.priority, "normal");
  if ("repeat" in input) out.repeat = oneOf(REPEATS, input.repeat, "");
  if ("estimate" in input) out.estimate = ESTIMATES.some(([m]) => m === Number(input.estimate)) ? Number(input.estimate) : null;
  if ("notes" in input) out.notes = text(input.notes, 5000);
  if ("clientId" in input) out.clientId = text(input.clientId, 40) || null;
  if ("checklist" in input)
    out.checklist = (Array.isArray(input.checklist) ? input.checklist : [])
      .slice(0, 60)
      .map((c) => ({ t: text((c as { t?: unknown })?.t, 300), done: Boolean((c as { done?: unknown })?.done) }))
      .filter((c) => c.t);
  return out;
}

/** The capture bar: a quick task for yourself, with any date, "!" and client understood. */
export async function captureTask(raw: string): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const today = lagosToday();
  const p = parseCapture(text(raw, 300), today, await data.listClients());
  if (!p.title) return fail("Type what needs doing.");
  await data.createTask({ title: p.title, assigneeId: user.id, due: p.due ?? "", priority: p.priority, clientId: p.clientId }, user.id);
  await audit(user, "task.create", p.title, `Captured "${p.title}"`);
  refresh();
  return { ok: true, message: `Captured${p.due ? `, due ${relDay(p.due, today).toLowerCase()}` : ""}.` };
}

export async function addTask(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const t = await readTask(user, { assigneeId: user.id, ...input });
  if (typeof t === "string") return fail(t);
  if (!t.title) return fail("Give the task a title.");
  await data.createTask({ ...t, title: t.title }, user.id);
  await alert(t.assigneeId, A.taskGiven(user.name, { title: t.title, due: t.due, notes: t.notes }), user.id);
  const people = await data.listPeople();
  const who = people.find((p) => p.id === t.assigneeId);
  await audit(user, "task.create", t.title, `Added "${t.title}"${who && who.id !== user.id ? ` for ${who.name}` : ""}`);
  refresh();
  return { ok: true, message: who && who.id !== user.id ? `Task added. ${who.name.split(" ")[0]} will see it on their Today.` : "Task added." };
}

export async function saveTask(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const task = await reachable(user, id);
  if (!task) return fail("That task isn't there any more.");
  const t = await readTask(user, input);
  if (typeof t === "string") return fail(t);
  await data.updateTask(task.id, t);
  if (t.assigneeId && t.assigneeId !== task.assigneeId) await alert(t.assigneeId, A.taskPassed(user.name, { title: t.title ?? task.title, due: t.due ?? task.due }), user.id);
  if (t.status === "done" && task.status !== "done") await completeTask({ ...task, ...t } as data.Task, user);
  else if (t.status && t.status !== task.status) await audit(user, "task.update", task.title, `"${task.title}" moved to ${TASK_STATUS.find(([k]) => k === t.status)?.[1]}`);
  refresh();
  return { ok: true, message: "Saved" };
}

/** Ticks a task off, or back on. */
export async function toggleTask(id: string): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const task = await reachable(user, id);
  if (!task) return fail("That task isn't there any more.");
  if (task.status === "done") {
    await data.updateTask(task.id, { status: "todo" });
    refresh();
    return { ok: true, message: "Back on your list." };
  }
  await completeTask(task, user);
  refresh();
  const sd = (await data.getStandups(lagosToday())).get(user.id);
  const tops = sd?.top ?? [];
  if (tops.includes(task.id)) {
    const open = (await data.listTasks({ assigneeId: user.id })).filter((t) => tops.includes(t.id) && t.status !== "done");
    if (!open.length) return { ok: true, message: "That's your three. Brilliant work." };
  }
  return { ok: true, message: task.repeat ? "Done. The next one is on your list." : "Done. Nice." };
}

/** Moves a task to the next working day (Monday after a Friday) and counts the carry. */
export async function carryTask(id: string): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const task = await reachable(user, id);
  if (!task) return fail("That task isn't there any more.");
  const to = nextWorkingDay(lagosToday());
  await data.updateTask(task.id, { due: to, carried: task.carried + 1 });
  await audit(user, "task.update", task.title, `Carried "${task.title}" to ${to}`);
  refresh();
  return { ok: true, message: `Moved to ${relDay(to, lagosToday()).toLowerCase()}.` };
}

export async function removeTask(id: string): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const task = await reachable(user, id);
  if (!task) return fail("That task isn't there any more.");
  await data.deleteTask(task.id);
  await audit(user, "task.delete", task.title, `Deleted "${task.title}"`);
  refresh();
  return { ok: true, message: "Task deleted." };
}

/**
 * The end of a focus session: its minutes go on the task, and "Done with it" ticks the task off.
 * A session is at most an hour, so anything longer than that is cut to it.
 */
export async function endFocus(id: string, mins: number, done: boolean): Promise<ActionResult> {
  const user = await requireModule("tasks");
  const task = await reachable(user, id);
  if (!task) return fail("That task isn't there any more.");
  const spent = Math.max(0, Math.min(60, Math.round(Number(mins) || 0)));
  if (spent) await data.addFocusMins(task.id, spent);
  if (done && task.status !== "done") await completeTask(task, user);
  refresh();
  const time = spent ? `${spent} minute${spent === 1 ? "" : "s"} of focus` : "";
  if (done) return { ok: true, message: time ? `Done, after ${time}. Nice.` : "Done. Nice." };
  return { ok: true, message: time ? `${time[0].toUpperCase()}${time.slice(1)} added to the task.` : "Stopped. Nothing was timed." };
}
