import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ContractsView } from "@/components/hq/contracts";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError, db } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { seesMoney } from "@/lib/hq/access";
import { loadWork } from "@/lib/hq/load";
import { listClientsFull, listContracts } from "@/lib/hq/sales";

export default function ContractsPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Contracts and renewals" lead="Every client agreement, talent contract and supplier deal, with a warning before each one lapses." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading contracts…</p>}>
        <Contracts />
      </Suspense>
    </main>
  );
}

async function Contracts() {
  let props;
  try {
    const user = await requireModule("contracts");
    const [w, contracts, clients, talents] = await Promise.all([
      loadWork(user),
      listContracts(),
      listClientsFull(),
      (await db()).query(`select id, name from hq_talents order by name`) as Promise<{ id: string; name: string }[]>,
    ]);
    props = { w, contracts, clients: clients.map((c) => ({ id: c.id, name: c.name, status: c.status, service: c.service })), talents, money: seesMoney(user.roles) };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <ContractsView {...props} />;
}
