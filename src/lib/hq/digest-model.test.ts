import { describe, expect, it } from "vitest";
import {
  type Snapshot,
  type SumPerson,
  getsSummary,
  getsUpdates,
  isMorningRun,
  isStale,
  lastWorkingDay,
  morningEmail,
  morningSections,
  updatesEmail,
} from "./digest-model";
import { DEFAULT_PATTERN, type LeaveItem } from "./leave-model";

const person = (id: number, name: string, roles: string[], over: Partial<SumPerson> = {}): SumPerson => ({
  id,
  name,
  email: `${name.split(" ")[0].toLowerCase()}@example.test`,
  notifyEmail: "",
  notifyMode: "instant",
  active: true,
  roles,
  pattern: DEFAULT_PATTERN,
  ...over,
});

const ada = person(1, "Ada Owner", ["Owner"]);
const bo = person(2, "Bo Staff", ["Contributor"]);
const cy = person(3, "Cy Planner", ["Operations (EA)"]);

const lv = (over: Partial<LeaveItem>): LeaveItem => ({
  id: "l",
  userId: 2,
  type: "leave",
  start: "",
  end: "",
  reliefId: null,
  reliefAnswer: "",
  reliefNote: "",
  doneText: "",
  todoText: "",
  handover: [],
  note: "",
  shiftFrom: "",
  shiftTo: "",
  status: "pending",
  reply: "",
  createdAt: "",
  ...over,
});

// Tuesday 24 November 2026
const base = (over: Partial<Snapshot> = {}): Snapshot => ({
  today: "2026-11-24",
  ownerId: 1,
  people: [ada, bo, cy],
  tasks: [],
  contacts: [],
  deals: [],
  talents: [],
  leave: [],
  patternReqs: [],
  kpiProposals: [],
  onboarding: [],
  attendance: { day: "2026-11-23", rows: [] },
  plan: null,
  ...over,
});

const titles = (p: SumPerson, s: Snapshot) => morningSections(p, s).map((x) => x.title);
const lines = (p: SumPerson, s: Snapshot) => morningSections(p, s).flatMap((x) => x.lines);

describe("who gets what", () => {
  it("update emails skip off, summary-only, inactive and address-less people", () => {
    expect(getsUpdates(bo)).toBe(true);
    expect(getsUpdates({ ...bo, notifyMode: "digest" })).toBe(false);
    expect(getsUpdates({ ...bo, notifyMode: "off" })).toBe(false);
    expect(getsUpdates({ ...bo, active: false })).toBe(false);
    expect(getsUpdates({ ...bo, email: "", notifyEmail: "" })).toBe(false);
    expect(getsSummary({ ...bo, notifyMode: "digest" })).toBe(true);
    expect(getsSummary({ ...bo, notifyMode: "off" })).toBe(false);
  });

  it("queued items go stale after two days", () => {
    const now = Date.parse("2026-11-24T08:00:00Z");
    expect(isStale("2026-11-23T08:00:00Z", now)).toBe(false);
    expect(isStale("2026-11-22T07:00:00Z", now)).toBe(true);
  });

  it("the morning run is the one before 9 Lagos", () => {
    expect(isMorningRun(7)).toBe(true);
    expect(isMorningRun(8)).toBe(true);
    expect(isMorningRun(9)).toBe(false);
  });

  it("attendance looks back to Friday on a Monday", () => {
    expect(lastWorkingDay("2026-11-23")).toBe("2026-11-20");
    expect(lastWorkingDay("2026-11-24")).toBe("2026-11-23");
  });
});

describe("update emails", () => {
  const item = (n: number) => ({ id: `n${n}`, title: `Update ${n}`, body: `Body ${n}`, link: `https://hq.example.test/savvy-hq/x${n}`, at: "" });

  it("uses the title for one item and a count for several", () => {
    expect(updatesEmail({ name: "Bo Staff", items: [item(1)], site: "https://hq.example.test" }).subject).toBe("Update 1");
    const m = updatesEmail({ name: "Bo Staff", items: [item(1), item(2)], site: "https://hq.example.test" });
    expect(m.subject).toBe("DSS HQ: 2 updates for you");
    expect(m.text).toContain("Hi Bo,");
    expect(m.text).toContain("Body 2\nhttps://hq.example.test/savvy-hq/x2");
    expect(m.text).toContain("Open DSS HQ: https://hq.example.test/savvy-hq");
  });

  it("escapes what people typed", () => {
    expect(updatesEmail({ name: "Bo", items: [{ ...item(1), title: "<b>hi</b>" }], site: "" }).html).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });
});

