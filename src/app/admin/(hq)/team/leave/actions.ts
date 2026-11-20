"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { type DeskUser, requireModule } from "@/lib/desk/auth";
import { isOwner } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import * as leave from "@/lib/hq/leave";
import { LV_TYPES, type Pattern, WEEK, autoApproved, dateSpan, dayMode, isMode, isShift, lvLabel, modeLabel, needsRelief, readyForOwner, reliefState } from "@/lib/hq/leave-model";
import { notify, ownerId } from "@/lib/hq/notify";
import { logActivity } from "@/lib/hq/sales";
import { lagosToday } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 2000) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const first = (name: string) => name.split(" ")[0] || name;
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const PATH = "team/leave";

async function teammate(id: unknown, not?: number) {
  const n = Number(id);
  if (!n || n === not) return null;
  return (await leave.listTeamPatterns()).find((p) => p.id === n) ?? null;
}

const owner = async () => {
  const user = await requireModule("team");
  return isOwner(user.roles) ? user : null;
};

const audit = (u: DeskUser, id: string, t: string) => logActivity(u, "leave", id, "update", t);

/* ── Requests ────────────────────────────────────────────────────────── */

export async function requestLeave(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("team");
  const type = LV_TYPES.some(([k]) => k === input.type && k !== "holiday") ? String(input.type) : "";
  const start = date(input.start);
  if (!type || !start) return fail("Choose the type of time off and the first day.");
  const end = date(input.end) && date(input.end) >= start ? date(input.end) : start;
  const relief = type === "leave" ? await teammate(input.reliefId, user.id) : null;
  const doneText = text(input.doneText);
  const todoText = text(input.todoText);
  if (type === "leave") {
    if (!relief) return fail("Choose a relief officer for annual leave.");
    if (!doneText || !todoText) return fail("Fill in tasks done and pending to-do.");
  }
  const mine = (await data.listTasks({ assigneeId: user.id })).filter((t) => t.status !== "done");
  const handover = relief ? (Array.isArray(input.handover) ? input.handover.map(String) : []).filter((id) => mine.some((t) => t.id === id)) : [];
  const status = autoApproved(type, start, end) ? "approved" : "pending";
  const id = await leave.addLeave({ userId: user.id, type, start, end, reliefId: relief?.id ?? null, doneText, todoText, handover, note: text(input.note), status }, user.id);
  const dates = dateSpan({ start, end }, fmt);
  if (type === "leave" && relief)
    await notify(relief.id, `${first(user.name)} has asked you to cover their leave`, `${first(user.name)} is off ${dates} and has named you as relief officer. Open HQ to say whether you can cover.\n\nStill to do: ${todoText}`, PATH, user.id);
  else if (status === "pending") await notify(await ownerId(), `${first(user.name)} has requested time off`, `${lvLabel(type)}, ${dates}. It needs your approval.`, PATH, user.id);
  await audit(user, id, `Asked for ${lvLabel(type).toLowerCase()}, ${dates}`);
  refresh();
  return {
    ok: true,
    message: status === "approved" ? "Logged. Get well soon." : type === "leave" ? `Sent to ${first(relief!.name)} to agree to cover. Then it goes to the owner.` : "Sent to the owner for approval.",
  };
}

export async function cancelLeave(id: string): Promise<ActionResult> {
  const user = await requireModule("team");
  const l = await leave.getLeave(String(id));
  if (!l || l.userId !== user.id || isShift(l)) return fail("That request isn't yours to cancel.");
  if (l.status !== "pending" && l.start <= lagosToday()) return fail("Time off that has started can't be cancelled here. Ask the owner.");
  await leave.deleteLeave(l.id);
  await audit(user, l.id, `Cancelled ${lvLabel(l.type).toLowerCase()}, ${dateSpan(l, fmt)}`);
  refresh();
  return { ok: true, message: "Cancelled." };
}

export async function changeRelief(id: string, reliefId: number): Promise<ActionResult> {
  const user = await requireModule("team");
  const l = await leave.getLeave(String(id));
  if (!l || l.userId !== user.id || l.status !== "pending" || !needsRelief(l)) return fail("That request can't change relief officer now.");
  const relief = await teammate(reliefId, user.id);
  if (!relief || relief.id === l.reliefId) return fail("Choose someone else to cover.");
  await leave.patchLeave(l.id, { reliefId: relief.id, reliefAnswer: "", reliefNote: "" });
  await notify(relief.id, `${first(user.name)} has asked you to cover their leave`, `${first(user.name)} is off ${dateSpan(l, fmt)}. Open HQ to say whether you can cover.`, PATH, user.id);
  refresh();
  return { ok: true, message: `Sent to ${first(relief.name)} to agree.` };
}

