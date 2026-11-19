"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import {
  type Application,
  type ApplicationEdit,
  type AUDIT_ACTIONS,
  type EditableSetting,
  type LeadFlag,
  BANDS,
  EDIT_KEYS,
  EDITABLE_SETTINGS,
  LEAD_FLAGS,
  ROUTES,
  digits,
} from "@/lib/desk/model";
import * as store from "@/lib/desk/db";
import { mirrorConfigured, scheduleMirror, syncSheetNow } from "@/lib/desk/sheets";
import { deliverChecklist } from "@/lib/mail";
import { syncApplicationToCrm } from "@/lib/hq/crm-sync";
import {
  type DeskUser,
  countUsers,
  createUser,
  currentUser,
  deleteUser,
  listUsers,
  ownerOrNull,
  requireModule,
  setUserActive,
  setUserPassword,
  setUserRoles,
  signIn,
  signOut,
  startSession,
} from "@/lib/desk/auth";
import { type Role, cleanRoles, isOwner } from "@/lib/hq/access";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const text = (v: unknown, max = 2000) => String(v ?? "").slice(0, max);
const fail = (error: string): ActionResult => ({ ok: false, error });
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

type Changes = Record<string, [string, string]>;

/** Writes one line to the audit log for what `user` just did. */
function audit(
  user: Pick<DeskUser, "name" | "email"> | null,
  action: keyof typeof AUDIT_ACTIONS,
  target: string,
  summary: string,
  changes: Changes | null = null,
) {
  return store.audit({ actor: user?.name ?? "", actorEmail: user?.email ?? "", action, target, summary, changes });
}

/** Field-by-field before/after for the keys that differ. */
function diff<T extends Record<string, unknown>>(before: T, after: T, keys: readonly (keyof T & string)[]) {
  const out: Changes = {};
  for (const k of keys) if (String(before[k] ?? "") !== String(after[k] ?? "")) out[k] = [String(before[k] ?? ""), String(after[k] ?? "")];
  return out;
}

const appLabel = (a: Pick<Application, "id" | "name" | "company">) => [a.name, a.company].filter(Boolean).join(", ") || a.id;

/* ── Signing in ──────────────────────────────────────────────────────── */

export async function login(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = text(form.get("email"), 200).trim();
  const user = await signIn(email, text(form.get("password"), 200));
  if (!user) {
    await audit(null, "auth.login_failed", email, `Wrong email or password for ${email}`);
    return fail("That email and password don't match an HQ account that can sign in.");
  }
  await audit(user, "auth.login", user.email, `${user.name} signed in`);
  redirect("/admin");
}

/** Creates the very first account. Refused once any account exists. */
export async function setupFirstUser(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  if ((await countUsers()) > 0) return fail("HQ already has an account. Sign in instead.");
  const name = text(form.get("name"), 80).trim();
  const email = text(form.get("email"), 200).trim();
  const password = text(form.get("password"), 200);
  if (!name) return fail("Add your name.");
  if (!emailOk(email)) return fail("Enter a valid email.");
  if (password.length < 10) return fail("Use a password of at least 10 characters.");
  await createUser({ name, email, password, roles: ["Owner"] });
  const first = (await listUsers())[0];
  await startSession(first.id);
  await audit(first, "auth.setup", first.email, `${first.name} created the first HQ account`);
  redirect("/admin");
}

export async function logout() {
  const user = await currentUser();
  if (user) await audit(user, "auth.logout", user.email, `${user.name} signed out`);
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
  const user = await requireModule("sessions");
  const appId = text(id, 40);
  const before = await store.getApplication(appId);
  const saved = await store.updateApplication(appId, readEdit(input), text(version, 40));
  if (!saved) return fail("Someone else saved this application since you opened it. Reopen it to see their changes.");
  const after = await store.getApplication(appId);
  if (before && after) {
    const changes = diff(before, after, EDIT_KEYS);
    const fields = Object.keys(changes);
    if (fields.length) await audit(user, "application.update", appId, `${appLabel(after)}: changed ${fields.join(", ")}`, changes);
    if (changes.status) await syncApplicationToCrm(appId);
  }
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved" };
}

