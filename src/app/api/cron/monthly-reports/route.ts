import { cronAllowed } from "@/lib/hq/cron";
import { fileLastMonth } from "@/lib/hq/reports";

// On the 1st (vercel.json): files last month's reports in the archive, the way HQ filed them the
// first time someone opened HQ in a new month. Reports already filed are left alone.

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not allowed", { status: 401 });
  return Response.json({ ok: true, filed: await fileLastMonth() });
}
