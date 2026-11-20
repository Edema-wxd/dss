import { describe, expect, it } from "vitest";
import { type TimeDay, closeAt, expectedMin, fmtHM, hhmm, lagosStamp, lateBy, missedClockOut, timesheetRows, toCsv, weekOf, workedMin } from "./time-model";

const W = { start: "09:00", end: "17:00", fullHours: 9, halfHours: 4.25, grace: 15 };
const day = (o: Partial<TimeDay>): TimeDay => ({ userId: 1, day: "2026-12-07", segs: [], breaks: [], status: "out", late: 0, mode: "full", expectedMin: 540, workedMin: null, eod: null, closedAt: "", ...o });

describe("attendance", () => {
  it("reads stamps in Lagos time", () => {
    expect(hhmm("2026-12-07T08:05:00Z")).toBe("09:05");
    expect(lagosStamp("2026-12-07", "17:30")).toBe("2026-12-07T16:30:00.000Z");
  });
  it("counts late only past the grace period, and only on working days", () => {
    expect(lateBy("2026-12-07T08:14:00Z", W, "full")).toBe(0);
    expect(lateBy("2026-12-07T08:20:00Z", W, "full")).toBe(20);
    expect(lateBy("2026-12-07T09:30:00Z", W, "off")).toBe(0);
  });
  it("sets a full day at 9 hours and a half day at 4 hours 15", () => {
    expect(expectedMin("full", W)).toBe(540);
    expect(expectedMin("half", W)).toBe(255);
    expect(expectedMin("leave", W)).toBe(0);
  });
  it("adds up worked time, leaving breaks out, and runs live while clocked in", () => {
    const d = day({
      status: "in",
      segs: [
        { in: "2026-12-07T08:00:00Z", out: "2026-12-07T11:00:00Z" },
        { in: "2026-12-07T11:30:00Z", out: null },
      ],
    });
    expect(workedMin(d, new Date("2026-12-07T12:30:00Z"))).toBe(240);
    expect(fmtHM(240)).toBe("4h 00m");
    const closed = closeAt({ segs: d.segs, breaks: [{ start: "2026-12-07T11:00:00Z", end: null }] }, "2026-12-07T16:00:00Z");
    expect(closed.segs[1].out).toBe("2026-12-07T16:00:00Z");
    expect(closed.breaks[0].end).toBe("2026-12-07T16:00:00Z");
  });
  it("finds earlier days left open", () => {
    const days = [day({ day: "2026-12-04", status: "in" }), day({ day: "2026-12-07", status: "in" }), day({ day: "2026-12-03" })];
    expect(missedClockOut(days, "2026-12-07").map((d) => d.day)).toEqual(["2026-12-04"]);
  });
  it("builds the week's timesheet", () => {
    const wk = weekOf("2026-12-09");
    expect(wk[0]).toBe("2026-12-07");
    const rows = timesheetRows(wk, [{ id: 1, name: "Bo Staff", roles: ["Contributor"] }], (_, d) => (d === "2026-12-07" ? day({ workedMin: 480, late: 20, eod: { doneText: "x", blockers: "", tomorrow: "", mood: "", tasksDone: [], tactics: 0 } }) : null), () => 540);
    expect(rows[1]).toEqual(["Bo Staff", "Contributor", "8.00", "", "", "", "", "", "", "8.00", "63.00", 1, 1]);
    expect(toCsv([["a \"b\""]])).toBe('"a ""b"""');
  });
});
