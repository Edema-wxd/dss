import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// Leave, relief cover and attendance against a real Postgres. Needs TEST_DATABASE_URL (local,
// "test" in the name); it is wiped first. Everyone here is made up.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("leave and attendance in Postgres", () => {
  let leave: typeof import("./leave");
  let time: typeof import("./time");
  let ada: number, bo: number, cy: number;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    leave = await import("./leave");
    time = await import("./time");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    await createUser({ name: "Bo Sales", email: "bo@example.test", password: "a-long-password", roles: ["Sales"] });
    await createUser({ name: "Cy Helper", email: "cy@example.test", password: "a-long-password", roles: ["Contributor"] });
    const users = await listUsers();
    [ada, bo, cy] = ["ada", "bo", "cy"].map((n) => users.find((u) => u.email.startsWith(n))!.id);
  });

  afterAll(() => disconnect());

  it("lends the absent person's roles to the relief only while approved leave runs", async () => {
    const id = await leave.addLeave({ userId: bo, type: "leave", start: "2026-12-07", end: "2026-12-09", reliefId: cy }, bo);
    expect(await leave.borrowedRoles(cy, "2026-12-08")).toEqual([]);
    await leave.patchLeave(id, { reliefAnswer: "accepted" });
    await leave.patchLeave(id, { status: "approved", reviewedBy: ada });
    expect((await leave.borrowedRoles(cy, "2026-12-08")).map((x) => x.roles)).toEqual([["Sales"]]);
    expect(await leave.borrowedRoles(cy, "2026-12-10")).toEqual([]);
    const l = await leave.getLeave(id);
    expect(l).toMatchObject({ status: "approved", reliefAnswer: "accepted", start: "2026-12-07", end: "2026-12-09" });
  });

  it("never lends the owner's roles", async () => {
    const id = await leave.addLeave({ userId: ada, type: "leave", start: "2026-12-14", end: "2026-12-14", reliefId: cy, status: "approved" }, ada);
    expect((await leave.borrowedRoles(cy, "2026-12-14")).map((x) => x.roles)).toEqual([["Owner"]]);
    const { withBorrowed } = await import("./access");
    expect(withBorrowed(["Contributor"], ["Owner"])).toEqual(["Contributor"]);
    await leave.deleteLeave(id);
  });

  it("keeps work-day requests apart from the approved week", async () => {
    const { patternOf } = await import("./leave-model");
    await leave.setPatternReq(bo, { pattern: patternOf({ fri: "half" }), status: "pending" });
    const p = (await leave.listTeamPatterns()).find((x) => x.id === bo)!;
    expect(p.pattern.fri).toBe("full");
    expect(p.patternReq).toMatchObject({ status: "pending", pattern: { fri: "half" } });
  });

  it("clocks in, takes a break, and closes the day with a report", async () => {
    const today = "2026-12-07";
    const r = await time.clockIn(cy, today);
    expect(r.ok && r.day.status).toBe("in");
    expect(await time.takeBreak(cy, today)).toBe(true);
    expect((await time.getDay(cy, today))?.status).toBe("break");
    const back = await time.clockIn(cy, today);
    expect(back.ok && back.day.segs).toHaveLength(2);
    const eod = { doneText: "Edited the deck", blockers: "", tomorrow: "", mood: "🙂 Good", tasksDone: [], tactics: 0 };
    const out = await time.closeDay(cy, today, eod, null);
    const d = await time.getDay(cy, today);
    expect(d).toMatchObject({ status: "out", workedMin: out.worked, eod: { doneText: "Edited the deck" } });
    expect(d!.breaks[0].end).toBeTruthy();
  });

  it("makes someone close a forgotten day before clocking in again", async () => {
    await time.clockIn(bo, "2026-12-03");
    const r = await time.clockIn(bo, "2026-12-04");
    expect(r).toMatchObject({ ok: false, missed: "2026-12-03" });
    await time.closeDay(bo, "2026-12-03", { doneText: "x", blockers: "", tomorrow: "", mood: "", tasksDone: [], tactics: 0 }, "2026-12-03T16:00:00.000Z");
    expect((await time.clockIn(bo, "2026-12-04")).ok).toBe(true);
    expect((await time.getDay(bo, "2026-12-03"))?.segs[0].out).toBe("2026-12-03T16:00:00.000Z");
  });

  it("queues notifications, except to yourself or anyone who turned them off", async () => {
    const { notify } = await import("./notify");
    expect(await notify(ada, "Hi", "Body", "team/leave", bo)).toBe(true);
    expect(await notify(bo, "Hi", "Body", "team/leave", bo)).toBe(false);
    const sql = connect(url);
    await sql.query(`update desk_users set notify_mode = 'off' where id = $1`, [cy]);
    expect(await notify(cy, "Hi", "Body", "today", ada)).toBe(false);
    const rows = await sql.query(`select title, link from hq_notify`);
    expect(rows).toEqual([{ title: "Hi", link: expect.stringMatching(/\/savvy-hq\/team\/leave$/) }]);
  });
});
