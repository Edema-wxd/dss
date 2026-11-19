import { describe, expect, it } from "vitest";
import { contractRank, contractState, followUpDue, parseOnbTemplate, renewalTaskDue, renewedEnd, stageAfterTouch, stepDone } from "./sales-model";

const TODAY = "2026-11-19";

describe("contract states, as HQ's ctState", () => {
  const c = (end: string, noticeDays = 30, status = "active") => contractState({ status, end, noticeDays }, TODAY);
  it("reads ended, draft and open-ended contracts first", () => {
    expect(c("2026-12-01", 30, "ended").l).toBe("Ended");
    expect(c("2026-12-01", 30, "draft").l).toBe("Not signed yet");
    expect(c("").l).toBe("No end date");
  });
  it("counts lapsed days", () => {
    expect(c("2026-11-18")).toMatchObject({ k: "lapsed", l: "Lapsed 1 day ago", tone: "bad" });
    expect(c("2026-11-09").l).toBe("Lapsed 10 days ago");
  });
  it("opens the decide window 14 days before the notice date", () => {
    // ends 1 Jan, 30 days' notice: notice by 2 Dec, which is 13 days away
    expect(c("2027-01-01")).toMatchObject({ k: "decide", l: "Decide by 2 Dec 2026", tone: "warn" });
    // notice date already passed
    expect(c("2026-12-10")).toMatchObject({ k: "decide", l: "Notice date passed", tone: "bad" });
  });
  it("warns 90 days out, then shows the end date", () => {
    expect(c("2027-02-01")).toMatchObject({ k: "soon", l: "Ends in 74 days" });
    expect(c("2027-06-01")).toMatchObject({ k: "ok", l: "Ends 1 Jun 2027" });
  });
  it("sorts the most urgent first", () => {
    expect(["ok", "lapsed", "draft", "decide"].map((k) => contractRank({ k } as never)).sort()).toEqual([0, 1, 3, 4]);
  });
  it("times renewals and the renewal task", () => {
    expect(renewedEnd("2026-01-01", "2026-04-01")).toBe("2026-06-30");
    expect(renewedEnd("", "2026-04-01")).toBe("2026-06-30");
    expect(renewalTaskDue("2027-03-01", 30, TODAY)).toBe("2027-01-27");
    expect(renewalTaskDue("2026-12-01", 30, TODAY)).toBe(TODAY);
  });
});

describe("CRM rules", () => {
  it("moves a fresh contact along when someone reaches out, but not for a note", () => {
    expect(stageAfterTouch("sales", "new", "call")).toBe("contacted");
    expect(stageAfterTouch("sales", "research", "email")).toBe("contacted");
    expect(stageAfterTouch("sales", "proposal", "call")).toBe("proposal");
    expect(stageAfterTouch("sales", "new", "note")).toBe("new");
    expect(stageAfterTouch("talent", "topitch", "whatsapp")).toBe("pitched");
  });
  it("counts a follow-up as due until the contact is finished with", () => {
    expect(followUpDue({ nextDate: TODAY, stage: "new" }, TODAY)).toBe(true);
    expect(followUpDue({ nextDate: "2026-11-20", stage: "new" }, TODAY)).toBe(false);
    expect(followUpDue({ nextDate: "2026-11-01", stage: "won" }, TODAY)).toBe(false);
    expect(followUpDue({ nextDate: "", stage: "new" }, TODAY)).toBe(false);
  });
});

describe("onboarding", () => {
  it("reads the template, one step per line", () => {
    expect(parseOnbTemplate("Welcome pack | 0 | point\nKick-off call | 3\n\n  | 2 | lead")).toEqual([
      { t: "Welcome pack", day: 0, who: "point" },
      { t: "Kick-off call", day: 3, who: "lead" },
    ]);
  });
  it("counts a step done when ticked or when its task is done", () => {
    const done = new Set(["t1"]);
    expect(stepDone({ t: "a", day: 0, who: "lead", taskId: "t1" }, done)).toBe(true);
    expect(stepDone({ t: "a", day: 0, who: "lead", done: true }, done)).toBe(true);
    expect(stepDone({ t: "a", day: 0, who: "lead", taskId: "t2" }, done)).toBe(false);
  });
});
