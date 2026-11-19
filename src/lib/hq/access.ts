// Who can open which part of the admin. Shared by the server (every page and action checks it)
// and the client (the nav only lists what someone can open). Taken from HQ's ROLES table in
// c-core.js, plus the two areas the merge added: Visibility Sessions and the Activity log.

export const MODULES = [
  { key: "today", label: "Today", phase: 2 },
  { key: "chat", label: "Messages", phase: 5 },
  { key: "plan", label: "12-week plan", phase: 5 },
  { key: "time", label: "Attendance", phase: 5 },
  { key: "overview", label: "Command centre", phase: 2 },
  { key: "tasks", label: "Tasks", phase: 2 },
  { key: "sessions", label: "Visibility Sessions", phase: 1 },
  { key: "clients", label: "Clients", phase: 3 },
  { key: "crm", label: "CRM", phase: 3 },
  { key: "talent", label: "Talent", phase: 3 },
  { key: "marketing", label: "Marketing", phase: 3 },
  { key: "finance", label: "Finance", phase: 4 },
  { key: "invoices", label: "Invoices", phase: 4 },
  { key: "kpis", label: "KPIs", phase: 2 },
  { key: "contracts", label: "Contracts", phase: 3 },
  { key: "reports", label: "Reports", phase: 4 },
  { key: "procedures", label: "Procedures", phase: 2 },
  { key: "team", label: "Team", phase: 1 },
  { key: "activity", label: "Activity", phase: 1 },
  { key: "settings", label: "Settings", phase: 2 },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];

/** Areas that exist in this build. The rest are listed above so access rules are settled once. */
export const BUILT: readonly ModuleKey[] = ["sessions", "team", "activity"];

export const ROLES = [
  "Owner",
  "Admin",
  "Finance",
  "Operations (EA)",
  "Marketing",
  "Operations",
  "Project Manager",
  "Sales",
  "Strategist",
  "Talent Manager",
  "Assistant (VA)",
  "Contributor",
  "Contractor",
] as const;

export type Role = (typeof ROLES)[number];

const ALL_STAFF: readonly ModuleKey[] = ["today", "tasks", "kpis", "procedures", "settings", "chat", "plan"];

// HQ's table, unchanged. "sessions" and "activity" are added below.
const HQ_ROLE_MODULES: Record<Role, readonly ModuleKey[]> = {
  Owner: ["today", "overview", "tasks", "clients", "crm", "talent", "marketing", "finance", "invoices", "kpis", "reports", "team", "contracts", "procedures", "settings", "chat", "plan", "time"],
  Admin: ["today", "overview", "tasks", "clients", "crm", "talent", "marketing", "invoices", "kpis", "reports", "team", "contracts", "procedures", "settings", "chat", "plan", "time"],
  Finance: ["today", "overview", "tasks", "finance", "invoices", "kpis", "reports", "team", "contracts", "procedures", "settings", "chat", "plan", "time"],
  "Operations (EA)": ["today", "overview", "tasks", "clients", "crm", "talent", "invoices", "kpis", "team", "contracts", "procedures", "settings", "chat", "plan", "time"],
  Marketing: ["today", "tasks", "marketing", "crm", "clients", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Operations: ["today", "overview", "tasks", "clients", "crm", "talent", "contracts", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  "Project Manager": ["today", "overview", "tasks", "clients", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Sales: ["today", "tasks", "crm", "clients", "marketing", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Strategist: ["today", "tasks", "clients", "crm", "marketing", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  "Talent Manager": ["today", "tasks", "talent", "crm", "clients", "kpis", "team", "contracts", "procedures", "settings", "chat", "plan", "time"],
  "Assistant (VA)": ["today", "tasks", "crm", "talent", "clients", "marketing", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Contributor: ["today", "tasks", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Contractor: ALL_STAFF,
};

export const ROLE_NOTES: Record<Role, string> = {
  Owner: "Everything, including Finance, the Activity log, and adding or removing people.",
  Admin: "Runs the business day to day. Everything except Finance.",
  Finance: "Budgets, spend, profit and loss, tax, invoices and the report archive.",
  "Operations (EA)": "Tasks, clients, CRM, talent, contracts and invoices.",
  Marketing: "Marketing dashboard, content planner, ads, CRM and clients.",
  Operations: "Runs delivery and the back office: tasks, clients, CRM, talent and contracts.",
  "Project Manager": "Tasks, clients and the command centre.",
  Sales: "CRM, clients and marketing.",
  Strategist: "Clients, CRM and marketing.",
  "Talent Manager": "Talent roster, deals, CRM and contracts.",
  "Assistant (VA)": "CRM, talent, clients and marketing support.",
  Contributor: "Their own tasks, KPIs, attendance, plan, procedures and messages.",
  Contractor: "Only their tasks, KPIs, procedures, plan and messages. No Team list or Visibility Sessions.",
};

export const isRole = (v: unknown): v is Role => (ROLES as readonly string[]).includes(String(v));

/** The areas a set of roles can open: the union over every role held. Unknown roles count for nothing. */
export function modulesFor(roles: readonly string[]): Set<ModuleKey> {
  const out = new Set<ModuleKey>();
  for (const r of roles) {
    if (!isRole(r)) continue;
    for (const m of HQ_ROLE_MODULES[r]) out.add(m);
    // The Session Desk was open to every desk account, so every staff role keeps it. Contractors don't.
    if (r !== "Contractor") out.add("sessions");
    if (r === "Owner") out.add("activity");
  }
  return out;
}

export const canUse = (roles: readonly string[], mod: ModuleKey) => modulesFor(roles).has(mod);

export const isOwner = (roles: readonly string[]) => roles.includes("Owner");

/** The built areas someone can open, in nav order. */
export function navFor(roles: readonly string[]) {
  const mine = modulesFor(roles);
  return MODULES.filter((m) => BUILT.includes(m.key) && mine.has(m.key));
}

/** Keeps known roles only, in the canonical order, without repeats. */
export const cleanRoles = (roles: readonly unknown[]): Role[] => ROLES.filter((r) => roles.includes(r));
