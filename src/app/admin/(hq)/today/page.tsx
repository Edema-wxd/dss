import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { TodayView } from "@/components/hq/today";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { getStandups, kpiStates, listClients, listContacts, listKpis, listPeople, listTasks } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { addDays, lagosHour } from "@/lib/hq/work";

import { BUILT, MODULES, canUse, isOwner, modulesFor, withBorrowed } from "@/lib/hq/access";
import { listLeave, listTeamPatterns } from "@/lib/hq/leave";
import { coveringFor, dayMode, isShift, lvLabel, onLeave, readyForOwner, reliefState, usualMode } from "@/lib/hq/leave-model";
import { listCycles, listTactics } from "@/lib/hq/plan";
import { currentCycle, weekNo } from "@/lib/hq/plan-model";
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


const first = (n: string) => n.split(" ")[0] || n;
const fmtD = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** HQ's leave banners on Today: your own day, who you're covering for, answers waiting on you, and who's out. */
function leaveBanners(
  out: { text: string; href: string; action: string }[],
  user: { id: number; roles: string[]; ownRoles?: string[] },
  today: string,
  items: Awaited<ReturnType<typeof listLeave>>,
  team: Awaited<ReturnType<typeof listTeamPatterns>>,
) {
  const me = team.find((p) => p.id === user.id);
  const cal = "/admin/team/leave";
  const mode = me ? dayMode(items, user.id, me.pattern, today) : "full";
  if (mode === "leave") out.push({ text: `You're marked ${lvLabel(onLeave(items, user.id, today)?.type ?? "").toLowerCase()} today. Rest properly; your relief officer has it.`, href: cal, action: "See the calendar" });
  else if (mode === "off") out.push({ text: "Today is an off day for you. Nothing here needs you.", href: cal, action: "See the calendar" });
  else if (mode === "half") out.push({ text: "Half day today. Pick one thing that matters and stop there.", href: cal, action: "See the calendar" });
  const mine = modulesFor(user.ownRoles ?? user.roles);
  for (const l of coveringFor(items, user.id, today)) {
    const absent = team.find((p) => p.id === l.userId);
    if (!absent) continue;
    const extra = [...modulesFor(withBorrowed([], absent.roles))].filter((m) => !mine.has(m) && BUILT.includes(m)).map((m) => MODULES.find((x) => x.key === m)?.label);
    out.push({
      text: `You're covering for ${first(absent.name)} until ${fmtD(l.end || l.start)}.${l.todoText ? ` Pending: ${l.todoText.slice(0, 200)}` : ""}${extra.length ? ` Their pages are in your menu while they're away: ${extra.join(", ")}. Access goes back to normal when they return.` : ""}`,
      href: "/admin/tasks",
      action: "Open tasks",
    });
  }
  const asks = items.filter((s) => isShift(s) && s.userId === user.id && s.status === "requested").length + items.filter((l) => !isShift(l) && l.reliefId === user.id && l.status === "pending" && reliefState(l) === "waiting").length;
  if (asks) out.push({ text: `${asks} request${asks > 1 ? "s need" : " needs"} your answer: a day change or covering for a teammate.`, href: cal, action: "Answer" });
  const away = team.filter((p) => {
    if (p.id === user.id || p.roles.includes("Contractor")) return false;
    const m = dayMode(items, p.id, p.pattern, today);
    return m === "leave" || m === "half" || (m === "off" && usualMode(p.pattern, today) !== "off");
  });
  if (away.length)
    out.push({
      text: `Not in for a full day: ${away.map((p) => { const m = dayMode(items, p.id, p.pattern, today); return `${first(p.name)} (${m === "leave" ? lvLabel(onLeave(items, p.id, today)?.type ?? "").toLowerCase() : m === "half" ? "half day" : "off"})`; }).join(", ")}.`,
      href: cal,
      action: "See the calendar",
    });
  if (isOwner(user.roles)) {
    const pr = team.filter((p) => p.patternReq?.status === "pending").length;
    if (pr) out.push({ text: `${pr} work-day change${pr > 1 ? "s" : ""} waiting for your approval.`, href: cal, action: "Review" });
    const lv = items.filter(readyForOwner).length;
    if (lv) out.push({ text: `${lv} time-off request${lv > 1 ? "s" : ""} ready for your decision. The relief officer has agreed.`, href: cal, action: "Review" });
  }
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
    leaveBanners(banners, user, w.today, ...(await Promise.all([listLeave(), listTeamPatterns()])));
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
    let plan = null;
    const cycle = canUse(user.roles, "plan") ? currentCycle(await listCycles()) : null;
    if (cycle) {
      const week = weekNo(cycle.start, w.today);
      const mine = await listTactics(cycle.id, user.id);
      plan = {
        cycle: { id: cycle.id, name: cycle.name, start: cycle.start, target: cycle.target, goals: cycle.goals },
        week,
        mine: mine.filter((t) => t.weeks.includes(week)),
        all: mine.length,
        tasked: tasks.filter((t) => t.tacticId && t.status !== "done").map((t) => `${t.tacticId}:${t.tacticWeek}`),
      };
    }
    props = {
      w,
      plan,
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
