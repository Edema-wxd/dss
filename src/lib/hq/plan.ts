import "server-only";
import { db } from "../desk/db";
import { newId } from "./data";
import { type Cycle, type Goal, type Review, type Tactic, weekNo } from "./plan-model";

// The 12-week plan: cycles (hq_plan), tactics (hq_tactics) and weekly reviews (hq_plan_reviews).
// Callers check who may do what first; the scoring lives in plan-model.ts.

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;

const CYCLE_COLS = `id, name, ${day("start")} as start, status, vision, target, goals, review`;
const TAC_COLS = `id, user_id::int as "userId", coalesce(cycle_id, '') as "cycleId", goal_id as "goalId", title, weeks, done, by_id::int as "byId"`;
const REV_COLS = `user_id::int as "userId", cycle_id as "cycleId", week, score, wins, lessons, change, ${iso("at")} as at`;

const cleanGoal = (g: Partial<Goal>): Goal => ({
  id: String(g.id ?? ""),
  title: String(g.title ?? ""),
  area: String(g.area ?? "ops"),
  owner: g.owner === null || g.owner === undefined || Number.isNaN(Number(g.owner)) ? null : Number(g.owner),
  measure: String(g.measure ?? ""),
  source: String(g.source ?? "manual"),
  unit: String(g.unit ?? "count"),
  base: Number(g.base) || 0,
  target: Number(g.target) || 0,
  current: Number(g.current ?? g.base) || 0,
});
const toCycle = (r: Cycle): Cycle => ({
  ...r,
  target: Number(r.target) || 85,
  goals: (Array.isArray(r.goals) ? r.goals : []).map(cleanGoal),
  review: r.review ?? {},
});

/* ── Cycles ──────────────────────────────────────────────────────────── */

export async function listCycles(): Promise<Cycle[]> {
  return ((await (await db()).query(`select ${CYCLE_COLS} from hq_plan order by start nulls last, id`)) as Cycle[]).map(toCycle);
}

export async function getCycle(id: string) {
  const rows = (await (await db()).query(`select ${CYCLE_COLS} from hq_plan where id = $1`, [id])) as Cycle[];
  return rows[0] ? toCycle(rows[0]) : null;
}

/** A new draft cycle, named and numbered after the ones before it ("Cycle 3"). */
export async function createCycle(c: Pick<Cycle, "start" | "vision" | "target" | "goals">, by: number) {
  const q = await db();
  const ids = new Set(((await q.query(`select id from hq_plan`)) as { id: string }[]).map((r) => r.id));
  let n = ids.size + 1;
  while (ids.has(`cycle-${n}`)) n++;
  const id = `cycle-${n}`;
  await q.query(`insert into hq_plan (id, name, start, status, vision, target, goals, created_by) values ($1, $2, $3::date, 'draft', $4, $5, $6::jsonb, $7)`, [
    id,
    `Cycle ${n}`,
    c.start,
    c.vision,
    c.target,
    JSON.stringify(c.goals.map(cleanGoal)),
    by,
  ]);
  return id;
}

export type CyclePatch = Partial<Pick<Cycle, "name" | "start" | "status" | "vision" | "target" | "goals" | "review">>;

export async function patchCycle(id: string, p: CyclePatch) {
  const sets: string[] = [];
  const params: unknown[] = [id];
  const put = (col: string, v: unknown, cast = "text") => sets.push(`${col} = $${params.push(v)}::${cast}`);
  if (p.name !== undefined) put("name", p.name);
  if (p.start !== undefined) put("start", p.start, "date");
  if (p.status !== undefined) put("status", p.status);
  if (p.vision !== undefined) put("vision", p.vision);
  if (p.target !== undefined) put("target", p.target, "integer");
  if (p.goals !== undefined) put("goals", JSON.stringify(p.goals.map(cleanGoal)), "jsonb");
  if (p.review !== undefined) put("review", JSON.stringify(p.review), "jsonb");
  if (!sets.length) return;
  await (await db()).query(`update hq_plan set ${sets.join(", ")}, updated_at = now() where id = $1`, params);
}

/* ── Tactics ─────────────────────────────────────────────────────────── */

const toTactic = (t: Tactic): Tactic => ({
  ...t,
  weeks: (t.weeks ?? []).map(Number),
  done: t.done ?? {},
});

