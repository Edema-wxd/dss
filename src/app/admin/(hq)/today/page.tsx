import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { TodayView } from "@/components/hq/today";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { getStandups, kpiStates, listClients, listContacts, listKpis, listPeople, listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { addDays, lagosHour } from "@/lib/hq/work";

export default function TodayPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Opening your day…</p>}>
        <Today />
      </Suspense>
    </main>
  );
}

const LIVE = ["active", "onboarding", "paused"];

async function Today() {
  let props;
  try {
    const user = await requireModule("today");
    const w = await loadWork(user);
    const [tasks, standups, contacts, clients, kpis, people] = await Promise.all([
      listTasks({ assigneeId: user.id, doneSince: w.today }),
      getStandups(w.today),
      listContacts(),
      listClients(),
      listKpis(),
      listPeople(),
    ]);
    const h = lagosHour();
    props = {
      w,
      greeting: h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening",
      tasks,
      standup: standups.get(user.id) ?? null,
      calls: contacts
        .filter((c) => c.ownerId === user.id && c.nextDate && c.nextDate <= w.today && !["won", "lost", "nofit"].includes(c.stage))
        .sort((a, b) => a.nextDate.localeCompare(b.nextDate)),
      clients: clients.filter(
        (c) => c.leadId === user.id && LIVE.includes(c.status) && ((c.nextDate && c.nextDate <= addDays(w.today, 3)) || c.health === "risk"),
      ),
      kpis: await kpiStates(kpis.filter((k) => k.ownerId === user.id), w.today),
      hours: people.find((p) => p.id === user.id)?.hours || 6,
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <TodayView {...props} />;
}
