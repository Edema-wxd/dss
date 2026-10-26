import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

// Team logins for the desk. Accounts live in desk_users; a session is a random token in an
// httpOnly cookie, stored hashed in desk_sessions so a database leak can't be replayed.

export const SESSION_COOKIE = "dss_desk";
const SESSION_DAYS = 14;

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

async function checkPassword(password: string, stored: string) {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = await scrypt(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export type DeskUser = { id: number; name: string; email: string; role: string };

export async function countUsers() {
  const rows = await (await db()).query(`select count(*)::int as n from desk_users`);
  return (rows[0] as { n: number }).n;
}

export async function listUsers() {
  return (await (await db()).query(`select id::int, name, email, role from desk_users order by id`)) as DeskUser[];
}

export async function createUser(u: { name: string; email: string; password: string; role?: string }) {
  await (await db()).query(`insert into desk_users (name, email, role, password_hash) values ($1, lower($2), $3, $4)`, [
    u.name.trim(),
    u.email.trim(),
    u.role ?? "team",
    await hashPassword(u.password),
  ]);
}

export async function deleteUser(id: number) {
  await (await db()).query(`delete from desk_users where id = $1`, [id]);
}

export async function signIn(email: string, password: string) {
  const rows = (await (await db()).query(`select id::int, password_hash from desk_users where email = lower($1)`, [
    email.trim(),
  ])) as { id: number; password_hash: string }[];
  const user = rows[0];
  // still hash when the account doesn't exist, so timing doesn't reveal which emails are real
  const ok = user ? await checkPassword(password, user.password_hash) : (await hashPassword(password), false);
  if (!user || !ok) return false;
  await startSession(user.id);
  return true;
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  const q = await db();
  await q.query(`delete from desk_sessions where expires < now()`);
  await q.query(`insert into desk_sessions (token_hash, user_id, expires) values ($1, $2, $3)`, [sha256(token), userId, expires]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await db()).query(`delete from desk_sessions where token_hash = $1`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in team member, or null. */
export async function currentUser(): Promise<DeskUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = (await (await db()).query(
    `select u.id::int, u.name, u.email, u.role from desk_sessions s join desk_users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires > now()`,
    [sha256(token)],
  )) as DeskUser[];
  return rows[0] ?? null;
}

/** For pages and actions: the signed-in team member, or a redirect to the login page. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  return user;
}