/** A cycle's tactics that haven't been removed. */
export async function listTactics(cycleId: string, userId?: number): Promise<Tactic[]> {
  const params: unknown[] = [cycleId];
  let where = `cycle_id = $1 and not archived`;
  if (userId !== undefined) where += ` and user_id = $${params.push(userId)}`;
  return ((await (await db()).query(`select ${TAC_COLS} from hq_tactics where ${where} order by created_at, id`, params)) as Tactic[]).map(toTactic);
}

export async function getTactic(id: string) {
  const rows = (await (await db()).query(`select ${TAC_COLS} from hq_tactics where id = $1 and not archived`, [id])) as Tactic[];
  return rows[0] ? toTactic(rows[0]) : null;
}

export async function addTactic(t: Pick<Tactic, "userId" | "cycleId" | "goalId" | "title" | "weeks">, by: number) {
  const id = newId();
  await (
    await db()
  ).query(`insert into hq_tactics (id, user_id, cycle_id, goal_id, title, weeks, by_id, created_by) values ($1, $2, $3, $4, $5, $6::integer[], $7, $7)`, [
    id,
    t.userId,
    t.cycleId,
    t.goalId,
    t.title,
    t.weeks,
    by,
  ]);
  return id;
}

export async function updateTactic(id: string, t: Pick<Tactic, "goalId" | "title" | "weeks">) {
  await (await db()).query(`update hq_tactics set goal_id = $2, title = $3, weeks = $4::integer[], updated_at = now() where id = $1`, [id, t.goalId, t.title, t.weeks]);
}

export async function archiveTactic(id: string) {
  await (await db()).query(`update hq_tactics set archived = true, updated_at = now() where id = $1`, [id]);
}

/** Ticks or unticks one week of a tactic, stamped with the server's time. */
export async function setTacticWeek(id: string, week: number, done: boolean) {
  await (
    await db()
  ).query(
    done
      ? `update hq_tactics set done = done || jsonb_build_object($2::text, ${iso("now()")}), updated_at = now() where id = $1 and not (done ? $2::text)`
      : `update hq_tactics set done = done - $2::text, updated_at = now() where id = $1`,
    [id, String(week)],
  );
}

/* ── Weekly reviews ──────────────────────────────────────────────────── */

export async function listReviews(cycleId: string, userId?: number): Promise<Review[]> {
  const params: unknown[] = [cycleId];
  let where = `cycle_id = $1`;
  if (userId !== undefined) where += ` and user_id = $${params.push(userId)}`;
  return (await (await db()).query(`select ${REV_COLS} from hq_plan_reviews where ${where} order by at desc`, params)) as Review[];
}

export async function saveReview(r: Pick<Review, "userId" | "cycleId" | "week" | "score" | "wins" | "lessons" | "change">) {
  await (
    await db()
  ).query(
    `insert into hq_plan_reviews (user_id, cycle_id, week, score, wins, lessons, change) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, cycle_id, week) do update set score = excluded.score, wins = excluded.wins, lessons = excluded.lessons, change = excluded.change, at = now()`,
    [r.userId, r.cycleId, r.week, r.score, r.wins, r.lessons, r.change],
  );
}

/* ── Goal progress from the rest of HQ ───────────────────────────────── */

/** Counts since the cycle began, for goals that track new clients, CRM leads or finished tasks. */
export async function sinceCounts(start: string) {
  const rows = (await (
    await db()
  ).query(
    `select
       (select count(*) from hq_clients where coalesce(start_date, created_at::date) >= $1::date)::int as newclients,
       (select count(*) from hq_contacts where (created_at at time zone 'Africa/Lagos')::date >= $1::date)::int as leads,
       (select count(*) from hq_tasks where status = 'done' and (done_at at time zone 'Africa/Lagos')::date >= $1::date)::int as tasks`,
    [start],
  )) as { newclients: number; leads: number; tasks: number }[];
  return rows[0] ?? { newclients: 0, leads: 0, tasks: 0 };
}

/** The tactics someone has due on a day, with whether that week is ticked. For the end-of-day report. */
export async function tacticsDueOn(userId: number, d: string) {
  const c = (await listCycles()).find((x) => x.status === "active");
  if (!c) return { cycle: null, week: 0, tactics: [] as Tactic[] };
  const w = weekNo(c.start, d);
  if (w < 1 || w > 12) return { cycle: c, week: w, tactics: [] as Tactic[] };
  return {
    cycle: c,
    week: w,
    tactics: (await listTactics(c.id, userId)).filter((t) => t.weeks.includes(w)),
  };
}
