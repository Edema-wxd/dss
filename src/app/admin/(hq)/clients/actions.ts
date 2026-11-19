"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import { isOwner, seesMoney } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import * as sales from "@/lib/hq/sales";
import { CLIENT_STATUS, CURRENCIES, HEALTH, ONB_DEFAULT, SERVICES, type Onboarding, type OnbStep, parseOnbTemplate } from "@/lib/hq/sales-model";
import { addDays, lagosToday } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 500) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const url = (v: unknown) => {
  const s = text(v, 1000);
  return /^https?:\/\//.test(s) ? s : "";
};
const oneOf = (list: readonly (readonly [string, string])[] | readonly string[], v: unknown, fallback: string) =>
  list.some((x) => (Array.isArray(x) ? x[0] : x) === v) ? String(v) : fallback;
const person = async (v: unknown) => {
  if (v === "" || v === null || v === undefined) return null;
  return (await data.listPeople()).find((p) => p.id === Number(v) && p.active)?.id ?? null;
};
const log = (u: DeskUser, id: string, type: string, t: string) => sales.logActivity(u, "client", id, type, t);

/** Cleans the client form. Fee and currency only change for roles that see money. */
async function readClient(user: DeskUser, input: Record<string, unknown>) {
  const out: Partial<sales.Client> = {};
  const has = (k: string) => k in input;
  if (has("name")) out.name = text(input.name, 160);
  if (has("service")) out.service = oneOf(SERVICES, input.service, "Other");
  if (has("status")) out.status = oneOf(CLIENT_STATUS, input.status, "active");
  if (has("health")) out.health = oneOf(HEALTH, input.health, "good");
  if (seesMoney(user.roles)) {
    if (has("fee")) out.fee = input.fee === "" || input.fee === null ? null : Math.max(0, Number(input.fee) || 0);
    if (has("currency")) out.currency = oneOf(CURRENCIES, input.currency, "NGN");
  }
  if (has("billing")) out.billing = input.billing === "project" ? "project" : "monthly";
  if (has("payMode")) out.payMode = input.payMode === "auto" ? "auto" : "invoice";
  if (has("payDay")) out.payDay = input.payDay === "" || input.payDay === null ? null : Math.min(28, Math.max(1, Number(input.payDay) || 1));
  if (has("startDate")) out.startDate = date(input.startDate);
  if (has("endDate")) out.endDate = date(input.endDate);
  if (has("leadId")) out.leadId = await person(input.leadId);
  if (has("pointId")) out.pointId = await person(input.pointId);
  for (const k of ["nextDeliverable", "contactName", "contactRole", "phone"] as const) if (has(k)) out[k] = text(input[k], 200);
  if (has("email")) out.email = text(input.email, 200);
  if (has("nextDate")) out.nextDate = date(input.nextDate);
  if (has("notes")) out.notes = text(input.notes, 5000);
  if (has("links")) {
    const l = (input.links ?? {}) as Record<string, unknown>;
    out.links = { drive: url(l.drive), portal: url(l.portal), contract: url(l.contract) };
  }
  return out;
}

/** The onboarding checklist from the template, each step a task for the lead or point guard when asked. */
async function buildOnboarding(user: DeskUser, c: sales.Client, start: string, withTasks: boolean): Promise<Onboarding> {
  const template = (await sales.getOnbTemplate()) ?? ONB_DEFAULT;
  const steps: OnbStep[] = [];
  for (const s of template) {
    let taskId: string | null = null;
    if (withTasks) {
      const who = s.who === "point" ? (c.pointId ?? c.leadId) : c.leadId;
      taskId = await data.createTask(
        { title: `${s.t}: ${c.name}`, clientId: c.id, assigneeId: who ?? user.id, due: addDays(start || lagosToday(), s.day), estimate: 30 },
        user.id,
      );
    }
    steps.push({ t: s.t, day: s.day, who: s.who === "point" ? "point" : "lead", taskId, done: false });
  }
  return { steps, status: "in_progress", startedAt: new Date().toISOString() };
}

export async function addClient(input: Record<string, unknown>): Promise<ActionResult & { id?: string }> {
  const user = await requireModule("clients");
  const c = await readClient(user, input);
  if (!c.name) return fail("Add the client or company name.");
  const today = lagosToday();
  const id = await sales.createClient(
    { status: "onboarding", startDate: today, endDate: addDays(today, 90), leadId: user.id, currency: "NGN", billing: "monthly", payMode: "invoice", ...c, name: c.name },
    user.id,
  );
  const client = (await sales.getClient(id))!;
  if (input.startOnboarding === true) await sales.updateClient(id, { onb: await buildOnboarding(user, client, client.startDate, true) });
  await log(user, id, "update", `Client added: ${client.service || "service not set"}`);
  const fromContact = text(input.fromContact, 40);
  if (fromContact && (await sales.getContact(fromContact))) {
    await sales.updateContact(fromContact, { clientId: id, stage: "won", wonAt: new Date().toISOString() });
    await sales.logActivity(user, "contact", fromContact, "stage", `Won: became the client ${client.name}`);
  }
  refresh();
  return { ok: true, message: "Client added.", id };
}

