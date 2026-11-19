import { isOwner } from "@/lib/hq/access";
import { cronAllowed, siteUrl } from "@/lib/hq/cron";
import { getGeneral, listPeople } from "@/lib/hq/data";
import { backupDue, backupReminderEmail } from "@/lib/hq/emails";
import { sendHqMail } from "@/lib/mail";

// The 1st of each month at 07:03 Lagos (vercel.json): if the last backup is over 30 days old,
// remind the owners to download one from Settings.

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not allowed", { status: 401 });
  const { due, days } = backupDue((await getGeneral()).lastBackup);
  if (!due) return Response.json({ ok: true, sent: 0, reason: "A backup was taken in the last 30 days." });
  const owners = (await listPeople()).filter((p) => p.active && isOwner(p.roles) && (p.notifyEmail || p.email));
  let sent = 0;
  for (const p of owners) {
    const mail = backupReminderEmail({ firstName: p.name.split(" ")[0], site: siteUrl(), daysSince: days });
    if (await sendHqMail({ kind: "hq.backup", to: p.notifyEmail || p.email, ...mail })) sent++;
  }
  return Response.json({ ok: true, sent });
}
