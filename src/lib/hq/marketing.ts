import "server-only";
import { db } from "../desk/db";
import { newId } from "./data";
import type { DailyStat, MonthStat } from "./marketing-model";
import { type FieldMap, patchRow } from "./sales";

// The Marketing dashboard's data. Callers check access first.

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const METRIC_COLS = `followers, reach, impressions, engagements, posts, profile_visits as "profileVisits", link_clicks as "linkClicks", leads`;
const nums = <T extends Record<string, unknown>>(r: T, keys: string[]) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, keys.includes(k) ? num(v) : v])) as T;
const METRIC_KEYS = ["followers", "reach", "impressions", "engagements", "posts", "profileVisits", "linkClicks", "leads"];

/* ── Accounts and their numbers ──────────────────────────────────────── */

export type Account = { id: string; platform: string; handle: string; url: string; goal: number | null; ownerId: number | null };

export async function listAccounts(): Promise<Account[]> {
  const rows = await (await db()).query(`select id, platform, handle, url, goal, owner_id::int as "ownerId" from hq_mkt_accounts order by platform, handle`);
  return rows.map((r) => ({ ...r, goal: num(r.goal) })) as Account[];
}

const ACCOUNT_FIELDS: FieldMap = { platform: ["platform", "text"], handle: ["handle", "text"], url: ["url", "text"], goal: ["goal", "numeric"], ownerId: ["owner_id", "bigint"] };

export async function saveAccount(id: string | null, a: Partial<Account>, by: number) {
  const aid = id ?? (a.platform ? `${a.platform}-${newId().slice(0, 6)}` : newId());
  if (!id) await (await db()).query(`insert into hq_mkt_accounts (id, platform, created_by) values ($1, $2, $3)`, [aid, a.platform ?? "instagram", by]);
  await patchRow("hq_mkt_accounts", aid, a, ACCOUNT_FIELDS);
  return aid;
}

export async function deleteAccount(id: string) {
  await (await db()).query(`delete from hq_mkt_accounts where id = $1`, [id]);
}

export type MonthStatRow = MonthStat & { profileVisits: number | null; at: string };

export async function listMonthStats(): Promise<MonthStatRow[]> {
  const rows = await (await db()).query(`select account_id as "accountId", month, ${METRIC_COLS}, source, ${iso("at")} as at from hq_mkt_stats order by month`);
  return rows.map((r) => nums(r, METRIC_KEYS)) as MonthStatRow[];
}

/** Daily numbers from the feed, for the last 200 days. */
export async function listDailyStats(): Promise<DailyStat[]> {
  const rows = await (await db()).query(
    `select account_id as "accountId", ${day("date")} as date, ${METRIC_COLS} from hq_mkt_daily where date >= current_date - 200 order by date`,
  );
  return rows.map((r) => nums(r, METRIC_KEYS)) as DailyStat[];
}

/** Typed-in monthly numbers replace that month's row, as HQ's form did. */
export async function saveMonthStats(accountId: string, month: string, m: Record<string, number | null>, by: number) {
  await (await db()).query(
    `insert into hq_mkt_stats (account_id, month, followers, reach, impressions, engagements, posts, profile_visits, link_clicks, leads, source, at, by_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', now(), $11)
     on conflict (account_id, month) do update set followers = excluded.followers, reach = excluded.reach, impressions = excluded.impressions,
       engagements = excluded.engagements, posts = excluded.posts, profile_visits = excluded.profile_visits, link_clicks = excluded.link_clicks,
       leads = excluded.leads, source = 'manual', at = now(), by_id = excluded.by_id`,
    [accountId, month, m.followers, m.reach, m.impressions, m.engagements, m.posts, m.profileVisits, m.linkClicks, m.leads, by],
  );
}

/* ── Posts ───────────────────────────────────────────────────────────── */

export type Post = {
  id: string;
  title: string;
  platform: string;
  format: string;
  date: string;
  time: string;
  status: string;
  pillar: string;
  ownerId: number | null;
  link: string;
  caption: string;
  reach: number | null;
  engagements: number | null;
  saves: number | null;
  leads: number | null;
  source: string;
};

export async function listPosts(): Promise<Post[]> {
  const rows = await (await db()).query(
    `select id, title, platform, format, ${day("date")} as date, time, status, pillar, owner_id::int as "ownerId", link, caption, reach, engagements, saves, leads, source
     from hq_mkt_posts order by date nulls last, time`,
  );
  return rows.map((r) => nums(r, ["reach", "engagements", "saves", "leads"])) as Post[];
}

const POST_FIELDS: FieldMap = {
  title: ["title", "text"],
  platform: ["platform", "text"],
  format: ["format", "text"],
  date: ["date", "date"],
  time: ["time", "text"],
  status: ["status", "text"],
  pillar: ["pillar", "text"],
  ownerId: ["owner_id", "bigint"],
  link: ["link", "text"],
  caption: ["caption", "text"],
  reach: ["reach", "numeric"],
  engagements: ["engagements", "numeric"],
  saves: ["saves", "numeric"],
  leads: ["leads", "numeric"],
};

