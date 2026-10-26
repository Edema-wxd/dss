import "server-only";
import { createSign } from "node:crypto";
import { after } from "next/server";
import { SETTING_KEYS } from "./model";
import { db, loadDesk } from "./db";

// A read-only copy of the desk in the "DSS Visibility Session Backend" Google Sheet, so the
// team can browse or export there. Neon stays the source of truth: every change on the desk
// or the website rewrites the Sheet's tabs in the background, and edits made in the Sheet
// are overwritten on the next sync.
//
// Needs a Google service account with edit access to the Sheet:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, and optionally GOOGLE_SHEET_ID.

const DEFAULT_SHEET_ID = "19C-LOCIyU2UJg0Nfd3Rmb3VEwc1eOsE9QYRVTxpHGV8";
const SYNC_KEY = "sheet_last_sync";

export const sheetId = () => process.env.GOOGLE_SHEET_ID || DEFAULT_SHEET_ID;
export const sheetUrl = () => `https://docs.google.com/spreadsheets/d/${sheetId()}/edit`;
export const mirrorConfigured = () => Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);

/* ── Google auth: a signed JWT exchanged for an access token ──────────── */

let token: { value: string; expires: number } | null = null;

async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  // hosts often store the key with literal "\n" sequences
  const key = String(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function sheets(path: string, init: { method: string; body?: unknown }) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId()}${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 403) throw new Error(`The service account can't edit the Sheet. Share it with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} as an Editor.`);
    throw new Error(`Google Sheets refused the update (${res.status}): ${detail}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/* ── The copy ────────────────────────────────────────────────────────── */

const APPS = "Applications";
const LEADS = "'Checklist Leads'";

/** Rewrites the Applications, Checklist Leads and Settings tabs from the database. */
export async function mirrorToSheet() {
  const { apps, leads, settings } = await loadDesk();

  const appRows = [...apps]
    .sort((x, y) => x.submitted.localeCompare(y.submitted))
    .map((a) => [
      a.id, a.submitted, a.name, a.role, a.company, a.site, a.email, a.whatsapp, a.moment, a.when, a.budget, a.decider,
      a.worth, a.route, a.source, a.score, a.consent, a.status, a.owner, a.sessionDate, a.sessionTime, a.firstReply,
      a.reviewLink, a.outcome, a.dealValue, a.followUp, a.notes, a.updated,
    ]);
  const leadRows = [...leads]
    .sort((x, y) => x.at.localeCompare(y.at))
    .map((l) => [l.at, l.name, l.email, l.moment, l.source, l.email1, l.email2, l.applied, l.notes]);

  // settings are matched by the keys in column A, so a reordered tab still lines up
  const keyCells = (await sheets(`/values/Settings!A4:A22`, { method: "GET" })).values as string[][] | undefined;
  const keys = keyCells?.length ? keyCells.map((r) => r[0] ?? "") : [...SETTING_KEYS];
  const cell = (v: string) => (v === "TRUE" ? true : v === "FALSE" ? false : /^\d+$/.test(v) && !v.startsWith("0") ? Number(v) : v);
  const settingRows = keys.map((k) => [k === "whatsapp_number" ? (settings.whatsapp_number ?? "") : k in settings ? cell(settings[k as keyof typeof settings] ?? "") : null]);

  await sheets(`/values:batchUpdate`, {
    method: "POST",
    body: {
      // RAW stores text as typed, so nothing a founder types can run as a formula
      valueInputOption: "RAW",
      data: [
        ...(appRows.length ? [{ range: `${APPS}!A2`, values: appRows }] : []),
        ...(leadRows.length ? [{ range: `${LEADS}!A2`, values: leadRows }] : []),
        { range: "Settings!B4", values: settingRows },
      ],
    },
  });
  // then clear anything below the copy, such as rows deleted on the desk
  await sheets(`/values:batchClear`, {
    method: "POST",
    body: { ranges: [`${APPS}!A${appRows.length + 2}:AB`, `${LEADS}!A${leadRows.length + 2}:I`] },
  });
  return { applications: appRows.length, leads: leadRows.length };
}

export type SyncStatus = { at: string; ok: boolean; detail: string } | null;

async function recordSync(ok: boolean, detail: string) {
  const value = JSON.stringify({ at: new Date().toISOString(), ok, detail: detail.slice(0, 300) });
  await (await db()).query(
    `insert into vs_settings (key, value, updated) values ($1, $2, now()) on conflict (key) do update set value = excluded.value, updated = now()`,
    [SYNC_KEY, value],
  );
}

export async function lastSync(): Promise<SyncStatus> {
  const rows = (await (await db()).query(`select value from vs_settings where key = $1`, [SYNC_KEY])) as { value: string }[];
  try {
    return rows[0] ? JSON.parse(rows[0].value) : null;
  } catch {
    return null;
  }
}

/** Runs the copy now and records how it went. */
export async function syncSheetNow() {
  try {
    const r = await mirrorToSheet();
    await recordSync(true, `${r.applications} applications and ${r.leads} leads copied`);
    return { ok: true as const, detail: `${r.applications} applications and ${r.leads} leads copied to the Sheet` };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Sheet mirror failed:", detail);
    await recordSync(false, detail).catch(() => {});
    return { ok: false as const, detail };
  }
}

/** Queues a copy to run after the response is sent. Does nothing until Google is set up. */
export function scheduleMirror() {
  if (!mirrorConfigured()) return;
  after(() => syncSheetNow());
}
