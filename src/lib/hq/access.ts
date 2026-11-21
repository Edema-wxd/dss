// Who can open which part of the admin. Shared by the server (every page and action checks it)
// and the client (the nav only lists what someone can open). Taken from HQ's ROLES, SEES_MONEY
// and MKT_ONLY tables in c-core.js (HQ version 24), plus the two areas the merge added:
// Visibility Sessions and the Activity log.

/** The sidebar's groups, in order. A group someone can open nothing in isn't shown. */
export const NAV_GROUPS = [
  { key: "day", label: "Your day" },
  { key: "sales", label: "Sales and clients" },
  { key: "growth", label: "Talent and marketing" },
  { key: "money", label: "Money" },
  { key: "results", label: "Plans and results" },
  { key: "admin", label: "Team and admin" },
] as const;

export type NavGroup = (typeof NAV_GROUPS)[number]["key"];

/** Every area, in sidebar order. The first four someone can open go in the phone's bottom bar. */
export const MODULES = [
  { key: "today", label: "Today", phase: 2, group: "day" },
  { key: "overview", label: "Command centre", phase: 2, group: "day" },
  { key: "tasks", label: "Tasks", phase: 2, group: "day" },
  { key: "chat", label: "Messages", phase: 5, group: "day" },
  { key: "time", label: "Attendance", phase: 5, group: "day" },
  { key: "crm", label: "CRM", phase: 3, group: "sales" },
  { key: "sessions", label: "Visibility Sessions", phase: 1, group: "sales" },
  { key: "clients", label: "Clients", phase: 3, group: "sales" },
  { key: "contracts", label: "Contracts", phase: 3, group: "sales" },
  { key: "talent", label: "Talent", phase: 3, group: "growth" },
  { key: "marketing", label: "Marketing", phase: 3, group: "growth" },
  { key: "finance", label: "Finance", phase: 4, group: "money" },
  { key: "invoices", label: "Invoices", phase: 4, group: "money" },
  { key: "plan", label: "12-week plan", phase: 5, group: "results" },
  { key: "kpis", label: "KPIs", phase: 2, group: "results" },
  { key: "reports", label: "Reports", phase: 4, group: "results" },
  { key: "team", label: "Team", phase: 1, group: "admin" },
  { key: "procedures", label: "Procedures", phase: 2, group: "admin" },
  { key: "activity", label: "Activity", phase: 1, group: "admin" },
  { key: "settings", label: "Settings", phase: 2, group: "admin" },
] as const satisfies readonly { key: string; label: string; phase: number; group: NavGroup }[];

export type ModuleKey = (typeof MODULES)[number]["key"];

/** Areas that exist in this build. The rest are listed above so access rules are settled once. */
export const BUILT: readonly ModuleKey[] = ["today", "chat", "plan", "time", "overview", "tasks", "sessions", "clients", "crm", "talent", "marketing", "finance", "invoices", "kpis", "contracts", "reports", "procedures", "team", "activity", "settings"];

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
  "Talent Manager": ["today", "tasks", "talent", "crm", "clients", "marketing", "kpis", "team", "contracts", "procedures", "settings", "chat", "plan", "time"],
  "Assistant (VA)": ["today", "tasks", "crm", "talent", "clients", "marketing", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Contributor: ["today", "tasks", "kpis", "team", "procedures", "settings", "chat", "plan", "time"],
  Contractor: ALL_STAFF,
};

export const ROLE_NOTES: Record<Role, string> = {
  Owner: "Everything, including Finance, the Activity log, and adding or removing people.",
  Admin: "Runs the business day to day. Sees everything except the Finance area.",
  Finance: "Budgets, spend, profit and loss, tax, invoices and the report archive.",
  "Operations (EA)": "Tasks, clients, CRM, talent and invoices.",
  Marketing: "Marketing dashboard, content planner, ads, Publicity, CRM and clients.",
  Operations: "Runs delivery and the back office: tasks, clients, CRM, talent and contracts.",
  "Project Manager": "Keeps client work on time: tasks, clients, deadlines and the Command centre.",
  Sales: "Finds and closes new business: CRM pipeline, leads, clients and marketing.",
  Strategist: "Client work, CRM and marketing.",
  "Talent Manager": "Talent roster, deals and brand relationships, and Publicity in Marketing.",
  "Assistant (VA)": "Tasks, CRM, talent, the content planner and Publicity.",
  Contributor: "Their own tasks, KPIs and the team page.",
  Contractor: "Their own tasks and KPIs only. No Team list or Visibility Sessions.",
};

