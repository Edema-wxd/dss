import { type Deliverable } from "./talent-model";
import { type LeaveItem, type Pattern, covers, coveringFor, dayMode, isShift, readyForOwner } from "./leave-model";
import { fmtHM } from "./time-model";
import { addDays, longDate, relDay, weekday } from "./work";

// What HQ's notifications job writes: the update emails (the hq_notify queue, one email per
// person per run) and the morning summary. Pure, so the tests read exactly what goes out.
// Plain, warm and short, no em or en dashes, and never money, salaries or private messages.

/** Queued updates older than this are marked skipped instead of sent, so a backlog never floods inboxes. */
export const STALE_HOURS = 48;
export const isStale = (at: string, now = Date.now()) => now - Date.parse(at) > STALE_HOURS * 3600e3;

/** The run before 09:00 Lagos is the morning one (Vercel may start a daily job up to 59 minutes late). */
export const isMorningRun = (lagosHour: number) => lagosHour < 9;

export type Recipient = { id: number; name: string; email: string; notifyEmail: string; notifyMode: string; active: boolean };
export const addressOf = (p: Pick<Recipient, "email" | "notifyEmail">) => (p.notifyEmail || p.email || "").trim();
/** Who gets update emails: an address, still active, and not set to off or morning summary only. */
export const getsUpdates = (p: Recipient) => p.active && !!addressOf(p) && p.notifyMode !== "off" && p.notifyMode !== "digest";
/** Who gets the morning summary: everyone with an address who hasn't turned emails off. */
export const getsSummary = (p: Recipient) => p.active && !!addressOf(p) && p.notifyMode !== "off";

const first = (n: string) => n.split(" ")[0] || n;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const WRAP = `font-family:Poppins,Segoe UI,Arial,sans-serif;color:#201c2b;max-width:560px;line-height:1.5`;
const FOOT = `color:#5f5f63;font-size:13px`;

/* ── Update emails ───────────────────────────────────────────────────── */

export type QueueItem = { id: string; title: string; body: string; link: string; at: string };

/** One email for everything waiting for a person. */
export function updatesEmail(o: { name: string; items: readonly QueueItem[]; site: string }) {
  const n = o.items.length;
  const subject = n === 1 ? o.items[0].title : `DSS HQ: ${n} updates for you`;
  const home = `${o.site}/savvy-hq`;
  const text = [
    `Hi ${first(o.name)},`,
    "",
    n === 1 ? "There's an update for you in DSS HQ." : `There are ${n} updates for you in DSS HQ.`,
    "",
    ...o.items.flatMap((i) => [i.title, ...(i.body ? [i.body] : []), i.link, ""]),
    `Open DSS HQ: ${home}`,
  ].join("\n");
  const html = `<div style="${WRAP}"><p>Hi ${esc(first(o.name))},</p>
${o.items
  .map(
    (i) =>
      `<p style="margin:0 0 14px"><b>${esc(i.title)}</b>${i.body ? `<br>${esc(i.body).replace(/\n/g, "<br>")}` : ""}<br><a href="${esc(i.link)}" style="color:#ec1763;font-weight:600">Open in HQ</a></p>`,
  )
  .join("\n")}
<p style="${FOOT}">DSS HQ · <a href="${esc(home)}" style="color:#5f5f63">${esc(home)}</a></p></div>`;
  return { subject, text, html };
}

/* ── The morning summary ─────────────────────────────────────────────── */

export type SumPerson = Recipient & { roles: readonly string[]; pattern: Pattern };
export type SumTask = { title: string; due: string; assigneeId: number | null };
export type SumContact = { name: string; company: string; nextAction: string; nextDate: string; ownerId: number | null };
export type SumDeal = { talent: string; brand: string; nextStep: string; nextDate: string; ownerId: number | null; deliverables: readonly Deliverable[] };
export type SumTalent = { name: string; trialEnds: string; managerId: number | null };
export type SumTime = { userId: number; status: string; late: number; workedMin: number | null; eod: { blockers?: string } | null };
export type SumTactic = { userId: number; title: string };

