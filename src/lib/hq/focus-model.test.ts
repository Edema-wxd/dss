import { describe, expect, it } from "vitest";
import { FOCUS_DEFAULT, clockText, elapsed, left, newClock, pause, running, spentMinutes, start, started } from "./focus-model";

const T = 1_800_000_000_000;
const s = (n: number) => T + n * 1000;

describe("the focus timer", () => {
  it("starts on 25 minutes and doesn't run until started", () => {
    const c = newClock();
    expect(FOCUS_DEFAULT).toBe(25);
    expect(left(c, s(90))).toBe(25 * 60);
    expect(started(c, s(90))).toBe(false);
  });

  it("counts from when it was started, so a sleeping tab catches up", () => {
    const c = start(newClock(15), T);
    expect(running(c)).toBe(true);
    expect(left(c, s(61))).toBe(15 * 60 - 61);
    expect(clockText(left(c, s(61)))).toBe("13:59");
  });

  it("keeps the time run across a pause and a resume", () => {
    let c = start(newClock(15), T);
    c = pause(c, s(120));
    expect(running(c)).toBe(false);
    expect(elapsed(c, s(9999))).toBe(120);
    c = start(c, s(500));
    expect(elapsed(c, s(530))).toBe(150);
    expect(started(c, s(530))).toBe(true);
  });

  it("stops at zero and never counts past the length", () => {
    const c = start(newClock(15), T);
    expect(left(c, s(60 * 60))).toBe(0);
    expect(spentMinutes(c, s(60 * 60))).toBe(15);
    expect(start(pause(c, s(60 * 60)), s(60 * 61))).toEqual(pause(c, s(60 * 60)));
    expect(clockText(-5)).toBe("00:00");
  });

  it("rounds the minutes that go on the task", () => {
    const c = start(newClock(25), T);
    expect(spentMinutes(c, s(29))).toBe(0);
    expect(spentMinutes(c, s(40))).toBe(1);
    expect(spentMinutes(c, s(10 * 60 + 20))).toBe(10);
  });
});
