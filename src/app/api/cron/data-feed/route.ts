import { cronAllowed } from "@/lib/hq/cron";
import { getGeneral } from "@/lib/hq/data";
import { runDataFeed } from "@/lib/hq/data-feed";
import { mirrorConfigured } from "@/lib/desk/sheets";

// Daily at 06:17 Lagos (vercel.json): copies the DSS HQ Data Feed sheet into Marketing,
// replacing HQ's scheduled task 02. Uses the same Google service account as the desk's sheet copy.

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not allowed", { status: 401 });
  if (!mirrorConfigured()) return Response.json({ ok: false, reason: "The Google service account isn't set up." });
  const sheet = (await getGeneral()).dataFeed;
  if (!sheet) return Response.json({ ok: false, reason: "No data feed sheet is set in HQ settings." });
  try {
    return Response.json(await runDataFeed(sheet));
  } catch (e) {
    return Response.json({ ok: false, reason: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
