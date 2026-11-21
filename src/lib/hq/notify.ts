import "server-only";
import { db } from "../desk/db";
import { newId } from "./data";

// HQ's notify(): an email waiting to go out. The notifications job sends the queue. As in HQ,
// nothing is queued for yourself, or for anyone who turned emails off or wants only the
// morning summary. Never put money or private messages in a notification.

export const siteUrl = () => (process.env.SITE_URL || "https://www.digitalsavvystudios.com").replace(/\/$/, "");

/** Queues one email. `path` is the HQ page it links to, such as "team/leave". */
export async function notify(toId: number | null | undefined, title: string, body: string, path: string, fromId: number | null = null) {
  if (!toId || toId === fromId) return false;
  const q = await db();
  const rows = await q.query(`select notify_mode as mode, active from desk_users where id = $1`, [toId]);
  const p = rows[0] as { mode: string; active: boolean } | undefined;
  if (!p || !p.active || p.mode === "off" || p.mode === "digest") return false;
  await q.query(`insert into hq_notify (id, to_id, from_id, title, body, link) values ($1, $2, $3, $4, $5, $6)`, [
    newId(),
    toId,
    fromId,
    title.slice(0, 300),
    body.slice(0, 4000),
    `${siteUrl()}/admin/${path.replace(/^\//, "")}`,
  ]);
  return true;
}

/** The first Owner: where HQ's "Jane" notifications go. */
export async function ownerId() {
  const rows = await (await db()).query(`select id::int from desk_users where 'Owner' = any(roles) and active order by id limit 1`);
  return rows[0] ? Number(rows[0].id) : null;
}

/** Queues one of the change alerts from alerts-model.ts. */
export const alert = (toId: number | null | undefined, a: { title: string; body: string; path: string }, fromId: number | null) =>
  notify(toId, a.title, a.body, a.path, fromId);
