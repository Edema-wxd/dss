import { describe, expect, it } from "vitest";
import { type Tactic, avgScore, compactWeeks, currentCycle, goalPct, isMonday, nextMonday, parseWeeks, scoreOf, teamScore, weekEnd, weekNo, weeksFor } from "./plan-model";

const tac = (userId: number, weeks: number[], done: number[] = []): Tactic => ({
  id: `${userId}-${weeks.join("")}-${done.join("")}`,
  userId,
  cycleId: "c1",
  goalId: null,
  title: "t",
  weeks,
  done: Object.fromEntries(done.map((w) => [String(w), "2026-12-08T09:00:00Z"])),
  byId: userId,
});

describe("cycle weeks", () => {
  it("counts weeks from the starting Monday, with week 13 for review", () => {
    expect(weekNo("2026-12-07", "2026-12-06")).toBe(0);
    expect(weekNo("2026-12-07", "2026-12-07")).toBe(1);
    expect(weekNo("2026-12-07", "2026-12-13")).toBe(1);
    expect(weekNo("2026-12-07", "2026-12-14")).toBe(2);
    expect(weekNo("2026-12-07", "2027-03-01")).toBe(13);
    expect(weekEnd("2026-12-07", 12)).toBe("2027-02-28");
  });

  it("starts the next cycle on the coming Monday, never today", () => {
    expect(nextMonday("2026-11-20")).toBe("2026-11-23");
    expect(nextMonday("2026-11-23")).toBe("2026-11-30");
    expect(isMonday("2026-11-23")).toBe(true);
    expect(isMonday("2026-11-24")).toBe(false);
  });

  it("works the active cycle, else the earliest draft", () => {
    const cs = [
      { id: "a", status: "closed", start: "2026-01-05" },
      { id: "b", status: "draft", start: "2026-06-01" },
      { id: "c", status: "draft", start: "2026-04-06" },
    ];
    expect(currentCycle(cs)?.id).toBe("c");
    expect(currentCycle([...cs, { id: "d", status: "active", start: "2026-03-02" }])?.id).toBe("d");
    expect(currentCycle(cs.slice(0, 1))).toBeNull();
  });
});

describe("scores", () => {
  const ts = [tac(1, [1, 2], [1]), tac(1, [1], [1]), tac(2, [1, 2], []), tac(2, [2], [2])];
  it("scores a week as the share of that week's tactics done", () => {
    expect(scoreOf(ts, 1, 1)).toBe(100);
    expect(scoreOf(ts, 1, 2)).toBe(0);
    expect(scoreOf(ts, 2, 1)).toBe(0);
    expect(scoreOf(ts, 2, 2)).toBe(50);
    expect(scoreOf(ts, 1, 3)).toBeNull();
  });

  it("averages the team over people who had tactics, and weeks that had any", () => {
    expect(teamScore(ts, [1, 2, 3], 1)).toBe(50);
    expect(teamScore(ts, [1, 2, 3], 3)).toBeNull();
    expect(avgScore(ts, [1, 2], 1, 3)).toBe(50);
    expect(avgScore(ts, [1, 2], null, 2)).toBe(38);
  });

  it("measures goals from their start to their target", () => {
    expect(goalPct(0, 10, 5)).toBe(50);
    expect(goalPct(10, 20, 5)).toBe(0);
    expect(goalPct(10, 20, 40)).toBe(100);
    expect(goalPct(5, 5, 5)).toBe(100);
    // a goal to bring something down
    expect(goalPct(10, 0, 4)).toBe(60);
  });
});

describe("weeks", () => {
  it("reads and writes week lists", () => {
    expect(parseWeeks("1, 3, 5-8 13 x")).toEqual([1, 3, 5, 6, 7, 8]);
    expect(parseWeeks("8-5")).toEqual([5, 6, 7, 8]);
    expect(compactWeeks([1, 3, 5, 6, 7, 8])).toBe("1, 3, 5 to 8");
    expect(weeksFor("all", "", 4)).toHaveLength(12);
    expect(weeksFor("rest", "", 10)).toEqual([10, 11, 12]);
    expect(weeksFor("rest", "", 0)).toHaveLength(12);
    expect(weeksFor("pick", "2,4", 1)).toEqual([2, 4]);
  });
});
