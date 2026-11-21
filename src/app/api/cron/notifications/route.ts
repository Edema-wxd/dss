import { cronAllowed } from "@/lib/hq/cron";
import { claimMorning, sendMorning, sendQueue } from "@/lib/hq/digest";
import { isMorningRun } from "@/lib/hq/digest-model";
import { lagosHour, lagosToday } from "@/lib/hq/work";
import { mailConfigured } from "@/lib/mail";

// Every two hours from 07:03 to 21:03 Lagos (eight daily entries in vercel.json, so it also runs
// on a Hobby plan): sends the queued update emails, and on the first run of the day the morning
// summary. "?morning=1" sends today's summary from a later run if the morning one didn't happen;
// it still goes out only once a day.

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not allowed", { status: 401 });
  // without SMTP nothing could go out: leave the queue and today's summary for when it's set up
  if (!mailConfigured()) return Response.json({ ok: false, error: "Email isn't set up on this server." }, { status: 503 });
  const today = lagosToday();
  const wantMorning = isMorningRun(lagosHour()) || new URL(req.url).searchParams.get("morning") === "1";
  const morning = wantMorning && (await claimMorning(today)) ? await sendMorning(today) : null;
  const updates = await sendQueue();
  return Response.json({ ok: true, today, updates, morning });
}
