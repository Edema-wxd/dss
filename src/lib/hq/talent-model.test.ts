import { describe, expect, it } from "vitest";
import { addToList, followerChange, mediaStatusAfterPitch, rateText, totalFollowers, withFollowerPoint } from "./talent-model";

describe("follower history", () => {
  it("keeps one point a day and the last 24", () => {
    let h = withFollowerPoint([], "2026-10-01", 100);
    h = withFollowerPoint(h, "2026-11-01", 150);
    h = withFollowerPoint(h, "2026-11-01", 160);
    expect(h).toEqual([
      { d: "2026-10-01", f: 100 },
      { d: "2026-11-01", f: 160 },
    ]);
    const long = Array.from({ length: 30 }, (_, i) => ({ d: `2026-01-${String(i + 1).padStart(2, "0")}`, f: i }));
    expect(withFollowerPoint(long, "2026-02-01", 99)).toHaveLength(24);
  });
  it("reports the change between the last two counts", () => {
    expect(followerChange([{ d: "2026-10-01", f: 100 }, { d: "2026-11-01", f: 160 }])).toEqual({ diff: 60, since: "2026-10-01" });
    expect(followerChange([{ d: "2026-10-01", f: 100 }])).toBeNull();
    expect(followerChange([{ d: "a", f: 5 }, { d: "b", f: 5 }])).toBeNull();
  });
  it("adds up reach across accounts", () => {
    expect(totalFollowers([{ id: "a", platform: "Instagram", handle: "", followers: 1200 }, { id: "b", platform: "TikTok", handle: "", followers: null }])).toBe(1200);
  });
});

describe("rate card text", () => {
  it("groups by platform and signs off as DSS", () => {
    const text = rateText(
      "Test Talent",
      [
        { id: "1", item: "Reel", platform: "Instagram", price: 500, currency: "NGN", notes: "30 days usage" },
        { id: "2", item: "Story set", platform: "Instagram", price: 200, currency: "NGN" },
        { id: "3", item: "Video", platform: "TikTok", price: 300, currency: "NGN" },
      ],
      "Prices exclude VAT.",
      (n) => `N${n}`,
    );
    expect(text).toBe(
      "Test Talent: rate card\n\nInstagram\n- Reel: N500 (30 days usage)\n- Story set: N200\n\nTikTok\n- Video: N300\n\nPrices exclude VAT.\n\nManaged by Digital Savvy Studios",
    );
  });
});

describe("lists and publicity", () => {
  it("adds comma-separated items without repeats", () => {
    expect(addToList(["Fitness"], " Fitness, Gaming ,, Music")).toEqual(["Fitness", "Gaming", "Music"]);
  });
  it("warms an outlet up when it's pitched, and never cools it", () => {
    expect(mediaStatusAfterPitch("new", "pitched")).toBe("contacted");
    expect(mediaStatusAfterPitch("contacted", "published")).toBe("featured");
    expect(mediaStatusAfterPitch("warm", "pitched")).toBe("warm");
    expect(mediaStatusAfterPitch("featured", "idea")).toBe("featured");
    expect(mediaStatusAfterPitch("nofit", "pitched")).toBe("contacted");
  });
});
