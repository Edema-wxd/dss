import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ProceduresView } from "@/components/hq/procedures";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canEditProcedures } from "@/lib/hq/access";
import { listPeople, listSops, listTasks } from "@/lib/hq/data";

export default function ProceduresPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="How we work" lead="Step-by-step procedures for the jobs we repeat. Open one, follow it, or turn it into a task with every step as a checklist." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading procedures…</p>}>
        <Procedures />
      </Suspense>
    </main>
  );
}

async function Procedures() {
  let props;
  try {
    const user = await requireModule("procedures");
    const [sops, people, tasks] = await Promise.all([listSops(), listPeople(), listTasks()]);
    props = {
      sops,
      canEdit: canEditProcedures(user.roles),
      me: user.id,
      people: people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name })),
      inProgress: tasks.filter((t) => t.sopId && t.status !== "done").map((t) => ({ id: t.id, title: t.title, sopId: t.sopId! })),
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <ProceduresView {...props} />;
}
