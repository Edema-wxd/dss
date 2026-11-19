"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule, requireUser, type DeskUser } from "@/lib/desk/auth";
import { seesMoney } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import * as sales from "@/lib/hq/sales";
import { CURRENCIES, FOLLOW_UP_IN, QUICK_TOUCHES, REL_TYPES, SERVICES, SOURCES, TOUCH_TYPES, label, stageAfterTouch, stagesFor } from "@/lib/hq/sales-model";
import { addDays, lagosToday, relDay } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const log = (u: DeskUser, id: string, type: string, t: string) => sales.logActivity(u, "contact", id, type, t);

/** Cleans the contact form. Value and currency only change for roles that see money. */
async function readContact(user: DeskUser, input: Record<string, unknown>, kind: string) {
  const out: Partial<sales.Contact> = {};
  const has = (k: string) => k in input;
  for (const k of ["name", "company", "role", "industry", "email", "phone", "whatsapp", "instagram", "linkedin", "website", "location", "nextAction"] as const)
    if (has(k)) out[k] = text(input[k], k === "website" || k === "linkedin" ? 500 : 200);
  if (has("stage")) {
    const stages = stagesFor(kind);
    out.stage = stages.some(([k]) => k === input.stage) ? String(input.stage) : stages[0][0];
  }
  if (has("ownerId")) out.ownerId = input.ownerId === "" || input.ownerId === null ? null : ((await data.listPeople()).find((p) => p.id === Number(input.ownerId) && p.active)?.id ?? null);
  if (has("nextDate")) out.nextDate = date(input.nextDate);
  if (has("service")) out.service = (SERVICES as readonly string[]).includes(String(input.service)) ? String(input.service) : "";
  if (has("relType")) out.relType = (REL_TYPES as readonly string[]).includes(String(input.relType)) ? String(input.relType) : "Brand";
  if (has("source")) out.source = text(input.source, 80) || SOURCES[0];
  if (has("notes")) out.notes = text(input.notes, 5000);
  if (has("tags")) out.tags = [...new Set(String(input.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 30);
  if (has("talentIds")) out.talentIds = (Array.isArray(input.talentIds) ? input.talentIds : []).map(String).slice(0, 30);
  if (seesMoney(user.roles)) {
    if (has("value")) out.value = input.value === "" || input.value === null ? null : Math.max(0, Number(input.value) || 0);
    if (has("currency")) out.currency = (CURRENCIES as readonly string[]).includes(String(input.currency)) ? String(input.currency) : "NGN";
  }
  return out;
}

export async function addContact(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("crm");
  const kind = input.kind === "talent" ? "talent" : "sales";
  const c = await readContact(user, input, kind);
  if (!c.name) return fail("Add the contact's name.");
  const id = await sales.createContact(
    { kind, stage: stagesFor(kind)[0][0], ownerId: user.id, currency: "NGN", whatsapp: c.phone, nextDate: addDays(lagosToday(), 1), ...c, name: c.name },
    user.id,
  );
  await log(user, id, "update", `Added ${kind === "talent" ? "to talent relationships" : "as a sales lead"}`);
  refresh();
  return { ok: true, message: "Contact added." };
}

export async function saveContact(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("crm");
  const before = await sales.getContact(String(id));
  if (!before) return fail("That contact isn't there any more.");
  const c = await readContact(user, input, before.kind);
  if ("name" in c && !c.name) return fail("The contact needs a name.");
  if (c.stage && c.stage !== before.stage && c.stage === "won") c.wonAt = new Date().toISOString();
  await sales.updateContact(before.id, c);
  if (c.stage && c.stage !== before.stage) await log(user, before.id, "stage", `Moved to ${label(stagesFor(before.kind), c.stage)}`);
  refresh();
  return { ok: true, message: "Saved" };
}

export async function removeContact(id: string): Promise<ActionResult> {
  const user = await requireModule("crm");
  const c = await sales.getContact(String(id));
  if (!c) return fail("That contact isn't there any more.");
  await sales.deleteContact(c.id);
  await log(user, c.id, "update", `Deleted the contact ${c.name}`);
  refresh();
  return { ok: true, message: "Contact deleted." };
}

/** "Log it": a call, message, email, meeting or note, then the next follow-up. */
export async function logTouch(id: string, type: string, note: string, nextIn: string): Promise<ActionResult> {
  const user = await requireModule("crm");
  const c = await sales.getContact(String(id));
  if (!c) return fail("That contact isn't there any more.");
  const t = TOUCH_TYPES.some(([k]) => k === type) ? type : "call";
  const what = text(note, 2000) || label(TOUCH_TYPES, t);
  const patch: Partial<sales.Contact> = { lastTouch: new Date().toISOString(), stage: stageAfterTouch(c.kind, c.stage, t) };
  if (nextIn === "none") patch.nextDate = "";
  else if (nextIn !== "keep" && FOLLOW_UP_IN.some(([k]) => k === nextIn)) patch.nextDate = addDays(lagosToday(), Number(nextIn));
  await sales.updateContact(c.id, patch);
  await log(user, c.id, t, what);
  if (patch.stage !== c.stage) await log(user, c.id, "stage", `Moved to ${label(stagesFor(c.kind), patch.stage)}`);
  refresh();
  return { ok: true, message: "Logged." };
}

/** Today's one-tap "Log:" buttons on a follow-up. Anyone can log a follow-up on their own contact. */
export async function quickTouch(id: string, key: string): Promise<ActionResult> {
  const user = await requireUser();
  const c = await sales.getContact(String(id));
  if (!c) return fail("That contact isn't there any more.");
  const q = QUICK_TOUCHES.find(([k]) => k === key);
  if (!q) return fail("Unknown follow-up.");
  const [, , type, what, days] = q;
  const next = addDays(lagosToday(), days);
  await sales.updateContact(c.id, { lastTouch: new Date().toISOString(), nextDate: next, stage: c.kind === "talent" ? (c.stage === "topitch" ? "pitched" : c.stage) : ["new", "research"].includes(c.stage) ? "contacted" : c.stage });
  await log(user, c.id, type, what);
  refresh();
  return { ok: true, message: `Logged. Next follow-up ${relDay(next, lagosToday()).toLowerCase()}.` };
}

/** Between DSS sales and talent relationships. The stage restarts at the first stage of the new list. */
export async function moveContactKind(id: string): Promise<ActionResult> {
  const user = await requireModule("crm");
  const c = await sales.getContact(String(id));
  if (!c) return fail("That contact isn't there any more.");
  const kind = c.kind === "talent" ? "sales" : "talent";
  await sales.updateContact(c.id, { kind, stage: stagesFor(kind)[0][0] });
  await log(user, c.id, "update", `Moved to ${kind === "talent" ? "talent relationships" : "DSS sales"}`);
  refresh();
  return { ok: true, message: `Moved to ${kind === "talent" ? "talent relationships" : "DSS sales"}.` };
}

/** A contact's history, for the contact panel. */
export async function contactHistory(id: string): Promise<sales.TimelineEntry[]> {
  await requireModule("crm");
  return sales.timeline("contact", String(id).slice(0, 40));
}
