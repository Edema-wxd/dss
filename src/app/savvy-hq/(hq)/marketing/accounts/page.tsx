import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { MarketingAccounts } from "@/components/hq/marketing";
import { getGeneral } from "@/lib/hq/data";
import { loadWork } from "@/lib/hq/load";
import { listAccounts, listMonthStats, listSync } from "@/lib/hq/marketing";
import { DEFAULT_PILLARS } from "@/lib/hq/marketing-model";
import { isOwner } from "@/lib/hq/access";
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
    const [w, accounts, stats, sync, general] = await Promise.all([loadWork(user), listAccounts(), listMonthStats(), listSync(), getGeneral()]);
    props = {
      w,
      accounts,
      stats,
      sync,
      pillars: general.mktPillars?.length ? general.mktPillars : DEFAULT_PILLARS,
      dataFeedUrl: isOwner(user.roles) && general.dataFeed ? `https://docs.google.com/spreadsheets/d/${general.dataFeed}/edit` : null,
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <MarketingTabs roles={user.roles} current="accounts" />
      <MarketingAccounts {...props} />
    </>
  );
}
