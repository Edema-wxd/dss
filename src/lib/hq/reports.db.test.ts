import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// The report archive against a real Postgres. Needs TEST_DATABASE_URL (local, "test" in the
// name); it is wiped first. Everything here is made up.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("reports in Postgres", () => {
  let reports: typeof import("./reports");
  let ada: number;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    reports = await import("./reports");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    ada = (await listUsers())[0].id;
    const { createClient } = await import("./sales");
    await createClient({ name: "Acme", service: "Brand Strategy", fee: 400000, startDate: "2026-09-01" }, ada);
  });

  afterAll(() => disconnect());

  it("files last month's reports once, and keeps them", async () => {
    expect((await reports.fileLastMonth(undefined, true, "2026-11-02")).length).toBe(7);
    expect(await reports.fileLastMonth(undefined, true, "2026-11-20")).toEqual([]);
    const list = await reports.listReports(["finance", "clients"]);
    expect(list.map((r) => [r.id, r.auto])).toEqual([
      ["clients_2026-10", true],
      ["finance_2026-10", true],
    ]);
    const clients = await reports.getReport("clients_2026-10");
    expect(clients?.slides[1]).toMatchObject({ kind: "stats", items: expect.arrayContaining([{ k: "Live clients", v: "1", s: "0 onboarding" }]) });
  });

  it("leaves Finance out when whoever triggers the filing can't see it", async () => {
    expect(await reports.fileLastMonth(["finance", "overview"], false, "2026-12-01")).toEqual(["finance", "overview"]);
    expect(await reports.getReport("finance_2026-11")).toBeNull();
    const overview = await reports.getReport("overview_2026-11");
    const keys = overview?.slides[1].kind === "stats" ? overview.slides[1].items.map((x) => x.k) : [];
    expect(keys).not.toContain("Revenue");
  });

  it("a rebuild replaces the snapshot and records who made it", async () => {
    const data = await reports.loadReportData(true, "2026-11-20");
    await reports.saveReport("clients", "2026-10", data, ada);
    expect((await reports.listReports(["clients"]))[0]).toMatchObject({ auto: false, byName: "Ada Owner" });
  });
});
