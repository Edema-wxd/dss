import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, disconnect, isLocalUrl } from "../driver";

// The daily data feed sync against a real Postgres, with a made-up sheet in place of Google.

const url = process.env.TEST_DATABASE_URL ?? "";
const usable = isLocalUrl(url) && /test/.test(new URL(url).pathname);

const SHEET: Record<string, string[][]> = {
  accounts_monthly: [
    ["platform", "handle", "month", "followers", "reach", "views", "engagements", "posts", "profile_visits", "link_clicks", "leads", "synced_at"],
    ["instagram", "@test", "2026-10", "1,000", "3000", "9000", "300", "12", "50", "20", "", "2026-11-01T06:00:00Z"],
    ["instagram", "@example", "2026-11", "1", "1", "1", "1", "1", "1", "1", "1", "2026-11-30T23:10:00Z"],
  ],
  accounts_daily: [["platform", "handle", "date", "followers", "reach", "views", "engagements", "synced_at"]],
  posts: [
    ["platform", "post_id", "caption", "format", "published_at", "permalink", "reach", "engagements", "saves", "leads"],
    ["instagram", "p1", "A launch story", "Reel", "2026-10-05T18:30:00Z", "https://example.test/p1", "800", "90", "10", "1"],
  ],
  website_monthly: [["month", "sessions", "users", "engagement_rate"], ["2026-10", "1200", "900", "0.55"]],
  website_pages: [["month", "path", "title", "views", "users"], ["2026-10", "/", "Home", "700", "500"]],
  website_sources: [["month", "source", "sessions"], ["2026-10", "google", "600"]],
  sync_status: [["platform", "status", "last_success_at", "message", "rows_written"], ["instagram", "ok", "2026-11-01T06:00:00Z", "", "3"]],
};

vi.mock("../desk/sheets", () => ({ readSheetRanges: async () => SHEET }));

describe.skipIf(!usable)("the data feed sync", () => {
  let sql: ReturnType<typeof connect>;
  let feed: typeof import("./data-feed");

  beforeAll(async () => {
    sql = connect(url);
    await sql.query(`drop schema public cascade`);
    await sql.query(`create schema public`);
    process.env.DATABASE_URL = url;
    feed = await import("./data-feed");
  });

  afterAll(() => disconnect());

  it("creates the account, monthly numbers, posts, website and status", async () => {
    const r = await feed.runDataFeed("sheet-id");
    expect(r.written).toMatchObject({ accounts: 1, stats: 1, posts: 1, web: 1, sync: 1 });
    expect(await sql.query(`select account_id, month, followers::int, impressions::int, source from hq_mkt_stats`)).toEqual([
      { account_id: "instagram-main", month: "2026-10", followers: 1000, impressions: 9000, source: "api" },
    ]);
    expect((await sql.query(`select title, date::text, time, status from hq_mkt_posts`))[0]).toEqual({ title: "A launch story", date: "2026-10-05", time: "18:30", status: "published" });
    expect((await sql.query(`select data from hq_mkt_web`))[0].data).toMatchObject({ sessions: 1200, engagementRate: 0.55, pages: [{ path: "/", views: 700 }] });
  });

  it("keeps typed-in leads and team edits to a post when it runs again", async () => {
    await sql.query(`update hq_mkt_stats set leads = 4`);
    await sql.query(`update hq_mkt_posts set title = 'Edited by the team', pillar = 'Education'`);
    await feed.runDataFeed("sheet-id");
    expect((await sql.query(`select leads::int from hq_mkt_stats`))[0].leads).toBe(4);
    expect((await sql.query(`select title, pillar, reach::int from hq_mkt_posts`))[0]).toEqual({ title: "Edited by the team", pillar: "Education", reach: 800 });
    expect((await sql.query(`select count(*)::int as n from hq_mkt_accounts`))[0].n).toBe(1);
  });
});
