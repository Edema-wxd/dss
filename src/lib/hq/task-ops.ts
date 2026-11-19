import "server-only";
import * as store from "../desk/db";
import * as data from "./data";
import { lagosToday, nextRepeat } from "./work";

type Actor = { id: number; name: string; email: string };

/**
 * Marks a task done, starts the next copy when it repeats, and logs it. Shared by the app and
 * the one-tap links in emails so both behave the same.
 */
export async function completeTask(task: data.Task, actor: Actor) {
  await data.updateTask(task.id, { status: "done" });
  const next = nextRepeat(task.repeat, task.due, lagosToday());
  if (next)
    await data.createTask(
      {
        title: task.title,
        assigneeId: task.assigneeId,
        clientId: task.clientId,
        due: next,
        priority: task.priority,
        estimate: task.estimate,
        repeat: task.repeat,
        notes: task.notes,
        checklist: task.checklist.map((c) => ({ t: c.t, done: false })),
        sopId: task.sopId,
      },
      actor.id,
    );
  await store.audit({ actor: actor.name, actorEmail: actor.email, action: "task.done", target: task.title, summary: `Done: ${task.title}${next ? `. Next one due ${next}` : ""}`, changes: null });
  return next;
}