describe("the morning summary", () => {
  it("lists overdue and today's tasks, oldest first", () => {
    const s = base({
      tasks: [
        { title: "Send the deck", due: "2026-11-24", assigneeId: 2 },
        { title: "Book the shoot", due: "2026-11-20", assigneeId: 2 },
        { title: "Someone else's", due: "2026-11-24", assigneeId: 3 },
      ],
    });
    expect(morningSections(bo, s)).toEqual([{ title: "Your tasks", lines: ["Book the shoot (overdue since 20 nov)", "Send the deck (due today)"] }]);
  });

  it("covers CRM follow-ups and talent work, and unowned deals go to the owner", () => {
    const s = base({
      contacts: [{ name: "Kemi Test", company: "Acme Test", nextAction: "Send proposal", nextDate: "2026-11-24", ownerId: 2 }],
      deals: [
        { talent: "Tola Test", brand: "Brand A", nextStep: "Chase the brief", nextDate: "2026-11-23", ownerId: 2, deliverables: [{ t: "Reel", due: "2026-11-24", done: false }] },
        { talent: "Uche Test", brand: "Brand B", nextStep: "Confirm dates", nextDate: "2026-11-24", ownerId: null, deliverables: [{ t: "Post", due: "2026-11-20", done: true }] },
      ],
      talents: [{ name: "Tola Test", trialEnds: "2026-12-01", managerId: null }],
    });
    expect(lines(bo, s)).toEqual([
      "Kemi Test, Acme Test: Send proposal (due today)",
      "Tola Test x Brand A: Chase the brief (overdue since yesterday)",
      "Tola Test x Brand A: Reel (due today)",
    ]);
    expect(lines(ada, s)).toContain("Uche Test x Brand B: Confirm dates (due today)");
    expect(lines(ada, s)).toContain("Tola Test: trial or contract review on 1 Dec");
    expect(lines(ada, s).join(" ")).not.toContain("Post");
  });

  it("says who you're covering for and what's waiting on your answer", () => {
    const s = base({
      leave: [
        lv({ id: "a", userId: 3, start: "2026-11-24", end: "2026-11-26", reliefId: 2, reliefAnswer: "accepted", status: "approved" }),
        lv({ id: "b", userId: 3, start: "2026-12-08", reliefId: 2, status: "pending" }),
        lv({ id: "c", userId: 2, type: "shift", start: "2026-11-28", status: "requested" }),
      ],
    });
    expect(lines(bo, s)).toEqual([
      "You're covering for Cy today. You can see and do what they usually do.",
      "Cy asked you to cover their time off from 8 Dec",
      "A change to your day on Saturday",
    ]);
  });

  it("lists this week's tactics on Mondays and the review nudge on Fridays", () => {
    const plan = { week: 3, tactics: [{ userId: 2, title: "Post three reels" }] };
    expect(morningSections(bo, base({ today: "2026-11-23", attendance: { day: "2026-11-20", rows: [] }, plan }))).toEqual([
      { title: "Your 12-week plan, week 3", lines: ["Post three reels"] },
    ]);
    expect(lines(bo, base({ today: "2026-11-27", plan }))).toEqual(["Tick off this week's tactics and do your weekly review on the 12-week plan page."]);
    expect(morningSections(cy, base({ today: "2026-11-27", plan }))).toEqual([]);
    expect(morningSections(bo, base({ plan }))).toEqual([]);
  });

  it("gives the owner approvals, who's out and yesterday's attendance", () => {
    const s = base({
      leave: [
        lv({ id: "a", userId: 2, start: "2026-12-01", reliefId: 3, reliefAnswer: "accepted" }),
        lv({ id: "b", userId: 3, start: "2026-12-02", reliefId: 2 }),
        lv({ id: "c", userId: 3, start: "2026-11-24", status: "approved", type: "sick" }),
      ],
      patternReqs: [{ name: "Bo Staff" }],
      kpiProposals: [{ name: "Cy Planner", title: "Posts a week" }],
      onboarding: [{ name: "Acme Test" }],
      attendance: {
        day: "2026-11-23",
        rows: [{ userId: 2, status: "in", late: 12, workedMin: 490, eod: { blockers: "Waiting on   the brief" } }],
      },
    });
    const sec = morningSections(ada, s);
    expect(sec.map((x) => x.title)).toEqual(["Needs your approval", "Out today", "Yesterday's attendance"]);
    expect(sec[0].lines).toEqual([
      "Bo: time off from 1 Dec",
      "1 more time off request is waiting on the relief officer first",
      "Bo: a new work pattern",
      "Cy: KPI proposal, Posts a week",
      "Acme Test: onboarding ready for sign-off",
    ]);
    expect(sec[1].lines).toEqual(["Cy"]);
    // Cy works Mondays and didn't clock in, Bo's day reads out in full, and owners aren't listed
    expect(sec[2].lines).toEqual([
      'Bo: 8h 10m, 12m late, didn\'t clock out, sent an end-of-day report, blocker: "Waiting on the brief"',
      "Cy: didn't clock in",
    ]);
  });

  it("doesn't count a day off as a missed clock-in", () => {
    const s = base({
      today: "2026-11-23",
      attendance: { day: "2026-11-20", rows: [] },
      people: [ada, { ...bo, pattern: { ...DEFAULT_PATTERN, fri: "off" } }],
      leave: [lv({ userId: 1, start: "2026-11-20", status: "approved" })],
    });
    expect(titles(ada, s)).toEqual([]);
  });

  it("sends the owner a one-liner on a quiet day and nobody else anything", () => {
    // a Sunday: Saturday was nobody's working day
    const s = base({ today: "2026-11-22", attendance: { day: "2026-11-21", rows: [] } });
    const m = morningEmail(ada, s, "https://hq.example.test")!;
    expect(m.subject).toBe("DSS HQ: your day, Sunday 22 November");
    expect(m.text).toContain("Nothing urgent today.");
    expect(morningEmail(bo, s, "https://hq.example.test")).toBeNull();
  });

  it("never uses long dashes", () => {
    const s = base({ tasks: [{ title: "A task", due: "2026-11-24", assigneeId: 2 }] });
    const m = morningEmail(bo, s, "https://hq.example.test")!;
    expect(`${m.subject}${m.text}${m.html}`).not.toMatch(/[\u2013\u2014]/);
  });
});
