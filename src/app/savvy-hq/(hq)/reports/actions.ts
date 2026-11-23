"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireUser } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { isRepType, repCan } from "@/lib/hq/report-model";
import { loadReportData, saveReport } from "@/lib/hq/reports";

// Filing a report. Anyone can build a report for an area they can open; the archive keeps it
// when they have Reports access (or for Marketing, which HQ always filed).

const fail = (error: string): ActionResult => ({ ok: false, error });

export async function fileReport(type: string, m: string): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  if (!isRepType(type) || !repCan(user.roles, type)) return fail("You don't have access to that report.");
  if (!/^\d{4}-\d{2}$/.test(m)) return fail("Pick a month.");
  const id = `${type}_${m}`;
  if (!canUse(user.roles, "reports") && type !== "marketing") return { ok: true, id, message: "Report ready." };
  await saveReport(type, m, await loadReportData(canUse(user.roles, "finance")), user.id);
  refresh();
  return { ok: true, id, message: "Saved to the archive." };
}

export async function rebuildReport(type: string, m: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!canUse(user.roles, "reports") || !isRepType(type) || !repCan(user.roles, type)) return fail("You don't have access to that report.");
  await saveReport(type, m, await loadReportData(canUse(user.roles, "finance")), user.id);
  refresh();
  return { ok: true, message: "Report rebuilt." };
}
