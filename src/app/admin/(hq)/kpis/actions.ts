"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import { canManageKpis, isOwner } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import { KPI_PERIODS, KPI_SOURCES, KPI_TEMPLATES, KPI_UNITS, formatKpi } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 500) => String(v ?? "").slice(0, max).trim();
const oneOf = (list: readonly (readonly [string, string])[], v: unknown, fallback: string) => (list.some(([k]) => k === v) ? String(v) : fallback);
const audit = (u: DeskUser, action: string, target: string, summary: string) =>
  store.audit({ actor: u.name, actorEmail: u.email, action, target, summary, changes: null });
const periodLabel = (p: string) => (KPI_PERIODS.find(([k]) => k === p)?.[1] ?? "Monthly").toLowerCase();

type KpiForm = Record<string, unknown>;

/** Cleans a KPI form. Revenue can only be set by someone who manages KPIs. */
function readKpi(input: KpiForm, ownerId: number | null, allowRevenue: boolean): data.KpiInput | string {
  const title = text(input.title, 200);
  if (!title) return "Say what's measured.";
  const target = Number(input.target);
  if (!Number.isFinite(target) || target < 0) return "Set a target of 0 or more.";
  const source = oneOf(KPI_SOURCES, input.source, "manual");
  if (source === "auto_revenue" && !allowRevenue) return "Only an owner or manager can set a revenue KPI.";
  const weight = Number(input.weight);
  return {
    title,
    ownerId,
    unit: oneOf(KPI_UNITS, input.unit, "number"),
    target,
    period: oneOf(KPI_PERIODS, input.period, "month"),
    direction: input.direction === "down" ? "down" : "up",
    source,
    weight: Number.isFinite(weight) && weight > 0 ? Math.min(weight, 10) : 1,
    how: text(input.how, 500),
  };
}

async function activePerson(id: unknown) {
  return (await data.listPeople()).find((p) => p.id === Number(id) && p.active) ?? null;
}

export async function saveKpi(id: string | null, input: KpiForm): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!canManageKpis(user.roles)) return fail("Only an owner or manager sets KPIs. You can propose one if the owner has switched that on for you.");
  const person = await activePerson(input.ownerId);
  if (!person) return fail("Pick who this KPI belongs to.");
  const k = readKpi(input, person.id, true);
  if (typeof k === "string") return fail(k);
  if (id && !(await data.listKpis()).some((x) => x.id === id)) return fail("That KPI isn't there any more.");
  await data.saveKpi(id ? String(id) : null, k, user.id);
  await audit(user, id ? "kpi.update" : "kpi.create", person.email, `${id ? "Changed" : "Set"} ${person.name}'s KPI "${k.title}": ${formatKpi(k.unit, k.target)} ${periodLabel(k.period)}`);
  refresh();
  return { ok: true, message: "KPI saved." };
}

export async function removeKpi(id: string): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!canManageKpis(user.roles)) return fail("Only an owner or manager can remove KPIs.");
  const k = (await data.listKpis()).find((x) => x.id === id);
  if (!k) return fail("That KPI isn't there any more.");
  await data.deleteKpi(k.id);
  await audit(user, "kpi.delete", k.id, `Removed the KPI "${k.title}"`);
  refresh();
  return { ok: true, message: "KPI removed." };
}

/** Gives someone the starter KPIs for their first role, as HQ's templates did. */
export async function applyTemplate(userId: number): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!canManageKpis(user.roles)) return fail("Only an owner or manager sets KPIs.");
  const person = await activePerson(userId);
  if (!person) return fail("That person isn't on the team.");
  const role = person.roles.find((r) => KPI_TEMPLATES[r]);
  if (!role) return fail("There's no template for their role yet.");
  for (const [title, unit, target, period, source] of KPI_TEMPLATES[role]) {
    await data.saveKpi(null, { title, ownerId: person.id, unit, target, period, direction: "up", source, weight: 1, how: "" }, user.id);
  }
  await audit(user, "kpi.create", person.email, `Gave ${person.name} the ${role} KPI template`);
  refresh();
  return { ok: true, message: `${person.name.split(" ")[0]} has the ${role} KPIs.` };
}

