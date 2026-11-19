import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PageHeader } from "@/components/hq/shell";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireUser } from "@/lib/desk/auth";
import { navFor } from "@/lib/hq/access";

// /admin opens the first area the person can use. Until Today is rebuilt, that's usually
// Visibility Sessions.

export default function AdminHome() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate">Opening DSS HQ…</p>}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  let first: string | undefined;
  try {
    const user = await requireUser();
    first = navFor(user.roles)[0]?.key;
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  if (first) redirect(`/admin/${first}`);
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-8 lg:pt-10">
      <PageHeader title="Welcome to DSS HQ" lead="Your areas of HQ are being moved over from the old app and will appear here as they arrive." />
      <p className="text-sm text-slate">Until then, keep using the current HQ for your tasks, plan and messages.</p>
    </main>
  );
}
