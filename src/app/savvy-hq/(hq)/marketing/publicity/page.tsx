import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PublicityView } from "@/components/hq/publicity";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { loadWork } from "@/lib/hq/load";
import { listClientsFull } from "@/lib/hq/sales";
import { listMedia, listPitches, listTalents } from "@/lib/hq/talent";
import { MarketingTabs } from "../tabs";

export default function PublicityPage() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading Publicity…</p>}>
        <Publicity />
      </Suspense>
    </main>
  );
}

async function Publicity() {
  let props;
  let user;
  try {
    user = await requireModule("marketing");
    const [w, media, pitches, clients, talents] = await Promise.all([loadWork(user), listMedia(), listPitches(), listClientsFull(), listTalents()]);
    const forOpts: [string, string][] = [
      ["dss", "Digital Savvy Studios"],
      ["jane", "Janefrances (personal brand)"],
      ...clients.filter((c) => c.status !== "ended").map((c) => [`client:${c.id}`, `Client: ${c.name}`] as [string, string]),
      ...talents.filter((t) => t.status !== "ended").map((t) => [`talent:${t.id}`, `Talent: ${t.name}`] as [string, string]),
    ];
    props = { w, media, pitches, forOpts };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <MarketingTabs roles={user.roles} current="publicity" />
      <PublicityView {...props} />
    </>
  );
}
