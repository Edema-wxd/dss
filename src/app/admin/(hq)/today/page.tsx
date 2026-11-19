import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { TodayView } from "@/components/hq/today";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { getStandups, kpiStates, listClients, listContacts, listKpis, listPeople, listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { addDays, lagosHour } from "@/lib/hq/work";

import { canUse, isOwner } from "@/lib/hq/access";
import { listClientsFull, listContracts } from "@/lib/hq/sales";
import { LIVE, contractState } from "@/lib/hq/sales-model";
import { listDeals, listMedia, listPitches, listTalents } from "@/lib/hq/talent";
import { OPEN_STAGES, PITCH_OPEN } from "@/lib/hq/talent-model";
import { relDay } from "@/lib/hq/work";
export default function TodayPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Opening your day…</p>}>
        <Today />
      </Suspense>
    </main>
  );
}


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
    const banners: { text: string; href: string; action: string }[] = [];
    if (isOwner(user.roles))
      for (const c of (await listClientsFull()).filter((c) => c.onb?.status === "submitted"))
        banners.push({ text: `${c.name} is ready for your onboarding sign-off.`, href: `/admin/clients/${c.id}`, action: "Review" });
    if (canUse(user.roles, "contracts")) {
      const due = (await listContracts()).map((c) => ({ c, s: contractState(c, w.today) })).filter(({ s }) => s.k === "decide" || s.k === "lapsed");
      if (due.length)
        banners.push({
          text: `${due.length} contract${due.length === 1 ? " needs" : "s need"} a decision: ${due.slice(0, 3).map(({ c, s }) => `${c.party || clients.find((x) => x.id === c.clientId)?.name || "Unnamed"} (${s.l.toLowerCase()})`).join(", ")}.`,
          href: "/admin/contracts",
          action: "Open contracts",
        });
    }
    const cards: { title: string; href: string; items: { title: string; sub: string }[] }[] = [];
    const ownerFirst = (id: number | null) => id === user.id || (id === null && isOwner(user.roles));
    const rel = (d: string) => relDay(d, w.today).toLowerCase();
    if (canUse(user.roles, "talent")) {
      const [deals, talents] = await Promise.all([listDeals(), listTalents()]);
      const tname = (id: string | null) => talents.find((t) => t.id === id)?.name ?? "Talent";
      const mine = deals.filter((d) => ownerFirst(d.ownerId));
      const soon = addDays(w.today, 2);
      const items = [
        ...mine.filter((d) => OPEN_STAGES.includes(d.stage) && d.nextDate && d.nextDate <= soon).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).map((d) => ({ title: `${tname(d.talentId)} x ${d.brand}`, sub: `${d.nextStep || "Next step"}, ${rel(d.nextDate)}` })),
        ...mine.flatMap((d) => d.deliverables.filter((x) => !x.done && x.due && x.due <= soon).map((x) => ({ title: `${tname(d.talentId)} x ${d.brand}`, sub: `Deliverable: ${x.t}, ${rel(x.due!)}` }))),
        ...mine
          .filter((d) => ["pitching", "negotiating"].includes(d.stage) && !d.nextDate && (!d.updates.length || d.updates[d.updates.length - 1].at.slice(0, 10) < addDays(w.today, -10)))
          .map((d) => ({ title: `${tname(d.talentId)} x ${d.brand}`, sub: "Quiet for 10+ days. Post an update or set a next step." })),
        ...talents
          .filter((t) => ownerFirst(t.managerId) && t.trialEnds && t.trialEnds >= addDays(w.today, -7) && t.trialEnds <= addDays(w.today, 21))
          .map((t) => ({ title: `${t.name}: contract review`, sub: `${t.status === "trial" ? "Trial ends" : "Review due"} ${rel(t.trialEnds)}. Check their goals before the meeting.` })),
      ];
      if (items.length) cards.push({ title: "Talent follow-ups", href: "/admin/talent", items });
    }
    if (canUse(user.roles, "marketing")) {
      const [pitches, media] = await Promise.all([listPitches(), listMedia()]);
      const out = (id: string | null) => media.find((m) => m.id === id)?.name ?? "an outlet";
      const items = [
        ...pitches.filter((p) => ownerFirst(p.ownerId) && p.status === "booked" && p.runDate >= w.today && p.runDate <= addDays(w.today, 3)).map((p) => ({ title: `On ${out(p.outletId)}`, sub: `Runs ${rel(p.runDate)}. Brief them and share it when it's live.` })),
        ...pitches.filter((p) => ownerFirst(p.ownerId) && PITCH_OPEN.includes(p.status) && p.nextDate && p.nextDate <= w.today).map((p) => ({ title: `Pitch to ${out(p.outletId)}`, sub: `Follow up, ${rel(p.nextDate)}` })),
        ...media.filter((m) => ownerFirst(m.ownerId) && m.status !== "nofit" && m.nextDate && m.nextDate <= w.today).map((m) => ({ title: m.name, sub: `Check in with ${m.contactName || "them"}, ${rel(m.nextDate)}` })),
      ];
      if (items.length) cards.push({ title: "Publicity follow-ups", href: "/admin/marketing/publicity", items });
    }
    props = {
      w,
      banners,
      cards,
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
