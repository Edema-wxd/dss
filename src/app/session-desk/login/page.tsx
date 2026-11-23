import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/desk/login-forms";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { Spectrum } from "@/components/desk/desk";
import { NotConfiguredError } from "@/lib/desk/db";
import { countUsers, currentUser } from "@/lib/desk/auth";

// The Session Desk's sign-in. Same accounts and password as DSS HQ: one sign-in opens both.

export default function DeskLoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border-2 border-ink bg-white shadow-hard-lg">
        <div className="bg-ink px-6 py-5 text-white">
          <p className="text-xs font-bold tracking-[0.12em] text-white/60 uppercase">Digital Savvy Studios</p>
          <h1 className="mt-1 text-3xl font-bold">
            Session <i className="text-pink">Desk</i>
          </h1>
        </div>
        <Spectrum className="h-1.5" />
        <div className="p-6">
          <Suspense fallback={<p className="text-slate">Loading…</p>}>
            <Gate />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function Gate() {
  try {
    if (await currentUser()) redirect("/session-desk");
    // the very first account is made on HQ's sign-in page
    if ((await countUsers()) === 0) redirect("/savvy-hq/login");
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <div className="grid gap-4">
      <LoginForm next="/session-desk" place="the Session Desk" />
      <p className="text-sm text-slate">Use your DSS HQ email and password.</p>
    </div>
  );
}
