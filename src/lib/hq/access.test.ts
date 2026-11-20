import { describe, expect, it } from "vitest";
import {
  type Cover,
  MODULES,
  ROLES,
  canEditGoals,
  canEditProcedures,
  canManageKpis,
  canUse,
  cleanRoles,
  effectiveRoles,
  isOwner,
  marketingTabsFor,
  modulesFor,
  navFor,
  ownTasksOnly,
  seesMoney,
} from "./access";

describe("role access", () => {
  it("covers all 13 HQ roles", () => {
    expect(ROLES).toHaveLength(13);
  });

  it("gives a Contractor only HQ's short list, without Team or Visibility Sessions", () => {
    expect([...modulesFor(["Contractor"])].sort()).toEqual(["chat", "kpis", "plan", "procedures", "settings", "tasks", "today"]);
    expect(canUse(["Contractor"], "team")).toBe(false);
    expect(canUse(["Contractor"], "sessions")).toBe(false);
  });

  it("keeps Finance to Owner and Finance roles", () => {
    const withFinance = ROLES.filter((r) => canUse([r], "finance"));
    expect(withFinance).toEqual(["Owner", "Finance"]);
  });

  it("keeps the Activity log to owners", () => {
    expect(ROLES.filter((r) => canUse([r], "activity"))).toEqual(["Owner"]);
  });

  it("keeps Visibility Sessions open to every staff role, as the old desk was", () => {
    expect(ROLES.filter((r) => !canUse([r], "sessions"))).toEqual(["Contractor"]);
  });

  it("gives someone with two roles both sets of areas", () => {
    expect(canUse(["Contributor", "Finance"], "finance")).toBe(true);
    expect(canUse(["Contractor", "Sales"], "crm")).toBe(true);
  });

  it("ignores roles it doesn't know", () => {
    expect(modulesFor(["Superuser"]).size).toBe(0);
    expect(cleanRoles(["Superuser", "Sales", "Owner", "Sales"])).toEqual(["Owner", "Sales"]);
  });

  it("lists only built areas in the nav, in HQ's order", () => {
    expect(navFor(["Owner"]).map((m) => m.key)).toEqual(["today", "plan", "time", "overview", "tasks", "sessions", "clients", "crm", "talent", "marketing", "finance", "invoices", "kpis", "contracts", "reports", "procedures", "team", "activity", "settings"]);
    // Finance is Owner and Finance only; Admin and Operations (EA) get Invoices without it
    expect(navFor(["Admin"]).map((m) => m.key)).toContain("invoices");
    expect(navFor(["Admin"]).map((m) => m.key)).not.toContain("finance");
    expect(navFor(["Finance"]).map((m) => m.key)).toEqual(expect.arrayContaining(["finance", "invoices"]));
    expect(navFor(["Sales"]).map((m) => m.key)).not.toContain("invoices");
    expect(navFor(["Contractor"]).map((m) => m.key)).toEqual(["today", "plan", "tasks", "kpis", "procedures", "settings"]);
    expect(navFor(["Contributor"]).map((m) => m.key)).toEqual(["today", "plan", "time", "tasks", "sessions", "kpis", "procedures", "team", "settings"]);
  });

  it("has a module entry for every area any role can open", () => {
    const keys = new Set(MODULES.map((m) => m.key));
    for (const r of ROLES) for (const m of modulesFor([r])) expect(keys.has(m)).toBe(true);
  });

  it("knows who is an owner", () => {
    expect(isOwner(["Admin", "Owner"])).toBe(true);
    expect(isOwner(["Admin"])).toBe(false);
  });
});

describe("v24 rules", () => {
  it("gives a Talent Manager Marketing, but only the Publicity tab", () => {
    expect(canUse(["Talent Manager"], "marketing")).toBe(true);
    expect(marketingTabsFor(["Talent Manager"])).toEqual(["publicity"]);
  });

  it("gives every tab to a role with full Marketing, even alongside Talent Manager", () => {
    expect(marketingTabsFor(["Marketing"])).toBeNull();
    expect(marketingTabsFor(["Talent Manager", "Assistant (VA)"])).toBeNull();
  });

  it("lists exactly HQ's money roles", () => {
    expect(ROLES.filter((r) => seesMoney([r]))).toEqual(["Owner", "Admin", "Finance", "Operations (EA)", "Operations", "Sales", "Talent Manager"]);
    expect(seesMoney(["Contributor", "Marketing"])).toBe(false);
  });
});

