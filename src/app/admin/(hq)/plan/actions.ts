"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { type DeskUser, requireModule } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import { canUse, isOwner } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import { notify } from "@/lib/hq/notify";
import * as plan from "@/lib/hq/plan";
import { goalsNow } from "./load";
import {
  CYCLE_STATUSES,
  GOAL_SOURCES,
  GOAL_UNITS,
  type Goal,
  MAX_GOALS,
  PLAN_AREAS,
  isMonday,
  leadsPlan,
  nextMonday,
  scoreOf,
  weekNo,
  weekStart,
  weeksFor,
  weeksText,
} from "@/lib/hq/plan-model";
import { addDays, lagosToday } from "@/lib/hq/work";

// Who may do what, as in HQ: Owner, Admin and Operations (EA) set up cycles and goals. Everyone
// writes, ticks and reviews their own tactics. The owner can also add, edit and tick anyone's.

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 2000) =>
  String(v ?? "")
    .slice(0, max)
    .trim();
const num = (v: unknown) => (String(v ?? "").trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const first = (name: string) => name.split(" ")[0] || name;
const fmt = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
const PATH = "plan";

const audit = (u: DeskUser, action: string, target: string, summary: string) =>
  store.audit({
    actor: u.name,
    actorEmail: u.email,
    action: `plan.${action}`,
    target,
    summary,
    changes: null,
  });

async function lead() {
  const user = await requireModule("plan");
  return leadsPlan(user.roles) ? user : null;
}

/** People on the plan: active, and not Contractors. */
async function planPeople() {
  return (await data.listPeople()).filter((p) => p.active && !(p.roles.length > 0 && p.roles.every((r) => r === "Contractor")));
}

/* ── Cycles ──────────────────────────────────────────────────────────── */

export async function startCycle(): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can start a cycle.");
  const cycles = await plan.listCycles();
  if (cycles.some((c) => c.status !== "closed")) return fail("There's already a cycle on the go. Close it first.");
  const start = nextMonday(lagosToday());
  const id = await plan.createCycle({ start, vision: "", target: 85, goals: [] }, user.id);
  await audit(user, "start", id, `Started a 12-week cycle from ${start}`);
  refresh();
  return {
    ok: true,
    message: `The cycle starts ${fmt(start)}. Add your goals.`,
  };
}

export async function saveCycle(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can change the cycle.");
  const c = await plan.getCycle(id);
  if (!c) return fail("That cycle is gone.");
  const start = text(input.start, 10);
  if (!isMonday(start)) return fail("Week 1 has to start on a Monday.");
  const target = num(input.target);
  if (target === null || target < 50 || target > 100) return fail("Set the winning week score between 50 and 100%.");
  const status = CYCLE_STATUSES.some(([k]) => k === input.status) ? String(input.status) : c.status;
  if (status === "active" && c.status !== "active") {
    if (!c.goals.length) return fail("Add at least one goal before making it active.");
    if ((await plan.listCycles()).some((x) => x.id !== id && x.status === "active")) return fail("Another cycle is active. Close it first.");
  }
  await plan.patchCycle(id, {
    name: text(input.name, 80) || c.name,
    start,
    target: Math.round(target),
    status,
    vision: text(input.vision, 600),
  });
  if (status === "active" && c.status !== "active") await announce(user, { ...c, start });
  refresh();
  return { ok: true, message: "Cycle saved." };
}

async function announce(user: DeskUser, c: { name: string; start: string }) {
  for (const p of await planPeople())
    await notify(p.id, `The 12-week plan is live: ${c.name}`, `Week 1 starts ${fmt(c.start)}. Add your weekly tactics on the 12-week plan page.`, PATH, user.id);
  await audit(user, "activate", c.name, `Made ${c.name} active`);
}

export async function activateCycle(id: string): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can make the cycle active.");
  const c = await plan.getCycle(id);
  if (!c || c.status !== "draft") return fail("That cycle isn't a draft.");
  if (!c.goals.length) return fail("Add at least one goal first.");
  if ((await plan.listCycles()).some((x) => x.status === "active")) return fail("Another cycle is active. Close it first.");
  await plan.patchCycle(id, { status: "active" });
  await announce(user, c);
  refresh();
  return { ok: true, message: "The cycle is live. The team has been told." };
}

