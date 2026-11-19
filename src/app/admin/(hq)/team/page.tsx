import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PageHeader } from "@/components/hq/shell";
import { TeamView } from "@/components/hq/team";
import { NotConfiguredError } from "@/lib/desk/db";
import { listUsers, requireModule } from "@/lib/desk/auth";
import { lastSync, mirrorConfigured, sheetUrl } from "@/lib/desk/sheets";
import { canUse, isOwner } from "@/lib/hq/access";

export default function TeamPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Team" lead="Who can open HQ, what each person's roles let them see, and how the website connects." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the team…</p>}>
        <Team />
      </Suspense>
    </main>
  );
}

async function Team() {
  let loaded;
  try {
    const me = await requireModule("team");
    const [members, synced] = await Promise.all([listUsers(), lastSync()]);
    loaded = { me, members, synced };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  const { me, members, synced } = loaded;
  return (
    <TeamView
      me={me}
      members={members}
      canManage={isOwner(me.roles)}
      canSync={canUse(me.roles, "sessions")}
      sheet={{ configured: mirrorConfigured(), url: sheetUrl(), last: synced }}
    />
  );
}
