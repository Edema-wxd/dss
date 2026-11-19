import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { NewsView } from "@/components/hq/marketing";
import { canUse, isOwner } from "@/lib/hq/access";
import { listNews } from "@/lib/hq/marketing";
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
    props = { news: await listNews(), me: user.id, canRemoveAny: isOwner(user.roles) || canUse(user.roles, "overview") };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <MarketingTabs roles={user.roles} current="news" />
      <NewsView {...props} />
    </>
  );
}
