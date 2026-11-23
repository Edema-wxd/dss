import { describe, expect, it } from "vitest";
import { backupDue, backupReminderEmail, checkinEmail } from "./emails";
import { readAction, signAction } from "./tokens";
import {
  addMonths,
  formatKpi,
  kpiPercent,
  lagosToday,
  nextRepeat,
  nextWorkingDay,
  parseCapture,
  periodKey,
  periodStart,
  personScore,
  relDay,
  sortTasks,
} from "./work";

// 2026-11-19 is a Thursday.
const THU = "2026-11-19";
const FRI = "2026-11-20";

describe("Lagos dates", () => {
  it("uses Lagos time, not the server's", () => {
    // 23:30 UTC on the 19th is already 00:30 on the 20th in Lagos
    expect(lagosToday(new Date("2026-11-19T23:30:00Z"))).toBe("2026-11-20");
    expect(lagosToday(new Date("2026-11-19T22:30:00Z"))).toBe("2026-11-19");
  });

  it("skips the weekend for the next working day", () => {
    expect(nextWorkingDay(THU)).toBe(FRI);
    expect(nextWorkingDay(FRI)).toBe("2026-11-23");
  });

  it("names nearby days", () => {
    expect(relDay(THU, THU)).toBe("Today");
    expect(relDay(FRI, THU)).toBe("Tomorrow");
    expect(relDay("2026-11-18", THU)).toBe("Yesterday");
    expect(relDay("2026-11-23", THU)).toBe("Monday");
    expect(relDay("2026-12-03", THU)).toBe("3 Dec");
  });

  it("gives the plain date when there's no today to compare with, as the week view's heading does", () => {
    expect(relDay("2026-11-23", "")).toBe("23 Nov");
    expect(relDay("", "")).toBe("");
  });

  it("keeps month-end dates sensible when adding a month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-19", 1)).toBe("2026-12-19");
  });
});

describe("repeating tasks", () => {
  it("schedules the next copy", () => {
    expect(nextRepeat("daily", FRI, THU)).toBe("2026-11-23");
    expect(nextRepeat("weekly", THU, THU)).toBe("2026-11-26");
    expect(nextRepeat("monthly", "2026-12-01", THU)).toBe("2027-01-01");
    expect(nextRepeat("", THU, THU)).toBeNull();
  });

  it("counts from today when the task had no date", () => {
    expect(nextRepeat("weekly", "", THU)).toBe("2026-11-26");
  });
});

describe("the capture bar", () => {
  const clients = [
    { id: "acme", name: "Acme Test Co" },
    { id: "bloom", name: "Bloom Studio" },
  ];

  it("reads dates and strips them from the title", () => {
    expect(parseCapture("Send the report tomorrow", THU)).toMatchObject({ title: "Send the report", due: FRI, priority: "normal" });
    expect(parseCapture("Call Ada today", THU)).toMatchObject({ title: "Call Ada", due: THU });
    expect(parseCapture("Draft the brief on monday", THU)).toMatchObject({ title: "Draft the brief", due: "2026-11-23" });
    expect(parseCapture("Review by fri", THU)).toMatchObject({ title: "Review", due: FRI });
    expect(parseCapture("Plan Q1 next week", THU)).toMatchObject({ title: "Plan Q1", due: "2026-11-26" });
  });

  it("treats ! as top priority", () => {
    expect(parseCapture("Pay the vendor!!", THU)).toMatchObject({ title: "Pay the vendor", priority: "top" });
  });

  it("links a client by name or a distinctive first word", () => {
    expect(parseCapture("Send Acme Test Co the deck", THU, clients).clientId).toBe("acme");
    expect(parseCapture("Bloom moodboard friday", THU, clients)).toMatchObject({ clientId: "bloom", due: "2026-11-20" });
    expect(parseCapture("Write the newsletter", THU, clients).clientId).toBeNull();
  });
});

