import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { MarketingWebsite } from "@/components/hq/marketing";
import { listSync, listWeb } from "@/lib/hq/marketing";
import { lagosToday } from "@/lib/hq/work";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireMarketingDashboard } from "@/lib/hq/marketing-guard";
import { MarketingTabs } from "../tabs";

export default function Page() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading Marketing…</p>}>
        <Tab />
      </Suspense>
    </main>
  );
}

async function Tab() {
  let user;
  let props;
  try {
    user = await requireMarketingDashboard();
    const [web, sync] = await Promise.all([listWeb(), listSync()]);
    props = { web, today: lagosToday(), connected: sync.some((s) => s.platform === "website") };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <MarketingTabs roles={user.roles} current="website" />
      <MarketingWebsite {...props} />
    </>
  );
}
