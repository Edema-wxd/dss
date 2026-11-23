"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import * as data from "@/lib/hq/data";
import { label } from "@/lib/hq/sales-model";
import * as sales from "@/lib/hq/sales";
import * as talent from "@/lib/hq/talent";
import { COSTS, MEDIA_STATUS, MEDIA_TYPES, PITCH_STATUS, REGIONS, addToList, mediaStatusAfterPitch } from "@/lib/hq/talent-model";
import { canUse, isOwner, marketingTabsFor } from "@/lib/hq/access";
import * as mkt from "@/lib/hq/marketing";
import { AD_OBJ, AD_PLATFORMS, AD_STATUS, NEWS_TAGS, PLATFORMS, POST_FORMATS, POST_STATUS } from "@/lib/hq/marketing-model";
import { patchGeneral } from "@/lib/hq/data";
import { lagosToday } from "@/lib/hq/work";
import { saveExpense } from "@/lib/hq/finance";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const oneOf = (list: readonly (readonly [string, string])[], v: unknown, fallback: string) => (list.some(([k]) => k === v) ? String(v) : fallback);
const person = async (v: unknown) => (v === "" || v === null || v === undefined ? null : ((await data.listPeople()).find((p) => p.id === Number(v) && p.active)?.id ?? null));
const log = (u: DeskUser, id: string, t: string) => sales.logActivity(u, "pitch", id, "update", t);

/** Who a pitch is for: DSS, Jane, or a live client or talent. */
async function forName(key: string) {
  if (key === "dss") return "Digital Savvy Studios";
  if (key === "jane") return "Janefrances (personal brand)";
  const [kind, id] = key.split(":");
  if (kind === "client") return (await sales.getClient(id))?.name ?? null;
  if (kind === "talent") return (await talent.getTalent(id))?.name ?? null;
  return null;
}

export async function saveMediaAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("marketing");
  const name = text(input.name, 200);
  if (!name) return fail("Add the outlet or agency name.");
  const m: Partial<talent.Media> = {
    name,
    type: oneOf(MEDIA_TYPES, input.type, "radio"),
    region: oneOf(REGIONS, input.region, "Nigeria"),
    cost: oneOf(COSTS, input.cost, ""),
    status: oneOf(MEDIA_STATUS, input.status, "new"),
    industries: addToList([], String(input.industries ?? "")).slice(0, 30),
    nextDate: date(input.nextDate),
    ownerId: await person(input.ownerId),
    link: /^https?:\/\//.test(text(input.link, 1000)) ? text(input.link, 1000) : "",
    howToPitch: text(input.howToPitch, 2000),
    notes: text(input.notes, 5000),
  };
  for (const k of ["show", "host", "city", "reach", "contactName", "contactRole", "email", "phone"] as const) m[k] = text(input[k], 200);
  await talent.saveMedia(id ? String(id) : null, m, user.id);
  refresh();
  return { ok: true, message: id ? "Saved." : "Media contact added." };
}

export async function removeMedia(id: string): Promise<ActionResult> {
  await requireModule("marketing");
  await talent.deleteMedia(String(id));
  refresh();
  return { ok: true, message: "Media contact deleted." };
}

/** Logs a pitch or updates one, warms up the outlet, and keeps a short status log. */
export async function savePitchAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("marketing");
  const forKey = text(input.forKey, 60) || "dss";
  const who = await forName(forKey);
  if (!who) return fail("Pick who it's for.");
  const outlets = await talent.listMedia();
  const outlet = outlets.find((m) => m.id === input.outletId);
  if (!outlet) return fail("Pick the outlet. Add it to the media list first if it's new.");
  const angle = text(input.angle, 500);
  if (!angle) return fail("Add the story or angle.");
  const before = id ? await talent.getPitch(String(id)) : null;
  if (id && !before) return fail("That pitch isn't there any more.");
  const status = oneOf(PITCH_STATUS, input.status, "pitched");
  const note = text(input.note, 1000);
  const pid = await talent.savePitch(
    before?.id ?? null,
    {
      forKey,
      outletId: outlet.id,
      angle,
      status,
      pitchedOn: date(input.pitchedOn),
      runDate: date(input.runDate),
      nextDate: date(input.nextDate),
      link: /^https?:\/\//.test(text(input.link, 1000)) ? text(input.link, 1000) : "",
      ownerId: await person(input.ownerId),
      updates: note ? [...(before?.updates ?? []), { at: new Date().toISOString(), by: user.id, text: note }].slice(-40) : (before?.updates ?? []),
    },
    user.id,
  );
  const lifted = mediaStatusAfterPitch(outlet.status, status);
  if (lifted !== outlet.status) await talent.saveMedia(outlet.id, { status: lifted }, user.id);
  if (!before || before.status !== status) await log(user, pid, `${who} x ${outlet.name}: ${label(PITCH_STATUS, status)}`);
  refresh();
  return { ok: true, message: before ? "Pitch updated." : "Pitch logged." };
}