/** The relief officer's answer. Only the person named can give it. */
export async function reliefReply(id: string, yes: boolean, note = ""): Promise<ActionResult> {
  const user = await requireModule("team");
  const l = await leave.getLeave(String(id));
  if (!l || l.reliefId !== user.id || l.status !== "pending" || reliefState(l) !== "waiting") return fail("That request isn't waiting on you.");
  const people = await leave.listTeamPatterns();
  const who = first(people.find((p) => p.id === l.userId)?.name ?? "them");
  if (!yes && !text(note)) return fail(`Tell ${who} why you can't cover.`);
  await leave.patchLeave(l.id, { reliefAnswer: yes ? "accepted" : "declined", reliefNote: yes ? "" : text(note) });
  if (yes) {
    await notify(await ownerId(), `${who}'s leave is ready for your decision`, `${first(user.name)} has agreed to cover for ${who}. Approve or decline in HQ.`, PATH, user.id);
    await notify(l.userId, `${first(user.name)} will cover for you`, "Your request has gone to the owner for approval.", PATH, user.id);
  } else await notify(l.userId, `${first(user.name)} can't cover for you`, `${text(note)}\n\nChoose another relief officer in HQ.`, PATH, user.id);
  await audit(user, l.id, yes ? `Agreed to cover for ${who}` : `Couldn't cover for ${who}`);
  refresh();
  return { ok: true, message: yes ? `Thanks. ${who}'s request now goes to the owner.` : `${who} has been told.` };
}

/** The owner approves or declines. Approving hands the chosen tasks to the relief officer. */
export async function decideLeave(id: string, approve: boolean, reply = ""): Promise<ActionResult> {
  const user = await owner();
  if (!user) return fail("Only the owner approves time off.");
  const l = await leave.getLeave(String(id));
  if (!l || isShift(l) || l.status !== "pending") return fail("That request has already been decided.");
  if (!readyForOwner(l)) return fail("The relief officer has to agree first.");
  if (!approve && !text(reply)) return fail("Say why, so they know.");
  await leave.patchLeave(l.id, { status: approve ? "approved" : "declined", reply: approve ? "" : text(reply), reviewedBy: user.id });
  const people = await leave.listTeamPatterns();
  const name = (pid: number | null) => first(people.find((p) => p.id === pid)?.name ?? "them");
  let moved = 0;
  if (approve) {
    if (l.reliefId)
      for (const tid of l.handover) {
        const t = await data.getTask(tid);
        if (t && t.status !== "done") {
          await data.updateTask(t.id, { assigneeId: l.reliefId, notes: `${t.notes ?? ""}\nCovering for ${name(l.userId)} (${dateSpan(l, fmt)}).`.trim() });
          moved++;
        }
      }
    await notify(l.userId, "Your time off is approved", `${lvLabel(l.type)}, ${dateSpan(l, fmt)}, is approved.`, PATH, user.id);
    if (l.reliefId) await notify(l.reliefId, `You're covering for ${name(l.userId)}`, `${name(l.userId)}'s leave, ${dateSpan(l, fmt)}, is approved.${moved ? ` ${moved} task${moved > 1 ? "s have" : " has"} been handed to you.` : ""}`, "today", user.id);
  } else await notify(l.userId, "Your time-off request was declined", `The owner says: ${text(reply)}`, PATH, user.id);
  await audit(user, l.id, `${approve ? "Approved" : "Declined"} ${name(l.userId)}'s ${lvLabel(l.type).toLowerCase()}, ${dateSpan(l, fmt)}`);
  refresh();
  return { ok: true, message: approve ? `Approved.${moved ? ` ${moved} task${moved > 1 ? "s" : ""} handed to ${name(l.reliefId)}.` : ""}` : "Declined." };
}

export async function addHoliday(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await owner();
  if (!user) return fail("Only the owner adds public holidays.");
  const start = date(input.start);
  const note = text(input.note, 120);
  if (!start || !note) return fail("Name the holiday and its first day.");
  const end = date(input.end) && date(input.end) >= start ? date(input.end) : start;
  const id = await leave.addLeave({ userId: null, type: "holiday", start, end, note, status: "approved" }, user.id);
  await audit(user, id, `Added a public holiday: ${note}`);
  refresh();
  return { ok: true, message: "Holiday added." };
}

export async function removeHoliday(id: string): Promise<ActionResult> {
  const user = await owner();
  const l = await leave.getLeave(String(id));
  if (!user || !l || l.userId !== null) return fail("Only the owner removes public holidays.");
  await leave.deleteLeave(l.id);
  refresh();
  return { ok: true, message: "Holiday removed." };
}

/* ── Day changes ─────────────────────────────────────────────────────── */

