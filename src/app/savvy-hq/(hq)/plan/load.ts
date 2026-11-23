import "server-only";
import type { DeskUser } from "@/lib/desk/auth";
import { canUse, isOwner } from "@/lib/hq/access";
import { listPeople, listTasks } from "@/lib/hq/data";
import { loadBooks } from "@/lib/hq/finance";
import { finance } from "@/lib/hq/finance-model";
import * as plan from "@/lib/hq/plan";
import { type Cycle, currentCycle, leadsPlan, weekNo } from "@/lib/hq/plan-model";
import { lagosToday } from "@/lib/hq/work";

const contractorOnly = (roles: readonly string[]) => roles.length > 0 && roles.every((r) => r === "Contractor");

/**
 * Where each goal is now. Goals that track HQ numbers count them since the cycle began; revenue
 * comes from Finance only for people who can see Finance, otherwise the last number typed in.
 */
export async function goalsNow(c: Cycle, seesFinance: boolean) {
  const out: Record<string, number> = {};
  if (!c.goals.length) return out;
  const counts = await plan.sinceCounts(c.start);
  let revenue: number | null = null;
  if (seesFinance && c.goals.some((g) => g.source === "revenue")) revenue = Math.round(finance(await loadBooks({ ledger: true })).finStats().revNGN);
  for (const g of c.goals)
    out[g.id] =
      g.source === "newclients"
        ? counts.newclients
        : g.source === "leads"
          ? counts.leads
          : g.source === "tasks"
            ? counts.tasks
            : g.source === "revenue" && revenue !== null
              ? revenue
              : g.current;
  return out;
}

/**
 * The plan page. Everyone sees the goals and the team's tactics and scores, as in HQ, except
 * Contractors, who see only their own. Weekly reviews are private to their writer and the owner.
 */
export async function loadPlan(user: DeskUser) {
  const today = lagosToday();
  const cycles = await plan.listCycles();
  const cycle = currentCycle(cycles);
  const lead = leadsPlan(user.roles);
  const owner = isOwner(user.roles);
  const solo = contractorOnly(user.roles);
  const everyone = (await listPeople()).filter((p) => p.active && !contractorOnly(p.roles));
  const people = (solo ? [] : everyone).map((p) => ({
    id: p.id,
    name: p.name,
  }));
  if (!people.some((p) => p.id === user.id)) people.push({ id: user.id, name: user.name });
  const base = {
    today,
    lead,
    owner,
    solo,
    me: user.id,
    people,
    // Contractors don't get the team list: only the names of the goals' owners
    everyone: everyone.filter((p) => !solo || cycle?.goals.some((g) => g.owner === p.id)).map((p) => ({ id: p.id, name: p.name })),
    closed: cycles.filter((c) => c.status === "closed").length,
  };
  if (!cycle)
    return {
      ...base,
      cycle: null,
      week: 0,
      tactics: [],
      reviews: [],
      now: {} as Record<string, number>,
      tasked: [] as string[],
    };
  const ids = new Set(people.map((p) => p.id));
  const [tactics, reviews, now, tasks] = await Promise.all([
    plan.listTactics(cycle.id),
    plan.listReviews(cycle.id, owner ? undefined : user.id),
    goalsNow(cycle, canUse(user.roles, "finance")),
    listTasks({ assigneeId: user.id }),
  ]);
  return {
    ...base,
    cycle,
    week: weekNo(cycle.start, today),
    tactics: tactics.filter((t) => ids.has(t.userId)),
    reviews,
    now,
    // tactic weeks already on my task list and not finished
    tasked: tasks.filter((t) => t.tacticId && t.tacticWeek && t.status !== "done").map((t) => `${t.tacticId}:${t.tacticWeek}`),
  };
}

export type PlanData = Awaited<ReturnType<typeof loadPlan>>;
