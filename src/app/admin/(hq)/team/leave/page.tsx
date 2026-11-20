import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { LeaveView } from "@/components/hq/leave";
import { PageHeader } from "@/components/hq/shell";
import { SubTabs, TEAM_TABS } from "@/components/hq/subtabs";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { isOwner } from "@/lib/hq/access";
import { listTasks } from "@/lib/hq/data";
import { listLeave, listTeamPatterns } from "@/lib/hq/leave";
import { lagosToday } from "@/lib/hq/work";

export default function LeavePage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Team" lead="Who's in, who's out, and time off waiting for approval." />
      <SubTabs label="Team" tabs={TEAM_TABS} current="leave" />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the calendar…</p>}>
        <Leave />
      </Suspense>
    </main>
  );
}

async function Leave() {
  let props;
  try {
    await connection();
    const user = await requireModule("team");
    const [people, items, tasks] = await Promise.all([listTeamPatterns(), listLeave(), listTasks()]);
    const open = tasks.filter((t) => t.status !== "done");
    const wanted = new Set(items.flatMap((l) => l.handover));
    props = {
      me: { id: user.id, name: user.name, owner: isOwner(user.roles) },
      today: lagosToday(),
      people: people.filter((p) => !p.roles.includes("Contractor") || p.id === user.id),
      items,
      myTasks: open
        .filter((t) => t.assigneeId === user.id)
        .slice(0, 15)
        .map((t) => ({ id: t.id, title: t.title, due: t.due })),
      taskTitles: Object.fromEntries(open.filter((t) => wanted.has(t.id)).map((t) => [t.id, t.title])),
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <LeaveView {...props} />;
}
