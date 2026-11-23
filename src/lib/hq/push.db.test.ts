import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// Push notifications for Messages against a real Postgres, with the push services faked: nothing
// leaves this machine. Needs TEST_DATABASE_URL (local, "test" in the name); it is wiped first.
// Everyone here is made up.

const sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, body: string) => {
      if (sub.endpoint.endsWith("/gone")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
      return { statusCode: 201 };
    },
  },
}));

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

const device = (name: string) => ({ endpoint: `https://push.example.test/${name}`, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });

describe.skipIf(!usable)("push notifications in Postgres", () => {
  let push: typeof import("./push");
  let chat: typeof import("./chat");
  let ada: number, bo: number, cy: number;

  beforeAll(async () => {
    const sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    process.env.VAPID_PUBLIC_KEY = "test-public-key";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    push = await import("./push");
    chat = await import("./chat");
    const { createUser, listUsers } = await import("../desk/auth");
    await createUser({ name: "Ada Owner", email: "ada@example.test", password: "a-long-password", roles: ["Owner"] });
    await createUser({ name: "Bo Staff", email: "bo@example.test", password: "a-long-password", roles: ["Sales"] });
    await createUser({ name: "Cy Quiet", email: "cy@example.test", password: "a-long-password", roles: ["Contributor"] });
    const users = await listUsers();
    [ada, bo, cy] = ["ada", "bo", "cy"].map((n) => users.find((u) => u.email.startsWith(n))!.id);
    await chat.seedChannels(ada);
  });

  afterAll(() => disconnect());

  it("keeps one row per device, and checks what the browser sends", async () => {
    expect(push.readSub(device("bo-phone"))).not.toBeNull();
    expect(push.readSub({ endpoint: "http://insecure.example.test/x", keys: device("x").keys })).toBeNull();
    expect(push.readSub({ endpoint: device("x").endpoint, keys: { p256dh: "short", auth: "" } })).toBeNull();
    await push.saveDevice(bo, push.readSub(device("bo-phone"))!, "all");
    await push.saveDevice(bo, push.readSub(device("bo-phone"))!, "mentions");
    expect(await push.deviceMode(bo, device("bo-phone").endpoint)).toBe("mentions");
    expect(await push.deviceMode(ada, device("bo-phone").endpoint)).toBeNull();
    await push.saveDevice(bo, push.readSub(device("bo-phone"))!, "all");
  });

  it("sends a new message to the right devices and forgets ones that are gone", async () => {
    await push.saveDevice(cy, push.readSub(device("cy-laptop"))!, "all");
    await push.saveDevice(cy, push.readSub(device("gone"))!, "all");
    await push.saveDevice(ada, push.readSub(device("ada-phone"))!, "all");
    await chat.setMuted(cy, "general", true);

    const r = await push.pushMessage({ id: "general", name: "General" }, { id: ada, name: "Ada Owner" }, { by: ada, text: "Morning team", files: [], mentions: [], everyone: false });
    // Bo hears it; Cy muted General; Ada wrote it
    expect(r).toMatchObject({ devices: 1, sent: 1, gone: 0 });
    expect(sent.map((s) => s.endpoint)).toEqual([device("bo-phone").endpoint]);
    expect(sent[0].payload).toMatchObject({ title: "Ada in General", body: "Morning team", url: "/savvy-hq/chat?c=general" });

    sent.length = 0;
    const r2 = await push.pushMessage({ id: "general", name: "General" }, { id: ada, name: "Ada Owner" }, { by: ada, text: "@Cy Quiet over to you", files: [], mentions: [cy], everyone: false });
    expect(r2).toMatchObject({ devices: 3, sent: 2, gone: 1 });
    expect(sent.find((s) => s.endpoint.endsWith("cy-laptop"))!.payload.title).toBe("Ada mentioned you in General");
    expect(await push.deviceMode(cy, device("gone").endpoint)).toBeNull();
  });

  it("stops for a device that turns it off, and for people switched off in HQ", async () => {
    await push.removeDevice(bo, device("bo-phone").endpoint);
    const { connect: c } = await import("../driver");
    await c(url).query(`update desk_users set active = false where id = $1`, [cy]);
    sent.length = 0;
    const r = await push.pushMessage({ id: "wins", name: "Wins" }, { id: ada, name: "Ada Owner" }, { by: ada, text: "A win", files: [], mentions: [], everyone: true });
    expect(r.devices).toBe(0);
    expect(sent).toEqual([]);
  });

  it("does nothing without push keys", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect(push.pushConfigured()).toBe(false);
    expect(await push.pushMessage({ id: "wins", name: "Wins" }, { id: bo, name: "Bo" }, { by: bo, text: "x", files: [], mentions: [], everyone: true })).toMatchObject({ devices: 0 });
  });
});
