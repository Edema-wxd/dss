import { finance, type Books } from "./finance-model";
import type { ReportData } from "./report-model";

// Made-up data for the report tests. None of these names or amounts are real.

const books: Books = {
  today: "2026-11-03",
  fx: {},
  settings: { tax: { reserveRate: 20 } },
  expenses: [
    { id: "e1", date: "2026-10-05", amount: 120000, currency: "NGN", cat: "workspace", acct: "business", description: "Desk", vendor: "", method: "", clientId: null, assetId: null, recurring: false, receipt: "", source: "" },
    { id: "e2", date: "2026-10-09", amount: 60000, currency: "NGN", cat: "transport", acct: "business", description: "Fuel", vendor: "", method: "", clientId: null, assetId: null, recurring: false, receipt: "", source: "" },
  ],
  income: [{ id: "i1", date: "2026-10-12", amount: 900000, currency: "NGN", type: "services", acct: "business", description: "Fees", from: "", clientId: null, period: "", source: "" }],
  invoices: [],
  booked: [],
  assets: [],
  budgets: [{ month: "2026-10", revenue: null, cats: { workspace: 100000, transport: 80000 } }],
  clients: [],
};

export const reportFixture = (): ReportData => ({
  today: "2026-11-03",
  monthlyGoal: 2000000,
  f: finance(books),
  toNGN: (a) => a,
  people: [
    { id: 1, name: "Ada Owner" },
    { id: 2, name: "Bo Staff" },
  ],
  tasks: [
    { assigneeId: 2, status: "done", doneDay: "2026-10-14", due: "2026-10-14", clientId: "c1" },
    { assigneeId: 2, status: "done", doneDay: "2026-10-20", due: "2026-10-20", clientId: "c1" },
    { assigneeId: 1, status: "todo", doneDay: "", due: "2026-10-30", clientId: null },
  ],
  contacts: [
    { id: "k1", kind: "sales", name: "Kemi", company: "Shopco", stage: "won", createdAt: "2026-10-02T09:00:00Z", wonAt: "2026-10-25T09:00:00Z", source: "Instagram", value: 500000, currency: "NGN", nextDate: "", ownerId: 2 },
    { id: "k2", kind: "sales", name: "Tunde", company: "", stage: "proposal", createdAt: "2026-10-10T09:00:00Z", wonAt: "", source: "Referral", value: 300000, currency: "NGN", nextDate: "2026-10-30", ownerId: 2 },
    { id: "k3", kind: "talent", name: "Brand person", company: "Brandco", stage: "pitched", createdAt: "2026-09-01T09:00:00Z", wonAt: "", source: "", value: null, currency: "NGN", nextDate: "", ownerId: 1 },
  ],
  touches: [
    { userId: 2, refId: "k2", type: "call", day: "2026-10-11" },
    { userId: 2, refId: "k2", type: "note", day: "2026-10-11" },
    { userId: 1, refId: "k3", type: "email", day: "2026-10-15" },
  ],
  clients: [
    { id: "c1", name: "Acme", service: "Brand Strategy", status: "active", health: "good", endDate: "2026-12-01", fee: 400000, currency: "NGN", billing: "monthly" },
    { id: "c2", name: "Beacon", service: "Content", status: "active", health: "risk", endDate: "", fee: 250000, currency: "NGN", billing: "monthly" },
  ],
  deals: [{ talentId: "t1", brand: "Brandco", stage: "contracted", fee: 1000000, currency: "NGN", commissionPct: 20, updatedAt: "2026-10-18" }],
  talents: [{ id: "t1", name: "Toby Forge" }],
  kpis: [
    { id: "kp1", title: "Tasks done", ownerId: 2, unit: "count", target: 2, period: "month", direction: "up", source: "auto_tasks", weight: 1 },
    { id: "kp2", title: "Follow-ups", ownerId: 2, unit: "count", target: 4, period: "month", direction: "up", source: "auto_touches", weight: 1 },
  ],
  kpiLogs: [],
  mkt: {
    accounts: [{ id: "a1", platform: "instagram", handle: "@dss" }],
    stats: [
      { accountId: "a1", month: "2026-09", followers: 1000, reach: 3000, engagements: 150, posts: 10, leads: 1 },
      { accountId: "a1", month: "2026-10", followers: 1200, reach: 5000, engagements: 400, posts: 12, leads: 2 },
    ],
    posts: [{ title: "Three launch mistakes", platform: "instagram", date: "2026-10-08", status: "published", reach: 2000, engagements: 200 }],
    ads: [],
    web: {},
    platformName: (k) => (k === "instagram" ? "Instagram" : k),
  },
});