describe("relief cover", () => {
  const roles: Record<number, string[]> = { 1: ["Finance"], 2: ["Contributor"], 3: ["Contractor"], 4: ["Talent Manager"] };
  const rolesOf = (id: number) => roles[id] ?? [];
  const leave = (over: Partial<Cover>): Cover => ({ reliefId: 2, absentId: 1, start: "2026-12-01", end: "2026-12-05", status: "approved", ...over });

  it("lends the absent person's roles to their relief for the dates of the leave, inclusive", () => {
    const covers = [leave({})];
    expect(effectiveRoles(2, roles[2], "2026-12-01", covers, rolesOf)).toEqual(["Finance", "Contributor"]);
    expect(effectiveRoles(2, roles[2], "2026-12-05", covers, rolesOf)).toEqual(["Finance", "Contributor"]);
    expect(effectiveRoles(2, roles[2], "2026-12-06", covers, rolesOf)).toEqual(["Contributor"]);
    expect(effectiveRoles(2, roles[2], "2026-11-30", covers, rolesOf)).toEqual(["Contributor"]);
  });

  it("grants nothing for pending leave, or to anyone but the named relief", () => {
    expect(effectiveRoles(2, roles[2], "2026-12-02", [leave({ status: "pending" })], rolesOf)).toEqual(["Contributor"]);
    expect(effectiveRoles(3, roles[3], "2026-12-02", [leave({})], rolesOf)).toEqual(["Contractor"]);
  });

  it("treats a one-day leave with no end date as that day", () => {
    expect(effectiveRoles(2, roles[2], "2026-12-01", [leave({ end: "" })], rolesOf)).toEqual(["Finance", "Contributor"]);
    expect(effectiveRoles(2, roles[2], "2026-12-02", [leave({ end: "" })], rolesOf)).toEqual(["Contributor"]);
  });

  it("never lends the Owner role", () => {
    const withOwner = (id: number) => (id === 1 ? ["Owner"] : (roles[id] ?? []));
    expect(effectiveRoles(2, roles[2], "2026-12-02", [leave({})], withOwner)).toEqual(["Contributor"]);
  });

  it("doesn't chain: covering someone who is covering only passes on their own roles", () => {
    // 4 is away and 1 covers for 4; 1 is also away and 2 covers for 1
    const covers = [leave({ reliefId: 1, absentId: 4 }), leave({ reliefId: 2, absentId: 1 })];
    expect(effectiveRoles(2, roles[2], "2026-12-02", covers, rolesOf)).toEqual(["Finance", "Contributor"]);
  });
});

describe("Phase 2 permissions", () => {
  it("lets the managers HQ named edit procedures and KPIs", () => {
    expect(ROLES.filter((r) => canEditProcedures([r]))).toEqual(["Owner", "Admin", "Operations (EA)", "Operations", "Project Manager"]);
    expect(ROLES.filter((r) => canManageKpis([r]))).toEqual(["Owner", "Admin", "Operations (EA)", "Operations", "Project Manager"]);
  });

  it("keeps goals and working hours to Owner and operations, as HQ did", () => {
    expect(ROLES.filter((r) => canEditGoals([r]))).toEqual(["Owner", "Operations (EA)", "Operations"]);
  });

  it("limits Contractors to their own tasks, unless they hold another role too", () => {
    expect(ownTasksOnly(["Contractor"])).toBe(true);
    expect(ownTasksOnly(["Contractor", "Sales"])).toBe(false);
    expect(ownTasksOnly(["Contributor"])).toBe(false);
  });

  it("keeps the Command centre away from Contributors and Contractors", () => {
    expect(canUse(["Contributor"], "overview")).toBe(false);
    expect(canUse(["Contractor"], "overview")).toBe(false);
    expect(canUse(["Project Manager"], "overview")).toBe(true);
  });
});
