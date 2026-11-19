import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// Clients, contacts, contracts and timelines against a real Postgres.
// Needs TEST_DATABASE_URL (local, "test" in the name); it is wiped first.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("clients, CRM and contracts in Postgres", () => {
  let sales: typeof import("./sales");
  let ada: { id: number; name: string; email: string };

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    sales = await import("./sales");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    ada = (await listUsers())[0];
  });

  afterAll(() => disconnect());

  it("creates a client and edits only the fields given", async () => {
    const id = await sales.createClient({ name: "Acme", service: "AI Automation", fee: 500000, startDate: "2026-11-01", leadId: ada.id, links: { drive: "https://drive.test" } }, ada.id);
    await sales.updateClient(id, { health: "watch", endDate: "" });
    expect(await sales.getClient(id)).toMatchObject({ name: "Acme", fee: 500000, health: "watch", startDate: "2026-11-01", endDate: "", leadId: ada.id, links: { drive: "https://drive.test" } });
  });

  it("keeps a contact's tags, talents and money, and records a win", async () => {
    const id = await sales.createContact({ name: "Kemi", company: "Shop", tags: ["warm", "lagos"], value: 200000, stage: "new" }, ada.id);
    await sales.updateContact(id, { stage: "won", wonAt: "2026-11-19T10:00:00Z", talentIds: ["tal-1"] });
    expect(await sales.getContact(id)).toMatchObject({ name: "Kemi", tags: ["warm", "lagos"], value: 200000, stage: "won", wonAt: "2026-11-19T10:00:00Z", talentIds: ["tal-1"], kind: "sales" });
  });

  it("writes each record's timeline into the shared activity log", async () => {
    await sales.logActivity(ada, "client", "acme-1", "meeting", "Kick-off call");
    await sales.logActivity(ada, "contact", "c-1", "call", "Spoke on the phone");
    await sales.logActivity(ada, "contact", "c-1", "note", "Prefers WhatsApp");
    expect((await sales.timeline("client", "acme-1")).map((e) => [e.type, e.text, e.actor])).toEqual([["meeting", "Kick-off call", "Ada Owner"]]);
    expect(await sales.timeline("contact", "c-1")).toHaveLength(2);
    const touches = await sales.touchesSince("2026-01-01");
    expect(touches.get(ada.id)).toBe(1);
  });

  it("saves a contract and ends a client's contracts together", async () => {
    const id = await sales.saveContract(null, { kind: "client", clientId: "acme-1", start: "2026-01-01", end: "2026-12-31", value: 100, noticeDays: 45 }, ada.id);
    expect(await sales.getContract(id)).toMatchObject({ clientId: "acme-1", end: "2026-12-31", noticeDays: 45, value: 100, status: "active", history: [] });
    await sales.endClientContracts("acme-1");
    expect((await sales.getContract(id))!.status).toBe("ended");
  });

  it("stores the onboarding template", async () => {
    expect(await sales.getOnbTemplate()).toBeNull();
    await sales.saveOnbTemplate([{ t: "Welcome pack", day: 0, who: "point" }], ada.id);
    expect(await sales.getOnbTemplate()).toEqual([{ t: "Welcome pack", day: 0, who: "point" }]);
  });
});
