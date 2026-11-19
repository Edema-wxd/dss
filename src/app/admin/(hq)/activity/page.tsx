import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { ActivityView } from "@/components/hq/activity";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError, loadAudit } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";

export default function ActivityPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="Activity" lead="Everything done in HQ, newest first. Only owners see this." />
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading activity…</p>}>
        <Activity />
      </Suspense>
    </main>
  );
}

async function Activity() {
  let entries;
  try {
    await requireModule("activity");
    entries = await loadAudit();
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <ActivityView entries={entries} />;
}
