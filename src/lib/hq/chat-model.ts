// Messages, as HQ ran them: channels open to the whole team, colourful bubbles each person picks,
// reactions, replies, @mentions, pins, and "Got it" on announcements. Private DMs are left out of the
// rebuild for now. Pure: shared by the page and the server.

/** [key, label, bubble, text] */
export const CHAT_COLORS = [
  ["rose", "Rose", "#EC1763", "#FFF8F2"],
  ["sky", "Sky", "#5568AF", "#FFF8F2"],
  ["sunset", "Sunset", "#F37826", "#201C2B"],
  ["lime", "Lime", "#CDD629", "#201C2B"],
  ["aqua", "Aqua", "#CEEAEE", "#201C2B"],
  ["ink", "Ink", "#201C2B", "#FFF8F2"],
  ["lavender", "Lavender", "#B9A7F5", "#201C2B"],
  ["mint", "Mint", "#9FE0C0", "#201C2B"],
  ["blush", "Blush", "#F9C9DA", "#201C2B"],
  ["plum", "Plum", "#7A3B82", "#FFF8F2"],
] as const;
export type ColorKey = (typeof CHAT_COLORS)[number][0];

export const CHAT_WALLS = [
  ["paper", "Plain paper"],
  ["dots", "Polka dots"],
  ["grid", "Notebook grid"],
  ["confetti", "Confetti"],
  ["night", "After hours"],
] as const;

export const TEXT_SIZES = [
  ["s", "Small"],
  ["m", "Medium"],
  ["l", "Large"],
] as const;

export const CH_EMOJI = ["👋", "📣", "💼", "🏆", "☕", "🎯", "💡", "📸", "🎬", "💸", "🤝", "🧠", "🗓️", "🚀", "🎨", "✨"];
export const QUICK_REACT = ["👍", "❤️", "😂", "🎉", "🔥", "🙏", "👀", "✅"];
export const EMOJI_SET =
  "😀 😁 😂 🤣 😊 😍 🥰 😘 😎 🤩 🥳 🤔 🙃 😅 😌 😴 🤯 😤 😢 😭 🙌 👏 👍 👎 🙏 💪 🤝 👀 💯 🔥 ✨ 🎉 🎊 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 ✅ ❌ ⚡ 📌 📎 📣 💡 🎯 🚀 💼 📈 📉 💸 🗓️ ⏰ ☕ 🍕 🍔 🎬 📸 🎨 🎤 📝".split(" ");

export type Look = { color?: string; wall?: string; size?: string; enter?: string; status?: string };

export type ChatFile = { key: string; name: string; type: string; size: number };

export type Channel = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  announce: boolean;
  archived: boolean;
  sort: number;
  pins: string[];
  last: { at: string; by: number | null; text: string } | null;
  createdBy: number | null;
  /** for the person asking */
  readAt: string;
  muted: boolean;
  unread: boolean;
  mentioned: boolean;
};

export type Message = {
  id: string;
  channelId: string;
  by: number | null;
  at: string;
  text: string;
  files: ChatFile[];
  mentions: number[];
  everyone: boolean;
  reactions: Record<string, number[]>;
  reply: string | null;
  edited: string;
  acks: number[];
  deleted: boolean;
  sys: boolean;
  updatedAt: string;
};

/** HQ's default channels, made the first time anyone opens Messages. */
export const DEFAULT_CHANNELS: readonly [id: string, name: string, emoji: string, color: string, desc: string, sort: number, announce: boolean][] = [
  ["general", "General", "👋", "sky", "Day-to-day chat for the whole team", 1, false],
  ["announcements", "Announcements", "📣", "rose", "News from the owner. Tap Got it so they know you've seen it", 2, true],
  ["client-work", "Client work", "💼", "aqua", "Questions, files and updates on client delivery", 3, false],
  ["wins", "Wins", "🏆", "lime", "Signed a client, landed a deal, hit a number? Post it here", 4, false],
  ["watercooler", "Watercooler", "☕", "sunset", "Everything else. Memes welcome", 5, false],
];
export const WELCOME =
  "Welcome to Messages in DSS HQ 👋\nChannels like this one are open to the whole team.\nTip: hover a message (or tap it on a phone) to react, reply or turn it into a task, and use @ to mention someone.";