/** Closes the cycle and starts a draft next Monday with the same goals, starting from where they got to. */
export async function closeCycle(id: string): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can close the cycle.");
  const c = await plan.getCycle(id);
  if (!c || c.status === "closed") return fail("That cycle is already closed.");
  const now = await goalsNow(c, canUse(user.roles, "finance"));
  await plan.patchCycle(id, { status: "closed" });
  const goals = c.goals.map((g) => ({
    ...g,
    base: now[g.id] ?? g.current,
    current: now[g.id] ?? g.current,
  }));
  const next = await plan.createCycle(
    {
      start: nextMonday(lagosToday()),
      vision: c.vision,
      target: c.target,
      goals,
    },
    user.id,
  );
  await audit(user, "close", id, `Closed ${c.name} and started ${next}`);
  refresh();
  return {
    ok: true,
    message: "Closed. The next 12 weeks are drafted with the same goals. Adjust them in Plan setup.",
  };
}

export async function saveCycleReview(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can write the cycle review.");
  if (!(await plan.getCycle(id))) return fail("That cycle is gone.");
  await plan.patchCycle(id, {
    review: {
      worked: text(input.worked),
      stop: text(input.stop),
      carry: text(input.carry),
    },
  });
  refresh();
  return { ok: true, message: "Cycle review saved." };
}

/* ── Goals ───────────────────────────────────────────────────────────── */

export async function saveGoal(cycleId: string, goalId: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can set goals.");
  const c = await plan.getCycle(cycleId);
  if (!c) return fail("That cycle is gone.");
  const title = text(input.title, 160);
  const base = num(input.base);
  const target = num(input.target);
  if (!title) return fail("Name the goal.");
  if (base === null || target === null) return fail("Give the goal a starting number and a target.");
  const old = goalId ? c.goals.find((g) => g.id === goalId) : undefined;
  if (goalId && !old) return fail("That goal is gone.");
  if (!old && c.goals.length >= MAX_GOALS) return fail(`${MAX_GOALS} goals is the most a cycle can hold. Fewer is better.`);
  const owner = Number(input.owner) || null;
  if (owner && !(await planPeople()).some((p) => p.id === owner)) return fail("Pick someone on the team to own it.");
  const g: Goal = {
    id: old?.id ?? `g${data.newId().slice(0, 6)}`,
    title,
    area: PLAN_AREAS.some(([k]) => k === input.area) ? String(input.area) : "ops",
    owner,
    measure: text(input.measure, 300),
    source: GOAL_SOURCES.some(([k]) => k === input.source) ? String(input.source) : "manual",
    unit: GOAL_UNITS.some(([k]) => k === input.unit) ? String(input.unit) : "count",
    base,
    target,
    current: old?.current ?? base,
  };
  await plan.patchCycle(cycleId, {
    goals: old ? c.goals.map((x) => (x.id === g.id ? g : x)) : [...c.goals, g],
  });
  refresh();
  return { ok: true, message: old ? "Goal saved." : "Goal added." };
}

export async function deleteGoal(cycleId: string, goalId: string): Promise<ActionResult> {
  const user = await lead();
  if (!user) return fail("Only the owner, an Admin or Operations (EA) can remove goals.");
  const c = await plan.getCycle(cycleId);
  if (!c) return fail("That cycle is gone.");
  await plan.patchCycle(cycleId, {
    goals: c.goals.filter((g) => g.id !== goalId),
  });
  refresh();
  return {
    ok: true,
    message: "Goal removed. Its tactics now count as general.",
  };
}

/** Where a hand-tracked goal is now. The plan leads and the goal's owner can update it. */
export async function updateGoalProgress(cycleId: string, goalId: string, current: unknown): Promise<ActionResult> {
  const user = await requireModule("plan");
  const c = await plan.getCycle(cycleId);
  const g = c?.goals.find((x) => x.id === goalId);
  if (!c || !g) return fail("That goal is gone.");
  if (!leadsPlan(user.roles) && g.owner !== user.id) return fail("Only the goal's owner can update it.");
  if (g.source !== "manual") return fail("This goal updates itself from HQ.");
  const v = num(current);
  if (v === null) return fail("Enter a number.");
  await plan.patchCycle(cycleId, {
    goals: c.goals.map((x) => (x.id === goalId ? { ...x, current: v } : x)),
  });
  refresh();
  return { ok: true, message: "Progress updated." };
}

/* ── Tactics ─────────────────────────────────────────────────────────── */

/** A tactic someone may change: their own, or anyone's for the owner. */
async function myTactic(user: DeskUser, id: string) {
  const t = await plan.getTactic(id);
  if (!t) return null;
  return t.userId === user.id || isOwner(user.roles) ? t : null;
}

