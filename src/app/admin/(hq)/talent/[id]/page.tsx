import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PageHeader } from "@/components/hq/shell";
import { TalentProfile } from "@/components/hq/talent";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { TALENT_STATUS } from "@/lib/hq/talent-model";
import { label } from "@/lib/hq/sales-model";
import { loadTalent } from "@/lib/hq/talent-load";

export default function TalentProfilePage(props: PageProps<"/admin/talent/[id]">) {
  return (
    <main className="mx-auto max-w-[1400px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Loading the profile…</p>}>
        <Profile params={props.params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let props;
  try {
    const all = await loadTalent(await requireModule("talent"));
    const t = all.talents.find((x) => x.id === decodeURIComponent(id));
    if (!t) notFound();
    props = { ...all, t };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  const { t } = props;
  return (
    <>
      <PageHeader title={t.name} lead={[[t.category, t.location].filter(Boolean).join(", ") || "Talent", label(TALENT_STATUS, t.status), t.package].filter(Boolean).join(". ")} />
      <TalentProfile {...props} />
    </>
  );
}
