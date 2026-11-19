"use server";

import { refresh } from "next/cache";
import type { ActionResult } from "@/app/admin/actions";
import { requireModule, type DeskUser } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import { canEditProcedures } from "@/lib/hq/access";
import * as data from "@/lib/hq/data";
import { SOP_AREAS } from "@/lib/hq/work";

const fail = (error: string): ActionResult => ({ ok: false, error });
const text = (v: unknown, max = 500) => String(v ?? "").slice(0, max).trim();
const audit = (u: DeskUser, action: string, target: string, summary: string) =>
  store.audit({ actor: u.name, actorEmail: u.email, action, target, summary, changes: null });

/** Steps are one per line; anything after ": " is the detail, as HQ's form worked. */
function parseSteps(v: unknown) {
  return String(v ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 60)
    .map((x) => {
      const i = x.indexOf(": ");
      return i > 0 && i < 90 ? { t: x.slice(0, i).slice(0, 300), note: x.slice(i + 2).slice(0, 1000) } : { t: x.slice(0, 300), note: "" };
    });
}

/** Links are one per line as "Label | https://…". Only http and https are kept. */
function parseLinks(v: unknown) {
  return String(v ?? "")
    .split("\n")
    .map((x) => x.split("|").map((y) => y.trim()))
    .filter((x) => x[1] && /^https?:\/\//.test(x[1]))
    .slice(0, 20)
    .map(([label, url]) => ({ label: label.slice(0, 120), url: url.slice(0, 1000) }));
}

export async function saveProcedure(id: string | null, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("procedures");
  if (!canEditProcedures(user.roles)) return fail("Only an owner or manager can change procedures.");
  const title = text(input.title, 200);
  const steps = parseSteps(input.steps);
  if (!title) return fail("Give the procedure a name.");
  if (!steps.length) return fail("Add at least one step.");
  const ownerId = input.ownerId ? Number(input.ownerId) : null;
  if (ownerId !== null && !(await data.listPeople()).some((p) => p.id === ownerId && p.active)) return fail("Pick an owner who's on the team.");
  if (id && !(await data.getSop(String(id)))) return fail("That procedure isn't there any more.");
  await data.saveSop(id ? String(id) : null, {
    title,
    area: (SOP_AREAS as readonly string[]).includes(String(input.area)) ? String(input.area) : "Clients",
    ownerId,
    purpose: text(input.purpose, 500),
    steps,
    links: parseLinks(input.links),
  }, user.id);
  await audit(user, id ? "sop.update" : "sop.create", title, `${id ? "Changed" : "Wrote"} the procedure "${title}"`);
  refresh();
  return { ok: true, message: "Procedure saved." };
}

export async function removeProcedure(id: string): Promise<ActionResult> {
  const user = await requireModule("procedures");
  if (!canEditProcedures(user.roles)) return fail("Only an owner or manager can delete procedures.");
  const sop = await data.getSop(String(id));
  if (!sop) return fail("That procedure isn't there any more.");
  await data.deleteSop(sop.id);
  await audit(user, "sop.delete", sop.title, `Deleted the procedure "${sop.title}"`);
  refresh();
  return { ok: true, message: "Procedure deleted." };
}

/** Turns a procedure into a task for yourself, with every step as a checklist item. */
export async function procedureToTask(id: string): Promise<ActionResult> {
  const user = await requireModule("procedures");
  const sop = await data.getSop(String(id));
  if (!sop) return fail("That procedure isn't there any more.");
  await data.createTask(
    { title: sop.title, assigneeId: user.id, sopId: sop.id, notes: sop.purpose, checklist: sop.steps.map((s) => ({ t: s.t, done: false })) },
    user.id,
  );
  await audit(user, "task.create", sop.title, `Made the procedure "${sop.title}" a task`);
  refresh();
  return { ok: true, message: "Task added to your list, with every step as a checklist." };
}
