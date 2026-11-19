import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { CrmView } from "@/components/hq/crm";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError, db } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { seesMoney } from "@/lib/hq/access";
import { backfillApplications } from "@/lib/hq/crm-sync";
import { loadWork } from "@/lib/hq/load";
import { listContactsFull } from "@/lib/hq/sales";

export default function CrmPage() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="CRM" lead="Every lead and relationship, where it stands, and when to follow up." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the CRM…</p>}>
        <Crm />
      </Suspense>
    </main>
  );
}

async function Crm() {
  let props;
  try {
    const user = await requireModule("crm");
    // the first time the CRM opens, existing Visibility Session applications come in as leads
    await backfillApplications();
    const [w, contacts, talents] = await Promise.all([
      loadWork(user),
      listContactsFull(),
      (await db()).query(`select id, name from hq_talents where coalesce(status, '') <> 'ended' order by name`) as Promise<{ id: string; name: string }[]>,
    ]);
    props = { w, contacts, talents, money: seesMoney(user.roles) };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <CrmView {...props} />;
}