/** Everything the summaries read, gathered once per run. Lists hold only what's open. */
export type Snapshot = {
  today: string;
  /** the first Owner: unowned deals and talents without a manager land with them */
  ownerId: number | null;
  people: readonly SumPerson[];
  /** open tasks due today or earlier */
  tasks: readonly SumTask[];
  /** CRM follow-ups due today or earlier, still in play */
  contacts: readonly SumContact[];
  /** deals in an open stage */
  deals: readonly SumDeal[];
  /** talents with a trial or contract review date */
  talents: readonly SumTalent[];
  leave: readonly LeaveItem[];
  /** people waiting on the owner to approve a new work pattern */
  patternReqs: readonly { name: string }[];
  kpiProposals: readonly { name: string; title: string }[];
  /** clients whose onboarding is waiting for sign-off */
  onboarding: readonly { name: string }[];
  /** the last working day's attendance */
  attendance: { day: string; rows: readonly SumTime[] };
  /** this week of the active 12-week plan, or null */
  plan: { week: number; tactics: readonly SumTactic[] } | null;
};

export type Section = { title: string; lines: string[] };

const when = (d: string, today: string) => (d < today ? `overdue since ${relDay(d, today).toLowerCase()}` : "due today");
const ownerOf = (id: number | null, s: Snapshot) => id ?? s.ownerId;
const nameOf = (s: Snapshot, id: number | null) => s.people.find((p) => p.id === id)?.name ?? "Someone";

/** The day attendance looks back on: yesterday, or Friday when it's Monday. */
export const lastWorkingDay = (today: string) => addDays(today, weekday(today) === 1 ? -3 : -1);

export const isOwnerRole = (roles: readonly string[]) => roles.includes("Owner");

