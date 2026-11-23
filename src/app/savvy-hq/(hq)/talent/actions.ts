"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import { seesMoney } from "@/lib/hq/access";
import * as A from "@/lib/hq/alerts-model";
import * as data from "@/lib/hq/data";
import { alert } from "@/lib/hq/notify";
import * as sales from "@/lib/hq/sales";
import { CURRENCIES, HEALTH, label } from "@/lib/hq/sales-model";
import * as talent from "@/lib/hq/talent";
import { AGE_BANDS, CHANNELS, DEAL_STAGES, PACKAGES, PAY_FLOW, RATE_PLATFORMS, SOCIAL_PLATFORMS, TALENT_STATUS, withFollowerPoint } from "@/lib/hq/talent-model";
import { lagosToday } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const n = (v: unknown, max = 1e13) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.min(max, Math.max(0, Number(v))));
const oneOf = (list: readonly (readonly [string, string])[] | readonly string[], v: unknown, fallback: string) =>
  list.some((x) => (Array.isArray(x) ? x[0] : x) === v) ? String(v) : fallback;
const strings = (v: unknown, max = 40) => [...new Set((Array.isArray(v) ? v : []).map((x) => text(x, 120)).filter(Boolean))].slice(0, max);
const short = () => Date.now().toString(36);
const person = async (v: unknown) => (v === "" || v === null || v === undefined ? null : ((await data.listPeople()).find((p) => p.id === Number(v) && p.active)?.id ?? null));
const log = (u: DeskUser, type: string, id: string, t: string) => sales.logActivity(u, type, id, "update", t);

/* ── Talent ──────────────────────────────────────────────────────────── */

/** Cleans any part of a talent: terms, profile, goals, socials, audience, lists or rate card. */
async function readTalent(user: DeskUser, input: Record<string, unknown>, before: talent.Talent | null) {
  const out: Partial<talent.Talent> = {};
  const has = (k: string) => k in input;
  for (const k of ["name", "category", "coManager", "location", "phone", "handles"] as const) if (has(k)) out[k] = text(input[k], 200);
  if (has("email")) out.email = text(input.email, 200);
  if (has("mediaKit")) out.mediaKit = /^https?:\/\//.test(text(input.mediaKit, 1000)) ? text(input.mediaKit, 1000) : "";
  if (has("bio")) out.bio = text(input.bio, 3000);
  if (has("priorities")) out.priorities = text(input.priorities, 3000);
  if (has("rateNotes")) out.rateNotes = text(input.rateNotes, 1000);
  if (has("status")) out.status = oneOf(TALENT_STATUS, input.status, "signed");
  if (has("package")) out.package = oneOf(PACKAGES, input.package, "");
  if (has("payFlow")) out.payFlow = input.payFlow === "direct" ? "direct" : "via_dss";
  if (has("managerId")) out.managerId = await person(input.managerId);
  if (has("startDate")) out.startDate = date(input.startDate);
  if (has("trialEnds")) out.trialEnds = date(input.trialEnds);
  if (seesMoney(user.roles)) {
    if (has("commission")) out.commission = n(input.commission, 100);
    if (has("terms")) out.terms = text(input.terms, 5000);
  }
  for (const k of ["interests", "industries", "avoid", "partners"] as const) if (has(k)) out[k] = strings(input[k]);
  if (has("goals")) {
    const goals = (Array.isArray(input.goals) ? input.goals : []).map((g) => ({
      t: text((g as { t?: unknown }).t, 200),
      done: Boolean((g as { done?: unknown }).done),
      at: text((g as { at?: unknown }).at, 40) || new Date().toISOString(),
      doneAt: (g as { done?: unknown }).done ? text((g as { doneAt?: unknown }).doneAt, 40) || new Date().toISOString() : null,
    }));
    if (goals.length > 5) return "Five goals is the limit.";
    out.goals = goals.filter((g) => g.t);
  }
  if (has("audience")) {
    const a = (input.audience ?? {}) as Record<string, unknown>;
    const ages: Record<string, number | null> = {};
    for (const [k] of AGE_BANDS) ages[k] = n((a.ages as Record<string, unknown> | undefined)?.[k], 100);
    out.audience = { female: n(a.female, 100), male: n(a.male, 100), ages, locations: text(a.locations, 500), notes: text(a.notes, 1000), source: text(a.source, 200) };
  }
  if (has("social")) {
    // one account added or updated; follower history keeps one point a day
    const s = (input.social ?? {}) as Record<string, unknown>;
    const socials = [...(before?.socials ?? [])];
    const i = socials.findIndex((x) => x.id === s.id);
    const followers = n(s.followers);
    const prev = i >= 0 ? socials[i] : null;
    const today = lagosToday();
    const next = {
      id: prev?.id ?? `s${short()}`,
      platform: oneOf(SOCIAL_PLATFORMS, s.platform, "Instagram"),
      handle: text(s.handle, 120),
      url: /^https?:\/\//.test(text(s.url, 500)) ? text(s.url, 500) : "",
      followers,
      er: n(s.er, 100),
      avgViews: n(s.avgViews),
      at: today,
      hist: followers === null ? (prev?.hist ?? []) : withFollowerPoint(prev?.hist ?? [], today, followers),
    };
    if (i >= 0) socials[i] = next;
    else socials.push(next);
    out.socials = socials;
  }
  if (has("removeSocial")) out.socials = (before?.socials ?? []).filter((x) => x.id !== input.removeSocial);
  if (has("rate")) {
    const r = (input.rate ?? {}) as Record<string, unknown>;
    const item = text(r.item, 200);
    const price = n(r.price);
    if (!item || price === null) return "Add the deliverable and its price.";
    const rates = [...(before?.rates ?? [])];
    const i = rates.findIndex((x) => x.id === r.id);
    const next = { id: i >= 0 ? rates[i].id : `r${short()}`, item, platform: oneOf(RATE_PLATFORMS, r.platform, "Instagram"), price, currency: oneOf(CURRENCIES, r.currency, "NGN"), notes: text(r.notes, 300) };
    if (i >= 0) rates[i] = next;
    else rates.push(next);
    out.rates = rates;
    out.rateAt = new Date().toISOString();
  }
  if (has("removeRate")) {
    out.rates = (before?.rates ?? []).filter((x) => x.id !== input.removeRate);
    out.rateAt = new Date().toISOString();
  }
  return out;
}

