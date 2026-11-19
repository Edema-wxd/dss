import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { SettingsView } from "@/components/hq/settings";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canEditGoals, canUse, isOwner } from "@/lib/hq/access";
import { WORKDAY_DEFAULTS, getGeneral, listPeople } from "@/lib/hq/data";
import { getFinSettings } from "@/lib/hq/finance";

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
    const invoices = canUse(user.roles, "invoices");
    const [people, general, fin] = await Promise.all([listPeople(), getGeneral(), invoices ? getFinSettings() : null]);
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
      // only what prints on invoices; the books' own settings stay in Finance
      invoice: fin ? { company: fin.company, banks: fin.banks, paystack: fin.paystack, terms: fin.terms, vatRate: fin.vatRate, vatDefault: fin.vatDefault, footer: fin.footer, whtText: fin.whtText } : null,
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <SettingsView {...props} />;
}
