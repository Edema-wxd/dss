import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { SettingsView } from "@/components/hq/settings";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canEditGoals, isOwner } from "@/lib/hq/access";
import { WORKDAY_DEFAULTS, getGeneral, listPeople } from "@/lib/hq/data";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-[1000px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Settings" lead="Your profile, and the goals and working hours the whole team runs on." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading settings…</p>}>
        <Settings />
      </Suspense>
    </main>
  );
}

async function Settings() {
  let props;
  try {
    const user = await requireModule("settings");
    const [people, general] = await Promise.all([listPeople(), getGeneral()]);
    const me = people.find((p) => p.id === user.id)!;
    const last = general.lastBackup ? Date.parse(general.lastBackup) : NaN;
    props = {
      me,
      canEditGoals: canEditGoals(user.roles),
      owner: isOwner(user.roles),
      general,
      workday: { ...WORKDAY_DEFAULTS, ...general.workday },
      // eslint-disable-next-line react-hooks/purity -- a server render reads the clock once, on purpose
      backupDays: Number.isNaN(last) ? null : Math.floor((Date.now() - last) / 864e5),
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <SettingsView {...props} />;
}
