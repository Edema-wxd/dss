import { cronAllowed } from "@/lib/hq/cron";
import { syncBooked } from "@/lib/hq/finance";
import { refreshRecordsSheet } from "@/lib/hq/records-sheet";
import { mirrorConfigured } from "@/lib/desk/sheets";

// Nightly at 23:17 Lagos (vercel.json). Two jobs:
// 1. Files the month's retainers in Finance, so a month nobody opened Finance in still counts them.
// 2. Refreshes the read-only "DSS HQ Records" copy of HQ, replacing HQ's scheduled task 04.
//    HQ_RECORDS_SHEET_ID names the sheet, shared with the service account as an Editor.

export async function GET(req: Request) {
  if (!cronAllowed(req)) return new Response("Not allowed", { status: 401 });
  const booked = await syncBooked();
  const id = process.env.HQ_RECORDS_SHEET_ID;
  if (!mirrorConfigured() || !id) return Response.json({ ok: false, booked, reason: "The Records sheet or the Google service account isn't set up." });
  try {
    return Response.json({ ...(await refreshRecordsSheet(id)), booked });
  } catch (e) {
    return Response.json({ ok: false, booked, reason: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
