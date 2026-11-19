import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Sql, connect, disconnect, isLocalUrl } from "../driver";

// Visibility Session applications feeding the CRM, against a real Postgres.
// Needs TEST_DATABASE_URL (local, "test" in the name); it is wiped first.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("applications into the CRM", () => {
  let sql: Sql;
  let sync: typeof import("./crm-sync");
  let desk: typeof import("../desk/db");

  const app = (id: string, over: Record<string, unknown> = {}) =>
    desk.insertApplication({
      id, name: "Tolu Founder", role: "CEO", company: "Bright Co", site: "https://bright.test", email: "tolu@bright.test", whatsapp: "2348000000000",
      moment: "Launching in March", when: "This month", budget: "1.5m-3m", decider: "Me", worth: "Need clarity", route: "fit", source: "website",
      consent: true, status: "New", owner: "Ada", ...over,
    });

  beforeAll(async () => {
    sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    desk = await import("../desk/db");
    sync = await import("./crm-sync");
    const { createUser } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
  });

  afterAll(() => disconnect());

  it("creates a New lead linked to the application, owned by the matching person", async () => {
    await app("VS-1");
    await sync.syncApplicationToCrm("VS-1");
    const [c] = await sql.query(`select c.name, c.company, c.kind, c.stage, c.email, c.source, u.name as owner from hq_contacts c left join desk_users u on u.id = c.owner_id where c.application_id = 'VS-1'`);
    expect(c).toEqual({ name: "Tolu Founder", company: "Bright Co", kind: "sales", stage: "new", email: "tolu@bright.test", source: "Visibility Session", owner: "Ada Owner" });
  });

  it("doesn't make a second contact when it syncs again", async () => {
    await sync.syncApplicationToCrm("VS-1");
    expect((await sql.query(`select count(*)::int as n from hq_contacts`))[0].n).toBe(1);
  });

  it("links an existing contact with the same email instead of copying it", async () => {
    await sql.query(`insert into hq_contacts (id, name, email, stage) values ('c-old', 'Kemi', 'kemi@shop.test', 'discovery')`);
    await app("VS-2", { name: "Kemi", email: "KEMI@shop.test", company: "Shop" });
    await sync.syncApplicationToCrm("VS-2");
    expect(await sql.query(`select id, stage, application_id from hq_contacts where lower(email) = 'kemi@shop.test'`)).toEqual([{ id: "c-old", stage: "discovery", application_id: "VS-2" }]);
  });

  it("marks the contact won when the session is won, and leaves other stages to the CRM", async () => {
    await sql.query(`update hq_contacts set stage = 'proposal' where application_id = 'VS-1'`);
    await sql.query(`update vs_applications set status = 'Held' where id = 'VS-1'`);
    await sync.syncApplicationToCrm("VS-1");
    expect((await sql.query(`select stage from hq_contacts where application_id = 'VS-1'`))[0].stage).toBe("proposal");
    await sql.query(`update vs_applications set status = 'Won' where id = 'VS-1'`);
    await sync.syncApplicationToCrm("VS-1");
    const [c] = await sql.query(`select stage, won_at is not null as won from hq_contacts where application_id = 'VS-1'`);
    expect(c).toEqual({ stage: "won", won: true });
  });

  it("brings in older applications once", async () => {
    await app("VS-3", { email: "new@person.test", name: "New Person" });
    await sync.backfillApplications();
    await sync.backfillApplications();
    expect((await sql.query(`select count(*)::int as n from hq_contacts where application_id = 'VS-3'`))[0].n).toBe(1);
  });
});
