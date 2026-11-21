import "server-only";
import { db } from "../desk/db";
import { type Channel, type ChatFile, DEFAULT_CHANNELS, type Look, type Message, WELCOME, lastLine } from "./chat-model";
import { newId } from "./data";

// Channels and messages (hq_chat_channels, hq_chat_messages) and each person's read state
// (hq_chat_reads). Callers check who may do what first; the rules live in chat-model.ts.

// microseconds, so polling for "changed since" never misses or repeats a change
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '')`;

const MSG_COLS = `channel_id as "channelId", id, by_id::int as by, ${iso("at")} as at, text, files, mentions::int[] as mentions, everyone,
  reactions, reply, ${iso("edited")} as edited, acks::int[] as acks, deleted, sys, ${iso("updated_at")} as "updatedAt"`;

const toMsg = (m: Message): Message => ({ ...m, files: Array.isArray(m.files) ? m.files : [], reactions: m.reactions ?? {}, mentions: m.mentions ?? [], acks: m.acks ?? [] });

/* ── Channels ────────────────────────────────────────────────────────── */

/** Every channel, with whether it's unread or mentions this person since they last read it. */
export async function listChannels(userId: number): Promise<Channel[]> {
  const rows = (await (await db()).query(
    `select c.id, c.name, c.description, c.emoji, c.color, c.announce, c.archived, c.sort, c.pins, c.last, c.created_by::int as "createdBy",
       ${iso("r.read_at")} as "readAt", coalesce(r.muted, false) as muted,
       exists (select 1 from hq_chat_messages m where m.channel_id = c.id and not m.deleted and m.by_id is distinct from $1
         and m.at > coalesce(r.read_at, '-infinity')) as unread,
       exists (select 1 from hq_chat_messages m where m.channel_id = c.id and not m.deleted and m.by_id is distinct from $1
         and m.at > coalesce(r.read_at, '-infinity') and ($1 = any(m.mentions) or m.everyone)) as mentioned
     from hq_chat_channels c left join hq_chat_reads r on r.channel_id = c.id and r.user_id = $1
     order by c.sort, c.name`,
    [userId],
  )) as (Channel & { last: { at: string; by: number | null; text: string } | null })[];
  return rows.map((c) => ({ ...c, pins: c.pins ?? [], last: c.last ? { ...c.last, by: c.last.by === null ? null : Number(c.last.by) } : null }));
}

/** How many channels have something new for this person (muted ones don't count). */
export async function unreadCount(userId: number) {
  return (await listChannels(userId)).filter((c) => !c.archived && !c.muted && c.unread).length;
}

export async function getChannel(id: string) {
  const rows = (await (await db()).query(
    `select id, name, description, emoji, color, announce, archived, sort, pins, created_by::int as "createdBy" from hq_chat_channels where id = $1`,
    [id],
  )) as Pick<Channel, "id" | "name" | "description" | "emoji" | "color" | "announce" | "archived" | "sort" | "pins" | "createdBy">[];
  return rows[0] ? { ...rows[0], pins: rows[0].pins ?? [] } : null;
}

/** HQ's five channels and a welcome message, once, when there are none. */
export async function seedChannels(by: number | null) {
  const q = await db();
  if (((await q.query(`select count(*)::int as n from hq_chat_channels`)) as { n: number }[])[0].n) return false;
  for (const [id, name, emoji, color, desc, sort, announce] of DEFAULT_CHANNELS)
    await q.query(
      `insert into hq_chat_channels (id, name, description, emoji, color, sort, announce, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (id) do nothing`,
      [id, name, desc, emoji, color, sort, announce, by],
    );
  await addMessage("general", { by, text: WELCOME, files: [], mentions: [], everyone: false, reply: null });
  return true;
}

export type ChannelInput = Pick<Channel, "name" | "description" | "emoji" | "color" | "announce" | "archived">;

export async function createChannel(id: string, c: ChannelInput, by: number) {
  const q = await db();
  let cid = id;
  for (let n = 2; ((await q.query(`select 1 from hq_chat_channels where id = $1`, [cid])) as unknown[]).length; n++) cid = `${id}-${n}`;
  await q.query(`insert into hq_chat_channels (id, name, description, emoji, color, announce, sort, created_by) values ($1, $2, $3, $4, $5, $6, 50, $7)`, [
    cid,
    c.name,
    c.description,
    c.emoji,
    c.color,
    c.announce,
    by,
  ]);
  return cid;
}

export async function updateChannel(id: string, c: ChannelInput) {
  await (await db()).query(
    `update hq_chat_channels set name = $2, description = $3, emoji = $4, color = $5, announce = $6, archived = $7, updated_at = now() where id = $1`,
    [id, c.name, c.description, c.emoji, c.color, c.announce, c.archived],
  );
}

export async function setPins(id: string, pins: string[]) {
  await (await db()).query(`update hq_chat_channels set pins = $2::text[], updated_at = now() where id = $1`, [id, pins.slice(-12)]);
}

/* ── Messages ────────────────────────────────────────────────────────── */

/** The latest messages in a channel, oldest first. */
export async function listMessages(channelId: string, limit = 300): Promise<Message[]> {
  const rows = (await (await db()).query(`select * from (select ${MSG_COLS} from hq_chat_messages where channel_id = $1 order by at desc, id desc limit $2) x order by at, id`, [
    channelId,
    limit,
  ])) as Message[];
  return rows.map(toMsg);
}

/** Messages sent, edited, reacted to or deleted since a moment, for polling. */
export async function changedSince(channelId: string, since: string): Promise<Message[]> {
  const rows = (await (await db()).query(`select ${MSG_COLS} from hq_chat_messages where channel_id = $1 and updated_at > $2::timestamptz order by at, id`, [
    channelId,
    since,
  ])) as Message[];
  return rows.map(toMsg);
}

export async function getMessage(channelId: string, id: string) {
  const rows = (await (await db()).query(`select ${MSG_COLS} from hq_chat_messages where channel_id = $1 and id = $2`, [channelId, id])) as Message[];
  return rows[0] ? toMsg(rows[0]) : null;
}

export type NewMessage = { by: number | null; text: string; files: ChatFile[]; mentions: number[]; everyone: boolean; reply: string | null };

/** Posts a message and moves the channel's "last message" on. Times are the server's. */
export async function addMessage(channelId: string, m: NewMessage) {
  const id = newId();
  const q = await db();
  await q.query(
    `insert into hq_chat_messages (channel_id, id, by_id, text, files, mentions, everyone, reply) values ($1, $2, $3, $4, $5::jsonb, $6::bigint[], $7, $8)`,
    [channelId, id, m.by, m.text, JSON.stringify(m.files), m.mentions, m.everyone, m.reply],
  );
  await q.query(
    `update hq_chat_channels c set last = jsonb_build_object('at', ${iso("m.at")}, 'by', m.by_id, 'text', $3::text) from hq_chat_messages m
     where c.id = $1 and m.channel_id = $1 and m.id = $2`,
    [channelId, id, lastLine(m.text, m.files)],
  );
  return (await getMessage(channelId, id))!;
}

export async function editMessage(channelId: string, id: string, text: string, mentions: number[], everyone: boolean) {
  await (await db()).query(
    `update hq_chat_messages set text = $3, mentions = $4::bigint[], everyone = $5, edited = now(), updated_at = now() where channel_id = $1 and id = $2 and not deleted`,
    [channelId, id, text, mentions, everyone],
  );
}

/** Replaced with "Message deleted" for everyone; the row stays so replies still make sense. */
export async function deleteMessage(channelId: string, id: string) {
  await (await db()).query(
    `update hq_chat_messages set deleted = true, text = '', files = '[]', reactions = '{}', updated_at = now() where channel_id = $1 and id = $2`,
    [channelId, id],
  );
}

export async function setReactions(channelId: string, id: string, reactions: Record<string, number[]>) {
  await (await db()).query(`update hq_chat_messages set reactions = $3::jsonb, updated_at = now() where channel_id = $1 and id = $2 and not deleted`, [
    channelId,
    id,
    JSON.stringify(reactions),
  ]);
}

/** "Got it" on an announcement. */
export async function ack(channelId: string, id: string, userId: number) {
  await (await db()).query(
    `update hq_chat_messages set acks = array_append(acks, $3::bigint), updated_at = now() where channel_id = $1 and id = $2 and not ($3 = any(acks))`,
    [channelId, id, userId],
  );
}

/* ── Read state and looks ────────────────────────────────────────────── */

/** Marks a channel read up to a moment (never backwards). */
export async function markRead(userId: number, channelId: string, at: string) {
  await (await db()).query(
    `insert into hq_chat_reads (user_id, channel_id, read_at) values ($1, $2, $3::timestamptz)
     on conflict (user_id, channel_id) do update set read_at = greatest(hq_chat_reads.read_at, excluded.read_at)`,
    [userId, channelId, at],
  );
}

export async function setMuted(userId: number, channelId: string, muted: boolean) {
  await (await db()).query(
    `insert into hq_chat_reads (user_id, channel_id, muted) values ($1, $2, $3) on conflict (user_id, channel_id) do update set muted = excluded.muted`,
    [userId, channelId, muted],
  );
}

export type Member = { id: number; name: string; roles: string[]; title: string; look: Look; day: string };

/** Everyone on the team, with their chat look and whether they're clocked in today. */
export async function listMembers(): Promise<Member[]> {
  return (await (await db()).query(
    `select u.id::int, u.name, u.roles, u.title, u.chat as look, coalesce(t.status, '') as day
     from desk_users u left join hq_time t on t.user_id = u.id and t.day = (now() at time zone 'Africa/Lagos')::date
     where u.active order by u.name`,
  )) as Member[];
}

export async function setLook(userId: number, look: Look) {
  await (await db()).query(`update desk_users set chat = $2::jsonb where id = $1`, [userId, JSON.stringify(look)]);
}
