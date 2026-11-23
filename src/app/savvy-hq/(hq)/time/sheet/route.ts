import { currentUser } from "@/lib/desk/auth";
import { canUse } from "@/lib/hq/access";
import { dayMode } from "@/lib/hq/leave-model";
import { expectedMin, timesheetRows, toCsv, weekOf } from "@/lib/hq/time-model";
import { loadAttendance } from "../load";

// The week's timesheet as CSV: the same people the Attendance page shows this person.

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || !canUse(user.roles, "time")) return new Response("Not allowed", { status: 403 });
  const offset = Math.max(-8, Math.min(0, Math.round(Number(new URL(req.url).searchParams.get("week")) || 0)));
  const a = await loadAttendance(user);
  const week = weekOf(a.today, offset);
  const byKey = new Map(a.rows.map((r) => [`${r.userId}:${r.day}`, r]));
  const pat = new Map(a.people.map((p) => [p.id, p.pattern]));
  const rows = timesheetRows(
    week,
    a.people,
    (id, d) => byKey.get(`${id}:${d}`) ?? null,
    (id, d) => expectedMin(dayMode(a.items, id, pat.get(id)!, d), a.workday),
  );
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="DSS timesheet ${week[0]} to ${week[6]}.csv"`, "cache-control": "no-store" },
  });
}
