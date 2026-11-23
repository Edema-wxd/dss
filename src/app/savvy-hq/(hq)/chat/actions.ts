"use server";

import { after } from "next/server";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { requireModule } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import * as chat from "@/lib/hq/chat";
import {
  CHAT_COLORS,
  CHAT_WALLS,
  CH_EMOJI,
  type Channel,
  type ChatFile,
  EMOJI_SET,
  type Look,
  type Message,
  QUICK_REACT,
  TEXT_SIZES,
  canPost,
  chatAdmin,
  parseMentions,
  plainOf,
  slugOf,
  toggleReaction,
} from "@/lib/hq/chat-model";
import * as data from "@/lib/hq/data";
import { notify } from "@/lib/hq/notify";
import * as push from "@/lib/hq/push";
import { isPushMode } from "@/lib/hq/push-model";
import { lagosToday, longDate } from "@/lib/hq/work";

// Messages. Everyone with the chat module reads and posts in every channel, except that only the
// owner, Admins and Operations (EA) post in announcement channels. People edit their own messages;
// the owner and Admins can also delete or pin anyone's. Every time is the server's.

const fail = (error: string): ActionResult => ({ ok: false, error });
const first = (n: string) => n.split(" ")[0] || n;
const EMOJI = new Set([...QUICK_REACT, ...EMOJI_SET]);

async function channelFor(id: string) {
  const c = await chat.getChannel(String(id));
  return c && !c.archived ? c : null;
}

export type ChannelLoad = { channel: string; messages: Message[]; readAt: string; channels: Channel[] };

/** Opens a channel: its latest messages, and where this person had read up to before opening it. */
export async function openChannel(id: string): Promise<ChannelLoad | null> {
  const user = await requireModule("chat");
  const channels = await chat.listChannels(user.id);
  const c = channels.find((x) => x.id === id);
  if (!c) return null;
  const messages = await chat.listMessages(id);
  return { channel: id, messages, readAt: c.readAt, channels };
}

export type Poll = { changed: Message[]; channels: Channel[] };

/** What changed in the open channel since `since`, plus the channel list for unread dots. */
export async function poll(id: string | null, since: string): Promise<Poll> {
  const user = await requireModule("chat");
  const [changed, channels] = await Promise.all([id && since ? chat.changedSince(id, since) : Promise.resolve([]), chat.listChannels(user.id)]);
  return { changed, channels };
}

export async function markRead(id: string, at: string) {
  const user = await requireModule("chat");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at) || !(await chat.getChannel(id))) return;
  await chat.markRead(user.id, id, at);
}

export async function sendMessage(id: string, input: { text?: unknown; reply?: unknown; files?: unknown }): Promise<ActionResult & { msg?: Message }> {
  const user = await requireModule("chat");
  const c = await channelFor(id);
  if (!c) return fail("That channel is gone.");
  if (!canPost(c, user.roles)) return fail(`Only the owner and admins post in ${c.name}.`);
  const text = String(input.text ?? "").replace(/\s+$/, "").slice(0, 8000);
  const files = (Array.isArray(input.files) ? input.files : [])
    .filter((f): f is ChatFile => !!f && typeof f === "object" && typeof (f as ChatFile).key === "string" && (f as ChatFile).key.startsWith("chat/"))
    .slice(0, 6)
    .map((f) => ({ key: f.key, name: String(f.name).slice(0, 200), type: String(f.type).slice(0, 100), size: Number(f.size) || 0 }));
  if (!text.trim() && !files.length) return fail("Write something first.");
  const reply = input.reply && (await chat.getMessage(id, String(input.reply))) ? String(input.reply) : null;
  const people = await chat.listMembers();
  const { mentions, everyone } = parseMentions(text, people, user.id, chatAdmin(user.roles));
  const msg = await chat.addMessage(id, { by: user.id, text, files, mentions, everyone, reply });
  await chat.markRead(user.id, id, msg.at);
  const who = everyone ? people.filter((p) => p.id !== user.id).map((p) => p.id) : mentions;
  for (const to of who.slice(0, 40)) await notify(to, `${user.name} mentioned you in ${c.name}`, plainOf(text).slice(0, 240), `chat?c=${id}`, user.id);
  // push notifications go out after the reply, so sending never waits on the push services
  after(() => push.pushMessage({ id: c.id, name: c.name }, { id: user.id, name: user.name }, { by: user.id, text, files, mentions, everyone }));
  return { ok: true, msg };
}

/* ── Push notifications on this device ───────────────────────────────── */

/** Turns notifications on for this browser, or changes what it gets. */
export async function savePush(sub: unknown, mode: unknown): Promise<ActionResult> {
  const user = await requireModule("chat");
  if (!push.pushConfigured()) return fail("Notifications aren't set up on this server yet.");
  const device = push.readSub(sub);
  if (!device) return fail("This browser didn't give a usable notification address. Try again.");
  const m = isPushMode(mode) ? mode : "all";
  await push.saveDevice(user.id, device, m);
  return { ok: true, message: m === "mentions" ? "Notifications on for mentions." : "Notifications on for every message." };
}

export async function stopPush(endpoint: unknown): Promise<ActionResult> {
  const user = await requireModule("chat");
  await push.removeDevice(user.id, String(endpoint ?? "").slice(0, 1100));
  return { ok: true, message: "Notifications off on this device." };
}

/** Whether this browser is signed up for this person, and for what. */
export async function pushState(endpoint: unknown) {
  const user = await requireModule("chat");
  return push.deviceMode(user.id, String(endpoint ?? "").slice(0, 1100));
}

async function mine(id: string, mid: string, allowAdmin: boolean) {
  const user = await requireModule("chat");
  const m = await chat.getMessage(id, mid);
  if (!m || m.deleted) return { user, m: null };
  return { user, m: m.by === user.id || (allowAdmin && chatAdmin(user.roles)) ? m : null };
}

