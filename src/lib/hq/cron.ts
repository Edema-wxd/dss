import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Vercel Cron calls with "Authorization: Bearer <CRON_SECRET>". Anything else is refused, and so
 * is every call when CRON_SECRET isn't set, so the jobs can't be triggered by strangers.
 */
export function cronAllowed(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false;
  const want = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return want.length === got.length && timingSafeEqual(want, got);
}

export const siteUrl = () => (process.env.SITE_URL || "https://www.digitalsavvystudios.com").replace(/\/$/, "");
