import "server-only";
import { cacheLife } from "next/cache";
import { monthStats } from "./desk/logic";
import { NotConfiguredError, loadDesk } from "./desk/db";
import { SETTING_DEFAULTS, truthy } from "./desk/model";

export type SlotStatus = {
  /** The month the site is taking applications for, e.g. "November". */
  month: string;
  /** Sessions still free in that month. */
  remaining: number;
  /** Complimentary sessions per month. */
  per: number;
  /** Whether the desk has applications switched on. */
  open: boolean;
  /** True when the site moved on to next month because this one is booked up. */
  thisMonthFull: boolean;
};

const TZ = "Africa/Lagos";

/** Today in Lagos as [year, month (1-12), day]: the studio's calendar, whatever the server's clock. */
function lagosToday(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return [y, m, d] as const;
}

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** Day of the month of the month's last Monday. */
function lastMonday(y: number, m: number) {
  const last = new Date(Date.UTC(y, m, 0));
  return last.getUTCDate() - ((last.getUTCDay() + 6) % 7);
}

/**
 * Which month the website offers and how many sessions are left in it, from the
 * desk's bookings. From the month's last Monday, or once it's booked up, the site
 * moves on to next month. Without a database it falls back to the desk defaults.
 */
export async function getSlotStatus(): Promise<SlotStatus> {
  "use cache";
  cacheLife("minutes");

  const [y, m, d] = lagosToday();
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;

  let current: { remaining: number; per: number; open: boolean };
  let next: { remaining: number; per: number };
  try {
    const { apps, settings } = await loadDesk();
    current = monthStats(apps, settings, monthKey(y, m));
    next = monthStats(apps, settings, monthKey(nextY, nextM));
  } catch (e) {
    if (!(e instanceof NotConfiguredError)) console.error("slot status", e);
    const per = Number(SETTING_DEFAULTS.sessions_per_month) || 8;
    current = { remaining: per, per, open: truthy(SETTING_DEFAULTS.applications_open ?? "") };
    next = { remaining: per, per };
  }

  const thisMonthFull = current.remaining === 0;
  const useNext = thisMonthFull || d >= lastMonday(y, m);
  const [showY, showM] = useNext ? [nextY, nextM] : [y, m];
  return {
    month: new Date(Date.UTC(showY, showM - 1, 15)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" }),
    remaining: (useNext ? next : current).remaining,
    per: current.per,
    open: current.open,
    thisMonthFull,
  };
}

/** "5 slots left", "1 slot left". */
export const slotsLeft = (n: number, noun = "slot") => `${n} ${noun}${n === 1 ? "" : "s"} left`;
