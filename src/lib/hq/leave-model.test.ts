import { describe, expect, it } from "vitest";
import { type LeaveItem, DEFAULT_PATTERN, autoApproved, coveringFor, dayMode, fmtDays, leaveTaken, patternOf, readyForOwner, reliefState, workdays } from "./leave-model";

// Made-up people: 1 is away, 2 covers, 3 works Mondays as half days.
const item = (o: Partial<LeaveItem>): LeaveItem => ({
  id: "x", userId: 1, type: "leave", start: "2026-12-07", end: "2026-12-11", reliefId: 2, reliefAnswer: "", reliefNote: "", doneText: "", todoText: "",
  handover: [], note: "", shiftFrom: "", shiftTo: "", status: "pending", reply: "", createdAt: "", ...o,
});
const half = patternOf({ mon: "half" });

describe("work patterns", () => {
  it("fills missing days from the usual Monday to Friday week", () => {
    expect(patternOf(null)).toEqual(DEFAULT_PATTERN);
    expect(patternOf({ sat: "half", sun: "nonsense" })).toMatchObject({ mon: "full", sat: "half", sun: "off" });
  });
  it("writes days like HQ", () => {
    expect(fmtDays(4.5)).toBe("4½ working days");
    expect(fmtDays(0.5)).toBe("½ working days");
    expect(fmtDays(1)).toBe("1 working day");
  });
});

describe("the kind of day", () => {
  it("puts approved leave first, then an accepted day change, then the usual week", () => {
    const items = [item({ status: "approved" }), item({ id: "s", userId: 3, type: "shift", start: "2026-12-14", end: "2026-12-14", shiftTo: "full", status: "accepted" })];
    expect(dayMode(items, 1, DEFAULT_PATTERN, "2026-12-08")).toBe("leave");
    expect(dayMode(items, 1, DEFAULT_PATTERN, "2026-12-12")).toBe("off");
    expect(dayMode(items, 3, half, "2026-12-07")).toBe("half");
    expect(dayMode(items, 3, half, "2026-12-14")).toBe("full");
  });
  it("gives everyone a public holiday, and pending leave changes nothing", () => {
    const items = [item({ userId: null, type: "holiday", start: "2026-12-25", end: "2026-12-26", status: "approved" }), item({})];
    expect(dayMode(items, 3, half, "2026-12-25")).toBe("leave");
    expect(dayMode(items, 1, DEFAULT_PATTERN, "2026-12-08")).toBe("full");
  });
});

describe("counting leave", () => {
  it("counts working days, skipping weekends, holidays, and halving half days", () => {
    const items = [item({ userId: null, type: "holiday", start: "2026-12-08", end: "2026-12-08", status: "approved" })];
    expect(workdays(items, "2026-12-07", "2026-12-13", 3, half)).toBe(3.5);
    expect(leaveTaken([...items, item({ userId: 3, status: "approved" })], 3, half, "2026") ).toBe(3.5);
  });
});

describe("the approval chain", () => {
  it("waits for the relief officer on annual leave, and not on other kinds", () => {
    expect(reliefState(item({}))).toBe("waiting");
    expect(readyForOwner(item({}))).toBe(false);
    expect(readyForOwner(item({ reliefAnswer: "accepted" }))).toBe(true);
    expect(readyForOwner(item({ reliefAnswer: "declined" }))).toBe(false);
    expect(readyForOwner(item({ type: "training", reliefId: null }))).toBe(true);
  });
  it("logs short sick leave straight away", () => {
    expect(autoApproved("sick", "2026-12-07", "2026-12-09")).toBe(true);
    expect(autoApproved("sick", "2026-12-07", "2026-12-10")).toBe(false);
    expect(autoApproved("leave", "2026-12-07", "2026-12-07")).toBe(false);
  });
  it("makes the relief a cover only on approved dates", () => {
    const l = item({ status: "approved" });
    expect(coveringFor([l], 2, "2026-12-11")).toHaveLength(1);
    expect(coveringFor([l], 2, "2026-12-12")).toHaveLength(0);
    expect(coveringFor([item({})], 2, "2026-12-08")).toHaveLength(0);
  });
});
