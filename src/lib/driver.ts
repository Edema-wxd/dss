import { neon } from "@neondatabase/serverless";
import pg from "pg";

// One way to run SQL, whichever database DATABASE_URL points at.
// Neon (production and dev branches) is reached over HTTP with the serverless driver.
// A local Postgres (development, CI and the browser tests) is reached with node-postgres,
// because the HTTP driver only speaks to Neon.
//
// No "server-only" import here: the import script and the tests run this file directly in Node.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export type Sql = { query: (text: string, params?: unknown[]) => Promise<Row[]> };

const LOCAL_HOST = /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;

/** True for a Postgres on this machine (a host name of localhost, or a Unix socket). */
export const isLocalUrl = (url: string) => LOCAL_HOST.test(url) || /[?&]host=\//.test(url);

/** The host and database name, for messages. Never the password. */
export function describeUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname || u.searchParams.get("host") || "local socket"}${u.pathname}`;
  } catch {
    return "an unreadable DATABASE_URL";
  }
}

const pools = new Map<string, pg.Pool>();

export function connect(url: string): Sql {
  if (isLocalUrl(url)) {
    let pool = pools.get(url);
    if (!pool) {
      pool = new pg.Pool({ connectionString: url, max: 5 });
      pools.set(url, pool);
    }
    const p = pool;
    return { query: async (text, params) => (await p.query(text, params)).rows };
  }
  const run = neon(url);
  return { query: (text, params) => run.query(text, params) as Promise<Row[]> };
}

/** Closes local connections so a script or test run can exit. */
export async function disconnect() {
  await Promise.all([...pools.values()].map((p) => p.end()));
  pools.clear();
}
