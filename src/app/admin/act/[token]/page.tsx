import { Suspense } from "react";
import { connection } from "next/server";
import { Spectrum } from "@/components/desk/desk";
import { QuickConfirm } from "@/components/hq/quick-confirm";
import { getTask } from "@/lib/hq/data";
import { readAction } from "@/lib/hq/tokens";

// Where the one-tap links in HQ emails land. Works without signing in: the signed link is the
// permission, and only for the one task and person it names.

export default function QuickActionPage(props: PageProps<"/admin/act/[token]">) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-[28px] border-2 border-ink bg-white shadow-hard-lg">
        <div className="bg-ink px-6 py-5 text-white">
          <p className="text-xs font-bold tracking-[0.12em] text-white/60 uppercase">Digital Savvy Studios</p>
          <h1 className="mt-1 text-3xl font-bold">
            DSS <i className="text-pink">HQ</i>
          </h1>
        </div>
        <Spectrum className="h-1.5" />
        <div className="p-6">
          <Suspense fallback={<p className="text-slate">Checking the link…</p>}>
            <Quick params={props.params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

const VERB = { done: "Mark this done", carry: "Move this to", drop: "Drop this task" } as const;

async function Quick({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // the link's expiry is checked against the clock, so this only runs at request time
  await connection();
  const a = readAction(decodeURIComponent(token));
  if (!a) return <p>This link has expired or isn&apos;t valid. Open HQ to update your tasks.</p>;
  const task = await getTask(a.task);
  if (!task) return <p>That task has already gone. Nothing else to do.</p>;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-slate">{a.action === "carry" ? `${VERB.carry} ${a.to}` : VERB[a.action]}:</p>
      <p className="text-xl font-bold">{task.title}</p>
      <QuickConfirm token={decodeURIComponent(token)} label={a.action === "done" ? "Yes, it's done" : a.action === "carry" ? "Yes, move it" : "Yes, drop it"} />
    </div>
  );
}
