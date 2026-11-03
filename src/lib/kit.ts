import "server-only";
import { after } from "next/server";

// Adds everyone who asks for the Launch Visibility Checklist to the studio's Kit account,
// tagged "Launch Visibility Checklist", so they can be emailed from Kit later.
//
// Needs a Kit v4 API key: KIT_API_KEY, and optionally KIT_CHECKLIST_TAG_ID.

const DEFAULT_TAG_ID = "25380322";
const API = "https://api.kit.com/v4";

export const kitConfigured = () => Boolean(process.env.KIT_API_KEY);

async function kit(path: string, body: object) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Kit-Api-Key": String(process.env.KIT_API_KEY) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kit ${path} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Creates or updates the subscriber, then tags them. Never throws: a failure is logged, not raised. */
export async function subscribeChecklistLead({ name, email }: { name: string; email: string }) {
  if (!kitConfigured()) return false;
  try {
    const firstName = name.split(/\s+/)[0] ?? "";
    await kit("/subscribers", { email_address: email, first_name: firstName || undefined });
    await kit(`/tags/${process.env.KIT_CHECKLIST_TAG_ID || DEFAULT_TAG_ID}/subscribers`, { email_address: email });
    return true;
  } catch (e) {
    console.error("Kit subscribe failed:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Queues the Kit sign-up after the response, so the visitor never waits on Kit. */
export function scheduleKitSubscribe(lead: { name: string; email: string }) {
  after(() => subscribeChecklistLead(lead).then(() => undefined));
}
