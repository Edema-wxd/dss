import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Sql, connect, disconnect, isLocalUrl } from "./driver";
import { SCHEMA_VERSION, ensureCurrentSchema } from "./schema";

// What happens to the production database on the first request after this deploys:
// the desk's tables already exist, with admin and team accounts and no roles yet.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("upgrading the existing desk database", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    // the desk_users table exactly as the desk created it before HQ
    await sql.query(`create table desk_users (
      id bigserial primary key, email text not null unique, name text not null,
      role text not null default 'team', password_hash text not null, created timestamptz not null default now())`);
    await sql.query(`insert into desk_users (email, name, role, password_hash) values
      ('admin@example.test', 'Desk Admin', 'admin', 'scrypt$aa$bb'), ('team@example.test', 'Desk Team', 'team', 'scrypt$cc$dd')`);
  });

  afterAll(() => disconnect());

  it("makes desk admins Owners and team accounts Contributors, keeping their passwords", async () => {
    expect(await ensureCurrentSchema(sql)).toBe(true);
    const users = await sql.query(`select email, roles, active, password_hash from desk_users order by id`);
    expect(users).toEqual([
      { email: "admin@example.test", roles: ["Owner"], active: true, password_hash: "scrypt$aa$bb" },
      { email: "team@example.test", roles: ["Contributor"], active: true, password_hash: "scrypt$cc$dd" },
    ]);
  });

  it("does nothing on the next start when the schema hasn't changed", async () => {
    expect(await ensureCurrentSchema(sql)).toBe(false);
    const [meta] = await sql.query(`select value from app_meta where key = 'schema'`);
    expect(meta.value).toBe(SCHEMA_VERSION);
  });

  it("doesn't overwrite roles the owner has since changed", async () => {
    await sql.query(`update desk_users set roles = '{Finance}' where email = 'team@example.test'`);
    await sql.query(`delete from app_meta`);
    await ensureCurrentSchema(sql);
    const [team] = await sql.query(`select roles from desk_users where email = 'team@example.test'`);
    expect(team.roles).toEqual(["Finance"]);
  });
});