export async function editMessage(id: string, mid: string, text: string): Promise<ActionResult> {
  const { user, m } = await mine(id, mid, false);
  if (!m) return fail("You can only edit your own messages.");
  const t = String(text ?? "").replace(/\s+$/, "").slice(0, 8000);
  if (!t.trim() && !m.files.length) return fail("A message can't be empty. Delete it instead.");
  const { mentions, everyone } = parseMentions(t, await chat.listMembers(), user.id, chatAdmin(user.roles));
  await chat.editMessage(id, mid, t, mentions, everyone);
  return { ok: true };
}

export async function deleteMessage(id: string, mid: string): Promise<ActionResult> {
  const { m } = await mine(id, mid, true);
  if (!m) return fail("You can only delete your own messages.");
  await chat.deleteMessage(id, mid);
  const c = await chat.getChannel(id);
  if (c?.pins.includes(mid)) await chat.setPins(id, c.pins.filter((p) => p !== mid));
  return { ok: true, message: "Message deleted." };
}

export async function react(id: string, mid: string, emoji: string): Promise<ActionResult> {
  const user = await requireModule("chat");
  if (!EMOJI.has(emoji)) return fail("Pick one of the emoji.");
  const m = await chat.getMessage(id, mid);
  if (!m || m.deleted) return fail("That message is gone.");
  await chat.setReactions(id, mid, toggleReaction(m.reactions, emoji, user.id));
  return { ok: true };
}

export async function gotIt(id: string, mid: string): Promise<ActionResult> {
  const user = await requireModule("chat");
  const c = await channelFor(id);
  if (!c?.announce) return fail("Only announcements take a Got it.");
  await chat.ack(id, mid, user.id);
  return { ok: true };
}

export async function togglePin(id: string, mid: string): Promise<ActionResult> {
  const { m } = await mine(id, mid, true);
  if (!m) return fail("You can pin your own messages. The owner and admins can pin any.");
  const c = (await chat.getChannel(id))!;
  const had = c.pins.includes(mid);
  await chat.setPins(id, had ? c.pins.filter((p) => p !== mid) : [...c.pins, mid]);
  return { ok: true, message: had ? "Unpinned." : "Pinned to the top of the channel." };
}

/** Turns a message into a task for yourself, due today, with the message in its notes. */
export async function messageToTask(id: string, mid: string): Promise<ActionResult> {
  const user = await requireModule("chat");
  if (!canUse(user.roles, "tasks")) return fail("You don't have Tasks.");
  const [c, m, people] = await Promise.all([chat.getChannel(id), chat.getMessage(id, mid), chat.listMembers()]);
  if (!c || !m || m.deleted) return fail("That message is gone.");
  const by = people.find((p) => p.id === m.by)?.name ?? "Someone";
  const t = plainOf(m.text) || m.files[0]?.name || "Follow up";
  await data.createTask(
    { title: t.slice(0, 110), assigneeId: user.id, due: lagosToday(), notes: `From ${c.name}, ${first(by)} on ${longDate(m.at.slice(0, 10))}:\n${m.text.slice(0, 800)}` },
    user.id,
  );
  return { ok: true, message: "Added to your tasks for today." };
}

/* ── Channels ────────────────────────────────────────────────────────── */

export async function saveChannel(id: string | null, input: Record<string, unknown>): Promise<ActionResult & { id?: string }> {
  const user = await requireModule("chat");
  const name = String(input.name ?? "")
    .trim()
    .slice(0, 40);
  if (!name) return fail("Name the channel.");
  const old = id ? await chat.getChannel(id) : null;
  if (id && !old) return fail("That channel is gone.");
  const owner = user.roles.includes("Owner");
  if (old && !owner && old.createdBy !== user.id) return fail("Only the owner or whoever made the channel can change it.");
  const body = {
    name,
    description: String(input.description ?? "").slice(0, 140),
    emoji: CH_EMOJI.includes(String(input.emoji)) ? String(input.emoji) : "✨",
    color: CHAT_COLORS.some(([k]) => k === input.color) ? String(input.color) : "sky",
    // only the owner and admins make announcement channels
    announce: chatAdmin(user.roles) ? input.announce === true || input.announce === "on" : (old?.announce ?? false),
    archived: old ? input.archived === true || input.archived === "on" : false,
  };
  if (old) {
    await chat.updateChannel(old.id, body);
    return { ok: true, message: body.archived ? "Channel archived." : "Channel saved.", id: old.id };
  }
  const cid = await chat.createChannel(slugOf(name), body, user.id);
  return { ok: true, message: `${name} is ready.`, id: cid };
}

export async function setMute(id: string, muted: boolean): Promise<ActionResult> {
  const user = await requireModule("chat");
  if (!(await chat.getChannel(id))) return fail("That channel is gone.");
  await chat.setMuted(user.id, id, muted);
  return { ok: true, message: muted ? "Muted. It won't count towards your unread badge." : "Unmuted." };
}

export async function saveLook(input: Look): Promise<ActionResult> {
  const user = await requireModule("chat");
  const pick = <T extends readonly (readonly [string, ...unknown[]])[]>(list: T, v: unknown, d: string) => (list.some(([k]) => k === v) ? String(v) : d);
  await chat.setLook(user.id, {
    color: input.color ? pick(CHAT_COLORS, input.color, "") : "",
    wall: pick(CHAT_WALLS, input.wall, "paper"),
    size: pick(TEXT_SIZES, input.size, "m"),
    enter: input.enter === "newline" ? "newline" : "send",
    status: String(input.status ?? "")
      .trim()
      .slice(0, 60),
  });
  return { ok: true };
}
