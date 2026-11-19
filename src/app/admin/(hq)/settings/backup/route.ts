import { currentUser } from "@/lib/desk/auth";
import * as store from "@/lib/desk/db";
import { isOwner } from "@/lib/hq/access";
import { backupData, patchGeneral } from "@/lib/hq/data";
import { lagosToday } from "@/lib/hq/work";

// The owner's monthly backup: every HQ table as one JSON file, to keep in Google Drive.
// Passwords and sign-in sessions are never included. Downloading it records the date, which
// the reminder email on the 1st of the month checks.

export async function GET() {
  const user = await currentUser();
  if (!user || !isOwner(user.roles)) return new Response("Only an owner can download a backup.", { status: 403 });
  const tables = await backupData();
  const at = new Date().toISOString();
  await patchGeneral({ lastBackup: at }, user.id);
  await store.audit({ actor: user.name, actorEmail: user.email, action: "backup.download", target: "backup", summary: `${user.name} downloaded a backup`, changes: null });
  const body = JSON.stringify({ app: "DSS HQ", exportedAt: at, by: user.email, tables }, null, 1);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="dss-hq-backup-${lagosToday()}.json"`,
      "cache-control": "no-store",
    },
  });
}
