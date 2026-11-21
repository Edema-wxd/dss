"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import { seesMoney } from "@/lib/hq/access";
import * as A from "@/lib/hq/alerts-model";
import * as data from "@/lib/hq/data";
import { alert } from "@/lib/hq/notify";
import * as sales from "@/lib/hq/sales";
import { CT_KINDS, CT_RENEW, CT_STATUS, CURRENCIES, renewalTaskDue, renewedEnd } from "@/lib/hq/sales-model";
import { addDays, lagosToday } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 300) => String(v ?? "").slice(0, max).trim();
const date = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");
const oneOf = (list: readonly (readonly [string, string])[], v: unknown, fallback: string) => (list.some(([k]) => k === v) ? String(v) : fallback);
const party = (c: sales.Contract, clients: sales.Client[]) => c.party || clients.find((x) => x.id === c.clientId)?.name || "Unnamed";
const audit = (u: DeskUser, id: string, t: string) => sales.logActivity(u, "contract", id, "update", t);

async function readContract(user: DeskUser, input: Record<string, unknown>) {
  const out: Partial<sales.Contract> = {
    kind: oneOf(CT_KINDS, input.kind, "client"),
    status: oneOf(CT_STATUS, input.status, "active"),
    clientId: text(input.clientId, 40) || null,
    talentId: text(input.talentId, 40) || null,
    party: text(input.party, 200),
    title: text(input.title, 300),
    start: date(input.start),
    end: date(input.end),
    renewal: oneOf(CT_RENEW, input.renewal, "manual"),
    noticeDays: Math.min(365, Math.max(0, Number(input.noticeDays ?? 30) || 0)),
    period: input.period === "total" ? "total" : "month",
    ownerId: input.ownerId ? ((await data.listPeople()).find((p) => p.id === Number(input.ownerId) && p.active)?.id ?? null) : null,
    link: /^https?:\/\//.test(text(input.link, 1000)) ? text(input.link, 1000) : "",
    notes: text(input.notes, 5000),
  };
  if (seesMoney(user.roles)) {
    out.value = input.value === "" || input.value === null || input.value === undefined ? null : Math.max(0, Number(input.value) || 0);
    out.currency = (CURRENCIES as readonly string[]).includes(String(input.currency)) ? String(input.currency) : "NGN";
  }
  return out;
}

export async function saveContractAction(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("contracts");
  const c = await readContract(user, input);
  if (!c.party && !c.clientId && !c.talentId) return fail("Add the client, talent or other party.");
  if (id && !(await sales.getContract(String(id)))) return fail("That contract isn't there any more.");
  const cid = await sales.saveContract(id ? String(id) : null, c, user.id);
  await audit(user, cid, `${id ? "Updated" : "Added"} a contract${c.title ? `: ${c.title}` : ""}`);
  refresh();
  return { ok: true, message: "Contract saved." };
}

export async function removeContract(id: string): Promise<ActionResult> {
  const user = await requireModule("contracts");
  const c = await sales.getContract(String(id));
  if (!c) return fail("That contract isn't there any more.");
  await sales.deleteContract(c.id);
  await audit(user, c.id, "Deleted a contract");
  refresh();
  return { ok: true, message: "Contract deleted." };
}

/** Renewed: the new term starts the day after the old end, and the old term goes into history. */
export async function renewContract(id: string, input: { end: unknown; value: unknown; link: unknown }): Promise<ActionResult> {
  const user = await requireModule("contracts");
  const c = await sales.getContract(String(id));
  if (!c) return fail("That contract isn't there any more.");
  const end = date(input.end) || renewedEnd(c.start, c.end);
  if (c.end && end <= c.end) return fail("The new end date must be after the current one.");
  const patch: Partial<sales.Contract> = {
    start: c.end ? addDays(c.end, 1) : lagosToday(),
    end,
    status: "active",
    history: [...c.history, { start: c.start, end: c.end, value: c.value, at: new Date().toISOString() }],
  };
  if (/^https?:\/\//.test(text(input.link, 1000))) patch.link = text(input.link, 1000);
  if (seesMoney(user.roles) && input.value !== "" && input.value !== undefined && input.value !== null) patch.value = Math.max(0, Number(input.value) || 0);
  await sales.saveContract(c.id, patch, user.id);
  if (c.clientId) await sales.updateClient(c.clientId, { endDate: end });
  await audit(user, c.id, `Renewed to ${end}`);
  refresh();
  return { ok: true, message: "Renewed. The new term is on file." };
}

/** A "Renewal decision" task, due three days before the notice date. */
export async function renewalTask(id: string): Promise<ActionResult> {
  const user = await requireModule("contracts");
  const c = await sales.getContract(String(id));
  if (!c) return fail("That contract isn't there any more.");
  const who = party(c, await sales.listClientsFull());
  const due = c.end ? renewalTaskDue(c.end, c.noticeDays, lagosToday()) : lagosToday();
  await data.createTask(
    {
      title: `Renewal decision: ${who}`,
      assigneeId: c.ownerId ?? user.id,
      clientId: c.clientId,
      due,
      priority: "top",
      estimate: 30,
      notes: `Contract ends ${c.end || "with no end date"}. Notice period: ${c.noticeDays} days.`,
      checklist: ["Review results and the relationship", "Decide: renew, change scope or end", "Send the renewal or notice in writing"].map((t) => ({ t, done: false })),
    },
    user.id,
  );
  await alert(c.ownerId, A.taskGiven(user.name, { title: `Renewal decision: ${who}`, due }), user.id);
  refresh();
  return { ok: true, message: "Renewal task added." };
}

/** One client agreement for each live client that has none, from the client's own dates and fee. */
export async function addMissingClientContracts(): Promise<ActionResult> {
  const user = await requireModule("contracts");
  const [clients, contracts] = await Promise.all([sales.listClientsFull(), sales.listContracts()]);
  const missing = clients.filter((c) => ["active", "onboarding", "paused"].includes(c.status) && !contracts.some((k) => k.clientId === c.id));
  if (!missing.length) return fail("Every client already has a contract on file.");
  for (const c of missing) {
    await sales.saveContract(
      null,
      {
        kind: "client",
        status: "active",
        clientId: c.id,
        title: c.service,
        start: c.startDate,
        end: c.endDate,
        renewal: "manual",
        noticeDays: 30,
        value: c.fee,
        currency: c.currency,
        period: c.billing === "project" ? "total" : "month",
        ownerId: c.leadId,
      },
      user.id,
    );
  }
  refresh();
  return { ok: true, message: `${missing.length} client contract${missing.length === 1 ? "" : "s"} added. Add each signed copy's link.` };
}
