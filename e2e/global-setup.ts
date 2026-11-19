import { connect, disconnect, isLocalUrl } from "../src/lib/driver";
import { E2E_DATABASE_URL } from "../playwright.config";

/** Wipes the browser-test database. Refuses anything that isn't a local database named for tests. */
export default async function globalSetup() {
  const url = E2E_DATABASE_URL;
  if (!isLocalUrl(url) || !/e2e/.test(new URL(url).pathname)) {
    throw new Error("E2E_DATABASE_URL must be a local Postgres database with e2e in its name. It is wiped before every run.");
  }
  const sql = connect(url);
  await sql.query(`drop schema public cascade`);
  await sql.query(`create schema public`);
  await disconnect();
}