export async function removePitch(id: string): Promise<ActionResult> {
  await requireModule("marketing");
  await talent.deletePitch(String(id));
  refresh();
  return { ok: true, message: "Pitch deleted." };
}

/* ── Marketing dashboard ─────────────────────────────────────────────── */


const n = (v: unknown) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));

/** The dashboard tabs other than Publicity are closed to someone whose Marketing is only Publicity. */
async function dashboardUser() {
  const user = await requireModule("marketing");
  const tabs = marketingTabsFor(user.roles);
  return tabs && !tabs.includes("overview") ? null : user;
}
const CLOSED = "Your role reaches Publicity only.";

export async function saveAccountAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  await mkt.saveAccount(
    id ? String(id) : null,
    {
      platform: oneOf(PLATFORMS, input.platform, "instagram"),
      handle: text(input.handle, 120),
      url: /^https?:\/\//.test(text(input.url, 500)) ? text(input.url, 500) : "",
      goal: n(input.goal),
      ownerId: await person(input.ownerId),
    },
    user.id,
  );
  refresh();
  return { ok: true, message: "Account saved." };
}

export async function removeAccount(id: string): Promise<ActionResult> {
  if (!(await dashboardUser())) return fail(CLOSED);
  await mkt.deleteAccount(String(id));
  refresh();
  return { ok: true, message: "Account removed." };
}

/** A month's numbers for one account, copied from the platform's insights. */
export async function saveMonthStatsAction(accountId: string, month: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  if (!/^\d{4}-\d{2}$/.test(String(month))) return fail("Pick a month.");
  if (!(await mkt.listAccounts()).some((a) => a.id === accountId)) return fail("That account isn't there any more.");
  if (n(input.followers) === null) return fail("Add the followers at month end.");
  await mkt.saveMonthStats(
    accountId,
    month,
    Object.fromEntries(["followers", "reach", "impressions", "engagements", "posts", "profileVisits", "linkClicks", "leads"].map((k) => [k, n(input[k])])),
    user.id,
  );
  refresh();
  return { ok: true, message: "Numbers saved." };
}

export async function savePillars(raw: string): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  const pillars = [...new Set(String(raw ?? "").split(",").map((p) => p.trim()).filter(Boolean))].slice(0, 12);
  await patchGeneral({ mktPillars: pillars }, user.id);
  refresh();
  return { ok: true, message: "Pillars saved." };
}

export async function savePostAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  const title = text(input.title, 300);
  if (!title) return fail("Add the post idea or hook.");
  await mkt.savePost(
    id ? String(id) : null,
    {
      title,
      platform: oneOf(PLATFORMS, input.platform, "instagram"),
      format: (POST_FORMATS as readonly string[]).includes(String(input.format)) ? String(input.format) : "Reel",
      date: date(input.date),
      time: /^\d{2}:\d{2}$/.test(String(input.time ?? "")) ? String(input.time) : "",
      status: oneOf(POST_STATUS, input.status, "idea"),
      pillar: text(input.pillar, 120),
      ownerId: await person(input.ownerId),
      link: /^https?:\/\//.test(text(input.link, 1000)) ? text(input.link, 1000) : "",
      caption: text(input.caption, 3000),
      reach: n(input.reach),
      engagements: n(input.engagements),
      saves: n(input.saves),
      leads: n(input.leads),
    },
    user.id,
  );
  refresh();
  return { ok: true, message: id ? "Post updated." : "Post added to the planner." };
}

