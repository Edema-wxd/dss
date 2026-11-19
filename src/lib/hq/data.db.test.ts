import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";
import { lagosToday, periodKey } from "./work";

// The Phase 2 data layer against a real Postgres. Needs TEST_DATABASE_URL (a local database
// with "test" in its name); it is wiped first. Skipped when it isn't set.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("work data in Postgres", () => {
  let data: typeof import("./data");
  let ada: number;
  let bo: number;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    data = await import("./data");
    const { createUser } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    await createUser({ name: "Bo Staff", email: "bo@example.test", password: "a-long-password", roles: ["Contributor"] });
    const people = await data.listPeople();
    ada = people.find((p) => p.email === "ada@example.test")!.id;
    bo = people.find((p) => p.email === "bo@example.test")!.id;
  });

  afterAll(() => disconnect());

  it("stamps a task done in Lagos time and clears it when reopened", async () => {
    const id = await data.createTask({ title: "Send the report", assigneeId: bo, due: "2026-11-19", checklist: [{ t: "Draft", done: false }] }, ada);
    await data.updateTask(id, { status: "done" });
    let t = (await data.getTask(id))!;
    expect(t).toMatchObject({ status: "done", doneDay: lagosToday(), due: "2026-11-19", assigneeId: bo, createdBy: ada });
    expect(t.doneAt).toMatch(/Z$/);
    await data.updateTask(id, { status: "doing" });
    t = (await data.getTask(id))!;
    expect(t).toMatchObject({ status: "doing", doneAt: "", doneDay: "" });
  });

  it("only changes the fields given, and blanks a cleared date", async () => {
    const id = await data.createTask({ title: "Plan", assigneeId: bo, due: "2026-11-20", priority: "top" }, bo);
    await data.updateTask(id, { title: "Plan the week", due: "" });
    expect(await data.getTask(id)).toMatchObject({ title: "Plan the week", due: "", priority: "top", assigneeId: bo });
    await data.updateTask(id, { carried: 2 });
    expect((await data.getTask(id))!.carried).toBe(2);
  });

  it("lists one person's tasks, and leaves out old finished ones", async () => {
    const mine = await data.listTasks({ assigneeId: bo, doneSince: "2099-01-01" });
    expect(mine.map((t) => t.title).sort()).toEqual(["Plan the week", "Send the report"]);
    expect(await data.listTasks({ assigneeId: ada })).toEqual([]);
  });

  it("merges a standup through the day", async () => {
    const day = "2026-11-19";
    await data.saveStandup(bo, day, { startedAt: "2026-11-19T08:00:00Z", energy: "High", top: ["x"] });
    await data.saveStandup(bo, day, { closedAt: "2026-11-19T17:00:00Z", blockers: "Waiting on copy" });
    expect((await data.getStandups(day)).get(bo)).toEqual({
      startedAt: "2026-11-19T08:00:00Z",
      energy: "High",
      top: ["x"],
      closedAt: "2026-11-19T17:00:00Z",
      blockers: "Waiting on copy",
    });
  });

  it("counts KPIs: logged numbers and tasks completed this period", async () => {
    const manual = await data.saveKpi(null, { title: "Pitches sent", ownerId: bo, unit: "number", target: 10, period: "month", direction: "up", source: "manual", weight: 1, how: "" }, ada);
    const auto = await data.saveKpi(null, { title: "Tasks completed", ownerId: bo, unit: "number", target: 4, period: "week", direction: "up", source: "auto_tasks", weight: 1, how: "" }, ada);
    await data.logKpi({ id: manual, period: "month" }, 6, bo);
    await data.logKpi({ id: manual, period: "month" }, 7, bo);
    const done = await data.createTask({ title: "Done one", assigneeId: bo }, bo);
    await data.updateTask(done, { status: "done" });
    const states = await data.kpiStates(await data.listKpis());
    expect(states.find((k) => k.id === manual)).toMatchObject({ actual: 7, pct: 70 });
    expect(states.find((k) => k.id === auto)).toMatchObject({ actual: 1, pct: 25 });
    const sql = connect(url);
    const logs = await sql.query(`select period_key from hq_kpi_logs`);
    expect(logs).toEqual([{ period_key: periodKey("month", lagosToday()) }]);
  });

  it("runs a KPI proposal through to approval", async () => {
    await data.setKpiSelf(bo, true);
    const id = await data.createProposal(bo, { title: "Posts", unit: "number", target: 12, period: "month", direction: "up", source: "manual", how: "", why: "Reach" });
    expect((await data.listProposals(bo))[0]).toMatchObject({ id, status: "pending" });
    await data.reviewProposal(id, { status: "declined", note: "Not this quarter" }, ada);
    expect((await data.listProposals())[0]).toMatchObject({ status: "declined", note: "Not this quarter" });
  });

  it("saves and edits a procedure, remembering who changed it", async () => {
    const id = await data.saveSop(null, { title: "Invoice run", area: "Finance", ownerId: ada, purpose: "", steps: [{ t: "Check", note: "" }], links: [] }, ada);
    await data.saveSop(id, { title: "Monthly invoice run", area: "Finance", ownerId: ada, purpose: "By the 1st", steps: [{ t: "Check", note: "" }, { t: "Send", note: "" }], links: [] }, bo);
    expect(await data.getSop(id)).toMatchObject({ title: "Monthly invoice run", purpose: "By the 1st", updatedBy: bo, ownerId: ada });
    expect((await data.getSop(id))!.steps).toHaveLength(2);
  });

  it("merges settings one level deep", async () => {
    await data.patchGeneral({ monthlyGoal: 100, fx: { USD: 1500 }, workday: { start: "09:00" } }, ada);
    await data.patchGeneral({ fx: { GBP: 2000 }, workday: { grace: 10 } }, ada);
    expect(await data.getGeneral()).toEqual({ monthlyGoal: 100, fx: { USD: 1500, GBP: 2000 }, workday: { start: "09:00", grace: 10 } });
  });

  it("backs up every table without passwords", async () => {
    const b = await data.backupData();
    expect(Object.keys(b)).toEqual(expect.arrayContaining(["hq_tasks", "hq_kpis", "hq_settings", "people", "desk_audit"]));
    expect(JSON.stringify(b.people)).not.toContain("scrypt");
    expect(Object.keys(b)).not.toContain("desk_sessions");
  });
});
