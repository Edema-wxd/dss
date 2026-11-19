import { describe, expect, it } from "vitest";
import { MODULES, ROLES, canUse, cleanRoles, isOwner, modulesFor, navFor } from "./access";

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
    expect(navFor(["Owner"]).map((m) => m.key)).toEqual(["sessions", "team", "activity"]);
    expect(navFor(["Contractor"])).toEqual([]);
    expect(navFor(["Contributor"]).map((m) => m.key)).toEqual(["sessions", "team"]);
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
