import "server-only";
import { db } from "../desk/db";
import { type Role, cleanRoles } from "./access";
import { newId } from "./data";
import { type LeaveItem, type Pattern, type PatternReq, patternOf } from "./leave-model";
import { type FieldMap, patchRow } from "./sales";

// Leave, day changes, public holidays and work patterns (hq_leave and desk_users). Callers check
// access first; the rules live in leave-model.ts.

const day = (col: string) => `coalesce(to_char(${col}, 'YYYY-MM-DD'), '')`;
const iso = (col: string) => `coalesce(to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`;

const COLS = `id, user_id::int as "userId", type, ${day("start_date")} as start, ${day("end_date")} as "end", relief_id::int as "reliefId",
  relief_answer as "reliefAnswer", relief_note as "reliefNote", done_text as "doneText", todo_text as "todoText", handover, note,
  shift_from as "shiftFrom", shift_to as "shiftTo", status, reply, ${iso("created_at")} as "createdAt"`;

/** Everything from the start of last year on: enough for this year's allowance and the calendar. */
export async function listLeave(): Promise<LeaveItem[]> {
  return (await (await db()).query(
    `select ${COLS} from hq_leave where coalesce(end_date, start_date) >= date_trunc('year', now()) - interval '1 year' order by start_date`,
  )) as LeaveItem[];
}

export async function getLeave(id: string) {
  const rows = (await (await db()).query(`select ${COLS} from hq_leave where id = $1`, [id])) as LeaveItem[];
  return rows[0] ?? null;
}

export type LeaveInput = Partial<Omit<LeaveItem, "id" | "createdAt">> & { type: string; start: string };

export async function addLeave(l: LeaveInput, by: number) {
  const id = newId();
  await (await db()).query(
    `insert into hq_leave (id, user_id, type, start_date, end_date, relief_id, done_text, todo_text, handover, note, shift_from, shift_to, status, created_by)
     values ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14)`,
    [
      id, l.userId ?? null, l.type, l.start, l.end || l.start, l.reliefId ?? null, l.doneText ?? "", l.todoText ?? "", l.handover ?? [], l.note ?? "",
      l.shiftFrom ?? "", l.shiftTo ?? "", l.status ?? "pending", by,
    ],
  );
  return id;
}

const FIELDS: FieldMap = {
  status: ["status", "text"],
  reply: ["reply", "text"],
  reliefId: ["relief_id", "bigint"],
  reliefAnswer: ["relief_answer", "text"],
  reliefNote: ["relief_note", "text"],
  reviewedBy: ["reviewed_by", "bigint"],
};

export async function patchLeave(id: string, patch: Partial<LeaveItem> & { reviewedBy?: number }) {
  await patchRow("hq_leave", id, patch, FIELDS);
  const q = await db();
  if ("reliefAnswer" in patch) await q.query(`update hq_leave set relief_at = case when relief_answer = '' then null else now() end where id = $1`, [id]);
  if ("reviewedBy" in patch) await q.query(`update hq_leave set reviewed_at = now() where id = $1`, [id]);
}

export async function deleteLeave(id: string) {
  await (await db()).query(`delete from hq_leave where id = $1`, [id]);
}

/* ── Work patterns ───────────────────────────────────────────────────── */

export type TeamPerson = { id: number; name: string; roles: Role[]; title: string; pattern: Pattern; patternSet: boolean; patternReq: PatternReq | null; leaveDays: number | null };

/** Active people with their usual week. */
export async function listTeamPatterns(): Promise<TeamPerson[]> {
  const rows = await (await db()).query(
    `select id::int, name, roles, title, pattern, pattern_req as "patternReq", leave_days as "leaveDays" from desk_users where active order by name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    roles: cleanRoles(r.roles),
    title: String(r.title ?? ""),
    pattern: patternOf(r.pattern),
    patternSet: !!r.pattern,
    patternReq: r.patternReq && typeof r.patternReq === "object" ? { ...(r.patternReq as PatternReq), pattern: patternOf((r.patternReq as PatternReq).pattern) } : null,
    leaveDays: r.leaveDays === null || r.leaveDays === undefined ? null : Number(r.leaveDays),
  }));
}

export async function setPattern(userId: number, pattern: Pattern) {
  await (await db()).query(`update desk_users set pattern = $2::jsonb where id = $1`, [userId, JSON.stringify(pattern)]);
}

export async function setPatternReq(userId: number, req: PatternReq | null) {
  await (await db()).query(`update desk_users set pattern_req = $2::jsonb where id = $1`, [userId, req ? JSON.stringify(req) : null]);
}

export async function setLeaveDays(userId: number, n: number | null) {
  await (await db()).query(`update desk_users set leave_days = $2 where id = $1`, [userId, n]);
}

/* ── Relief cover ────────────────────────────────────────────────────── */

/** The roles of everyone this person is the relief for on approved leave covering `day`. */
export async function borrowedRoles(userId: number, on: string): Promise<{ absentId: number; name: string; roles: Role[]; end: string }[]> {
  const rows = await (await db()).query(
    `select a.id::int as "absentId", a.name, a.roles, ${day("coalesce(l.end_date, l.start_date)")} as "end"
     from hq_leave l join desk_users a on a.id = l.user_id
     where l.relief_id = $1 and l.user_id <> $1 and l.status = 'approved' and l.type <> 'shift'
       and $2::date between l.start_date and coalesce(l.end_date, l.start_date)`,
    [userId, on],
  );
  return rows.map((r) => ({ absentId: Number(r.absentId), name: String(r.name), roles: cleanRoles(r.roles), end: String(r.end) }));
}
