import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ClientsView } from "@/components/hq/clients";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { isOwner, seesMoney } from "@/lib/hq/access";
import { listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { getOnbTemplate, listClientsFull } from "@/lib/hq/sales";
import { ONB_DEFAULT } from "@/lib/hq/sales-model";

export default function ClientsPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Clients" lead="Every engagement, its health, what's next, and who's on it." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading clients…</p>}>
        <Clients />
      </Suspense>
    </main>
  );
}

async function Clients() {
  let props;
  try {
    const user = await requireModule("clients");
    const [w, clients, tasks, template] = await Promise.all([loadWork(user), listClientsFull(), listTasks(), getOnbTemplate()]);
    props = {
      w,
      clients,
      tasks: tasks.filter((t) => t.clientId),
      money: seesMoney(user.roles),
      owner: isOwner(user.roles),
      template: (template ?? ONB_DEFAULT).map((s) => `${s.t} | ${s.day} | ${s.who}`).join("\n"),
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <ClientsView {...props} />;
}