export async function saveTactic(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("plan");
  const t = id ? await myTactic(user, id) : null;
  if (id && !t) return fail("You can only change your own tactics.");
  const c = await plan.getCycle(t ? t.cycleId : String(input.cycleId ?? ""));
  if (!c || c.status === "closed") return fail("There's no open cycle to add tactics to.");
  const title = text(input.title, 200);
  if (!title) return fail("Say what the weekly action is.");
  const weeks = weeksFor(String(input.when ?? "all"), String(input.weeks ?? ""), weekNo(c.start, lagosToday()));
  if (!weeks.length) return fail("Pick at least one week, like 1, 3, 5-8.");
  const goalId = c.goals.some((g) => g.id === input.goalId) ? String(input.goalId) : null;
  if (id) {
    await plan.updateTactic(id, { goalId, title, weeks });
    refresh();
    return { ok: true, message: "Tactic updated." };
  }
  let ownerId = user.id;
  if (input.userId && Number(input.userId) !== user.id) {
    if (!isOwner(user.roles)) return fail("You can only add tactics for yourself.");
    const p = (await planPeople()).find((x) => x.id === Number(input.userId));
    if (!p) return fail("Pick someone on the team.");
    ownerId = p.id;
  }
  await plan.addTactic({ userId: ownerId, cycleId: c.id, goalId, title, weeks }, user.id);
  if (ownerId !== user.id) await notify(ownerId, `${first(user.name)} added a 12-week tactic for you`, `"${title}" · ${weeksText(weeks).toLowerCase()}.`, PATH, user.id);
  refresh();
  return { ok: true, message: "Tactic added." };
}

export async function removeTactic(id: string): Promise<ActionResult> {
  const user = await requireModule("plan");
  if (!(await myTactic(user, id))) return fail("You can only remove your own tactics.");
  await plan.archiveTactic(id);
  refresh();
  return { ok: true, message: "Tactic removed." };
}

export async function tickTactic(id: string, week: number, done: boolean): Promise<ActionResult> {
  const user = await requireModule("plan");
  const t = await myTactic(user, id);
  if (!t) return fail("You can only tick your own tactics.");
  if (!t.weeks.includes(week)) return fail("That tactic isn't set for that week.");
  await plan.setTacticWeek(id, week, done);
  refresh();
  return { ok: true, message: done ? "Ticked off." : "Unticked." };
}

/** Puts a tactic on your task list for its week. Finishing the task ticks the tactic. */
export async function tacticToTask(id: string, week: number): Promise<ActionResult> {
  const user = await requireModule("plan");
  const t = await plan.getTactic(id);
  if (!t || t.userId !== user.id) return fail("You can only do this with your own tactics.");
  const c = await plan.getCycle(t.cycleId);
  if (!c || !t.weeks.includes(week)) return fail("That tactic isn't set for that week.");
  const open = (await data.listTasks({ assigneeId: user.id })).some((x) => x.tacticId === id && x.tacticWeek === week && x.status !== "done");
  if (open) return fail("It's already on your task list.");
  const today = lagosToday();
  const fri = addDays(weekStart(c.start, week), 4);
  await data.createTask(
    {
      title: t.title,
      assigneeId: user.id,
      due: fri < today ? today : fri,
      priority: "high",
      notes: `12-week plan tactic, week ${week}. Finishing this task ticks the tactic.`,
      tacticId: id,
      tacticWeek: week,
    },
    user.id,
  );
  refresh();
  return {
    ok: true,
    message: "On your task list for this week. Finishing it ticks the tactic.",
  };
}

/* ── Weekly reviews ──────────────────────────────────────────────────── */

export async function saveWeekReview(cycleId: string, week: number, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("plan");
  const c = await plan.getCycle(cycleId);
  if (!c) return fail("That cycle is gone.");
  if (!Number.isInteger(week) || week < 1 || week > 12) return fail("Pick a week from 1 to 12.");
  if (weekStart(c.start, week) > lagosToday()) return fail("That week hasn't started yet.");
  const score = scoreOf(await plan.listTactics(cycleId, user.id), user.id, week);
  await plan.saveReview({
    userId: user.id,
    cycleId,
    week,
    score,
    wins: text(input.wins),
    lessons: text(input.lessons),
    change: text(input.change, 300),
  });
  refresh();
  return { ok: true, message: `Week ${week} reviewed.` };
}
