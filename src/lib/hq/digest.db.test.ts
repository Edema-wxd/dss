import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";
import type { Send } from "./digest";
import { lagosToday } from "./work";

// The notifications job against a real Postgres. Needs TEST_DATABASE_URL (local, "test" in the
// name); it is wiped first. Everyone here is made up, and nothing is really emailed.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("the notifications job in Postgres", () => {
  let digest: typeof import("./digest");
  let notify: typeof import("./notify");
  let q: Awaited<ReturnType<typeof import("../desk/db").db>>;
  let ada: number, bo: number, cy: number;
  const outbox: Parameters<Send>[0][] = [];
  const send: Send = async (m) => (outbox.push(m), true);

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    digest = await import("./digest");
    notify = await import("./notify");
    q = await (await import("../desk/db")).db();
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    await createUser({ name: "Bo Staff", email: "bo@example.test", password: "a-long-password", roles: ["Sales"] });
    await createUser({ name: "Cy Quiet", email: "cy@example.test", password: "a-long-password", roles: ["Contributor"] });
    const users = await listUsers();
    [ada, bo, cy] = ["ada", "bo", "cy"].map((n) => users.find((u) => u.email.startsWith(n))!.id);
  });

  afterAll(() => disconnect());

  const unsent = async () => ((await q.query(`select count(*)::int as n from hq_notify where not sent`)) as { n: number }[])[0].n;

  it("sends one email per person and marks everything sent", async () => {
    await notify.notify(bo, "Ada mentioned you in General", "Over to you", "chat?c=general", ada);
    await notify.notify(bo, "A task for you", "Send the deck", "tasks", ada);
    await notify.notify(ada, "Bo has requested time off", "", "team/leave", bo);
    const r = await digest.sendQueue(send);
    expect(r).toMatchObject({ sent: 2, recipients: 2, items: 3, skipped: 0, failed: 0 });
    const toBo = outbox.find((m) => m.to === "bo@example.test")!;
    expect(toBo.subject).toBe("DSS HQ: 2 updates for you");
    expect(toBo.text).toContain("/savvy-hq/chat?c=general");
    expect(outbox.find((m) => m.to === "ada@example.test")!.subject).toBe("Bo has requested time off");
    expect(await unsent()).toBe(0);
    outbox.length = 0;
    expect(await digest.sendQueue(send)).toMatchObject({ sent: 0, items: 0 });
  });

  it("skips stale items and people who changed to the summary only", async () => {
    await notify.notify(bo, "Old news", "", "tasks", ada);
    await q.query(`update hq_notify set at = now() - interval '3 days' where title = 'Old news'`);
    await notify.notify(cy, "For Cy", "", "tasks", ada);
    await q.query(`update desk_users set notify_mode = 'digest' where id = $1`, [cy]);
    const r = await digest.sendQueue(send);
    expect(r).toMatchObject({ sent: 0, skipped: 2 });
    expect(outbox).toEqual([]);
    expect(((await q.query(`select count(*)::int as n from hq_notify where skipped`)) as { n: number }[])[0].n).toBe(2);
    await q.query(`update desk_users set notify_mode = 'instant' where id = $1`, [cy]);
  });

  it("hands items back when the email fails, for the next run", async () => {
    await notify.notify(bo, "Try again", "", "tasks", ada);
    expect(await digest.sendQueue(async () => false)).toMatchObject({ sent: 0, failed: 1 });
    expect(await unsent()).toBe(1);
    expect(await digest.sendQueue(send)).toMatchObject({ sent: 1, items: 1 });
    expect(await unsent()).toBe(0);
    outbox.length = 0;
  });

  it("claims the morning summary once a day", async () => {
    expect(await digest.claimMorning("2026-11-24")).toBe(true);
    expect(await digest.claimMorning("2026-11-24")).toBe(false);
    expect(await digest.claimMorning("2026-11-25")).toBe(true);
  });

  it("sends each person their summary, and the owner a quiet-day note", async () => {
    const today = lagosToday();
    await q.query(`insert into hq_tasks (id, title, assignee_id, due, status) values ('t1', 'Book the shoot', $1, $2::date, 'todo'), ('t2', 'Done one', $1, $2::date, 'done')`, [
      bo,
      today,
    ]);
    await q.query(`update desk_users set notify_mode = 'off' where id = $1`, [cy]);
    const s = await digest.snapshot(today);
    expect(s.tasks.map((t) => t.title)).toEqual(["Book the shoot"]);
    expect(s.ownerId).toBe(ada);
    const r = await digest.sendMorning(today, send);
    expect(r.failed).toBe(0);
    const toBo = outbox.find((m) => m.to === "bo@example.test")!;
    expect(toBo.subject).toMatch(/^DSS HQ: your day, /);
    expect(toBo.text).toContain("Book the shoot (due today)");
    expect(outbox.some((m) => m.to === "ada@example.test")).toBe(true);
    expect(outbox.some((m) => m.to === "cy@example.test")).toBe(false);
  });
});
