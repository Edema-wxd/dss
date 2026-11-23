import "server-only";
import type { DeskUser } from "@/lib/desk/auth";
import { isOwner } from "@/lib/hq/access";
import { listLeave, listTeamPatterns } from "@/lib/hq/leave";
import { listTime, workday } from "@/lib/hq/time";
import { seesTeamTime } from "@/lib/hq/time-model";
import { addDays, lagosToday } from "@/lib/hq/work";

/**
 * Whose days someone can see: leads (Owner, Admin, Operations (EA), Project Manager) see the team
 * without Contractors, and the owner only once she has used the clock. Everyone else sees their own.
 */
export async function loadAttendance(user: DeskUser) {
  const today = lagosToday();
  const lead = seesTeamTime(user.roles);
  const [team, items, w] = await Promise.all([listTeamPatterns(), listLeave(), workday()]);
  const since = addDays(today, -70);
  const rows = await listTime(since, lead ? undefined : [user.id]);
  const used = new Set(rows.map((r) => r.userId));
  const people = (lead ? team.filter((p) => !p.roles.includes("Contractor") && (!isOwner(p.roles) || used.has(p.id))) : team.filter((p) => p.id === user.id)).map((p) => ({
    id: p.id,
    name: p.name,
    roles: p.roles as string[],
    pattern: p.pattern,
  }));
  const ids = new Set(people.map((p) => p.id));
  return { today, lead, workday: w, people, items, rows: rows.filter((r) => ids.has(r.userId)) };
}
