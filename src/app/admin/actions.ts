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
  ROUTES,
  digits,
} from "@/lib/desk/model";
import * as store from "@/lib/desk/db";
import { mirrorConfigured, scheduleMirror, syncSheetNow } from "@/lib/desk/sheets";
import { countUsers, createUser, deleteUser, listUsers, requireUser, signIn, signOut, startSession } from "@/lib/desk/auth";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const text = (v: unknown, max = 2000) => String(v ?? "").slice(0, max);
const fail = (error: string): ActionResult => ({ ok: false, error });
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/* ── Signing in ──────────────────────────────────────────────────────── */

export async function login(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const ok = await signIn(text(form.get("email"), 200), text(form.get("password"), 200));
  if (!ok) return fail("That email and password don't match a desk account.");
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
  redirect("/admin");
}

export async function logout() {
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
  await requireUser();
  const saved = await store.updateApplication(text(id, 40), readEdit(input), text(version, 40));
  if (!saved) return fail("Someone else saved this application since you opened it. Reopen it to see their changes.");
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
  await store.insertApplication({
    id: store.newApplicationId(),
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
  scheduleMirror();
  refresh();
  return { ok: true, message: "Application added" };
}

export async function removeApplication(id: string): Promise<ActionResult> {
  await requireUser();
  await store.deleteApplication(text(id, 40));
  scheduleMirror();
  refresh();
  return { ok: true, message: "Application deleted" };
}

/* ── Checklist leads ─────────────────────────────────────────────────── */

export async function setLeadFlag(id: number, flag: LeadFlag, value: boolean): Promise<ActionResult> {
  await requireUser();
  if (!LEAD_FLAGS.includes(flag)) return fail("Unknown field.");
  await store.setLeadFlag(Number(id), flag, Boolean(value));
  scheduleMirror();
  refresh();
  return { ok: true, message: "Saved" };
}

export async function removeLead(id: number): Promise<ActionResult> {
  await requireUser();
  await store.deleteLead(Number(id));
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
  await store.saveSettings(values, user.name);
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
  refresh();
  return { ok: true, message: `${name} can now sign in` };
}

export async function removeTeamMember(id: number): Promise<ActionResult> {
  const user = await requireUser();
  if (user.role !== "admin") return fail("Only an admin can remove people.");
  if (Number(id) === user.id) return fail("You can't remove your own account.");
  await deleteUser(Number(id));
  refresh();
  return { ok: true, message: "Removed" };
}

/* ── Google Sheet copy ───────────────────────────────────────────────── */

export async function syncSheet(): Promise<ActionResult> {
  await requireUser();
  if (!mirrorConfigured()) return fail("The Google Sheet copy isn't set up yet. See the steps under Team and setup.");
  const r = await syncSheetNow();
  refresh();
  return r.ok ? { ok: true, message: r.detail } : fail(r.detail);
}
