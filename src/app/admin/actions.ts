"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  type ApplicationEdit,
  type EditableSetting,
  type LeadFlag,
  BANDS,
  EDIT_KEYS,
  EDITABLE_SETTINGS,
  LEAD_FLAGS,
  LEAD_FLAG_LABELS,
  ROUTES,
  SETTING_LABELS,
  type ActivityEntry,
  digits,
} from "@/lib/desk/model";
import * as store from "@/lib/desk/db";
import { mirrorConfigured, scheduleMirror, syncSheetNow } from "@/lib/desk/sheets";
import { countUsers, createUser, currentUser, deleteUser, listUsers, requireUser, signIn, signOut, startSession } from "@/lib/desk/auth";
import { appLabel, applicationChanges, diff, listActivity, logActivity, requestIp } from "@/lib/desk/activity";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const text = (v: unknown, max = 2000) => String(v ?? "").slice(0, max);
const fail = (error: string): ActionResult => ({ ok: false, error });
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/* ── Signing in ──────────────────────────────────────────────────────── */

export async function login(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = text(form.get("email"), 200).trim();
  const user = await signIn(email, text(form.get("password"), 200));
  const ip = await requestIp();
  if (!user) {
    await logActivity({ name: "Unknown visitor", email }, "auth.signin_failed", `Failed sign-in attempt for ${email || "a blank email"}`, { ip });
    return fail("That email and password don't match a desk account.");
  }
  await logActivity(user, "auth.signin", `${user.name} signed in`, { ip });
  redirect("/admin");
}

/** Creates the very first account. Refused once any account exists. */
export async function setupFirstUser(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  if ((await countUsers()) > 0) return fail("The desk already has an account. Sign in instead.");
  const name = text(form.get("name"), 80).trim();
  const email = text(form.get("email"), 200).trim();
  const password = text(form.get("password"), 200);
  if (!name) return fail("Add your name.");
  if (!emailOk(email)) return fail("Enter a valid email.");
  if (password.length < 10) return fail("Use a password of at least 10 characters.");
  await createUser({ name, email, password, role: "admin" });
  const first = (await listUsers())[0];
  await startSession(first.id);
  await logActivity(first, "auth.setup", `${first.name} created the desk's first account`, { ip: await requestIp() });
  redirect("/admin");
}

export async function logout() {
  const user = await currentUser();
  if (user) await logActivity(user, "auth.signout", `${user.name} signed out`);
  await signOut();
  redirect("/admin/login");
}

/* ── Applications ────────────────────────────────────────────────────── */

function readEdit(input: Record<string, unknown>): ApplicationEdit {
  const out = {} as ApplicationEdit;
  for (const k of EDIT_KEYS) out[k] = text(input[k], k === "notes" ? 5000 : 500);
  return out;
}

export async function saveApplication(id: string, version: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const appId = text(id, 40);
  const before = await store.getApplication(appId);
  const saved = await store.updateApplication(appId, readEdit(input), text(version, 40));
  if (!saved) return fail("Someone else saved this application since you opened it. Reopen it to see their changes.");
  const after = await store.getApplication(appId);
  if (before && after) {
    const changes = applicationChanges(before, after);
    if (changes.length) {
      const status = changes.find((c) => c.field === "Status");
      const summary = status
        ? `${user.name} moved ${appLabel(after)} from ${status.from || "New"} to ${status.to}`
        : `${user.name} updated ${appLabel(after)}`;
      await logActivity(user, "application.updated", summary, { target: appId, changes });
    }
  }
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved" };
}

export async function addApplication(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const name = text(input.name, 120).trim();
  const email = text(input.email, 200).trim();
  if (!name || !emailOk(email)) return fail("Add at least a name and a valid email.");
  const route = ROUTES.find((r) => r === input.route) ?? "fit";
  const budget = BANDS.find(([b]) => b === input.budget)?.[0] ?? "";
  const edit = readEdit(input);
  const id = store.newApplicationId();
  await store.insertApplication({
    id,
    name,
    role: text(input.role, 120),
    company: text(input.company, 160),
    site: text(input.site, 200),
    email,
    whatsapp: text(input.whatsapp, 40),
    moment: text(input.moment, 200),
    when: text(input.when, 80),
    budget,
    decider: text(input.decider, 120),
    worth: text(input.worth, 1000),
    route,
    source: text(input.source, 120).trim() || `Added by ${user.name}`,
    consent: false,
    status: edit.status || "New",
    owner: edit.owner,
    notes: edit.notes,
  });
  const company = text(input.company, 160);
  await logActivity(user, "application.added", `${user.name} added ${appLabel({ name, company })} by hand`, {
    target: id,
    changes: [
      { field: "Status", from: "", to: edit.status || "New" },
      ...(edit.owner ? [{ field: "Owner", from: "", to: edit.owner }] : []),
    ],
  });
  scheduleMirror();
  refresh();
  return { ok: true, message: "Application added" };
}

export async function removeApplication(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const appId = text(id, 40);
  const gone = await store.getApplication(appId);
  await store.deleteApplication(appId);
  if (gone) {
    await logActivity(user, "application.deleted", `${user.name} deleted the application from ${appLabel(gone)}`, {
      target: appId,
      changes: [
        { field: "Email", from: "", to: gone.email },
        { field: "Status", from: "", to: gone.status },
      ],
    });
  }
  scheduleMirror();
  refresh();
  return { ok: true, message: "Application deleted" };
}

/* ── Checklist leads ─────────────────────────────────────────────────── */

