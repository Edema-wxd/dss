import Link from "next/link";
import { PageHeader } from "@/components/hq/shell";
import { marketingTabsFor } from "@/lib/hq/access";
import { cn } from "@/lib/utils";

export const MARKETING_TABS = [
  ["overview", "Overview", "/admin/marketing"],
  ["accounts", "Accounts and insights", "/admin/marketing/accounts"],
  ["website", "Website", "/admin/marketing/website"],
  ["planner", "Content planner", "/admin/marketing/planner"],
  ["ads", "Ads", "/admin/marketing/ads"],
  ["publicity", "Publicity", "/admin/marketing/publicity"],
  ["news", "Marketing news", "/admin/marketing/news"],
] as const;

/** Tabs that exist in this build. The rest of the Marketing dashboard follows. */
export const BUILT_TABS: readonly string[] = ["publicity"];

/** The Marketing heading and tabs. Someone limited to Publicity (a Talent Manager) sees just "Publicity". */
export function MarketingTabs({ roles, current }: { roles: readonly string[]; current: string }) {
  const allowed = marketingTabsFor(roles);
  const tabs = MARKETING_TABS.filter(([k]) => BUILT_TABS.includes(k) && (!allowed || allowed.includes(k)));
  if (allowed && tabs.length === 1)
    return <PageHeader title="Publicity" lead="Press, radio, TV, podcasts and blogs for our clients, our talent, DSS and Jane." />;
  return (
    <>
      <PageHeader title="Marketing, measured." lead="Our own channels, publicity for clients and talent, and what the market is doing." />
      <nav aria-label="Marketing" className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map(([k, l, href]) => (
          <Link
            key={k}
            href={href}
            aria-current={current === k ? "page" : undefined}
            className={cn("rounded-full border-2 border-transparent px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-slate hover:text-ink", current === k && "border-ink bg-ink text-white hover:text-white")}
          >
            {l}
          </Link>
        ))}
      </nav>
    </>
  );
}
