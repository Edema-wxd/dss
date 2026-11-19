import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PageHeader } from "@/components/hq/shell";
import { TasksView } from "@/components/hq/tasks";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { addDays } from "@/lib/hq/work";

export default function TasksPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Tasks" lead="Everything that needs doing, by status, by day, or as a list." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading tasks…</p>}>
        <Tasks />
      </Suspense>
    </main>
  );
}

async function Tasks() {
  let loaded;
  try {
    const user = await requireModule("tasks");
    const w = await loadWork(user);
    const tasks = await listTasks({ doneSince: addDays(w.today, -14), ...(w.ownOnly ? { assigneeId: user.id } : {}) });
    loaded = { w, tasks };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <TasksView tasks={loaded.tasks} w={loaded.w} />;
}