/** Moving a post on the calendar or board changes only its date or status. */
export async function movePost(id: string, patch: { date?: string; status?: string }): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  await mkt.savePost(String(id), { ...(patch.date ? { date: date(patch.date) } : {}), ...(patch.status ? { status: oneOf(POST_STATUS, patch.status, "idea") } : {}) }, user.id);
  refresh();
  return { ok: true, message: "Moved." };
}

export async function removePost(id: string): Promise<ActionResult> {
  if (!(await dashboardUser())) return fail(CLOSED);
  await mkt.deletePost(String(id));
  refresh();
  return { ok: true, message: "Post deleted." };
}

/** Ad campaigns. Logging new spend in Finance arrives with Finance. */
export async function saveAdAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  const name = text(input.name, 200);
  if (!name) return fail("Name the campaign.");
  const before = id ? (await mkt.listAds()).find((a) => a.id === String(id)) : undefined;
  const adId = await mkt.saveAd(
    id ? String(id) : null,
    {
      name,
      platform: AD_PLATFORMS.includes(String(input.platform)) ? String(input.platform) : "instagram",
      objective: (AD_OBJ as readonly string[]).includes(String(input.objective)) ? String(input.objective) : "Leads",
      status: oneOf(AD_STATUS, input.status, "planned"),
      currency: ["NGN", "USD", "GBP", "EUR", "CAD"].includes(String(input.currency)) ? String(input.currency) : "NGN",
      start: date(input.start),
      end: date(input.end),
      notes: text(input.notes, 2000),
      clientId: text(input.clientId, 40) || null,
      ...Object.fromEntries(["budget", "spend", "impressions", "clicks", "leads", "conversions", "revenue"].map((k) => [k, n(input[k])])),
    },
    user.id,
  );
  // New spend goes into Finance as Paid ads, when DSS paid for it and the person keeps the books.
  const spend = n(input.spend) ?? 0;
  const delta = spend - (before?.loggedSpend ?? 0);
  if ((input.logFin === true || input.logFin === "on") && canUse(user.roles, "finance") && delta > 0) {
    const currency = ["NGN", "USD", "GBP", "EUR", "CAD"].includes(String(input.currency)) ? String(input.currency) : "NGN";
    await saveExpense(
      null,
      { description: `Ads: ${name}`, amount: delta, currency, cat: "ads", date: lagosToday(), vendor: label(PLATFORMS, String(input.platform)), method: "Card", recurring: false, clientId: text(input.clientId, 40) || null },
      user.id,
    );
    await mkt.saveAd(adId, { loggedSpend: spend }, user.id);
    refresh();
    return { ok: true, message: `Campaign saved. ${currency} ${delta.toLocaleString("en-GB")} of new spend logged in Finance.` };
  }
  refresh();
  return { ok: true, message: "Campaign saved." };
}

export async function removeAd(id: string): Promise<ActionResult> {
  if (!(await dashboardUser())) return fail(CLOSED);
  await mkt.deleteAd(String(id));
  refresh();
  return { ok: true, message: "Campaign deleted." };
}

export async function addNewsAction(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  const title = text(input.title, 300);
  if (!title) return fail("Add the headline.");
  await mkt.addNews({
    date: lagosToday(),
    title,
    url: /^https?:\/\//.test(text(input.url, 1000)) ? text(input.url, 1000) : "",
    source: text(input.source, 120),
    tag: (NEWS_TAGS as readonly string[]).includes(String(input.tag)) ? String(input.tag) : NEWS_TAGS[0],
    summary: text(input.summary, 2000),
    soWhat: text(input.soWhat, 2000),
    addedBy: String(user.id),
  });
  refresh();
  return { ok: true, message: "Story added." };
}

/** A story can be removed by whoever added it, or an owner or manager. */
export async function removeNews(id: string): Promise<ActionResult> {
  const user = await dashboardUser();
  if (!user) return fail(CLOSED);
  const item = await mkt.getNews(String(id));
  if (!item) return fail("That story isn't there any more.");
  if (item.addedBy !== String(user.id) && !isOwner(user.roles) && !canUse(user.roles, "overview")) return fail("Only whoever added it, or a manager, can remove it.");
  await mkt.deleteNews(item.id);
  refresh();
  return { ok: true, message: "Story removed." };
}
