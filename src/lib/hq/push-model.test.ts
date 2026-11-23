import { describe, expect, it } from "vitest";
import { pushPayload, pushTargets } from "./push-model";

// Everyone here is made up.

const sub = (userId: number, mode = "all", muted = false) => ({ endpoint: `https://push.example.test/${userId}-${mode}`, userId, mode, muted });
const msg = (over: Partial<Parameters<typeof pushTargets>[1]> = {}) => ({ by: 1, text: "Morning team", files: [], mentions: [], everyone: false, ...over });

describe("who gets a push for a new message", () => {
  it("everyone signed up except the sender", () => {
    const subs = [sub(1), sub(2), sub(3)];
    expect(pushTargets(subs, msg()).map((s) => s.userId)).toEqual([2, 3]);
  });

  it("mentions-only devices wait for a mention, and muted channels stay quiet unless you're mentioned", () => {
    const subs = [sub(2, "mentions"), sub(3, "all", true), sub(4)];
    expect(pushTargets(subs, msg()).map((s) => s.userId)).toEqual([4]);
    expect(pushTargets(subs, msg({ mentions: [2, 3] })).map((s) => s.userId)).toEqual([2, 3, 4]);
    expect(pushTargets(subs, msg({ everyone: true })).map((s) => s.userId)).toEqual([2, 3, 4]);
  });

  it("each device decides for itself", () => {
    const subs = [sub(2, "all"), sub(2, "mentions")];
    expect(pushTargets(subs, msg())).toHaveLength(1);
  });
});

describe("what the push says", () => {
  const channel = { id: "general", name: "General" };

  it("names the sender and channel, and opens the channel", () => {
    expect(pushPayload({ sender: "Bo Staff", channel, text: "Can you send the deck?", files: [], mentioned: false })).toEqual({
      title: "Bo in General",
      body: "Can you send the deck?",
      url: "/savvy-hq/chat?c=general",
      tag: "chat-general",
    });
    expect(pushPayload({ sender: "Bo Staff", channel, text: "@Ada Owner look", files: [], mentioned: true }).title).toBe("Bo mentioned you in General");
  });

  it("shortens long messages and describes files", () => {
    expect(pushPayload({ sender: "Bo", channel, text: "word ".repeat(80), files: [], mentioned: false }).body).toHaveLength(180);
    expect(pushPayload({ sender: "Bo", channel, text: "", files: [{ name: "brief.pdf" }], mentioned: false }).body).toBe("Sent brief.pdf");
    expect(pushPayload({ sender: "Bo", channel, text: "  ", files: [{ name: "a" }, { name: "b" }], mentioned: false }).body).toBe("Sent 2 files");
  });

  it("never uses long dashes", () => {
    const p = pushPayload({ sender: "Bo", channel, text: "x", files: [], mentioned: true });
    expect(JSON.stringify(p)).not.toMatch(/[–—]/);
  });
});