export async function addTalent(input: Record<string, unknown>): Promise<ActionResult & { id?: string }> {
  const user = await requireModule("talent");
  const t = await readTalent(user, input, null);
  if (typeof t === "string") return fail(t);
  if (!t.name) return fail("Add their name.");
  const id = await talent.createTalent({ status: "signed", package: "The Roster", commission: 20, payFlow: "via_dss", startDate: lagosToday(), managerId: user.id, ...t, name: t.name }, user.id);
  await log(user, "talent", id, `Added ${t.name} to the roster`);
  refresh();
  return { ok: true, message: "Talent added.", id };
}

export async function saveTalent(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("talent");
  const before = await talent.getTalent(String(id));
  if (!before) return fail("That talent isn't on the roster any more.");
  const t = await readTalent(user, input, before);
  if (typeof t === "string") return fail(t);
  if ("name" in t && !t.name) return fail("They need a name.");
  await talent.updateTalent(before.id, t);
  refresh();
  return {
    ok: true,
    message: "social" in input ? (before.socials.some((s) => s.id === (input.social as { id?: string })?.id) ? "Account updated." : "Account added.") : "rate" in input ? "Rate saved." : "Saved",
  };
}

export async function removeTalent(id: string): Promise<ActionResult> {
  const user = await requireModule("talent");
  const t = await talent.getTalent(String(id));
  if (!t) return fail("That talent isn't on the roster any more.");
  await talent.deleteTalent(t.id);
  await log(user, "talent", t.id, `Removed ${t.name} from the roster`);
  refresh();
  return { ok: true, message: "Removed from the roster. Their deals stay in the tracker." };
}

/* ── Deals ───────────────────────────────────────────────────────────── */

async function readDeal(user: DeskUser, input: Record<string, unknown>) {
  const out: Partial<talent.Deal> = {};
  const has = (k: string) => k in input;
  if (has("talentId")) out.talentId = (await talent.getTalent(text(input.talentId, 40)))?.id ?? null;
  for (const k of ["brand", "title", "contactPerson", "contactRole", "nextStep"] as const) if (has(k)) out[k] = text(input[k], 200);
  if (has("stage")) out.stage = oneOf(DEAL_STAGES, input.stage, "prospect");
  if (has("health")) out.health = oneOf(HEALTH, input.health, "good");
  if (has("contactId")) out.contactId = text(input.contactId, 40) ? ((await sales.getContact(text(input.contactId, 40)))?.id ?? null) : null;
  if (has("contactChannel")) out.contactChannel = oneOf(CHANNELS, input.contactChannel, "");
  if (has("payFlow")) out.payFlow = oneOf(PAY_FLOW, input.payFlow, "via_dss");
  if (has("ownerId")) out.ownerId = await person(input.ownerId);
  if (has("nextDate")) out.nextDate = date(input.nextDate);
  if (has("dueDate")) out.dueDate = date(input.dueDate);
  if (has("usage")) out.usage = text(input.usage, 2000);
  if (has("notes")) out.notes = text(input.notes, 5000);
  if (has("deliverables"))
    out.deliverables = (Array.isArray(input.deliverables) ? input.deliverables : [])
      .slice(0, 60)
      .map((d) => ({ t: text((d as { t?: unknown }).t, 200), due: date((d as { due?: unknown }).due), done: Boolean((d as { done?: unknown }).done) }))
      .filter((d) => d.t);
  if (seesMoney(user.roles)) {
    for (const k of ["proposed", "fee", "received"] as const) if (has(k)) out[k] = n(input[k]);
    if (has("currency")) out.currency = oneOf(CURRENCIES, input.currency, "NGN");
    if (has("commissionPct")) out.commissionPct = n(input.commissionPct, 100);
  }
  return out;
}

