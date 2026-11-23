import { Suspense } from "react";
import { Desk } from "@/components/desk/desk";
import { DeskBar } from "@/components/desk/desk-bar";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { TEAM } from "@/lib/desk/model";
import { NotConfiguredError, loadDesk } from "@/lib/desk/db";
import { listUsers, requireModule } from "@/lib/desk/auth";
import { lastSync, mirrorConfigured, sheetUrl } from "@/lib/desk/sheets";
import { mailConfigured } from "@/lib/mail";

// The Session Desk: Visibility Sessions, on its own beside DSS HQ.

export default function SessionDeskPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate">Opening Visibility Sessions…</p>}>
      <DeskLoader />
    </Suspense>
  );
}

async function DeskLoader() {
  let loaded;
  try {
    const user = await requireModule("sessions");
    const [data, users, synced] = await Promise.all([loadDesk(), listUsers(), lastSync()]);
    loaded = {
      user,
      data,
      users: users.filter((u) => u.active),
      sheet: { configured: mirrorConfigured(), url: sheetUrl(), last: synced },
      mail: { configured: mailConfigured(), from: process.env.SMTP_USER ?? "" },
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  const { user, data, users, sheet, mail } = loaded;
  const team = [...new Set([...TEAM, ...users.map((u) => u.name.split(" ")[0])])];
  return (
    <>
      <DeskBar name={user.name} roles={(user.ownRoles ?? user.roles).join(", ")} />
      <Desk data={data} user={user} team={team} sheet={sheet} mail={mail} />
    </>
  );
}
