import { Suspense } from "react";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { KpisView } from "@/components/hq/kpis";
import { ReportSlot } from "@/components/hq/report-slot";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { canManageKpis, isOwner } from "@/lib/hq/access";
import { kpiStates, listKpis, listPeople, listProposals } from "@/lib/hq/data";
import { KPI_TEMPLATES } from "@/lib/hq/work";

export default function KpisPage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <PageHeader title="KPIs" lead="Each person's targets for this period. Scores update as the work is logged.">
        <ReportSlot type="team" />
      </PageHeader>
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading KPIs…</p>}>
        <Kpis />
      </Suspense>
    </main>
  );
}

async function Kpis() {
  let props;
  try {
    const user = await requireModule("kpis");
    const manage = canManageKpis(user.roles);
    const owner = isOwner(user.roles);
    const [people, kpis, proposals] = await Promise.all([listPeople(), listKpis(), listProposals(owner ? undefined : user.id)]);
    const me = people.find((p) => p.id === user.id);
    // managers see the whole team; everyone else sees only themselves
    const shown = people.filter((p) => p.active && (manage || p.id === user.id));
    props = {
      me: { id: user.id, name: user.name, isOwner: owner, canManage: manage, canPropose: Boolean(me?.kpiSelf) && !owner },
      people: shown.map((p) => ({
        id: p.id,
        name: p.name,
        roleLabel: p.roles.join(" + "),
        kpiSelf: p.kpiSelf,
        template: p.roles.find((r) => KPI_TEMPLATES[r]) ?? null,
      })),
      kpis: await kpiStates(kpis.filter((k) => shown.some((p) => p.id === k.ownerId))),
      proposals,
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return <KpisView {...props} />;
}
