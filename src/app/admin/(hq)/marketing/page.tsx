import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireModule } from "@/lib/desk/auth";

// The Marketing dashboard's other tabs (accounts, website, planner, ads, news) follow;
// until then Marketing opens on Publicity.
export default function MarketingPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-slate">Opening Marketing…</p>}>
      <Go />
    </Suspense>
  );
}

async function Go(): Promise<React.ReactNode> {
  await requireModule("marketing");
  redirect("/admin/marketing/publicity");
}
