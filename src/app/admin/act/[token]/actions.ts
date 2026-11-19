"use server";

import * as store from "@/lib/desk/db";
import * as data from "@/lib/hq/data";
import { completeTask } from "@/lib/hq/task-ops";
import { readAction } from "@/lib/hq/tokens";

export type QuickResult = { ok: boolean; message: string };

/** Carries out a one-tap link from an email, after the person taps Confirm. */
export async function confirmQuickAction(token: string): Promise<QuickResult> {
  const a = readAction(token);
  if (!a) return { ok: false, message: "This link has expired. Open HQ to update the task." };
  const person = (await data.listPeople()).find((p) => p.id === a.user && p.active);
  const task = await data.getTask(a.task);
  if (!person) return { ok: false, message: "This link isn't valid any more." };
  if (!task) return { ok: true, message: "That task has already gone. Nothing else to do." };
  if (task.assigneeId !== person.id) return { ok: false, message: "That task belongs to someone else now. Open HQ to see it." };
  const actor = { id: person.id, name: person.name, email: person.email };
  if (a.action === "done") {
    if (task.status !== "done") await completeTask(task, actor);
    return { ok: true, message: `Done: ${task.title}.` };
  }
  if (a.action === "carry") {
    if (a.to && task.due !== a.to) {
      await data.updateTask(task.id, { due: a.to, carried: task.carried + 1 });
      await store.audit({ actor: actor.name, actorEmail: actor.email, action: "task.update", target: task.title, summary: `Carried "${task.title}" to ${a.to} from the check-in email`, changes: null });
    }
    return { ok: true, message: `Moved to ${a.to}: ${task.title}.` };
  }
  await data.deleteTask(task.id);
  await store.audit({ actor: actor.name, actorEmail: actor.email, action: "task.delete", target: task.title, summary: `Dropped "${task.title}" from the check-in email`, changes: null });
  return { ok: true, message: `Dropped: ${task.title}.` };
}