export async function savePost(id: string | null, p: Partial<Post>, by: number) {
  const pid = id ?? newId();
  if (!id) await (await db()).query(`insert into hq_mkt_posts (id, created_by) values ($1, $2)`, [pid, by]);
  await patchRow("hq_mkt_posts", pid, p, POST_FIELDS);
  return pid;
}

export async function deletePost(id: string) {
  await (await db()).query(`delete from hq_mkt_posts where id = $1`, [id]);
}

/* ── Website, sync status ────────────────────────────────────────────── */

export type WebMonth = {
  sessions?: number | null;
  users?: number | null;
  newUsers?: number | null;
  engagementRate?: number | null;
  avgEngagementSeconds?: number | null;
  keyEvents?: number | null;
  topKeyEvent?: string;
  pages?: { path: string; title: string; views: number; users: number }[];
  sources?: { source: string; sessions: number; keyEvents?: number }[];
};

export async function listWeb(): Promise<Record<string, WebMonth>> {
  const rows = await (await db()).query(`select month, data from hq_mkt_web order by month`);
  return Object.fromEntries(rows.map((r) => [r.month, r.data as WebMonth]));
}

export type SyncState = { platform: string; status: string; lastSuccessAt: string; message: string; rows: number | null };

export async function listSync(): Promise<SyncState[]> {
  return (await (await db()).query(`select platform, status, ${iso("last_success_at")} as "lastSuccessAt", message, rows from hq_mkt_sync`)) as SyncState[];
}

/* ── Ads ─────────────────────────────────────────────────────────────── */

export type Ad = {
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  currency: string;
  start: string;
  end: string;
  budget: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  conversions: number | null;
  revenue: number | null;
  notes: string;
  clientId: string | null;
  /** how much of `spend` is already in Finance as Paid ads */
  loggedSpend: number | null;
};

const AD_NUMS = ["budget", "spend", "impressions", "clicks", "leads", "conversions", "revenue"];
const AD_READ = [...AD_NUMS, "loggedSpend"];

export async function listAds(): Promise<Ad[]> {
  const rows = await (await db()).query(
    `select id, name, platform, objective, status, currency, ${day("start_date")} as start, ${day("end_date")} as "end", ${AD_NUMS.join(", ")}, notes, client_id as "clientId",
       logged_spend as "loggedSpend"
     from hq_mkt_ads order by start_date desc nulls last`,
  );
  return rows.map((r) => nums(r, AD_READ)) as Ad[];
}

const AD_FIELDS: FieldMap = {
  name: ["name", "text"],
  platform: ["platform", "text"],
  objective: ["objective", "text"],
  status: ["status", "text"],
  currency: ["currency", "text"],
  start: ["start_date", "date"],
  end: ["end_date", "date"],
  notes: ["notes", "text"],
  clientId: ["client_id", "text"],
  loggedSpend: ["logged_spend", "numeric"],
  ...Object.fromEntries(AD_NUMS.map((k) => [k, [k, "numeric"] as const])),
};

export async function saveAd(id: string | null, a: Partial<Ad>, by: number) {
  const aid = id ?? newId();
  if (!id) await (await db()).query(`insert into hq_mkt_ads (id, name, created_by) values ($1, $2, $3)`, [aid, a.name ?? "", by]);
  await patchRow("hq_mkt_ads", aid, a, AD_FIELDS);
  return aid;
}

export async function deleteAd(id: string) {
  await (await db()).query(`delete from hq_mkt_ads where id = $1`, [id]);
}

/* ── News ────────────────────────────────────────────────────────────── */

export type NewsItem = { id: string; date: string; title: string; url: string; source: string; summary: string; soWhat: string; tag: string; addedBy: string };

export async function listNews(): Promise<NewsItem[]> {
  return (await (await db()).query(
    `select id, ${day("date")} as date, title, url, source, summary, so_what as "soWhat", tag, added_by as "addedBy" from hq_mkt_news order by date desc nulls last limit 80`,
  )) as NewsItem[];
}

export async function addNews(n: Omit<NewsItem, "id">) {
  const id = newId();
  await (await db()).query(
    `insert into hq_mkt_news (id, date, title, url, source, summary, so_what, tag, added_by) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)`,
    [id, n.date, n.title, n.url, n.source, n.summary, n.soWhat, n.tag, n.addedBy],
  );
  return id;
}

export async function getNews(id: string) {
  return (await listNews()).find((n) => n.id === id) ?? null;
}

export async function deleteNews(id: string) {
  await (await db()).query(`delete from hq_mkt_news where id = $1`, [id]);
}
