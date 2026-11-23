// Push notifications for Messages: who gets one for a new message, and what it says. Pure, so it
// can be tested; push.ts sends them.
//
// Each device that turned notifications on picks "every message" or "only when I'm mentioned".
// A muted channel stays quiet unless the message mentions you (or everyone). Nobody gets a push
// for their own message.

export const PUSH_MODES = [
  ["all", "Every message"],
  ["mentions", "Only when I'm mentioned"],
] as const;
export type PushMode = (typeof PUSH_MODES)[number][0];
export const isPushMode = (v: unknown): v is PushMode => PUSH_MODES.some(([k]) => k === v);

export type PushSub = { endpoint: string; userId: number; mode: string; muted: boolean };
export type NewChatMessage = { by: number; text: string; files: { name: string }[]; mentions: number[]; everyone: boolean };

export const mentionsUser = (m: Pick<NewChatMessage, "mentions" | "everyone">, userId: number) => m.everyone || m.mentions.includes(userId);

/** The devices to notify about a new message. */
export function pushTargets(subs: readonly PushSub[], m: NewChatMessage) {
  return subs.filter((s) => {
    if (s.userId === m.by) return false;
    if (mentionsUser(m, s.userId)) return true;
    return s.mode !== "mentions" && !s.muted;
  });
}

export type PushPayload = { title: string; body: string; url: string; tag: string };

/** The notification itself: who wrote where, the start of the message, and where a tap opens. */
export function pushPayload(o: { sender: string; channel: { id: string; name: string }; text: string; files: { name: string }[]; mentioned: boolean }): PushPayload {
  const first = o.sender.trim().split(/\s+/)[0] || "Someone";
  const words = o.text.replace(/\s+/g, " ").trim();
  const filesLine = o.files.length === 1 ? `Sent ${o.files[0].name || "a file"}` : o.files.length > 1 ? `Sent ${o.files.length} files` : "";
  const body = words ? (words.length > 180 ? `${words.slice(0, 179).trimEnd()}…` : words) : filesLine || "Sent a message";
  return {
    title: o.mentioned ? `${first} mentioned you in ${o.channel.name}` : `${first} in ${o.channel.name}`,
    body,
    url: `/savvy-hq/chat?c=${encodeURIComponent(o.channel.id)}`,
    // one notification per channel: a newer message replaces the last
    tag: `chat-${o.channel.id}`,
  };
}