export async function saveClient(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("clients");
  const before = await sales.getClient(String(id));
  if (!before) return fail("That client isn't there any more.");
  const c = await readClient(user, input);
  if ("name" in c && !c.name) return fail("The client needs a name.");
  await sales.updateClient(before.id, c);
  if (c.status && c.status !== before.status) await log(user, before.id, "update", `Status: ${CLIENT_STATUS.find(([k]) => k === c.status)?.[1]}`);
  if (c.status === "ended" && before.status !== "ended") await sales.endClientContracts(before.id);
  refresh();
  return { ok: true, message: "Saved" };
}

export async function removeClient(id: string): Promise<ActionResult> {
  const user = await requireModule("clients");
  const c = await sales.getClient(String(id));
  if (!c) return fail("That client isn't there any more.");
  await sales.deleteClient(c.id);
  await log(user, c.id, "update", `Deleted the client ${c.name}`);
  refresh();
  return { ok: true, message: "Client deleted." };
}

/** "Log it" on a client's Updates tab. */
export async function logClientUpdate(id: string, type: string, note: string): Promise<ActionResult> {
  const user = await requireModule("clients");
  const c = await sales.getClient(String(id));
  if (!c) return fail("That client isn't there any more.");
  const t = text(note, 2000);
  if (!t) return fail("Say what happened.");
  await log(user, c.id, ["update", "meeting", "call", "email", "whatsapp"].includes(type) ? type : "update", t);
  refresh();
  return { ok: true, message: "Logged." };
}

/* ── Onboarding ──────────────────────────────────────────────────────── */

export async function startOnboarding(id: string, withTasks: boolean): Promise<ActionResult> {
  const user = await requireModule("clients");
  const c = await sales.getClient(String(id));
  if (!c) return fail("That client isn't there any more.");
  if (c.onb) return fail("This client already has an onboarding checklist.");
  await sales.updateClient(c.id, { onb: await buildOnboarding(user, c, c.startDate, Boolean(withTasks)) });
  refresh();
  return { ok: true, message: "Onboarding checklist started." };
}

export async function tickStep(id: string, index: number, done: boolean): Promise<ActionResult> {
  const user = await requireModule("clients");
  const c = await sales.getClient(String(id));
  if (!c?.onb?.steps[index]) return fail("That step isn't there any more.");
  const steps = c.onb.steps.map((s, i) => (i === index ? { ...s, done: Boolean(done), doneBy: done ? user.id : null, doneAt: done ? new Date().toISOString() : null } : s));
  await sales.updateClient(c.id, { onb: { ...c.onb, steps } });
  refresh();
  return { ok: true, message: done ? "Ticked." : "Unticked." };
}

/** Every step done: off to the owner for sign-off. Steps done through their tasks count. */
export async function submitOnboarding(id: string): Promise<ActionResult> {
  const user = await requireModule("clients");
  const c = await sales.getClient(String(id));
  if (!c?.onb) return fail("There's no onboarding checklist to send.");
  const done = new Set((await data.listTasks()).filter((t) => t.status === "done").map((t) => t.id));
  const open = c.onb.steps.filter((s) => !s.done && !(s.taskId && done.has(s.taskId)));
  if (open.length) return fail(`${open.length} step${open.length === 1 ? " is" : "s are"} still open.`);
  await sales.updateClient(c.id, { onb: { ...c.onb, status: "submitted", submittedAt: new Date().toISOString(), submittedBy: user.id } });
  await log(user, c.id, "update", "Onboarding sent to Jane for sign-off");
  refresh();
  return { ok: true, message: "Sent to Jane for sign-off." };
}

export async function approveOnboarding(id: string): Promise<ActionResult> {
  const user = await requireModule("clients");
  if (!isOwner(user.roles)) return fail("Only an owner signs off onboarding.");
  const c = await sales.getClient(String(id));
  if (!c?.onb) return fail("There's no onboarding checklist to sign off.");
  await sales.updateClient(c.id, { status: "active", onb: { ...c.onb, status: "approved", approvedAt: new Date().toISOString(), approvedBy: user.id, note: "" } });
  await log(user, c.id, "update", "Onboarding signed off. Client is now active.");
  refresh();
  return { ok: true, message: `${c.name} is signed off and active.` };
}

export async function sendBackOnboarding(id: string, note: string): Promise<ActionResult> {
  const user = await requireModule("clients");
  if (!isOwner(user.roles)) return fail("Only an owner sends onboarding back.");
  const c = await sales.getClient(String(id));
  const why = text(note, 1000);
  if (!c?.onb) return fail("There's no onboarding checklist.");
  if (!why) return fail("Say what still needs doing.");
  await sales.updateClient(c.id, { onb: { ...c.onb, status: "changes", note: why } });
  await log(user, c.id, "update", `Onboarding sent back: ${why}`);
  refresh();
  return { ok: true, message: "Sent back." };
}

export async function saveOnbTemplate(raw: string): Promise<ActionResult> {
  const user = await requireModule("clients");
  if (!isOwner(user.roles)) return fail("Only an owner changes the onboarding template.");
  const steps = parseOnbTemplate(String(raw ?? ""));
  if (!steps.length) return fail("Add at least one step.");
  await sales.saveOnbTemplate(steps, user.id);
  refresh();
  return { ok: true, message: "Template saved. New clients get these steps." };
}
