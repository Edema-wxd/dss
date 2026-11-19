import { describe, expect, it } from "vitest";
import { buildRecords, lagosStamp, newLedgerRows } from "./records-model";

const base = {
  people: [{ id: 1, name: "Ada Owner" }],
  tasks: [{ id: "t1", title: "Send the report", assigneeId: 1, due: "2026-11-20", status: "doing", priority: "top", clientId: "c1", notes: "", doneAt: "" }],
  clients: [{ id: "c1", name: "Acme", service: "AI Automation", status: "active", health: "watch", fee: 500, currency: "NGN", billing: "monthly", startDate: "2026-01-01", endDate: "", contactName: "Bo", contactRole: "CEO", nextDeliverable: "", nextDate: "" }],
  contacts: [{ id: "k1", name: "Kemi", company: "Shop", kind: "talent", stage: "talks", industry: "", location: "", service: "", relType: "Brand", source: "Referral", ownerId: 1, nextDate: "", notes: "" }],
  talents: [
    {
      id: "tal", name: "Test Talent", category: "Actor", status: "signed", package: "The Roster", commission: 20, payFlow: "direct", coManager: "",
      goals: [{ t: "A", done: true }, { t: "B", done: false }], interests: ["Food"], industries: [], avoid: ["Rival"], partners: [],
      socials: [{ id: "s", platform: "Instagram", handle: "@t", followers: 1200 }], audience: { female: 60, male: 40, ages: { "18_24": 46 }, locations: "Lagos" },
      rates: [{ id: "r1", item: "Reel", platform: "Instagram", price: 50, currency: "NGN" }],
    },
  ],
  deals: [
    {
      id: "d1", talentId: "tal", brand: "Brandco", title: "Launch", stage: "prospect", health: "good", contactPerson: "", contactRole: "", proposed: 800, fee: null, received: null,
      currency: "NGN", commissionPct: 20, deliverables: [{ t: "x", done: true }, { t: "y", done: false }], nextStep: "Call", nextDate: "", dueDate: "2026-12-01",
      updates: [{ at: "2026-11-02T10:00:00Z", by: 1, text: "Second" }, { at: "2026-11-01T10:00:00Z", by: 1, text: "First" }], notes: "",
    },
  ],
  media: [],
  pitches: [{ id: "p1", forKey: "talent:tal", outletId: null, angle: "Story", status: "booked", pitchedOn: "", runDate: "", link: "", ownerId: 1, nextDate: "", updates: [] }],
};

describe("the Records sheet", () => {
  const tabs = buildRecords(base);
  it("names people, clients and labels instead of ids", () => {
    expect(tabs.Tasks[0]).toEqual(["t1", "Send the report", "Ada Owner", "2026-11-20", "In progress", "top", "Acme", "", ""]);
    expect(tabs.Clients[0]).toContain("Bo (CEO)");
    expect(tabs.Clients[0]).toContain("Watch");
    expect(tabs.CRM[0].slice(3, 5)).toEqual(["Talent relationships", "In talks"]);
  });
  it("writes talent goals, audience and the rate card", () => {
    const t = tabs.Talent[0];
    expect(t[6]).toBe("Brand pays talent");
    expect(t[8]).toBe("[done] A | B");
    expect(t[13]).toBe(1200);
    expect(t[17]).toBe("18 to 24: 46%");
    expect(tabs["Rate cards"]).toEqual([["tal:r1", "Test Talent", "Instagram", "Reel", 50, "NGN", ""]]);
  });
  it("uses the newest status update and the key date when there's no next date", () => {
    const d = tabs["Brand tracker"][0];
    expect(d.slice(13, 18)).toEqual([1, 2, "Call", "2026-12-01", "2026-11-02: Second"]);
    expect(tabs.Pitches[0][1]).toBe("Test Talent");
  });
  it("only appends ledger rows the sheet doesn't have yet, by date", () => {
    const rows = [
      { id: "b", date: "2026-11-02", description: "Fuel", party: "", kind: "transport", acct: "business", amount: 10, currency: "NGN", method: "Card" },
      { id: "a", date: "2026-11-01", description: "Data", party: "", kind: "data", acct: "business", amount: 5, currency: "NGN" },
      { id: "c", date: "2026-10-01", description: "Old", party: "", kind: "data", acct: "business", amount: 1, currency: "NGN" },
    ];
    expect(newLedgerRows(rows, new Set(["c"]), true).map((r) => r[0])).toEqual(["a", "b"]);
    expect(newLedgerRows(rows, new Set(), false)[0]).toHaveLength(8);
  });
  it("stamps the time in Lagos", () => {
    expect(lagosStamp(new Date("2026-11-19T22:17:00Z"))).toBe("19 Nov 2026, 23:17 Lagos");
  });
});
