import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PlanView } from "@/components/hq/plan";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { loadPlan } from "./load";

const TABS = ["week", "goals", "board", "reviews", "setup"] as const;

export default function PlanPage({ searchParams }: PageProps<"/savvy-hq/plan">) {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the plan…</p>}>
        <Plan searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Plan({ searchParams }: Pick<PageProps<"/savvy-hq/plan">, "searchParams">) {
  let d;
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "week";
  try {
    await connection();
    const user = await requireModule("plan");
    d = await loadPlan(user);
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <PageHeader title="The 12-week plan." lead="Twelve weeks is long enough to finish something real and short enough to feel the deadline." />
      <PlanView d={d} tab={tab} />
    </>
  );
}