export async function askShift(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await owner();
  if (!user) return fail("Only the owner asks for day changes.");
  const p = await teammate(input.userId, user.id);
  const d = date(input.day);
  if (!p || !d || d < lagosToday()) return fail("Choose someone and a day from today on.");
  if (!isMode(input.to)) return fail("Choose the kind of day.");
  const from = dayMode(await leave.listLeave(), p.id, p.pattern, d);
  if (from === "leave") return fail(`${first(p.name)} is on leave that day.`);
  if (from === input.to) return fail(`That's already a ${modeLabel(from).toLowerCase()} for ${first(p.name)}.`);
  const id = await leave.addLeave({ userId: p.id, type: "shift", start: d, end: d, shiftFrom: from, shiftTo: String(input.to), note: text(input.reason, 300), status: "requested" }, user.id);
  await notify(p.id, "The owner has asked you to change a day", `${fmt(d)}: ${modeLabel(from).toLowerCase()} to ${modeLabel(String(input.to)).toLowerCase()}.${text(input.reason) ? ` ${text(input.reason, 300)}` : ""} Accept or decline in HQ.`, PATH, user.id);
  await audit(user, id, `Asked ${first(p.name)} for a ${modeLabel(String(input.to)).toLowerCase()} on ${fmt(d)}`);
  refresh();
  return { ok: true, message: `Sent to ${first(p.name)}.` };
}

export async function shiftReply(id: string, accept: boolean, reply = ""): Promise<ActionResult> {
  const user = await requireModule("team");
  const s = await leave.getLeave(String(id));
  if (!s || !isShift(s) || s.userId !== user.id || s.status !== "requested") return fail("That day change isn't waiting on you.");
  await leave.patchLeave(s.id, { status: accept ? "accepted" : "declined", reply: text(reply, 300) });
  await notify(await ownerId(), `${first(user.name)} ${accept ? "accepted" : "can't do"} the day change`, `${fmt(s.start)}, ${modeLabel(s.shiftTo).toLowerCase()}.${text(reply) ? ` ${text(reply, 300)}` : ""}`, PATH, user.id);
  refresh();
  return { ok: true, message: accept ? "Accepted. It's on the calendar." : "Sent." };
}

export async function withdrawShift(id: string): Promise<ActionResult> {
  const user = await owner();
  const s = await leave.getLeave(String(id));
  if (!user || !s || !isShift(s)) return fail("Only the owner withdraws day changes.");
  await leave.deleteLeave(s.id);
  refresh();
  return { ok: true, message: "Withdrawn." };
}

/* ── Work patterns ───────────────────────────────────────────────────── */

function readPattern(v: unknown): Pattern | null {
  if (!v || typeof v !== "object") return null;
  const out = {} as Pattern;
  for (const [k] of WEEK) {
    const m = (v as Record<string, unknown>)[k];
    if (!isMode(m)) return null;
    out[k] = m;
  }
  return out;
}

/** The owner sets her own week; everyone else sends theirs for approval. */
export async function savePattern(input: unknown): Promise<ActionResult> {
  const user = await requireModule("team");
  const p = readPattern(input);
  if (!p) return fail("Choose full, half or off for every day.");
  if (isOwner(user.ownRoles ?? user.roles)) {
    await leave.setPattern(user.id, p);
    await leave.setPatternReq(user.id, null);
    refresh();
    return { ok: true, message: "Your work days are saved." };
  }
  await leave.setPatternReq(user.id, { pattern: p, status: "pending", at: new Date().toISOString() });
  await notify(await ownerId(), `${first(user.name)} wants a new usual week`, "Approve or decline it on Leave and availability in HQ.", PATH, user.id);
  refresh();
  return { ok: true, message: "Sent to the owner for approval." };
}

export async function decidePattern(userId: number, approve: boolean, note = ""): Promise<ActionResult> {
  const user = await owner();
  if (!user) return fail("Only the owner approves work days.");
  const p = await teammate(userId);
  if (!p || p.patternReq?.status !== "pending") return fail("That change has already been decided.");
  if (approve) await leave.setPattern(p.id, p.patternReq.pattern);
  await leave.setPatternReq(p.id, { ...p.patternReq, status: approve ? "approved" : "declined", note: approve ? "" : text(note, 300) });
  await notify(p.id, approve ? "Your work days are approved" : "Your work-day change was declined", approve ? "Your new usual week is on the team calendar." : `The owner says: ${text(note, 300) || "not this time."}`, PATH, user.id);
  await audit(user, String(p.id), `${approve ? "Approved" : "Declined"} ${first(p.name)}'s new usual week`);
  refresh();
  return { ok: true, message: approve ? "Approved." : "Declined." };
}

export async function setAllowance(userId: number, days: string): Promise<ActionResult> {
  const user = await owner();
  if (!user) return fail("Only the owner sets leave allowances.");
  const p = await teammate(userId);
  if (!p) return fail("That person isn't on the team.");
  const n = days.trim() === "" ? null : Math.min(366, Math.max(0, Number(days)));
  if (n !== null && !Number.isFinite(n)) return fail("Type a number of days.");
  await leave.setLeaveDays(p.id, n);
  refresh();
  return { ok: true, message: n === null ? "Allowance cleared." : `${first(p.name)}: ${n} days a year.` };
}

