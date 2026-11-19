import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PageHeader } from "@/components/hq/shell";
import { TalentRoster } from "@/components/hq/talent";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { loadTalent } from "@/lib/hq/talent-load";

export default function TalentPage() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Talent" lead="Pick a talent to see their profile, goals, rate card and brand tracker." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the roster…</p>}>
        <Roster />
      </Suspense>
    </main>
  );
}

async function Roster() {
  let props;
  try {
    props = await loadTalent(await requireModule("talent"));
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <TalentRoster {...props} />;
}
