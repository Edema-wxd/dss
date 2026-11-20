import { Suspense } from "react";
import { connection } from "next/server";
import { currentUser } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { getDay, openPastDays } from "@/lib/hq/time";
import { lagosToday } from "@/lib/hq/work";
import { Clock } from "./time";

// The clock in the top bar of every HQ page, for anyone with Attendance.

async function ClockLoader() {
  await connection();
  const user = await currentUser().catch(() => null);
  if (!user || !canUse(user.roles, "time")) return null;
  const today = lagosToday();
  const [day, missed] = await Promise.all([getDay(user.id, today), openPastDays(user.id, today)]);
  return <Clock day={day} missed={missed[0]?.day ?? null} serverNow={new Date().toISOString()} />;
}

export function ClockSlot() {
  return (
    <Suspense fallback={null}>
      <ClockLoader />
    </Suspense>
  );
}
