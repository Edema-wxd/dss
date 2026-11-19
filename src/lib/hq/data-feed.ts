import "server-only";
import { db } from "../desk/db";
import { readSheetRanges } from "../desk/sheets";
import { captionTitle, sheetNum, sheetRows } from "./marketing-model";

// The daily social and website sync (HQ's scheduled task 02): copies the "DSS HQ Data Feed"
// Google Sheet into the Marketing tables. Never deletes anything. Typed-in numbers stay unless
// the feed sends that account and month.

const RANGES = ["accounts_monthly!A1:M", "accounts_daily!A1:M", "posts!A1:O", "website_monthly!A1:J", "website_pages!A1:F", "website_sources!A1:F", "sync_status!A1:E"];
const METRICS = ["followers", "reach", "impressions", "engagements", "posts", "profile_visits", "link_clicks", "leads"] as const;

type Row = Record<string, string>;
const metricsOf = (r: Row) => [r.followers, r.reach, r.views, r.engagements, r.posts, r.profile_visits, r.link_clicks, r.leads].map(sheetNum);

export async function runDataFeed(spreadsheetId: string) {
  const tabs = await readSheetRanges(spreadsheetId, RANGES);
  const rows = Object.fromEntries(Object.entries(tabs).map(([k, v]) => [k, sheetRows(v)])) as Record<string, Row[]>;
  const read = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length]));
  if (!Object.values(rows).some((v) => v.length)) return { ok: true, read, written: {}, note: "Nothing to sync yet" };
  const q = await db();
  const written: Record<string, number> = {};
  const count = (k: string) => (written[k] = (written[k] ?? 0) + 1);

  // the account a row belongs to: same platform (and handle when there are several), else a new "<platform>-main"
  const accounts = (await q.query(`select id, platform, handle from hq_mkt_accounts`)) as { id: string; platform: string; handle: string }[];
  const accountFor = async (r: Row) => {
    const platform = (r.platform || "").toLowerCase();
    if (!platform) return null;
    const same = accounts.filter((a) => a.platform === platform);
    const hit = same.length > 1 ? same.find((a) => a.handle === r.handle) ?? same[0] : same[0];
    if (hit) return hit.id;
    const id = `${platform}-main`;
    await q.query(`insert into hq_mkt_accounts (id, platform, handle) values ($1, $2, $3) on conflict (id) do nothing`, [id, platform, r.handle ?? ""]);
    accounts.push({ id, platform, handle: r.handle ?? "" });
    count("accounts");
    return id;
  };

  for (const r of rows.accounts_monthly ?? []) {
    const acc = await accountFor(r);
    if (!acc || !/^\d{4}-\d{2}$/.test(r.month ?? "")) continue;
    // an empty leads cell keeps leads someone typed in
    await q.query(
      `insert into hq_mkt_stats (account_id, month, ${METRICS.join(", ")}, source, at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'api', coalesce($11::timestamptz, now()))
       on conflict (account_id, month) do update set followers = excluded.followers, reach = excluded.reach, impressions = excluded.impressions,
         engagements = excluded.engagements, posts = excluded.posts, profile_visits = excluded.profile_visits, link_clicks = excluded.link_clicks,
         leads = coalesce(excluded.leads, hq_mkt_stats.leads), source = 'api', at = excluded.at`,
      [acc, r.month, ...metricsOf(r), r.synced_at || null],
    );
    count("stats");
  }

  const since = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  for (const r of rows.accounts_daily ?? []) {
    const acc = await accountFor(r);
    if (!acc || !/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "") || r.date < since) continue;
    await q.query(
      `insert into hq_mkt_daily (account_id, date, ${METRICS.join(", ")}, source, at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'api', coalesce($11::timestamptz, now()))
       on conflict (account_id, date) do update set followers = excluded.followers, reach = excluded.reach, impressions = excluded.impressions,
         engagements = excluded.engagements, posts = excluded.posts, profile_visits = excluded.profile_visits, link_clicks = excluded.link_clicks,
         leads = excluded.leads, at = excluded.at`,
      [acc, r.date, ...metricsOf(r), r.synced_at || null],
    );
    count("daily");
  }

  for (const r of rows.posts ?? []) {
    const platform = (r.platform || "").toLowerCase();
    if (!platform || !r.post_id) continue;
    const at = r.published_at || "";
    const nums = [r.reach, r.engagements, r.saves, r.leads, r.views, r.likes, r.comments, r.shares].map(sheetNum);
    // the team may have edited the title, pillar or owner, so an update only touches the numbers, link and status
    await q.query(
      `insert into hq_mkt_posts (id, title, platform, format, date, time, status, link, reach, engagements, saves, leads, views, likes, comments, shares, external_id, source)
       values ($1, $2, $3, $4, $5::date, $6, 'published', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'api')
       on conflict (id) do update set status = 'published', link = excluded.link, reach = excluded.reach, engagements = excluded.engagements,
         saves = excluded.saves, leads = excluded.leads, views = excluded.views, likes = excluded.likes, comments = excluded.comments,
         shares = excluded.shares, updated_at = now()`,
      [`ext_${platform}_${r.post_id}`, captionTitle(r.caption || ""), platform, r.format || "", /^\d{4}-\d{2}-\d{2}/.test(at) ? at.slice(0, 10) : null, at.slice(11, 16), r.permalink || "", ...nums, r.post_id],
    );
    count("posts");
  }

  for (const r of rows.website_monthly ?? []) {
    if (!/^\d{4}-\d{2}$/.test(r.month ?? "")) continue;
    const pages = (rows.website_pages ?? [])
      .filter((p) => p.month === r.month)
      .map((p) => ({ path: p.path, title: p.title, views: sheetNum(p.views) ?? 0, users: sheetNum(p.users) ?? 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 20);
    const sources = (rows.website_sources ?? [])
      .filter((p) => p.month === r.month)
      .map((p) => ({ source: p.source, sessions: sheetNum(p.sessions) ?? 0, users: sheetNum(p.users) ?? 0, keyEvents: sheetNum(p.key_events) ?? 0 }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 20);
    const data = {
      month: r.month,
      sessions: sheetNum(r.sessions),
      users: sheetNum(r.users),
      newUsers: sheetNum(r.new_users),
      engagedSessions: sheetNum(r.engaged_sessions),
      engagementRate: sheetNum(r.engagement_rate),
      avgEngagementSeconds: sheetNum(r.avg_engagement_seconds),
      keyEvents: sheetNum(r.key_events),
      topKeyEvent: r.top_key_event || "",
      pages,
      sources,
    };
    await q.query(`insert into hq_mkt_web (month, data, source, synced_at) values ($1, $2::jsonb, 'api', now()) on conflict (month) do update set data = excluded.data, synced_at = now()`, [
      r.month,
      JSON.stringify(data),
    ]);
    count("web");
  }

  for (const r of rows.sync_status ?? []) {
    if (!r.platform) continue;
    await q.query(
      `insert into hq_mkt_sync (platform, status, last_success_at, message, rows, at) values ($1, $2, $3::timestamptz, $4, $5, now())
       on conflict (platform) do update set status = excluded.status, last_success_at = excluded.last_success_at, message = excluded.message, rows = excluded.rows, at = now()`,
      [r.platform.toLowerCase(), r.status || "", r.last_success_at || null, r.message || "", sheetNum(r.rows_written)],
    );
    count("sync");
  }
  return { ok: true, read, written };
}
