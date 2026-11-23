import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ReportsView } from "@/components/hq/reports";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { REP_TYPES, repCan } from "@/lib/hq/report-model";
import { fileLastMonth, listReports } from "@/lib/hq/reports";
import { lagosToday } from "@/lib/hq/work";

export default function ReportsPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Report archive" lead="Every month-end report, kept as it was on the day it was made. Download any of them as slides." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading reports…</p>}>
        <Reports />
      </Suspense>
    </main>
  );
}

async function Reports() {
  let props;
  try {
    const user = await requireModule("reports");
    await connection();
    const types = REP_TYPES.map(([k]) => k).filter((t) => repCan(user.roles, t));
    // HQ filed last month's reports the first time an Owner, Admin or Finance opened it in a new
    // month. The 1st-of-month job does that now; this catches a month the job missed.
    const own = user.roles;
    await fileLastMonth(own.includes("Owner") || own.includes("Admin") ? types : types.filter((t) => t === "finance"), canUse(own, "finance"));
    props = { reports: await listReports(types), types, today: lagosToday() };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <ReportsView {...props} />;
}
