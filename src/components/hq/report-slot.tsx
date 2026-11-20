import { Suspense } from "react";
import { connection } from "next/server";
import { currentUser } from "@/lib/desk/auth";
import { REP_TYPES, type RepType, repCan } from "@/lib/hq/report-model";
import { lagosToday } from "@/lib/hq/work";
import { ReportButton } from "./reports";

// "Monthly report" in a dashboard's header, for anyone who can make that report.

async function Slot({ type }: { type: RepType }) {
  const user = await currentUser();
  await connection();
  if (!user || !repCan(user.roles, type)) return null;
  const types = REP_TYPES.map(([k]) => k).filter((t) => repCan(user.roles, t));
  return <ReportButton type={type} types={types} today={lagosToday()} />;
}

export function ReportSlot({ type }: { type: RepType }) {
  return (
    <Suspense fallback={null}>
      <Slot type={type} />
    </Suspense>
  );
}
