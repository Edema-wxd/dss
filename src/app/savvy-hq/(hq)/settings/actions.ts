"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import { canEditGoals } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 200) => String(v ?? "").slice(0, max).trim();
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const numIn = (v: unknown, min: number, max: number) => {
  const n = Number(v);
  return v === "" || v === null || v === undefined || !Number.isFinite(n) ? undefined : Math.min(max, Math.max(min, n));
};

export async function saveProfile(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("settings");
  const name = text(input.name, 80);
  if (!name) return fail("Your name can't be blank.");
  const notifyEmail = text(input.notifyEmail, 200);
  if (notifyEmail && !emailOk(notifyEmail)) return fail("That notification email doesn't look right.");
  const hours = numIn(input.hours, 1, 12);
  await data.updateProfile(user.id, {
    name,
    title: text(input.title, 120),
    hours: hours === undefined ? null : Math.round(hours),
    whatsapp: text(input.whatsapp, 30).replace(/[^\d+]/g, ""),
    notifyEmail,
    notifyMode: ["instant", "digest", "off"].includes(String(input.notifyMode)) ? String(input.notifyMode) : "instant",
  });
  await store.audit({ actor: name, actorEmail: user.email, action: "settings.profile", target: user.email, summary: `${name} updated their profile`, changes: null });
  refresh();
  return { ok: true, message: "Profile saved." };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveGoals(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("settings");
  if (!canEditGoals(user.roles)) return fail("Only an owner or operations can change the goals and working hours.");
  const start = text(input.start, 5);
  const end = text(input.end, 5);
  if ((start && !TIME.test(start)) || (end && !TIME.test(end))) return fail("Use 24-hour times like 09:00.");
  const fx: data.GeneralSettings["fx"] = {};
  for (const c of ["USD", "GBP", "EUR", "CAD"] as const) {
    const v = numIn(input[`fx${c}`], 0, 1e7);
    if (v !== undefined) fx[c] = v;
  }
  const link = text(input.studioDesk, 500);
  if (link && !/^https:\/\//.test(link)) return fail("The Studio Desk link must start with https://");
  await data.patchGeneral(
    {
      monthlyGoal: numIn(input.monthlyGoal, 0, 1e13),
      annualGoal: numIn(input.annualGoal, 0, 1e14),
      fx,
      studioDesk: link,
      workday: {
        ...(start ? { start } : {}),
        ...(end ? { end } : {}),
        ...(numIn(input.fullHours, 1, 16) !== undefined ? { fullHours: numIn(input.fullHours, 1, 16) } : {}),
        ...(numIn(input.halfHours, 0.5, 12) !== undefined ? { halfHours: numIn(input.halfHours, 0.5, 12) } : {}),
        ...(numIn(input.grace, 0, 120) !== undefined ? { grace: numIn(input.grace, 0, 120) } : {}),
      },
    },
    user.id,
  );
  await store.audit({ actor: user.name, actorEmail: user.email, action: "settings.hq", target: "settings/general", summary: "Changed the goals, exchange rates or working hours", changes: null });
  refresh();
  return { ok: true, message: "Saved." };
}
