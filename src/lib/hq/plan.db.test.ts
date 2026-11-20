import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// The 12-week plan against a real Postgres. Needs TEST_DATABASE_URL (local, "test" in the name);
// it is wiped first. Everyone here is made up.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("the 12-week plan in Postgres", () => {
  let plan: typeof import("./plan");
  let data: typeof import("./data");
  let ada: number, bo: number;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    plan = await import("./plan");
    data = await import("./data");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    await createUser({ name: "Bo Sales", email: "bo@example.test", password: "a-long-password", roles: ["Sales"] });
    const users = await listUsers();
    [ada, bo] = ["ada", "bo"].map((n) => users.find((u) => u.email.startsWith(n))!.id);
  });

  afterAll(() => disconnect());

  it("numbers cycles and keeps goals with their owners", async () => {
    const id = await plan.createCycle({ start: "2026-11-23", vision: "Grow", target: 85, goals: [{ id: "g1", title: "Leads", area: "sales", owner: bo, measure: "", source: "leads", unit: "count", base: 0, target: 20, current: 0 }] }, ada);
    expect(id).toBe("cycle-1");
    await plan.patchCycle(id, { status: "active", name: "Winter push" });
    const c = await plan.getCycle(id);
    expect(c).toMatchObject({ name: "Winter push", start: "2026-11-23", status: "active", target: 85 });
    expect(c!.goals[0]).toMatchObject({ id: "g1", owner: bo, target: 20 });
    expect(await plan.createCycle({ start: "2027-03-01", vision: "", target: 85, goals: [] }, ada)).toBe("cycle-2");
  });

  it("ticks a tactic's week once, with the server's time, and unticks it", async () => {
    const id = await plan.addTactic({ userId: bo, cycleId: "cycle-1", goalId: "g1", title: "Send 5 pitches", weeks: [1, 2, 3] }, bo);
    await plan.setTacticWeek(id, 1, true);
    const first = (await plan.getTactic(id))!.done["1"];
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await plan.setTacticWeek(id, 1, true);
    expect((await plan.getTactic(id))!.done["1"]).toBe(first);
    await plan.setTacticWeek(id, 1, false);
    expect((await plan.getTactic(id))!.done).toEqual({});
    await plan.archiveTactic(id);
    expect(await plan.listTactics("cycle-1")).toEqual([]);
  });

  it("ticks the tactic when the task made from it is finished", async () => {
    const tid = await plan.addTactic({ userId: bo, cycleId: "cycle-1", goalId: null, title: "Follow up proposals", weeks: [1] }, bo);
    const task = await data.createTask({ title: "Follow up proposals", assigneeId: bo, tacticId: tid, tacticWeek: 1 }, bo);
    expect(await data.getTask(task)).toMatchObject({ tacticId: tid, tacticWeek: 1 });
    await data.updateTask(task, { status: "doing" });
    expect((await plan.getTactic(tid))!.done).toEqual({});
    await data.updateTask(task, { status: "done" });
    expect(Object.keys((await plan.getTactic(tid))!.done)).toEqual(["1"]);
    // the end-of-day report finds it for any day of week 1
    const due = await plan.tacticsDueOn(bo, "2026-11-27");
    expect(due.week).toBe(1);
    expect(due.tactics.map((t) => t.id)).toEqual([tid]);
    expect((await plan.tacticsDueOn(bo, "2026-12-01")).tactics).toEqual([]);
  });

  it("keeps one review per person per week", async () => {
    await plan.saveReview({ userId: bo, cycleId: "cycle-1", week: 1, score: 100, wins: "Two calls", lessons: "", change: "" });
    await plan.saveReview({ userId: bo, cycleId: "cycle-1", week: 1, score: 100, wins: "Three calls", lessons: "", change: "Start earlier" });
    const rs = await plan.listReviews("cycle-1");
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ userId: bo, week: 1, wins: "Three calls", change: "Start earlier" });
    expect(await plan.listReviews("cycle-1", ada)).toEqual([]);
  });

  it("counts HQ numbers since the cycle began", async () => {
    const c = await plan.sinceCounts("2000-01-01");
    expect(c.tasks).toBe(1);
    expect(c).toMatchObject({ newclients: 0, leads: 0 });
  });
});
