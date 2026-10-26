import { Suspense } from "react";
import { Desk } from "@/components/desk/desk";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { TEAM } from "@/lib/desk/model";
import { NotConfiguredError, loadDesk } from "@/lib/desk/db";
import { listUsers, requireUser } from "@/lib/desk/auth";
import { lastSync, mirrorConfigured, sheetUrl } from "@/lib/desk/sheets";

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate">Opening the desk…</p>}>
      <DeskLoader />
    </Suspense>
  );
}

async function DeskLoader() {
  let loaded;
  try {
    const user = await requireUser();
    const [data, users, synced] = await Promise.all([loadDesk(), listUsers(), lastSync()]);
    loaded = { user, data, users, sheet: { configured: mirrorConfigured(), url: sheetUrl(), last: synced } };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  const { user, data, users, sheet } = loaded;
  const team = [...new Set([...TEAM, ...users.map((u) => u.name.split(" ")[0])])];
  return <Desk data={data} user={user} users={users} team={team} sheet={sheet} />;
}
