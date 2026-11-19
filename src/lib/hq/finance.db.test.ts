import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";
import { finance } from "./finance-model";

// Finance and Invoices against a real Postgres. Needs TEST_DATABASE_URL (local, "test" in the
// name); it is wiped first. Every name and amount here is made up.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("finance and invoices in Postgres", () => {
  let fin: typeof import("./finance");
  let ada: { id: number; name: string; email: string };
  let clientId: string;
  let talentId: string;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    fin = await import("./finance");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    ada = (await listUsers())[0];
    const sales = await import("./sales");
    clientId = await sales.createClient({ name: "Acme", service: "Brand Strategy", fee: 400000, startDate: "2026-09-10", health: "good" }, ada.id);
    const talent = await import("./talent");
    talentId = await talent.createTalent({ name: "Toby Forge", commission: 20 }, ada.id);
  });

  afterAll(() => disconnect());

  it("saves expenses and income, and puts capital purchases on the asset register", async () => {
    await fin.saveExpense(null, { date: "2026-11-02", amount: 30000, cat: "subs", description: "Design tool", acct: "business" }, ada.id);
    const cam = await fin.saveExpense(null, { date: "2026-11-03", amount: 720000, cat: "capital", description: "Camera", life: 24 }, ada.id);
    expect(cam.addedAsset).toBe(true);
    await fin.saveIncome(null, { date: "2026-11-05", amount: 150000, type: "speaking", description: "Workshop" }, ada.id);
    const assets = await fin.listAssets();
    expect(assets).toMatchObject([{ name: "Camera", cost: 720000, firstMonth: "2026-11", life: 24 }]);
    const f = finance(await fin.loadBooks({ ledger: true }, "2026-11-19"));
    const p = f.plFor("2026-11");
    expect(p.r.other).toBe(150000);
    expect(p.opex).toBe(30000);
    expect(p.dep).toBe(30000);
    expect(f.cashAt("2026-11-30")).toBe(150000 - 30000 - 720000);
  });

  it("files this month's retainers and adds them to earlier months", async () => {
    const changed = await fin.syncBooked("2026-11-19");
    expect(changed.sort()).toEqual(["2026-09", "2026-10", "2026-11"]);
    const f = finance(await fin.loadBooks({ ledger: true }, "2026-11-19"));
    expect(f.plFor("2026-10").r.retainers).toBe(400000);
    expect(await fin.syncBooked("2026-11-19")).toEqual([]);
    await fin.setRetainerSkip("2026-11", clientId, true);
    const g = finance(await fin.loadBooks({ ledger: true }, "2026-11-19"));
    expect(g.plFor("2026-11").r.retainers).toBe(0);
  });

  it("numbers, checks and saves invoices", async () => {
    expect(await fin.suggestInvoiceNo("client", "2026-11-19")).toBe("DSS-INV-2026-001");
    const draft = {
      no: "DSS-INV-2026-001", kind: "client", status: "draft", currency: "NGN", issueDate: "2026-11-19", dueDate: "2026-12-03",
      items: [{ d: "Audit", q: 1, p: 200000 }, { d: "", q: 1, p: 0 }], vat: true, vatRate: 7.5, wht: false, discType: "pct", discValue: null,
      discLabel: "", notes: "", billTo: { name: " Acme " }, clientId, period: "", talentId: null, dealId: null, commissionPct: null,
      talentLine: "", payBank: true, payPaystack: false, bankId: "", payLink: "", payments: [],
    };
    const id = await fin.saveInvoice(null, draft, ada, { send: true });
    const inv = await fin.getInvoice(id);
    expect(inv).toMatchObject({ status: "sent", items: [{ d: "Audit", q: 1, p: 200000 }], billTo: { name: "Acme" }, vatRate: 7.5 });
    expect(inv!.sentAt).not.toBe("");
    await expect(fin.saveInvoice(null, draft, ada)).rejects.toThrow("already used");
    expect(await fin.recordPayment(id, { amt: 100000, wht: 0, date: "2026-11-20", method: "Bank transfer", note: "" }, ada)).toContain("left");
    expect(await fin.recordPayment(id, { amt: 105000, wht: 10000, date: "2026-11-21", method: "Bank transfer", note: "" }, ada)).toContain("paid in full");
    const f = finance(await fin.loadBooks({ ledger: true }, "2026-11-25"));
    expect(f.plFor("2026-11").r.services).toBeCloseTo(215000 * (200000 / 215000));
  });

  it("makes the talent's payout when a brand pays in full", async () => {
    const id = await fin.saveInvoice(
      null,
      {
        no: "DSS-TAL-2026-001", kind: "talent", status: "sent", currency: "NGN", issueDate: "2026-11-19", dueDate: "2026-12-03",
        items: [{ d: "Campaign", q: 1, p: 1000000 }], vat: false, vatRate: 7.5, wht: false, discType: "pct", discValue: null, discLabel: "",
        notes: "", billTo: { name: "Brandco" }, clientId: null, period: "", talentId, dealId: null, commissionPct: 20, talentLine: "",
        payBank: true, payPaystack: false, bankId: "", payLink: "", payments: [],
      },
      ada,
    );
    expect(await fin.recordPayment(id, { amt: 1000000, wht: 0, date: "2026-11-22", method: "Bank transfer", note: "" }, ada)).toContain("Toby Forge's payout");
    const [po] = await fin.listPayouts();
    expect(po).toMatchObject({ invoiceNo: "DSS-TAL-2026-001", gross: 1000000, commission: 200000, net: 800000, status: "due" });
    await fin.markPayoutPaid(po.id, "2026-11-23", "TRF-1");
    expect((await fin.listPayouts())[0]).toMatchObject({ status: "paid", paidAt: "2026-11-23", ref: "TRF-1" });
    await fin.saveTalentBank(talentId, { bank: "Test Bank", number: "0001112223" });
    expect(await fin.getTalentBank(talentId)).toEqual({ bank: "Test Bank", name: "", number: "0001112223" });
  });

  it("drafts retainer invoices once a month", async () => {
    const { createClient } = await import("./sales");
    await createClient({ name: "Beacon", service: "", fee: 250000, startDate: "2026-11-01" }, ada.id);
    const before = await fin.retainerCandidates("2026-11-19");
    expect(before.map((c) => c.name)).toEqual(["Beacon"]); // Acme already has November's invoice
    expect(await fin.createRetainerDrafts({}, ada, "November 2026", "2026-11-19")).toBe(1);
    expect(await fin.retainerCandidates("2026-11-19")).toEqual([]);
    const beacon = (await fin.listInvoices()).find((i) => i.billTo.name === "Beacon")!;
    expect(beacon).toMatchObject({ no: "DSS-INV-2026-002", status: "draft", period: "2026-11", items: [{ d: "Retainer: November 2026", q: 1, p: 250000 }] });
  });

  it("merges finance settings one level deep", async () => {
    await fin.patchFinSettings({ company: { name: "DSS", rc: "RC-1" }, terms: 14 }, ada.id);
    await fin.patchFinSettings({ company: { email: "a@example.test" } }, ada.id);
    expect(await fin.getFinSettings()).toMatchObject({ company: { name: "DSS", rc: "RC-1", email: "a@example.test" }, terms: 14 });
  });
});