/** Roles that see money: fees, deal values, rates' totals. Everyone else sees the work without the figures. */
export const SEES_MONEY: readonly Role[] = ["Owner", "Admin", "Finance", "Operations (EA)", "Operations", "Sales", "Talent Manager"];

/** Roles whose Marketing access is limited to some tabs. Every other role with Marketing sees every tab. */
const MARKETING_ONLY: Partial<Record<Role, readonly string[]>> = { "Talent Manager": ["publicity"] };

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

export const seesMoney = (roles: readonly string[]) => roles.some((r) => (SEES_MONEY as readonly string[]).includes(r));

/**
 * The Marketing tabs someone can open: null for every tab, or a list when all their Marketing
 * access comes from limited roles (a Talent Manager gets ["publicity"]).
 */
export function marketingTabsFor(roles: readonly string[]): string[] | null {
  const withMarketing = roles.filter((r) => isRole(r) && HQ_ROLE_MODULES[r].includes("marketing")) as Role[];
  if (withMarketing.some((r) => !MARKETING_ONLY[r])) return null;
  return [...new Set(withMarketing.flatMap((r) => MARKETING_ONLY[r] ?? []))];
}

/** An approved leave with a named relief. Dates are YYYY-MM-DD, inclusive. */
export type Cover = { reliefId: number; absentId: number; start: string; end: string; status: string };

/**
 * Someone's roles for the day, as HQ's effRoles(): their own, plus the roles of anyone they are
 * the relief for on approved leave that covers `day`. One level only: covering for someone
 * who is themselves covering doesn't pass the second person's roles on. Pending leave grants nothing.
 */
export function effectiveRoles(userId: number, own: readonly string[], day: string, covers: readonly Cover[], rolesOf: (id: number) => readonly string[]): Role[] {
  const borrowed = covers
    .filter((c) => c.status === "approved" && c.reliefId === userId && c.absentId !== userId && day >= c.start && day <= (c.end || c.start))
    .flatMap((c) => rolesOf(c.absentId));
  return withBorrowed(own, borrowed);
}

/**
 * Someone's own roles plus roles lent by relief cover. Owner is never lent: here it carries
 * powers HQ kept to the owner herself (people, approvals, the Activity log), not just pages.
 */
export const withBorrowed = (own: readonly string[], borrowed: readonly string[]): Role[] => cleanRoles([...own, ...borrowed.filter((r) => r !== "Owner")]);

/** The built areas someone can open, in nav order. */
export function navFor(roles: readonly string[]) {
  const mine = modulesFor(roles);
  return MODULES.filter((m) => BUILT.includes(m.key) && mine.has(m.key));
}

/** Keeps known roles only, in the canonical order, without repeats. */
export const cleanRoles = (roles: readonly unknown[]): Role[] => ROLES.filter((r) => roles.includes(r));

/* ── Who can change what inside an area (HQ's hasRole checks) ────────── */

const hasAny = (roles: readonly string[], list: readonly Role[]) => roles.some((r) => (list as readonly string[]).includes(r));

/** Write and edit procedures. Everyone else can read and follow them. */
export const canEditProcedures = (roles: readonly string[]) => hasAny(roles, ["Owner", "Admin", "Operations (EA)", "Operations", "Project Manager"]);

/** Set and edit anyone's KPIs, and see the whole team's. Everyone else sees their own. */
export const canManageKpis = (roles: readonly string[]) => hasAny(roles, ["Owner", "Admin", "Operations (EA)", "Operations", "Project Manager"]);

/** Change the revenue goals, exchange rates and working hours in Settings. */
export const canEditGoals = (roles: readonly string[]) => hasAny(roles, ["Owner", "Operations (EA)", "Operations"]);

/** Contractors only ever see and change their own tasks. */
export const ownTasksOnly = (roles: readonly string[]) => !roles.some((r) => r !== "Contractor");
