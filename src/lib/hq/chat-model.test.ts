import { describe, expect, it } from "vitest";
import { canPost, chatAdmin, colorOf, emojiOnly, lastLine, parseMentions, plainOf, postsAnnouncements, slugOf, toggleReaction, tokenize } from "./chat-model";

const people = [
  { id: 1, name: "Ada Owner" },
  { id: 2, name: "Bo Staff" },
  { id: 3, name: "Bo" },
];

describe("who can do what", () => {
  it("lets only the owner, admins and Operations (EA) post announcements", () => {
    expect(canPost({ announce: false }, ["Contributor"])).toBe(true);
    expect(canPost({ announce: true }, ["Contributor"])).toBe(false);
    expect(canPost({ announce: true }, ["Operations (EA)"])).toBe(true);
    expect(postsAnnouncements(["Sales", "Admin"])).toBe(true);
    expect(chatAdmin(["Operations (EA)"])).toBe(false);
    expect(chatAdmin(["Owner"])).toBe(true);
  });
});

describe("mentions", () => {
  it("finds people by full name, never yourself, and @everyone only for those allowed", () => {
    expect(parseMentions("@Bo Staff can you check?", people, 1, false)).toEqual({ mentions: [2, 3], everyone: false });
    expect(parseMentions("Thanks @Ada Owner", people, 1, false).mentions).toEqual([]);
    expect(parseMentions("@everyone standup at 10", people, 1, false).everyone).toBe(false);
    expect(parseMentions("@everyone standup at 10", people, 1, true).everyone).toBe(true);
    expect(parseMentions("mail me@everyone.com", people, 1, true).everyone).toBe(false);
  });
});

describe("text", () => {
  it("formats bold, italic, code, strike, links and mentions, keeping the longest name", () => {
    const t = tokenize("**Hi** _there_ `x` ~~no~~ https://example.test/a. @Bo Staff\nok", ["Bo", "Bo Staff"], "Bo Staff");
    expect(t.map((x) => x.t)).toEqual(["b", "text", "i", "text", "code", "text", "s", "text", "link", "text", "mention", "br", "text"]);
    expect(t.find((x) => x.t === "link")!.v).toBe("https://example.test/a");
    expect(t.find((x) => x.t === "mention")).toMatchObject({ v: "@Bo Staff", me: true });
  });

  it("strips formatting for previews and spots emoji-only messages", () => {
    expect(plainOf("**Big** ~~news~~  `now`")).toBe("Big news now");
    expect(lastLine("", [{ key: "chat/x", name: "deck.pdf", type: "application/pdf", size: 1 }])).toBe("📎 deck.pdf");
    expect(emojiOnly("🎉🎉")).toBe(true);
    expect(emojiOnly("🎉 done")).toBe(false);
    expect(emojiOnly("1️⃣")).toBe(false);
  });
});

describe("reactions and looks", () => {
  it("toggles one person's reaction and drops empty ones", () => {
    const r = toggleReaction({ "👍": [2] }, "👍", 1);
    expect(r).toEqual({ "👍": [2, 1] });
    expect(toggleReaction(toggleReaction(r, "👍", 1), "👍", 2)).toEqual({});
  });

  it("uses a person's chosen colour, else one picked from their id", () => {
    expect(colorOf({ color: "plum" }, 1)[0]).toBe("plum");
    expect(colorOf({}, 1)[0]).toBe("sky");
    expect(colorOf(undefined, 1)[0]).toBe(colorOf({}, 1)[0]);
  });

  it("makes channel ids from names", () => {
    expect(slugOf("Talent desk!")).toBe("talent-desk");
    expect(slugOf("✨")).toBe("channel");
  });
});