/** Saves the person's own numbers for their manual KPIs this period. */
export async function logNumbers(values: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("kpis");
  const mine = (await data.listKpis()).filter((k) => k.ownerId === user.id && (k.source || "manual") === "manual");
  let n = 0;
  for (const k of mine) {
    const raw = values[k.id];
    if (raw === "" || raw === undefined || raw === null) continue;
    const v = Number(raw);
    if (!Number.isFinite(v)) return fail(`"${k.title}" needs a number.`);
    await data.logKpi(k, v, user.id);
    n++;
  }
  if (!n) return fail("Fill in at least one number.");
  await audit(user, "kpi.log", user.email, `${user.name} updated ${n} KPI number${n === 1 ? "" : "s"}`);
  refresh();
  return { ok: true, message: "Numbers saved." };
}

/** The owner lets someone propose their own KPIs, or stops it. */
export async function setCanPropose(userId: number, on: boolean): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!isOwner(user.roles)) return fail("Only an owner can change this.");
  const person = await activePerson(userId);
  if (!person) return fail("That person isn't on the team.");
  await data.setKpiSelf(person.id, Boolean(on));
  await audit(user, "kpi.self", person.email, `${person.name} ${on ? "can now propose" : "can no longer propose"} KPIs`);
  refresh();
  return { ok: true, message: on ? `${person.name.split(" ")[0]} can now propose KPIs for your approval.` : `${person.name.split(" ")[0]} can no longer propose KPIs.` };
}

export async function proposeKpi(input: KpiForm): Promise<ActionResult> {
  const user = await requireModule("kpis");
  const me = (await data.listPeople()).find((p) => p.id === user.id);
  if (!me?.kpiSelf || isOwner(user.roles)) return fail("The owner hasn't switched on KPI proposals for you.");
  const k = readKpi(input, user.id, false);
  if (typeof k === "string") return fail(k);
  const why = text(input.why, 1000);
  if (!why) return fail("Say why this KPI matters.");
  await data.createProposal(user.id, { ...k, why });
  await audit(user, "kpi.propose", user.email, `${user.name} proposed the KPI "${k.title}"`);
  refresh();
  return { ok: true, message: "Sent to the owner for approval." };
}

export async function withdrawProposal(id: string): Promise<ActionResult> {
  const user = await requireModule("kpis");
  await data.deleteProposal(String(id), user.id);
  refresh();
  return { ok: true, message: "Proposal withdrawn." };
}

async function pendingProposal(id: string) {
  return (await data.listProposals()).find((p) => p.id === id && p.status === "pending") ?? null;
}

export async function approveProposal(id: string): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!isOwner(user.roles)) return fail("Only an owner approves KPIs.");
  const p = await pendingProposal(id);
  if (!p) return fail("That proposal has already been answered.");
  const kid = await data.saveKpi(null, { ...p, ownerId: p.userId, weight: 1, proposedBy: p.userId }, user.id);
  await data.reviewProposal(p.id, { status: "approved", kpiId: kid }, user.id);
  await audit(user, "kpi.approve", p.title, `Approved the KPI "${p.title}"`);
  refresh();
  return { ok: true, message: "Approved. It's now on their KPIs." };
}

export async function declineProposal(id: string, note: string): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!isOwner(user.roles)) return fail("Only an owner answers KPI proposals.");
  const p = await pendingProposal(id);
  if (!p) return fail("That proposal has already been answered.");
  const why = text(note, 1000);
  if (!why) return fail("Tell them why.");
  await data.reviewProposal(p.id, { status: "declined", note: why }, user.id);
  await audit(user, "kpi.decline", p.title, `Declined the KPI "${p.title}"`);
  refresh();
  return { ok: true, message: "Declined." };
}

/** "Reject and set mine": the owner sets their own version of the proposed KPI, with a reason. */
export async function reviseProposal(id: string, input: KpiForm): Promise<ActionResult> {
  const user = await requireModule("kpis");
  if (!isOwner(user.roles)) return fail("Only an owner answers KPI proposals.");
  const p = await pendingProposal(id);
  if (!p) return fail("That proposal has already been answered.");
  const k = readKpi(input, p.userId, true);
  if (typeof k === "string") return fail(k);
  const note = text(input.note, 1000);
  if (!note) return fail("Say why you changed it. They'll see this.");
  const kid = await data.saveKpi(null, { ...k, proposedBy: p.userId }, user.id);
  const final = `${formatKpi(k.unit, k.target)} ${periodLabel(k.period)}${k.title !== p.title ? ` for "${k.title}"` : ""}`;
  await data.reviewProposal(p.id, { status: "revised", kpiId: kid, note, final }, user.id);
  await audit(user, "kpi.revise", p.title, `Set a different version of the KPI "${p.title}": ${final}`);
  refresh();
  return { ok: true, message: "Your version is set on their KPIs." };
}
