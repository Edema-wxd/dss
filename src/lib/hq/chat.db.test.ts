import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// Messages against a real Postgres. Needs TEST_DATABASE_URL (local, "test" in the name); it is
// wiped first. Everyone here is made up.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

describe.skipIf(!usable)("messages in Postgres", () => {
  let chat: typeof import("./chat");
  let ada: number, bo: number;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    chat = await import("./chat");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    await createUser({ name: "Bo Staff", email: "bo@example.test", password: "a-long-password", roles: ["Sales"] });
    const users = await listUsers();
    [ada, bo] = ["ada", "bo"].map((n) => users.find((u) => u.email.startsWith(n))!.id);
  });

  afterAll(() => disconnect());

  it("makes HQ's five channels once, with a welcome in General", async () => {
    expect(await chat.seedChannels(ada)).toBe(true);
    expect(await chat.seedChannels(ada)).toBe(false);
    const cs = await chat.listChannels(bo);
    expect(cs.map((c) => c.id)).toEqual(["general", "announcements", "client-work", "wins", "watercooler"]);
    expect(cs.find((c) => c.id === "announcements")!.announce).toBe(true);
    const g = cs.find((c) => c.id === "general")!;
    expect(g).toMatchObject({ unread: true, mentioned: false });
    expect(g.last).toMatchObject({ by: ada, text: expect.stringContaining("Welcome to Messages") });
  });

  it("tracks unread, mentions and mutes per person", async () => {
    const all = await chat.listMessages("general");
    await chat.markRead(bo, "general", all.at(-1)!.at);
    expect((await chat.listChannels(bo)).find((c) => c.id === "general")!.unread).toBe(false);
    const m = await chat.addMessage("general", { by: ada, text: "@Bo Staff over to you", files: [], mentions: [bo], everyone: false, reply: null });
    let g = (await chat.listChannels(bo)).find((c) => c.id === "general")!;
    expect(g).toMatchObject({ unread: true, mentioned: true });
    // your own message never counts as unread for you
    expect((await chat.listChannels(ada)).find((c) => c.id === "general")!.mentioned).toBe(false);
    await chat.setMuted(bo, "general", true);
    // the other channels have no messages yet, so muting General leaves nothing unread
    expect(await chat.unreadCount(bo)).toBe(0);
    await chat.markRead(bo, "general", m.at);
    // reading never moves backwards
    await chat.markRead(bo, "general", "2000-01-01T00:00:00Z");
    g = (await chat.listChannels(bo)).find((c) => c.id === "general")!;
    expect(g).toMatchObject({ unread: false, muted: true });
  });

  it("reports edits, reactions, Got it and deletes as changes since a moment", async () => {
    const m = await chat.addMessage("announcements", { by: ada, text: "Office closed Friday", files: [], mentions: [], everyone: true, reply: null });
    const since = m.updatedAt;
    expect(await chat.changedSince("announcements", since)).toEqual([]);
    await chat.setReactions("announcements", m.id, { "👍": [bo] });
    await chat.ack("announcements", m.id, bo);
    await chat.ack("announcements", m.id, bo);
    let c = await chat.changedSince("announcements", since);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ reactions: { "👍": [bo] }, acks: [bo], everyone: true });
    await chat.editMessage("announcements", m.id, "Office closed Friday and Monday", [], true);
    expect((await chat.getMessage("announcements", m.id))!.edited).toMatch(/^\d{4}-/);
    await chat.deleteMessage("announcements", m.id);
    c = await chat.changedSince("announcements", since);
    expect(c[0]).toMatchObject({ deleted: true, text: "", reactions: {} });
  });

  it("names new channels uniquely and saves each person's look", async () => {
    const body = { name: "Wins", description: "", emoji: "🏆", color: "lime", announce: false, archived: false };
    expect(await chat.createChannel("wins", body, bo)).toBe("wins-2");
    await chat.setLook(bo, { color: "plum", wall: "dots", status: "On a shoot" });
    expect((await chat.listMembers()).find((m) => m.id === bo)!.look).toMatchObject({ color: "plum", status: "On a shoot" });
  });
});