describe("sorting", () => {
  it("puts earlier due dates first, undated last, then priority", () => {
    const t = (id: string, due: string, priority = "normal") => ({ id, title: id, due, priority, status: "todo" });
    expect(sortTasks([t("c", ""), t("b", FRI, "top"), t("a", THU), t("d", FRI, "high")]).map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
  });
});

describe("KPIs", () => {
  it("finds the start of each period", () => {
    expect(periodStart("week", THU)).toBe("2026-11-16");
    expect(periodStart("month", THU)).toBe("2026-11-01");
    expect(periodStart("quarter", THU)).toBe("2026-10-01");
    expect(periodKey("month", THU)).toBe("month:2026-11-01");
  });

  it("scores higher-is-better and lower-is-better targets", () => {
    expect(kpiPercent(15, 20, "up")).toBe(75);
    expect(kpiPercent(2, 3, "down")).toBe(150);
    expect(kpiPercent(0, 3, "down")).toBe(100);
    expect(kpiPercent(null, 10, "up")).toBe(0);
  });

  it("weights a person's score and caps each KPI at 120%", () => {
    expect(personScore([])).toBeNull();
    expect(personScore([{ pct: 300, weight: 1 }, { pct: 60, weight: 1 }])).toBe(90);
    expect(personScore([{ pct: 100, weight: 2 }, { pct: 40, weight: 1 }])).toBe(80);
  });

  it("formats values by unit", () => {
    expect(formatKpi("percent", 95.4)).toBe("95%");
    expect(formatKpi("naira", 20000000)).toBe("₦20M");
    expect(formatKpi("number", 3.25)).toBe("3.3");
    expect(formatKpi("number", null)).toBe("-");
  });
});

describe("one-tap links", () => {
  const key = "a-test-secret-of-enough-length";
  const exp = Math.floor(Date.parse("2026-11-21T00:00:00Z") / 1000);
  const now = Date.parse("2026-11-19T18:00:00Z");

  it("round-trips a signed instruction", () => {
    const token = signAction({ task: "t1", action: "carry", user: 3, to: FRI, exp }, key);
    expect(readAction(token, now, key)).toEqual({ task: "t1", action: "carry", user: 3, to: FRI, exp });
  });

  it("refuses a changed, expired or foreign link", () => {
    const token = signAction({ task: "t1", action: "done", user: 3, exp }, key);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ task: "t2", action: "done", user: 3, exp })).toString("base64url");
    expect(readAction(`${forged}.${mac}`, now, key)).toBeNull();
    expect(readAction(`${body}.${mac}`, Date.parse("2026-11-22T00:00:00Z"), key)).toBeNull();
    expect(readAction(token, now, "another-secret-of-enough-length")).toBeNull();
    expect(readAction("nonsense", now, key)).toBeNull();
  });

  it("won't sign without a real secret", () => {
    expect(() => signAction({ task: "t1", action: "done", user: 1, exp }, "short")).toThrow();
  });
});

describe("emails", () => {
  const tasks = [
    { id: "a", title: "Send the report", due: "2026-11-18", priority: "normal", status: "todo", doneDay: "" },
    { id: "b", title: "Call the client", due: THU, priority: "top", status: "todo", doneDay: "" },
    { id: "c", title: "Draft the brief", due: "2026-11-24", priority: "normal", status: "todo", doneDay: "" },
    { id: "d", title: "Book the studio", due: THU, priority: "normal", status: "done", doneDay: THU },
    { id: "e", title: "Next month's plan", due: "2026-12-20", priority: "normal", status: "todo", doneDay: "" },
  ];
  const mail = checkinEmail({ firstName: "Ada", today: THU, next: FRI, tasks, site: "https://example.test", link: (t, a) => `https://example.test/admin/act/${t}-${a}` });

  it("lists what's done, then open work overdue first, with one-tap links", () => {
    expect(mail.subject).toBe("Your end of day check-in, Thursday 19 November");
    expect(mail.text).toContain("Closed today (1):\n  Book the studio");
    expect(mail.text).toMatch(/1\. Send the report, overdue since yesterday[\s\S]*2\. Call the client, due today[\s\S]*3\. Draft the brief, due tuesday/);
    expect(mail.text).toContain("Move to tomorrow: https://example.test/admin/act/a-carry");
    expect(mail.text).not.toContain("Next month's plan");
    expect(mail.html).toContain("https://example.test/admin/today/end");
  });

  it("works without links, pointing to End of day instead", () => {
    const plain = checkinEmail({ firstName: "Ada", today: THU, next: FRI, tasks, site: "https://example.test", link: () => null });
    expect(plain.text).not.toContain("/admin/act/");
    expect(plain.text).toContain("https://example.test/admin/today/end");
  });

  it("never uses em or en dashes", () => {
    const reminder = backupReminderEmail({ firstName: "Ada", site: "https://example.test", daysSince: 40 });
    for (const s of [mail.subject, mail.text, mail.html, reminder.subject, reminder.text, reminder.html]) expect(s).not.toMatch(/[\u2013\u2014]/);
  });

  it("only reminds about backups older than 30 days", () => {
    const now = Date.parse("2026-12-01T06:03:00Z");
    expect(backupDue(undefined, now)).toEqual({ due: true, days: null });
    expect(backupDue("2026-11-20T10:00:00Z", now).due).toBe(false);
    expect(backupDue("2026-10-15T10:00:00Z", now)).toEqual({ due: true, days: 46 });
  });
});
