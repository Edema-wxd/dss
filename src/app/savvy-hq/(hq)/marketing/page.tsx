import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { MarketingOverview } from "@/components/hq/marketing";
import { listAccounts, listAds, listDailyStats, listMonthStats, listPosts } from "@/lib/hq/marketing";
import { listContactsFull } from "@/lib/hq/sales";
import { lagosToday } from "@/lib/hq/work";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireMarketingDashboard } from "@/lib/hq/marketing-guard";
import { MarketingTabs } from "./tabs";

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
    const [accounts, stats, daily, posts, ads, contacts] = await Promise.all([listAccounts(), listMonthStats(), listDailyStats(), listPosts(), listAds(), listContactsFull()]);
    props = {
      accounts,
      stats,
      daily,
      posts,
      ads,
      leads: contacts.map((c) => ({ source: c.source, createdAt: c.createdAt, won: c.stage === "won" })),
      today: lagosToday(),
      addAccountHref: "/savvy-hq/marketing/accounts",
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <MarketingTabs roles={user.roles} current="overview" />
      <MarketingOverview {...props} />
    </>
  );
}