/** One person's summary, section by section. Empty when there's nothing for them. */
export function morningSections(p: SumPerson, s: Snapshot): Section[] {
  const { today } = s;
  const out: Section[] = [];
  const add = (title: string, lines: string[]) => lines.length && out.push({ title, lines });

  add(
    "Your tasks",
    s.tasks
      .filter((t) => t.assigneeId === p.id && t.due && t.due <= today)
      .sort((a, b) => a.due.localeCompare(b.due))
      .map((t) => `${t.title} (${when(t.due, today)})`),
  );

  add(
    "Follow-ups in the CRM",
    s.contacts
      .filter((c) => c.ownerId === p.id && c.nextDate && c.nextDate <= today)
      .map((c) => `${[c.name, c.company].filter(Boolean).join(", ")}${c.nextAction ? `: ${c.nextAction}` : ""} (${when(c.nextDate, today)})`),
  );

  const mine = s.deals.filter((d) => ownerOf(d.ownerId, s) === p.id);
  add("Talent follow-ups", [
    ...mine.filter((d) => d.nextDate && d.nextDate <= today).map((d) => `${d.talent} x ${d.brand}: ${d.nextStep || "next step"} (${when(d.nextDate, today)})`),
    ...mine.flatMap((d) => d.deliverables.filter((x) => !x.done && x.due && x.due <= today).map((x) => `${d.talent} x ${d.brand}: ${x.t} (${when(x.due!, today)})`)),
  ]);

  const soon = addDays(today, 14);
  add(
    "Talent reviews coming up",
    s.talents
      .filter((t) => ownerOf(t.managerId, s) === p.id && t.trialEnds && t.trialEnds >= today && t.trialEnds <= soon)
      .sort((a, b) => a.trialEnds.localeCompare(b.trialEnds))
      .map((t) => `${t.name}: trial or contract review on ${relDay(t.trialEnds, today)}`),
  );

  add(
    "Covering today",
    coveringFor(s.leave, p.id, today).map((l) => `You're covering for ${first(nameOf(s, l.userId))} today. You can see and do what they usually do.`),
  );

  add("Waiting on your answer", [
    ...s.leave
      .filter((l) => !isShift(l) && l.status === "pending" && l.reliefId === p.id && !l.reliefAnswer)
      .map((l) => `${first(nameOf(s, l.userId))} asked you to cover their time off from ${relDay(l.start, today)}`),
    ...s.leave.filter((l) => isShift(l) && l.userId === p.id && l.status === "requested").map((l) => `A change to your day on ${relDay(l.start, today)}`),
  ]);

  if (s.plan && s.plan.week >= 1 && s.plan.week <= 12) {
    const mineT = s.plan.tactics.filter((t) => t.userId === p.id);
    if (weekday(today) === 1) add(`Your 12-week plan, week ${s.plan.week}`, mineT.map((t) => t.title));
    if (weekday(today) === 5 && mineT.length) add("12-week plan", ["Tick off this week's tactics and do your weekly review on the 12-week plan page."]);
  }

  if (isOwnerRole(p.roles)) {
    const ready = s.leave.filter((l) => l.userId !== null && readyForOwner(l));
    const onRelief = s.leave.filter((l) => l.userId !== null && !isShift(l) && l.status === "pending" && !readyForOwner(l)).length;
    add("Needs your approval", [
      ...ready.map((l) => `${first(nameOf(s, l.userId))}: time off from ${relDay(l.start, today)}`),
      ...(onRelief ? [`${onRelief} more time off request${onRelief === 1 ? " is" : "s are"} waiting on the relief officer first`] : []),
      ...s.patternReqs.map((r) => `${first(r.name)}: a new work pattern`),
      ...s.kpiProposals.map((k) => `${first(k.name)}: KPI proposal, ${k.title}`),
      ...s.onboarding.map((c) => `${c.name}: onboarding ready for sign-off`),
    ]);

    const hol = s.leave.find((l) => l.userId === null && !isShift(l) && l.status === "approved" && covers(l, today));
    add("Out today", [
      ...(hol ? [`Public holiday${hol.note ? `: ${hol.note}` : ""}`] : []),
      ...s.leave.filter((l) => l.userId !== null && !isShift(l) && l.status === "approved" && covers(l, today)).map((l) => first(nameOf(s, l.userId))),
    ]);

    const d = s.attendance.day;
    const dayLabel = weekday(today) === 1 ? "Friday" : "Yesterday";
    add(
      `${dayLabel}'s attendance`,
      s.people
        // owners don't clock in
        .filter((x) => x.active && !isOwnerRole(x.roles))
        .flatMap((x) => {
          const t = s.attendance.rows.find((r) => r.userId === x.id);
          if (!t) return ["full", "half"].includes(dayMode(s.leave, x.id, x.pattern, d)) ? [`${first(x.name)}: didn't clock in`] : [];
          const bits = [fmtHM(t.workedMin ?? 0)];
          if (t.late > 0) bits.push(`${fmtHM(t.late)} late`);
          if (t.status === "in" || t.status === "break") bits.push("didn't clock out");
          bits.push(t.eod ? "sent an end-of-day report" : "no end-of-day report");
          const bl = (t.eod?.blockers ?? "").replace(/\s+/g, " ").trim();
          if (bl) bits.push(`blocker: "${bl.length > 80 ? `${bl.slice(0, 79)}…` : bl}"`);
          return [`${first(x.name)}: ${bits.join(", ")}`];
        }),
    );
  }
  return out;
}

/** The summary email, or null when there's nothing to say (the owner still gets a one-liner). */
export function morningEmail(p: SumPerson, s: Snapshot, site: string) {
  const sections = morningSections(p, s);
  if (!sections.length && !isOwnerRole(p.roles)) return null;
  const subject = `DSS HQ: your day, ${longDate(s.today)}`;
  const home = `${site}/savvy-hq`;
  const text = [
    `Good morning ${first(p.name)},`,
    "",
    ...(sections.length ? sections.flatMap((x) => [`${x.title}:`, ...x.lines.map((l) => `  ${l}`), ""]) : ["Nothing urgent today.", ""]),
    `Open DSS HQ: ${home}`,
  ].join("\n");
  const html = `<div style="${WRAP}"><p>Good morning ${esc(first(p.name))},</p>
${
  sections.length
    ? sections.map((x) => `<p style="margin:14px 0 4px"><b>${esc(x.title)}</b></p><ul style="margin:0;padding-left:20px">${x.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("\n")
    : "<p>Nothing urgent today.</p>"
}
<p style="margin-top:18px"><a href="${esc(home)}" style="color:#ec1763;font-weight:600">Open DSS HQ</a></p>
<p style="${FOOT}">You get this each morning. Change it in HQ under Settings, Your profile, Email me.</p></div>`;
  return { subject, text, html };
}
