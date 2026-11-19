import { describe, expect, it } from "vitest";
import { type Batch, classify, planActivity, planDocs, planPeople } from "./import";
import { OWNER_UID, SAMPLE_EXPORT, STAFF_UID } from "./sample-export";

const docs = SAMPLE_EXPORT.docs;

function plan(extraDocs = {}) {
  const warnings: string[] = [];
  const users = new Map([
    [OWNER_UID, 1],
    [STAFF_UID, 2],
  ]);
  const all = { ...docs, ...extraDocs };
  const out = planDocs(all, { users, ownerId: 1, fallbackStamp: "2026-01-31T00:00:00Z", warn: (m) => warnings.push(m) });
  return { ...out, warnings };
}

/** One planned row as {column: value}. */
function row(batches: Batch[], table: string, match: (r: Record<string, unknown>) => boolean) {
  const b = batches.find((x) => x.table === table)!;
  return b.rows.map((r) => Object.fromEntries(b.columns.map((c, i) => [c, r[i]]))).find(match)!;
}

describe("sorting the export", () => {
  it("leaves out private keys and DMs, and accounts for every other document", () => {
    const c = classify(docs);
    expect(c.excluded).toEqual(["chat_dm/a__b", "chat_dm/a__b/msgs/m1", `data/users/${OWNER_UID}/chatkey`]);
    expect(c.unmapped).toEqual([]);
    const counted = c.excluded.length + c.activity.length + c.specs.length;
    const peopleDocs = Object.keys(docs).filter((p) => /^(people|roles)\//.test(p)).length;
    expect(counted + peopleDocs).toBe(Object.keys(docs).length);
  });

  it("flags documents that have no table yet", () => {
    expect(classify({ ...docs, "time/u_x/days/2026-01-02": {}, "plan/c1": {} }).unmapped).toEqual(["plan/c1", "time/u_x/days/2026-01-02"]);
  });
});

describe("people", () => {
  it("joins people and roles, lowercases emails and keeps both roles", () => {
    const warnings: string[] = [];
    const { people, ownerUid } = planPeople(docs, (m) => warnings.push(m));
    expect(ownerUid).toBe(OWNER_UID);
    const owner = people.find((p) => p.uid === OWNER_UID)!;
    expect(owner).toMatchObject({ email: "ada@example.test", name: "Ada Owner", roles: ["Owner"], hours: 40, active: true });
    expect(JSON.parse(owner.extra)).toMatchObject({ chatPub: "{}", "roles.since": "2026-01-01T09:00:00Z" });
    const staff = people.find((p) => p.uid === STAFF_UID)!;
    expect(staff.roles).toEqual(["Finance", "Operations (EA)"]);
    expect(JSON.parse(staff.pattern!)).toEqual({ mon: "full", sat: "off" });
  });

  it("reports someone with no email instead of making an account", () => {
    const warnings: string[] = [];
    const { people } = planPeople(docs, (m) => warnings.push(m));
    expect(people.map((p) => p.uid)).not.toContain("u_NoEmail000000000000000c");
    expect(warnings.join()).toContain("no email");
  });
});

describe("documents", () => {
  it("turns HQ's uids and the 'owner' placeholder into person ids", () => {
    const { batches } = plan();
    expect(row(batches, "hq_tasks", (r) => r.id === "t-1")).toMatchObject({ assignee_id: 1, created_by: 2, due: "2026-02-01", estimate: 30, status: "doing" });
    expect(row(batches, "hq_clients", (r) => r.id === "acme").lead_id).toBe(1);
    expect(row(batches, "hq_kpis", (r) => r.id === "k-1").owner_id).toBe(1);
    expect(row(batches, "hq_standups", () => true)).toMatchObject({ user_id: 2, day: "2026-01-30" });
  });

  it("keeps fields without a column in extra", () => {
    const { batches } = plan();
    expect(JSON.parse(row(batches, "hq_clients", (r) => r.id === "acme").extra as string)).toEqual({ onb: { status: "done" } });
    expect(JSON.parse(row(batches, "hq_fin_assets", (r) => r.id === "a-1").extra as string)).toEqual({ expId: "e-1" });
  });

  it("keeps a non-person marker in extra and warns", () => {
    const { batches, warnings } = plan();
    const budget = row(batches, "hq_fin_budgets", (r) => r.month === "2026-02");
    expect(budget.by_id).toBeNull();
    expect(JSON.parse(budget.extra as string)).toEqual({ by: "books" });
    expect(warnings.join()).toContain("unknown person books");
  });

  it("blanks a link to a document that isn't in the export", () => {
    const { batches, warnings } = plan();
    expect(row(batches, "hq_deals", (r) => r.id === "deal-1")).toMatchObject({ talent_id: "tal-1", contact_id: null, owner_id: 1 });
    expect(warnings.join()).toContain("contacts/con-gone");
  });

  it("skips and reports a ledger line with no date, and a task with no title", () => {
    const { batches, errors } = plan();
    expect(errors).toEqual(["fin/main/expenses/e-bad: skipped, missing date", "tasks/t-2: skipped, missing title"]);
    expect(batches.find((b) => b.table === "hq_fin_expenses")!.rows).toHaveLength(2);
  });

  it("keeps money exact and business and personal apart", () => {
    const { batches } = plan();
    expect(row(batches, "hq_fin_expenses", (r) => r.id === "e-1")).toMatchObject({ amount: 120.5, acct: "business", description: "Fuel" });
    expect(row(batches, "hq_fin_expenses", (r) => r.id === "e-2")).toMatchObject({ acct: "personal", cat: "owner_draw" });
    expect(row(batches, "hq_fin_income", (r) => r.id === "i-1")).toMatchObject({ amount: 1000, type: "services", client_id: "acme", from_name: "ACME" });
  });

  it("puts finance and other reports in one table with their area", () => {
    const { batches } = plan();
    const reports = batches.filter((b) => b.table === "hq_reports");
    expect(reports).toHaveLength(1);
    expect(row(batches, "hq_reports", (r) => r.id === "finance_2026-01").area).toBe("finance");
    expect(row(batches, "hq_reports", (r) => r.id === "clients_2026-01").area).toBe("clients");
  });

  it("stores both settings documents under their own keys", () => {
    const { batches } = plan();
    const general = row(batches, "hq_settings", (r) => r.key === "general");
    expect(JSON.parse(general.value as string)).toMatchObject({ annualGoal: 1000 });
    expect(JSON.parse(row(batches, "hq_settings", (r) => r.key === "finance").value as string)).toMatchObject({ openingCash: 50 });
  });

  it("maps message mentions and reactions, dropping people it can't find", () => {
    const { batches } = plan();
    const msg = row(batches, "hq_chat_messages", (r) => r.id === "welcome");
    expect(msg).toMatchObject({ channel_id: "general", by_id: 1, mentions: [2] });
    expect(JSON.parse(msg.reactions as string)).toEqual({ "👍": [2] });
    expect(JSON.parse(row(batches, "hq_chat_channels", (r) => r.id === "general").last as string)).toMatchObject({ by: 1 });
  });

  it("writes tables in an order where every link already exists", () => {
    const order = plan().batches.map((b) => b.table);
    expect(order.indexOf("hq_talents")).toBeLessThan(order.indexOf("hq_deals"));
    expect(order.indexOf("hq_contacts")).toBeLessThan(order.indexOf("hq_deals"));
    expect(order.indexOf("hq_chat_channels")).toBeLessThan(order.indexOf("hq_chat_messages"));
  });

  it("turns the activity feed into audit lines", () => {
    expect(planActivity(docs)).toEqual([
      { ref: "activity/act-1", at: "2026-01-12T11:00:00Z", byUid: OWNER_UID, action: "activity.update", target: "client:acme", summary: "Done: Send the report" },
    ]);
  });

  it("brings over v24 talent profiles, keeping fields it doesn't know yet", () => {
    const { batches } = plan();
    const t = row(batches, "hq_talents", (r) => r.id === "tal-1");
    expect(t).toMatchObject({ trial_ends: "2026-03-01", interests: ["food"], industries: ["Beverages"], avoid: ["Rival Cola"], partners: ["Acme Test Co"], rate_notes: "Before VAT" });
    expect(JSON.parse(t.socials as string)[0]).toMatchObject({ platform: "instagram", followers: 1200 });
    expect(JSON.parse(t.rates as string)).toHaveLength(1);
    expect(JSON.parse(t.audience as string)).toMatchObject({ female: 60 });
    expect(JSON.parse(t.extra as string)).toEqual({ futureField: "kept" });
  });

  it("brings over the brand tracker, with status updates pointing at people", () => {
    const { batches } = plan();
    const d = row(batches, "hq_deals", (r) => r.id === "deal-1");
    expect(d).toMatchObject({ health: "watch", proposed: 800, fee: 500, received: 250, next_step: "Send the contract", next_date: "2026-02-03", usage: "3 months organic" });
    expect(JSON.parse(d.updates as string)).toEqual([{ at: "2026-01-20T10:00:00Z", by: 2, text: "Brand came back with 500" }]);
    expect(JSON.parse(d.extra as string)).toEqual({});
  });

  it("brings over Publicity: outlets, and pitches linked to them", () => {
    const { batches, warnings } = plan();
    expect(row(batches, "hq_media", (r) => r.id === "out-1")).toMatchObject({ name: "Test FM", type: "radio", show: "Morning Drive", industries: ["Lifestyle"], status: "warm", owner_id: 2 });
    expect(row(batches, "hq_pitches", (r) => r.id === "p-1")).toMatchObject({ for_key: "talent:tal-1", outlet_id: "out-1", status: "pitched", pitched_on: "2026-01-21", owner_id: 1 });
    expect(row(batches, "hq_pitches", (r) => r.id === "p-2")).toMatchObject({ for_key: "dss", outlet_id: null });
    expect(warnings.join()).toContain("media/out-gone");
    const order = batches.map((b) => b.table);
    expect(order.indexOf("hq_media")).toBeLessThan(order.indexOf("hq_pitches"));
  });
});
