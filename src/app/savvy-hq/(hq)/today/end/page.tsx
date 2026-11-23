import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { EndOfDay } from "@/components/hq/end-of-day";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { getStandups, listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { addDays, nextWorkingDay } from "@/lib/hq/work";

export default function EndOfDayPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="End of day" lead="What you finished, what moves to tomorrow, and anything blocking you." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading your day…</p>}>
        <End />
      </Suspense>
    </main>
  );
}

async function End() {
  let props;
  try {
    const user = await requireModule("today");
    const w = await loadWork(user);
    const [tasks, standups] = await Promise.all([listTasks({ assigneeId: user.id, doneSince: w.today }), getStandups(w.today)]);
    const sd = standups.get(user.id) ?? null;
    const week = addDays(w.today, 7);
    props = {
      w,
      standup: sd,
      next: nextWorkingDay(w.today),
      done: tasks.filter((t) => t.status === "done" && t.doneDay === w.today),
      // overdue and due today first, then anything picked as the three, then the rest of this week
      open: tasks.filter((t) => t.status !== "done" && ((t.due && t.due <= week) || sd?.top?.includes(t.id))),
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <EndOfDay {...props} />;
}
