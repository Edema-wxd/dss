import { isOwner } from "@/lib/hq/access";
import { cronAllowed, siteUrl } from "@/lib/hq/cron";
import { listPeople, listTasks } from "@/lib/hq/data";
import { checkinEmail } from "@/lib/hq/emails";
import { linksConfigured, signAction } from "@/lib/hq/tokens";
import { lagosToday, nextWorkingDay } from "@/lib/hq/work";
import { sendHqMail } from "@/lib/mail";

// Weekdays at 18:56 Lagos (vercel.json): the end of day check-in for each owner, replacing the
// Claude scheduled task that messaged Jane at 7pm. Her answers are the one-tap links, or End of day in HQ.

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not allowed", { status: 401 });
  const today = lagosToday();
  const next = nextWorkingDay(today);
  const exp = Math.floor(Date.now() / 1000) + 3 * 86400;
  const site = siteUrl();
  const owners = (await listPeople()).filter((p) => p.active && isOwner(p.roles) && p.notifyMode !== "off" && (p.notifyEmail || p.email));
  const sent: string[] = [];
  for (const p of owners) {
    const tasks = await listTasks({ assigneeId: p.id, doneSince: today });
    const link = (task: string, action: "done" | "carry" | "drop") =>
      linksConfigured() ? `${site}/savvy-hq/act/${encodeURIComponent(signAction({ task, action, user: p.id, exp, ...(action === "carry" ? { to: next } : {}) }))}` : null;
    const mail = checkinEmail({ firstName: p.name.split(" ")[0], today, next, tasks, site, link });
    if (await sendHqMail({ kind: "hq.checkin", to: p.notifyEmail || p.email, ...mail })) sent.push(p.email);
  }
  return Response.json({ ok: true, sent: sent.length, owners: owners.length });
}
