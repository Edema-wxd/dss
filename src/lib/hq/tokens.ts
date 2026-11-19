import { createHmac, timingSafeEqual } from "node:crypto";

// One-tap links in HQ emails ("Done", "Tomorrow", "Drop"). Each link carries a signed, expiring
// instruction for one task and one person, so it works on a phone without signing in, and
// can't be changed to touch another task. The page it opens still asks for a tap to confirm,
// so a mail scanner opening the link changes nothing.

export type QuickAction = { task: string; action: "done" | "carry" | "drop"; user: number; to?: string; exp: number };

const secret = () => process.env.HQ_LINK_SECRET || process.env.CRON_SECRET || "";
export const linksConfigured = () => secret().length >= 16;

const sig = (body: string, key: string) => createHmac("sha256", key).update(body).digest("base64url");

export function signAction(a: QuickAction, key = secret()) {
  if (key.length < 16) throw new Error("HQ_LINK_SECRET (or CRON_SECRET) must be set, at least 16 characters.");
  const body = Buffer.from(JSON.stringify(a)).toString("base64url");
  return `${body}.${sig(body, key)}`;
}

/** The instruction, or null when the link was changed, signed with another key, or has expired. */
export function readAction(token: string, now = Date.now(), key = secret()): QuickAction | null {
  if (key.length < 16) return null;
  const [body, mac] = String(token).split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sig(body, key));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const a = JSON.parse(Buffer.from(body, "base64url").toString()) as QuickAction;
    if (!["done", "carry", "drop"].includes(a.action) || typeof a.task !== "string" || !Number.isInteger(a.user)) return null;
    return a.exp * 1000 > now ? a : null;
  } catch {
    return null;
  }
}
