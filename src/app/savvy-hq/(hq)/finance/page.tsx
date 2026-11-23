import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { FinanceView } from "@/components/hq/finance";
import { ReportSlot } from "@/components/hq/report-slot";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError, db } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { getGeneral } from "@/lib/hq/data";
import { loadBooks, syncBooked } from "@/lib/hq/finance";

export default function FinancePage() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Money, clearly." lead="Budget, spend, profit, projections and tax for Digital Savvy Studios.">
        <ReportSlot type="finance" />
      </PageHeader>
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading Finance…</p>}>
        <Finance />
      </Suspense>
    </main>
  );
}

async function Finance() {
  let props;
  try {
    const user = await requireModule("finance");
    await connection();
    // Keep this month's retainers on file (and earlier months for new clients), as HQ did on load.
    await syncBooked();
    const [books, general, clients] = await Promise.all([
      loadBooks({ ledger: true }),
      getGeneral(),
      (await db()).query(`select id, name from hq_clients order by name`) as Promise<{ id: string; name: string }[]>,
    ]);
    props = { books, clients, goal: Number(general.monthlyGoal) || 20000000, canInvoices: canUse(user.roles, "invoices") };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <FinanceView {...props} />;
}
