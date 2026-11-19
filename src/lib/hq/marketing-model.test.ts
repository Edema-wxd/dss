import { describe, expect, it } from "vitest";
import { accountTotals, basisOf, buckets, captionTitle, previousWindow, rangeWindow, sheetNum, sheetRows } from "./marketing-model";

const TODAY = "2026-11-19";

describe("period views", () => {
  it("covers the right days for each range", () => {
    expect(rangeWindow("7d", TODAY)).toMatchObject({ from: "2026-11-13", to: TODAY, days: 7 });
    expect(rangeWindow("14d", TODAY)).toMatchObject({ from: "2026-11-06", days: 14 });
    expect(rangeWindow("90d", TODAY)).toMatchObject({ from: "2026-08-22", days: 90 });
    expect(rangeWindow("6m", TODAY)).toMatchObject({ from: "2026-06-01", to: TODAY });
    expect(rangeWindow("month", TODAY, "2026-10")).toMatchObject({ from: "2026-10-01", to: "2026-10-31", label: "October 2026", days: 31 });
  });
  it("compares with the same length just before, or the previous month", () => {
    expect(previousWindow(rangeWindow("7d", TODAY), "7d")).toMatchObject({ from: "2026-11-06", to: "2026-11-12" });
    expect(previousWindow(rangeWindow("month", TODAY, "2026-03"), "month")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("buckets by day, week or month", () => {
    expect(buckets(rangeWindow("7d", TODAY))).toHaveLength(7);
    expect(buckets(rangeWindow("90d", TODAY))).toHaveLength(13);
    expect(buckets(rangeWindow("6m", TODAY)).map((b) => b.label)).toEqual(["Jun", "Jul", "Aug", "Sept", "Oct", "Nov"]);
  });
});

describe("an account's totals", () => {
  const acc = { id: "ig", platform: "instagram" };
  const monthly = [{ accountId: "ig", month: "2026-10", followers: 1000, reach: 3100, engagements: 310 }];
  const posts = [{ platform: "instagram", date: "2026-11-15", status: "published", reach: 500, engagements: 50, leads: 1 }];

  it("uses daily numbers when the feed covers the period", () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({ accountId: "ig", date: `2026-11-${13 + i}`, followers: 1100 + i, reach: 100, engagements: 10 }));
    expect(accountTotals(acc, rangeWindow("7d", TODAY), monthly, daily, posts)).toMatchObject({ basis: "daily", reach: 700, engagements: 70, followers: 1106 });
  });
  it("shares monthly insights across the days of a long period", () => {
    const t = accountTotals(acc, { from: "2026-10-01", to: "2026-10-31", label: "", short: "", days: 31 }, monthly, [], posts);
    expect(t).toMatchObject({ basis: "monthly", reach: 3100, followers: 1000 });
    const half = accountTotals(acc, { from: "2026-10-17", to: "2026-11-15", label: "", short: "", days: 30 }, monthly, [], posts);
    expect(half.reach).toBe(1500);
  });
  it("falls back to published posts", () => {
    expect(accountTotals(acc, rangeWindow("7d", TODAY), monthly, [], posts)).toMatchObject({ basis: "posts", reach: 500, posts: 1, leads: 1, followers: 1000 });
  });
  it("names a mixed basis", () => {
    expect(basisOf(["daily", "monthly"])).toBe("mixed");
    expect(basisOf(["monthly", "posts"])).toBe("monthly");
    expect(basisOf(["posts"])).toBe("posts");
  });
});

describe("the data feed sheet", () => {
  it("keys rows by the header and skips the example and empty rows", () => {
    const rows = sheetRows([
      ["Platform", "Month", "Followers", "synced_at"],
      ["instagram", "2026-11", "1,200", "2026-11-30T23:10:00Z"],
      ["instagram", "2026-10", "1,100", "2026-11-01T06:00:00Z"],
      ["", "", "", ""],
    ]);
    expect(rows).toEqual([{ platform: "instagram", month: "2026-10", followers: "1,100", synced_at: "2026-11-01T06:00:00Z" }]);
    expect(sheetNum("1,100")).toBe(1100);
    expect(sheetNum("")).toBeNull();
    expect(sheetNum("n/a")).toBeNull();
  });
  it("cuts a caption to a title at a word", () => {
    expect(captionTitle("Short caption")).toBe("Short caption");
    const long = "How three Lagos founders turned a quiet launch into a sold out first month, and what they would do differently next time";
    expect(captionTitle(long)).toBe("How three Lagos founders turned a quiet launch into a sold out first month, and what they");
  });
});
