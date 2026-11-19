"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import * as data from "@/lib/hq/data";
import { label } from "@/lib/hq/sales-model";
import * as sales from "@/lib/hq/sales";
import * as talent from "@/lib/hq/talent";
import { COSTS, MEDIA_STATUS, MEDIA_TYPES, PITCH_STATUS, REGIONS, addToList, mediaStatusAfterPitch } from "@/lib/hq/talent-model";

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
