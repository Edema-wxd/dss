import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { AdsView } from "@/components/hq/marketing";
import { seesMoney } from "@/lib/hq/access";
import { listAds } from "@/lib/hq/marketing";
import { listClientsFull } from "@/lib/hq/sales";
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
    const [ads, clients] = await Promise.all([listAds(), listClientsFull()]);
    props = { ads, clients: clients.filter((c) => c.status !== "ended").map((c) => ({ id: c.id, name: c.name })), money: seesMoney(user.roles) };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <MarketingTabs roles={user.roles} current="ads" />
      <AdsView {...props} />
    </>
  );
}
