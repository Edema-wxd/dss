"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import * as data from "@/lib/hq/data";
import { lagosToday, nextWorkingDay, relDay } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 2000) => String(v ?? "").slice(0, max).trim();
const audit = (u: DeskUser, action: string, summary: string) =>
  store.audit({ actor: u.name, actorEmail: u.email, action, target: lagosToday(), summary, changes: null });

/** Only the person's own open tasks can be picked as their three. */
async function ownOpenIds(user: DeskUser, ids: unknown) {
  const mine = new Set((await data.listTasks({ assigneeId: user.id })).filter((t) => t.status !== "done").map((t) => t.id));
  return (Array.isArray(ids) ? ids : []).map(String).filter((id) => mine.has(id)).slice(0, 3);
}

/** Start my day: up to three tasks, and how the energy is. */
export async function startDay(ids: string[], energy: string): Promise<ActionResult> {
  const user = await requireModule("today");
  const top = await ownOpenIds(user, ids);
  if (!top.length) return fail("Pick at least one task to start with.");
  await data.saveStandup(user.id, lagosToday(), {
    startedAt: new Date().toISOString(),
    energy: ["Low", "Steady", "High"].includes(energy) ? energy : "",
    top,
  });
  await audit(user, "day.start", `${user.name} started the day with ${top.length} task${top.length === 1 ? "" : "s"}`);
  refresh();
  return { ok: true, message: "Your day has started. One thing at a time." };
}

/** Change the three after the day has started. */
export async function swapThree(ids: string[]): Promise<ActionResult> {
  const user = await requireModule("today");
  const top = await ownOpenIds(user, ids);
  if (!top.length) return fail("Pick at least one task.");
  const sd = (await data.getStandups(lagosToday())).get(user.id);
  await data.saveStandup(user.id, lagosToday(), sd ? { top } : { startedAt: new Date().toISOString(), energy: "", top });
  refresh();
  return { ok: true, message: "Your three are updated." };
}

/** A new task for today, straight from the start-of-day picker. Returns its id in the message for the picker. */
export async function addTodayTask(title: string): Promise<ActionResult & { id?: string }> {
  const user = await requireModule("today");
  const t = text(title, 300);
  if (!t) return fail("Type what needs doing.");
  const id = await data.createTask({ title: t, assigneeId: user.id, due: lagosToday(), priority: "top" }, user.id);
  refresh();
  return { ok: true, message: "Added to today.", id };
}

/**
 * Close my day: what got done, what's blocking, the first thing tomorrow. Anything still open and
 * due today or earlier can move to the next working day in the same step, as HQ's evening
 * check-in did by default.
 */
export async function closeDay(input: { doneText: unknown; blockers: unknown; tomorrow: unknown; addTomorrow: unknown; carryRest: unknown }): Promise<ActionResult> {
  const user = await requireModule("today");
  const today = lagosToday();
  const next = nextWorkingDay(today);
  const doneText = text(input.doneText);
  const blockers = text(input.blockers);
  const tomorrow = text(input.tomorrow, 300);
  const sd = (await data.getStandups(today)).get(user.id);
  const now = new Date().toISOString();
  await data.saveStandup(user.id, today, { ...(sd ? {} : { startedAt: now, energy: "", top: [] }), closedAt: now, doneText, blockers, tomorrow });

  let carried = 0;
  if (input.carryRest === true) {
    for (const t of await data.listTasks({ assigneeId: user.id })) {
      if (t.status !== "done" && t.due && t.due <= today) {
        await data.updateTask(t.id, { due: next, carried: t.carried + 1 });
        carried++;
      }
    }
  }
  if (tomorrow && input.addTomorrow === true) await data.createTask({ title: tomorrow, assigneeId: user.id, due: next, priority: "top" }, user.id);

  await audit(user, "day.close", `${user.name} closed the day${blockers ? ", with a blocker" : ""}${carried ? `, ${carried} carried to ${next}` : ""}`);
  refresh();
  return {
    ok: true,
    message: `Day closed.${carried ? ` ${carried} task${carried === 1 ? "" : "s"} moved to ${relDay(next, today).toLowerCase()}.` : ""} Switch off properly.`,
  };
}

/** An owner marks someone's blocker as handled, so it leaves the Command centre. */
export async function clearBlocker(userId: number): Promise<ActionResult> {
  const user = await requireModule("overview");
  await data.saveStandup(Number(userId), lagosToday(), { blockersCleared: true });
  await audit(user, "day.blocker", `Marked a blocker as handled`);
  refresh();
  return { ok: true, message: "Marked as handled." };
}
