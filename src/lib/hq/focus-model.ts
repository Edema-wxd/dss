// The focus timer (HQ's focus mode): one task, a countdown, nothing else on screen. Pure, so it
// can be tested. The clock is measured from when it was started, not counted tick by tick, so a
// tab left in the background still shows the right time when it comes back.

/** The lengths on offer, in minutes. HQ starts on 25. */
export const FOCUS_LENGTHS = [15, 25, 45, 60] as const;
export const FOCUS_DEFAULT = 25;

export type FocusClock = {
  /** the length chosen, in seconds */
  total: number;
  /** seconds already run before the current start */
  offset: number;
  /** when the current run started (ms), or null while paused or not started */
  startedAt: number | null;
};

export const newClock = (minutes: number = FOCUS_DEFAULT): FocusClock => ({ total: minutes * 60, offset: 0, startedAt: null });

/** Seconds run so far, never past the length chosen. */
export const elapsed = (c: FocusClock, now: number) => Math.min(c.total, c.offset + (c.startedAt === null ? 0 : Math.floor((now - c.startedAt) / 1000)));

export const left = (c: FocusClock, now: number) => c.total - elapsed(c, now);
export const running = (c: FocusClock) => c.startedAt !== null;
export const started = (c: FocusClock, now: number) => running(c) || elapsed(c, now) > 0;

export const start = (c: FocusClock, now: number): FocusClock => (running(c) || left(c, now) <= 0 ? c : { ...c, startedAt: now });
export const pause = (c: FocusClock, now: number): FocusClock => (running(c) ? { ...c, offset: elapsed(c, now), startedAt: null } : c);

/** Whole minutes to add to the task: rounded, as HQ did, so 40 seconds counts as one. */
export const spentMinutes = (c: FocusClock, now: number) => Math.round(elapsed(c, now) / 60);

/** "24:59" */
export const clockText = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