const has = (roles: readonly string[], ...r: string[]) => roles.some((x) => r.includes(x));
/** Who posts in announcement channels (everyone else reacts and taps Got it). */
export const postsAnnouncements = (roles: readonly string[]) => has(roles, "Owner", "Admin", "Operations (EA)");
/** Who can @everyone, mark a channel as announcements, and pin or delete anyone's message. */
export const chatAdmin = (roles: readonly string[]) => has(roles, "Owner", "Admin");
export const canPost = (c: Pick<Channel, "announce">, roles: readonly string[]) => !c.announce || postsAnnouncements(roles);

/** A person's bubble colour: their pick, or one chosen from their id. */
export function colorOf(look: Look | undefined, id: number | null) {
  const k = look?.color || ["rose", "sky", "sunset", "lime", "lavender", "mint", "aqua", "plum"][Math.abs(Number(id) || 0) % 8];
  return CHAT_COLORS.find((c) => c[0] === k) ?? CHAT_COLORS[0];
}
export const channelColor = (k: string) => (CHAT_COLORS.find((c) => c[0] === k) ?? CHAT_COLORS[1])[2];

/** Who a message mentions: "@Full Name" for anyone on the team, and @everyone for those allowed. */
export function parseMentions(text: string, people: readonly { id: number; name: string }[], me: number, allowEveryone: boolean) {
  const ids = people.filter((p) => p.id !== me && p.name && text.includes(`@${p.name}`)).map((p) => p.id);
  return { mentions: ids, everyone: allowEveryone && /(^|\s)@everyone\b/.test(text) };
}

/** A URL-safe channel id from its name. */
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "channel";

export const plainOf = (t: string) =>
  String(t ?? "")
    .replace(/\*\*|~~|`/g, "")
    .replace(/(^|\s)_([^_]+)_/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

/** A message that's only a few emoji shows large, without a bubble. */
export function emojiOnly(t: string) {
  const s = (t ?? "").trim();
  if (!s || s.length > 16 || /\d/.test(s)) return false;
  return /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(s);
}

export const fsize = (n: number) => (!n ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Toggles one person's reaction. */
export function toggleReaction(r: Record<string, number[]>, emoji: string, who: number) {
  const out = { ...r };
  const set = new Set(out[emoji] ?? []);
  if (set.has(who)) set.delete(who);
  else set.add(who);
  if (set.size) out[emoji] = [...set];
  else delete out[emoji];
  return out;
}

/** What a channel's list entry says about its last message. */
export const lastLine = (text: string, files: readonly ChatFile[]) => (plainOf(text) || (files[0] ? `📎 ${files[0].name}` : "")).slice(0, 90);

/** Simple formatting: **bold**, _italic_, `code`, ~~strike~~ and links, as tokens to render. */
export type Token = { t: "text" | "b" | "i" | "code" | "s" | "link" | "mention" | "br"; v: string; me?: boolean };
export function tokenize(text: string, names: readonly string[], myName: string): Token[] {
  const out: Token[] = [];
  const nm = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mention = nm.length ? `@(?:everyone|${nm.map(esc).join("|")})` : "@everyone";
  const re = new RegExp(`(https?:\\/\\/[^\\s<]+[^\\s<.,;:!?)\\]'"])|\\*\\*([^*\\n]+)\\*\\*|(?<=^|[\\s(])_([^_\\n]+)_(?=$|[\\s).,!?])|\`([^\`\\n]+)\`|~~([^~\\n]+)~~|(${mention})|(\\n)`, "g");
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > i) out.push({ t: "text", v: text.slice(i, m.index) });
    if (m[1]) out.push({ t: "link", v: m[1] });
    else if (m[2]) out.push({ t: "b", v: m[2] });
    else if (m[3]) out.push({ t: "i", v: m[3] });
    else if (m[4]) out.push({ t: "code", v: m[4] });
    else if (m[5]) out.push({ t: "s", v: m[5] });
    else if (m[6]) out.push({ t: "mention", v: m[6], me: m[6] === `@${myName}` || m[6] === "@everyone" });
    else out.push({ t: "br", v: "" });
    i = m.index! + m[0].length;
  }
  if (i < text.length) out.push({ t: "text", v: text.slice(i) });
  return out;
}
