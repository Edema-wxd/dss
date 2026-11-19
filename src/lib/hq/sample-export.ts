import type { ExportFile } from "./import.ts";

// A made-up export in the shape of the claude.ai HQ export, for the tests.
// This repository is public: no real people, clients or amounts belong here.

export const OWNER_UID = "u_TestOwner000000000000a";
export const STAFF_UID = "u_TestStaff000000000000b";

export const SAMPLE_EXPORT: ExportFile = {
  exportedAt: "2026-01-31",
  docs: {
    [`people/${OWNER_UID}`]: { name: "Ada Owner", email: "Ada@Example.test", title: "Founder", hours: 40, chatPub: "{}", joinedAt: "2026-01-01T09:00:00Z" },
    [`roles/${OWNER_UID}`]: { role: "Owner", active: true, since: "2026-01-01T09:00:00Z" },
    [`people/${STAFF_UID}`]: { name: "Bo Staff", email: "bo@example.test" },
    [`roles/${STAFF_UID}`]: { role: "Operations (EA)", roles: ["Operations (EA)", "Finance"], active: true, pattern: { mon: "full", sat: "off" } },
    "people/u_NoEmail000000000000000c": { name: "No Email" },

    "settings/general": { annualGoal: 1000, monthlyGoal: 100, dataFeed: "sheet-id" },
    "fin/settings": { openingCash: 50, statements: { "2026-01": 75 }, updatedAt: "2026-01-20T10:00:00Z" },

    "clients/acme": { name: "Acme Test Co", status: "active", fee: 1000, currency: "NGN", startDate: "2026-01-05", leadUid: "owner", links: {}, onb: { status: "done" } },
    "talents/tal-1": { name: "Test Talent", managerUid: STAFF_UID, commission: 15 },
    "contacts/con-1": { name: "Cara Contact", company: "Acme Test Co", kind: "sales", stage: "proposal", ownerUid: STAFF_UID, tags: ["warm"], nextDate: "" },
    "deals/deal-1": { title: "Test deal", talentId: "tal-1", contactId: "con-gone", ownerUid: "owner", fee: 500 },

    "tasks/t-1": { title: "Send the report", assignee: "owner", due: "2026-02-01", status: "doing", estimate: 30.4, checklist: [{ t: "draft", done: true }], createdBy: STAFF_UID },
    "tasks/t-2": { title: "", assignee: STAFF_UID },
    [`standups/${STAFF_UID}/days/2026-01-30`]: { energy: "High", top: ["t-1"] },

    "kpis/k-1": { title: "Revenue", uid: "owner", target: 100, weight: 2 },
    "sops/s-1": { title: "Close a client", steps: [{ t: "Confirm in writing" }] },
    "reports/clients_2026-01": { month: "2026-01", title: "Clients", slides: [{ kind: "cover" }], auto: true, by: OWNER_UID },
    "fin/main/reports/finance_2026-01": { month: "2026-01", title: "Finance", slides: [], by: OWNER_UID },

    "fin/main/expenses/e-1": { date: "2026-01-10", amount: 120.5, cat: "transport", acct: "business", desc: "Fuel", deal: "Test Deal", recurring: false },
    "fin/main/expenses/e-2": { date: "2026-01-11", amount: 80, cat: "owner_draw", acct: "personal", desc: "Draw" },
    "fin/main/expenses/e-bad": { amount: 10, cat: "data" },
    "fin/main/income/i-1": { date: "2026-01-15", amount: 1000, type: "services", acct: "business", desc: "Fee", from: "ACME", clientId: "acme" },
    "fin/main/booked/2026-01": { locked: true, source: "books", lines: [], seen: ["acme"] },
    "fin/main/budgets/2026-02": { revenue: 2000, cats: { data: 10 }, by: "books" },
    "fin/main/assets/a-1": { name: "Laptop", cost: 600, date: "2026-01-02", firstMonth: "2026-01", life: 36, expIds: ["e-1"], expId: "e-1" },

    "mkt_news/n-1": { date: "2026-01-12", title: "A headline", url: "https://example.test/a", soWhat: "So what" },
    "chat_ch/general": { name: "General", order: 1, pins: [], last: { at: "2026-01-12T10:00:00Z", by: OWNER_UID, text: "Hi" } },
    "chat_ch/general/msgs/welcome": { at: "2026-01-12T10:00:00Z", by: OWNER_UID, text: "Hi", mentions: [STAFF_UID], reactions: { "👍": [STAFF_UID, "u_Unknown"] } },

    "activity/act-1": { at: "2026-01-12T11:00:00Z", by: OWNER_UID, type: "update", refType: "client", refId: "acme", text: "Done: Send the report" },

    [`data/users/${OWNER_UID}/chatkey`]: { priv: "secret" },
    "chat_dm/a__b": { members: [OWNER_UID, STAFF_UID] },
    "chat_dm/a__b/msgs/m1": { iv: "x", ct: "y" },
  },
};
