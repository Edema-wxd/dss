import { describe, expect, it } from "vitest";
import { REP_TYPES, buildReport, defaultReportMonth, delta, kpiMonthPct, repCan, teamScoreMonth } from "./report-model";
import { reportFixture } from "./report-fixture";

const stats = (r: ReturnType<typeof buildReport>, n = 1) => {
  const s = r.slides[n];
  return s.kind === "stats" ? Object.fromEntries(s.items.map((x) => [x.k, x.v])) : {};
};

describe("monthly reports", () => {
  const d = reportFixture();
  it("starts with a cover and ends with the close for every type", () => {
    for (const [t, l] of REP_TYPES) {
      const r = buildReport(t, "2026-10", d);
      expect(r.title).toBe(`${l} report · October 2026`);
      expect(r.slides[0]).toEqual({ kind: "cover", title: l, sub: "October 2026" });
      expect(r.slides.at(-1)).toMatchObject({ kind: "close", title: "Excellence, made visible." });
    }
  });
  it("finance: the month's numbers, budget and profit and loss", () => {
    const r = buildReport("finance", "2026-10", d);
    expect(stats(r)).toMatchObject({ Revenue: "₦900K", "Running costs": "₦180K", "Net profit": "₦720K" });
    const bars = r.slides.find((s) => s.kind === "bars");
    expect(bars && bars.kind === "bars" && bars.rows.find((x) => x.label === "Workspace, power and internet")?.color).toBe("#C42B3C");
    expect(r.slides.find((s) => s.kind === "notes")).toMatchObject({ blocks: [{ h: "What went well" }, { h: "Watch", items: ["Over budget: Workspace, power and internet."] }, { h: "Next month" }] });
  });
  it("leaves money out without Finance", () => {
    const r = buildReport("overview", "2026-10", { ...d, f: null });
    expect(Object.keys(stats(r))).toEqual(["Live clients", "Clients won", "Followers", "Team KPI score"]);
    expect(buildReport("finance", "2026-10", { ...d, f: null }).slides.map((s) => s.kind)).toEqual(["cover", "close"]);
  });
  // follow-ups: the call and the brand email count, the note does not
  it("sales, clients, talent and marketing count the month", () => {
    expect(stats(buildReport("sales", "2026-10", d))).toEqual({ "New leads": "2", "Follow-ups": "2", "Clients won": "1", "Open pipeline": "₦300K" });
    expect(stats(buildReport("clients", "2026-10", d))).toMatchObject({ "Live clients": "2", "At risk": "1", "Renewing soon": "1" });
    expect(stats(buildReport("talent", "2026-10", d))).toEqual({ "Deals live": "1", "Deals moved forward": "1", "Deal value": "₦1M", "DSS commission": "₦200K" });
    expect(stats(buildReport("marketing", "2026-10", d))).toMatchObject({ "Total followers": "1,200", "Engagement rate": "8.0%", Leads: "3" });
  });
  it("scores KPIs over the month", () => {
    expect(kpiMonthPct(d.kpis[0], "2026-10", d)).toBe(100);
    expect(kpiMonthPct(d.kpis[1], "2026-10", d)).toBe(25);
    expect(teamScoreMonth(2, "2026-10", d)).toBe(63);
    expect(teamScoreMonth(1, "2026-10", d)).toBeNull();
  });
  it("words changes and picks the default month", () => {
    expect(delta(120, 100)).toBe("Up 20% on last month");
    expect(delta(5, 0)).toBe("no comparison yet");
    expect(defaultReportMonth("2026-11-03")).toBe("2026-10");
    expect(defaultReportMonth("2026-11-19")).toBe("2026-11");
  });
  it("follows each area's access", () => {
    expect(REP_TYPES.filter(([t]) => repCan(["Owner"], t)).length).toBe(7);
    expect(repCan(["Admin"], "finance")).toBe(false);
    expect(repCan(["Finance"], "finance")).toBe(true);
    expect(repCan(["Contributor"], "team")).toBe(true);
    expect(repCan(["Contributor"], "sales")).toBe(false);
  });
});