export async function addApplication(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireModule("sessions");
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
  await syncApplicationToCrm(id);
  await audit(user, "application.create", id, `${appLabel({ id, name, company: text(input.company, 160) })} added by hand`);
  scheduleMirror();
  refresh();
  return { ok: true, message: "Application added" };
}

export async function removeApplication(id: string): Promise<ActionResult> {
  const user = await requireModule("sessions");
  const appId = text(id, 40);
  const app = await store.getApplication(appId);
  await store.deleteApplication(appId);
  await audit(user, "application.delete", appId, app ? `Deleted ${appLabel(app)} (${app.email}, status ${app.status})` : `Deleted ${appId}`);
  scheduleMirror();
  refresh();
  return { ok: true, message: "Application deleted" };
}

/* ── Checklist leads ─────────────────────────────────────────────────── */

export async function setLeadFlag(id: number, flag: LeadFlag, value: boolean): Promise<ActionResult> {
  const user = await requireModule("sessions");
  if (!LEAD_FLAGS.includes(flag)) return fail("Unknown field.");
  await store.setLeadFlag(Number(id), flag, Boolean(value));
  const name = (await store.getLeadName(Number(id))) || `Lead ${id}`;
  await audit(user, "lead.flag", `lead ${id}`, `${name}: ${flag} set to ${value ? "yes" : "no"}`, {
    [flag]: [value ? "FALSE" : "TRUE", value ? "TRUE" : "FALSE"],
  });
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved" };
}

export async function removeLead(id: number): Promise<ActionResult> {
  const user = await requireModule("sessions");
  const name = (await store.getLeadName(Number(id))) || `Lead ${id}`;
  await store.deleteLead(Number(id));
  await audit(user, "lead.delete", `lead ${id}`, `Deleted ${name}`);
  scheduleMirror();
  refresh();
  return { ok: true, message: "Lead deleted" };
}

/* ── Sent mail ───────────────────────────────────────────────────────── */

/** Sends a logged checklist email again, as a new entry in the log. */
export async function resendMail(id: number): Promise<ActionResult> {
  const user = await requireModule("sessions");
  const mail = await store.getMail(Number(id));
  if (!mail) return fail("That email is no longer in the log.");
  if (mail.kind !== "checklist") return fail("Only checklist emails can be sent again.");
  const name = mail.leadId ? await store.getLeadName(mail.leadId) : "";
  const site = process.env.SITE_URL || "https://www.digitalsavvystudios.com";
  const sent = await deliverChecklist({ leadId: mail.leadId, name, email: mail.to, site });
  await audit(user, "mail.resend", mail.to, `Resent "${mail.subject}" to ${mail.to}: ${sent ? "sent" : "didn't send"}`);
  scheduleMirror();
  refresh();
  return sent ? { ok: true, message: `Checklist sent to ${mail.to}` } : fail("It didn't send. The new entry in the log says why.");
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
  const user = await requireModule("sessions");
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
  const before = await store.getSettingValues(Object.keys(values));
  await store.saveSettings(values, user.name);
  const changes = diff(before, values, Object.keys(values) as EditableSetting[]);
  const fields = Object.keys(changes);
  if (fields.length) await audit(user, "settings.update", "settings", `Changed ${fields.join(", ")}`, changes);
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved. The website picks this up straight away." };
}

/* ── Team ────────────────────────────────────────────────────────────── */

const OWNER_ONLY = "Only an owner can change who has access.";

/** Roles from a form or a client call: known roles only, at least one. */
function readRoles(v: unknown): Role[] {
  return cleanRoles(Array.isArray(v) ? v : [v]);
}

const memberLabel = (u: Pick<DeskUser, "name" | "email">) => `${u.name} (${u.email})`;

/** Refuses a change that would leave nobody able to manage the team. */
async function keepsAnOwner(changingId: number, nextRoles: Role[] | null) {
  const owners = (await listUsers()).filter((u) => u.active && isOwner(u.roles));
  const remaining = owners.filter((u) => u.id !== changingId || (nextRoles !== null && isOwner(nextRoles)));
  return remaining.length > 0;
}

