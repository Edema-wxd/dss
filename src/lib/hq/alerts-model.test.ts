import { describe, expect, it } from "vitest";
import * as A from "./alerts-model";
import { formatKpi } from "./work";

// The change alerts' wording. Everyone here is made up.

describe("change alerts", () => {
  it("tells someone about a task they were given or passed", () => {
    expect(A.taskGiven("Ada Owner", { title: "Send the deck", due: "2026-11-24", notes: " Use the new logo " })).toEqual({
      title: "New task: Send the deck",
      body: "Ada gave you a task, due Tue 24 Nov.\n\nUse the new logo",
      path: "tasks",
    });
    expect(A.taskPassed("Ada Owner", { title: "Send the deck", due: "" }).body).toBe("Ada passed this task to you.");
    expect(A.tasksGiven("Ada Owner", 1, "Acme Test onboarding").title).toBe("1 new task for Acme Test onboarding");
    expect(A.tasksGiven("Ada Owner", 3, "Acme Test onboarding").body).toBe("Ada gave you 3 tasks for Acme Test onboarding. They're on your Tasks page with their due dates.");
  });

  it("links a deal hand-over to the talent's page", () => {
    const a = A.dealHandedOver("Ada Owner", "Tola Test", "Brand A", "t1");
    expect(a.title).toBe("You're now managing Tola Test x Brand A");
    expect(a.path).toBe("talent/t1");
    expect(A.dealHandedOver("Ada", "A talent", "Brand A", null).path).toBe("talent");
  });

  it("covers onboarding sign-off both ways", () => {
    expect(A.onboardingSubmitted("Acme Test", "c1")).toMatchObject({ title: "Acme Test is ready for onboarding sign-off", path: "clients/c1" });
    expect(A.onboardingApproved("Acme Test", "c1").body).toBe("The client is now active.");
    expect(A.onboardingSentBack("Acme Test", "c1", "Add the brand kit").body).toBe("The owner says: Add the brand kit");
  });

  it("lists the roles someone was given, without a password", () => {
    expect(A.accessGiven(["Sales"]).body).toMatch(/^Your role: Sales\. /);
    expect(A.accessGiven(["Sales", "Talent Manager"]).body).toMatch(/^Your roles: Sales, Talent Manager\. /);
  });

  it("keeps naira targets out of KPI alerts", () => {
    const posts = { title: "Posts a week", unit: "number", target: 5, period: "week" };
    const sales = { title: "New sales", unit: "naira", target: 5_000_000, period: "month" };
    expect(A.kpiTarget(posts, "weekly", formatKpi)).toBe("5 weekly");
    expect(A.kpiTarget(sales, "monthly", formatKpi)).toBe("monthly");
    expect(A.kpiProposed("Bo Staff", sales, A.kpiTarget(sales, "monthly", formatKpi), "It pays the bills").body).toBe("New sales: monthly. Why: It pays the bills");
    expect(A.kpiRevised("Posts a week", "4 weekly", "Start smaller").body).toBe("Posts a week: 4 weekly. The owner says: Start smaller");
    expect(A.kpiDeclined("Posts a week", "Not this quarter").body).toBe("Posts a week. The owner says: Not this quarter");
  });

  it("never uses long dashes", () => {
    const all = [
      A.taskGiven("Ada", { title: "x", due: "2026-11-24" }),
      A.tasksGiven("Ada", 2, "x"),
      A.dealHandedOver("Ada", "x", "y", null),
      A.onboardingSubmitted("x", "c"),
      A.accessGiven(["Sales"]),
      A.kpiApproved("x"),
    ];
    expect(JSON.stringify(all)).not.toMatch(/[–—]/);
  });
});