export async function addDeal(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("talent");
  const d = await readDeal(user, input);
  if (!d.talentId) return fail("Pick the talent.");
  if (!d.brand) return fail("Add the brand.");
  const t = (await talent.getTalent(d.talentId))!;
  const note = text(input.note, 2000);
  const id = await talent.createDeal(
    {
      stage: "pitching",
      health: "good",
      currency: "NGN",
      payFlow: t.payFlow || "via_dss",
      ownerId: user.id,
      ...(seesMoney(user.roles) ? { commissionPct: t.commission ?? 20 } : {}),
      ...d,
      updates: note ? [{ at: new Date().toISOString(), by: user.id, text: note }] : [],
    },
    user.id,
  );
  await log(user, "deal", id, `Deal opened with ${d.brand}`);
  if (d.contactId) await log(user, "contact", d.contactId, `Deal opened for ${t.name}`);
  refresh();
  return { ok: true, message: d.stage === "prospect" ? "Brand added to the tracker." : "Deal added." };
}

export async function saveDeal(id: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("talent");
  const before = await talent.getDeal(String(id));
  if (!before) return fail("That deal isn't there any more.");
  const d = await readDeal(user, input);
  if ("brand" in d && !d.brand) return fail("The deal needs a brand.");
  await talent.updateDeal(before.id, d);
  if (d.ownerId && d.ownerId !== before.ownerId) {
    const tid = d.talentId ?? before.talentId;
    const who = (tid ? await talent.getTalent(tid) : null)?.name ?? "A talent";
    await alert(d.ownerId, A.dealHandedOver(user.name, who, d.brand || before.brand || before.title || "a brand", tid), user.id);
  }
  if (d.stage && d.stage !== before.stage) await sales.logActivity(user, "deal", before.id, "stage", `Moved to ${label(DEAL_STAGES, d.stage)}`);
  refresh();
  return { ok: true, message: "Saved" };
}

/** "Post update": a line in the deal's status log, and the health if it changed. Keeps the last 60. */
export async function postDealUpdate(id: string, note: string, health: string): Promise<ActionResult> {
  const user = await requireModule("talent");
  const d = await talent.getDeal(String(id));
  if (!d) return fail("That deal isn't there any more.");
  const t = text(note, 2000);
  if (!t) return fail("Say how it's going.");
  await talent.updateDeal(d.id, {
    updates: [...d.updates, { at: new Date().toISOString(), by: user.id, text: t }].slice(-60),
    ...(HEALTH.some(([k]) => k === health) ? { health } : {}),
  });
  await log(user, "deal", d.id, t);
  refresh();
  return { ok: true, message: "Status update posted." };
}

/** Only your own status updates can be removed. */
export async function removeDealUpdate(id: string, at: string): Promise<ActionResult> {
  const user = await requireModule("talent");
  const d = await talent.getDeal(String(id));
  if (!d) return fail("That deal isn't there any more.");
  const left = d.updates.filter((u) => !(u.at === at && u.by === user.id));
  if (left.length === d.updates.length) return fail("You can only remove your own updates.");
  await talent.updateDeal(d.id, { updates: left });
  refresh();
  return { ok: true, message: "Update removed." };
}

export async function removeDeal(id: string): Promise<ActionResult> {
  const user = await requireModule("talent");
  const d = await talent.getDeal(String(id));
  if (!d) return fail("That deal isn't there any more.");
  await talent.deleteDeal(d.id);
  await log(user, "deal", d.id, `Deleted the deal with ${d.brand}`);
  refresh();
  return { ok: true, message: "Deal deleted." };
}

/** A deal's history, for the deal panel. */
export async function dealHistory(id: string) {
  await requireModule("talent");
  return sales.timeline("deal", String(id).slice(0, 40));
}
