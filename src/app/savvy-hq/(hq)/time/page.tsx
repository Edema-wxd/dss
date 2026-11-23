import { Suspense } from "react";
import { connection } from "next/server";
import { DeskSetupNotice } from "@/components/desk/setup-notice";
import { PageHeader } from "@/components/hq/shell";
import { TimeView } from "@/components/hq/time";
import { NotConfiguredError } from "@/lib/desk/db";
import { requireModule } from "@/lib/desk/auth";
import { isOwner } from "@/lib/hq/access";
import { loadAttendance } from "./load";

export default function TimePage() {
  return (
    <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-8 lg:pt-8">
      <Suspense fallback={<p className="p-10 text-center text-slate">Adding up the hours…</p>}>
        <Time />
      </Suspense>
    </main>
  );
}

async function Time() {
  let props;
  try {
    await connection();
    const user = await requireModule("time");
    const a = await loadAttendance(user);
    props = { ...a, me: { id: user.id, owner: isOwner(user.roles) }, serverNow: new Date().toISOString() };
  } catch (e) {
    if (e instanceof NotConfiguredError) return <DeskSetupNotice />;
    throw e;
  }
  return (
    <>
      <PageHeader
        title="Attendance, honestly."
        lead={props.lead ? "Who's in, who's done, and what everyone got through today." : "Your hours, breaks and end-of-day reports. Clock in and out from the button at the top of any page."}
      />
      <TimeView {...props} />
    </>
  );
}