export async function addTeamMember(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await ownerOrNull();
  if (!user) return fail(OWNER_ONLY);
  const name = text(form.get("name"), 80).trim();
  const email = text(form.get("email"), 200).trim();
  const password = text(form.get("password"), 200);
  const roles = readRoles(form.getAll("roles"));
  if (!name || !emailOk(email)) return fail("Add a name and a valid email.");
  if (password.length < 10) return fail("Use a temporary password of at least 10 characters.");
  if (!roles.length) return fail("Pick at least one role.");
  try {
    await createUser({ name, email, password, roles });
  } catch {
    return fail("That email already has an account.");
  }
  await audit(user, "team.add", email, `Added ${name} (${email}) as ${roles.join(", ")}`);
  refresh();
  return { ok: true, message: `${name} can now sign in` };
}

export async function setTeamRoles(id: number, input: unknown): Promise<ActionResult> {
  const user = await ownerOrNull();
  if (!user) return fail(OWNER_ONLY);
  const roles = readRoles(input);
  if (!roles.length) return fail("Pick at least one role.");
  const member = (await listUsers()).find((u) => u.id === Number(id));
  if (!member) return fail("That person is no longer on the team.");
  if (!(await keepsAnOwner(member.id, roles))) return fail("Someone else needs to be an Owner first, so the team can still be managed.");
  await setUserRoles(member.id, roles);
  await audit(user, "team.roles", member.email, `${memberLabel(member)}: roles set to ${roles.join(", ")}`, {
    roles: [member.roles.join(", "), roles.join(", ")],
  });
  refresh();
  return { ok: true, message: "Roles saved" };
}

export async function setTeamActive(id: number, active: boolean): Promise<ActionResult> {
  const user = await ownerOrNull();
  if (!user) return fail(OWNER_ONLY);
  const member = (await listUsers()).find((u) => u.id === Number(id));
  if (!member) return fail("That person is no longer on the team.");
  if (member.id === user.id && !active) return fail("You can't switch off your own access.");
  if (!active && !(await keepsAnOwner(member.id, null))) return fail("Someone else needs to be an Owner first.");
  await setUserActive(member.id, Boolean(active));
  await audit(user, "team.active", member.email, `${memberLabel(member)}: access ${active ? "switched on" : "switched off"}`);
  refresh();
  return { ok: true, message: active ? `${member.name} can sign in again` : `${member.name} is signed out and can't sign in` };
}

export async function setTeamPassword(id: number, password: string): Promise<ActionResult> {
  const user = await ownerOrNull();
  if (!user) return fail(OWNER_ONLY);
  const pw = text(password, 200);
  if (pw.length < 10) return fail("Use a temporary password of at least 10 characters.");
  const member = (await listUsers()).find((u) => u.id === Number(id));
  if (!member) return fail("That person is no longer on the team.");
  await setUserPassword(member.id, pw);
  await audit(user, "team.password", member.email, `Set a new password for ${memberLabel(member)}`);
  refresh();
  return { ok: true, message: `New password set. Share it with ${member.name.split(" ")[0]} privately.` };
}

export async function removeTeamMember(id: number): Promise<ActionResult> {
  const user = await ownerOrNull();
  if (!user) return fail(OWNER_ONLY);
  if (Number(id) === user.id) return fail("You can't remove your own account.");
  const gone = (await listUsers()).find((u) => u.id === Number(id));
  if (gone && !(await keepsAnOwner(gone.id, null))) return fail("Someone else needs to be an Owner first.");
  await deleteUser(Number(id));
  await audit(user, "team.remove", gone?.email ?? `user ${id}`, gone ? `Removed ${memberLabel(gone)}` : `Removed user ${id}`);
  refresh();
  return { ok: true, message: "Removed" };
}

/* ── Google Sheet copy ───────────────────────────────────────────────── */

export async function syncSheet(): Promise<ActionResult> {
  const user = await requireModule("sessions");
  if (!mirrorConfigured()) return fail("The Google Sheet copy isn't set up yet. See the steps under Team and setup.");
  const r = await syncSheetNow();
  await audit(user, "sheet.sync", "Google Sheet", `${r.ok ? "Synced" : "Sync failed"}: ${r.detail}`);
  refresh();
  return r.ok ? { ok: true, message: r.detail } : fail(r.detail);
}
