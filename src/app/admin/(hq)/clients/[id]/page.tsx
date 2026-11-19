import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ClientDetail } from "@/components/hq/clients";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canUse, isOwner, seesMoney } from "@/lib/hq/access";
import { listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { getClient, listContracts, timeline } from "@/lib/hq/sales";

export default function ClientPage(props: PageProps<"/admin/clients/[id]">) {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the client…</p>}>
        <OneClient params={props.params} />
      </Suspense>
    </main>
  );
}

async function OneClient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let props;
  try {
    const user = await requireModule("clients");
    const client = await getClient(decodeURIComponent(id));
    if (!client) notFound();
    const canContracts = canUse(user.roles, "contracts");
    const [w, tasks, entries, contracts] = await Promise.all([loadWork(user), listTasks(), timeline("client", client.id), canContracts ? listContracts() : []]);
    const contract = contracts.filter((c) => c.clientId === client.id && c.status !== "ended").sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;
    props = {
      client,
      w,
      tasks: tasks.filter((t) => t.clientId === client.id),
      timeline: entries,
      contract,
      money: seesMoney(user.roles),
      owner: isOwner(user.roles),
      canContracts,
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <Link href="/admin/clients" className="mb-2 inline-block text-sm font-semibold text-pink underline">
        All clients
      </Link>
      <PageHeader title={props.client.name} lead={props.client.service || "Service not set"} />
      <ClientDetail {...props} />
    </>
  );
}
