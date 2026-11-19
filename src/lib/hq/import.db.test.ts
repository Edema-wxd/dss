import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Sql, connect, disconnect, isLocalUrl } from "../driver";
import { applySchema } from "../schema";
import { runImport } from "./import";
import { SAMPLE_EXPORT } from "./sample-export";

// Runs the schema and the import against a real Postgres. Needs TEST_DATABASE_URL pointing at a
// local database whose name includes "test"; it is wiped first. Skipped when it isn't set.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("import into Postgres", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    // an existing desk account with the owner's email, as production will have
    await applySchema(sql);
    await sql.query(`insert into desk_users (email, name, role, roles, password_hash) values ('ada@example.test', 'Ada', 'admin', '{Owner}', 'scrypt$aa$bb')`);
  });

  afterAll(() => disconnect());

  it("applies the schema twice without complaint", async () => {
    await applySchema(sql);
    await applySchema(sql);
  });

  it("refuses to write when some documents have no table yet", async () => {
    const r = await runImport(sql, { ...SAMPLE_EXPORT, docs: { ...SAMPLE_EXPORT.docs, "plan/cycle-1": { name: "Q1" } } });
    expect(r.wrote).toBe(false);
    expect(r.unmapped).toEqual(["plan/cycle-1"]);
    expect((await sql.query(`select count(*)::int as n from hq_tasks`))[0].n).toBe(0);
  });

  it("imports, matches the existing account by email and keeps its password", async () => {
    const r = await runImport(sql, SAMPLE_EXPORT);
    expect(r.wrote).toBe(true);
    expect(r.people).toEqual({ created: 1, updated: 1 });
    const people = await sql.query(`select email, name, roles, password_hash, hq_uid is not null as linked from desk_users order by id`);
    expect(people).toEqual([
      { email: "ada@example.test", name: "Ada", roles: ["Owner"], password_hash: "scrypt$aa$bb", linked: true },
      { email: "bo@example.test", name: "Bo Staff", roles: ["Finance", "Operations (EA)"], password_hash: "none", linked: true },
    ]);
  });

  it("is safe to run again: nothing doubles", async () => {
    await runImport(sql, SAMPLE_EXPORT);
    const counts = await sql.query(`
      select (select count(*)::int from hq_fin_expenses) as expenses, (select count(*)::int from hq_tasks) as tasks,
             (select count(*)::int from desk_audit where action = 'activity.update') as activity,
             (select count(*)::int from desk_users) as people, (select sum(amount)::text from hq_fin_expenses) as spent`);
    expect(counts[0]).toEqual({ expenses: 2, tasks: 1, activity: 1, people: 2, spent: "200.50" });
  });

  it("links work to people", async () => {
    const [task] = await sql.query(`select u.email from hq_tasks t join desk_users u on u.id = t.assignee_id where t.id = 't-1'`);
    expect(task.email).toBe("ada@example.test");
    const [standup] = await sql.query(`select u.email, s.day::text from hq_standups s join desk_users u on u.id = s.user_id`);
    expect(standup).toEqual({ email: "bo@example.test", day: "2026-01-30" });
  });

  it("links pitches to outlets and keeps talent profiles", async () => {
    const [p] = await sql.query(`select m.name, p.for_key from hq_pitches p join hq_media m on m.id = p.outlet_id where p.id = 'p-1'`);
    expect(p).toEqual({ name: "Test FM", for_key: "talent:tal-1" });
    const [t] = await sql.query(`select avoid, jsonb_array_length(socials) as socials, trial_ends::text from hq_talents where id = 'tal-1'`);
    expect(t).toEqual({ avoid: ["Rival Cola"], socials: 1, trial_ends: "2026-03-01" });
  });
});