export async function setLeadFlag(id: number, flag: LeadFlag, value: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!LEAD_FLAGS.includes(flag)) return fail("Unknown field.");
  const lead = await store.getLead(Number(id));
  await store.setLeadFlag(Number(id), flag, Boolean(value));
  if (lead && lead[flag] !== Boolean(value)) {
    const label = LEAD_FLAG_LABELS[flag];
    await logActivity(user, "lead.updated", `${user.name} ${value ? "ticked" : "unticked"} "${label}" for ${lead.name || lead.email}`, {
      target: String(lead.id),
      changes: [{ field: label, from: lead[flag] ? "Yes" : "No", to: value ? "Yes" : "No" }],
    });
  }
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved" };
}

export async function removeLead(id: number): Promise<ActionResult> {
  const user = await requireUser();
  const lead = await store.getLead(Number(id));
  await store.deleteLead(Number(id));
  if (lead) {
    await logActivity(user, "lead.deleted", `${user.name} deleted the checklist lead ${lead.name || lead.email}`, {
      target: String(lead.id),
      changes: [{ field: "Email", from: "", to: lead.email }],
    });
  }
  scheduleMirror();
  refresh();
  return { ok: true, message: "Lead deleted" };
}

/* ── Settings ────────────────────────────────────────────────────────── */

const NUMERIC: EditableSetting[] = [
  "sessions_per_month",
  "client_slots_total",
  "clients_won_other_routes",
  "reply_promise_hours",
  "minimum_monthly_budget",
  "session_value",
];
const FLAGS: EditableSetting[] = ["applications_open", "waitlist_when_full"];

export async function saveSettings(input: Partial<Record<EditableSetting, unknown>>): Promise<ActionResult> {
  const user = await requireUser();
  const values: Partial<Record<EditableSetting, string>> = {};
  for (const k of EDITABLE_SETTINGS) {
    if (!(k in input)) continue;
    const v = input[k];
    if (NUMERIC.includes(k)) values[k] = String(Math.min(Math.max(0, Number(digits(v)) || 0), k.endsWith("budget") || k === "session_value" ? 1e12 : 999));
    else if (FLAGS.includes(k)) values[k] = v === true || v === "TRUE" ? "TRUE" : "FALSE";
    else if (k === "whatsapp_number") values[k] = digits(v).slice(0, 15);
    else if (k === "priority_from_band") values[k] = BANDS.find(([b]) => b === v)?.[0] ?? "3m-5m";
    else if (k === "client_period_start") values[k] = /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : "";
    else if (k === "booking_link") {
      const link = text(v, 500).trim();
      if (link && !/^https:\/\//.test(link)) return fail("The booking link must start with https://");
      values[k] = link;
    } else values[k] = text(v, 500).trim();
  }
  const before = await store.storedSettings();
  await store.saveSettings(values, user.name);
  const changes = diff(
    before,
    { ...before, ...values },
    Object.fromEntries(Object.keys(values).map((k) => [k, SETTING_LABELS[k as EditableSetting]])) as Record<string, string>,
  );
  if (changes.length) {
    const what = changes.length === 1 ? changes[0].field.toLowerCase() : `${changes.length} website settings`;
    await logActivity(user, "settings.updated", `${user.name} changed ${what}`, { changes });
  }
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved. The website picks this up straight away." };
}

/* ── Team ────────────────────────────────────────────────────────────── */

export async function addTeamMember(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return fail("Only an admin can add people to the desk.");
  const name = text(form.get("name"), 80).trim();
  const email = text(form.get("email"), 200).trim();
  const password = text(form.get("password"), 200);
  const role = form.get("role") === "admin" ? "admin" : "team";
  if (!name || !emailOk(email)) return fail("Add a name and a valid email.");
  if (password.length < 10) return fail("Use a temporary password of at least 10 characters.");
  try {
    await createUser({ name, email, password, role });
  } catch {
    return fail("That email already has a desk account.");
  }
  await logActivity(user, "team.added", `${user.name} gave ${name} ${role} access`, {
    changes: [
      { field: "Email", from: "", to: email.toLowerCase() },
      { field: "Access", from: "", to: role },
    ],
  });
  refresh();
  return { ok: true, message: `${name} can now sign in` };
}

export async function removeTeamMember(id: number): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return fail("Only an admin can remove people.");
  if (Number(id) === user.id) return fail("You can't remove your own account.");
  const gone = (await listUsers()).find((u) => u.id === Number(id));
  await deleteUser(Number(id));
  if (gone) {
    await logActivity(user, "team.removed", `${user.name} removed ${gone.name}'s access`, {
      changes: [
        { field: "Email", from: "", to: gone.email },
        { field: "Access", from: "", to: gone.role },
      ],
    });
  }
  refresh();
  return { ok: true, message: "Removed" };
}

/* ── Google Sheet copy ───────────────────────────────────────────────── */

export async function syncSheet(): Promise<ActionResult> {
  const user = await requireUser();
  if (!mirrorConfigured()) return fail("The Google Sheet copy isn't set up yet. See the steps under Team and setup.");
  const r = await syncSheetNow();
  await logActivity(user, "sheet.synced", r.ok ? `${user.name} copied everything to the Google Sheet` : `${user.name}'s copy to the Google Sheet failed`, {
    changes: [{ field: "Result", from: "", to: r.detail }],
  });
  refresh();
  return r.ok ? { ok: true, message: r.detail } : fail(r.detail);
}

/* ── Activity log ────────────────────────────────────────────────────── */

/** Older entries, for "Show older" at the foot of the log. Admins only. */
export async function olderActivity(beforeId: number): Promise<ActivityEntry[]> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only an admin can see the activity log.");
  return listActivity(Number(beforeId) || undefined);
}
