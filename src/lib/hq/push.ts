import "server-only";
import webpush from "web-push";
import { db } from "../desk/db";
import { plainOf } from "./chat-model";
import { siteUrl } from "./notify";
import { type NewChatMessage, type PushMode, mentionsUser, pushPayload, pushTargets } from "./push-model";

// Web Push for Messages. Each device that turns notifications on is a row in hq_push_subs. A new
// message goes to the devices push-model.ts picks, through each browser's push service (Google,
// Apple, Mozilla), signed with this server's VAPID keys. Devices the push service says are gone
// are forgotten.
//
// Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (make a pair with `npx web-push
// generate-vapid-keys`). Without them the switch doesn't show and nothing is sent.

export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? "";

export type DeviceSub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** A browser's subscription as it arrives from the page: an https endpoint and its two keys. */
export function readSub(v: unknown): DeviceSub | null {
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = String(s?.endpoint ?? "");
  const p256dh = String(s?.keys?.p256dh ?? "");
  const auth = String(s?.keys?.auth ?? "");
  if (!/^https:\/\/[^\s]{8,1000}$/.test(endpoint) || !/^[\w-]{20,200}$/.test(p256dh) || !/^[\w-]{8,100}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** Saves this device for this person. A device moving to another account moves with it. */
export async function saveDevice(userId: number, sub: DeviceSub, mode: PushMode) {
  await (await db()).query(
    `insert into hq_push_subs (endpoint, user_id, p256dh, auth, mode) values ($1, $2, $3, $4, $5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, mode = excluded.mode`,
    [sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth, mode],
  );
}

export async function removeDevice(userId: number, endpoint: string) {
  await (await db()).query(`delete from hq_push_subs where endpoint = $1 and user_id = $2`, [endpoint, userId]);
}

/** This device's setting, if it's signed up for this person. */
export async function deviceMode(userId: number, endpoint: string): Promise<PushMode | null> {
  const rows = (await (await db()).query(`select mode from hq_push_subs where endpoint = $1 and user_id = $2`, [endpoint, userId])) as { mode: PushMode }[];
  return rows[0]?.mode ?? null;
}

type Row = { endpoint: string; userId: number; p256dh: string; auth: string; mode: string; muted: boolean };

export type PushReport = { devices: number; sent: number; gone: number; failed: number };

/** Sends a new message to everyone who should hear about it. Never throws: a push is a nice-to-have. */
export async function pushMessage(channel: { id: string; name: string }, sender: { id: number; name: string }, m: NewChatMessage): Promise<PushReport> {
  const report: PushReport = { devices: 0, sent: 0, gone: 0, failed: 0 };
  if (!pushConfigured()) return report;
  try {
    const q = await db();
    const rows = (await q.query(
      `select s.endpoint, s.user_id::int as "userId", s.p256dh, s.auth, s.mode, coalesce(r.muted, false) as muted
       from hq_push_subs s join desk_users u on u.id = s.user_id and u.active
       left join hq_chat_reads r on r.user_id = s.user_id and r.channel_id = $1
       where s.user_id <> $2`,
      [channel.id, sender.id],
    )) as Row[];
    const targets = pushTargets(rows, m) as Row[];
    report.devices = targets.length;
    if (!targets.length) return report;

    webpush.setVapidDetails(process.env.VAPID_SUBJECT || siteUrl(), vapidPublicKey(), process.env.VAPID_PRIVATE_KEY!);
    const text = plainOf(m.text);
    const gone: string[] = [];
    const ok: string[] = [];
    await Promise.allSettled(
      targets.map(async (t) => {
        const mentioned = mentionsUser(m, t.userId);
        const payload = pushPayload({ sender: sender.name, channel, text, files: m.files, mentioned });
        try {
          await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(payload), {
            TTL: 60 * 60 * 24,
            urgency: mentioned ? "high" : "normal",
            topic: payload.tag.replace(/[^\w-]/g, "").slice(0, 32),
          });
          ok.push(t.endpoint);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) gone.push(t.endpoint);
          else report.failed++;
        }
      }),
    );
    report.sent = ok.length;
    report.gone = gone.length;
    if (gone.length) await q.query(`delete from hq_push_subs where endpoint = any($1::text[])`, [gone]);
    if (ok.length) await q.query(`update hq_push_subs set last_ok = now() where endpoint = any($1::text[])`, [ok]);
  } catch {
    report.failed++;
  }
  return report;
}
