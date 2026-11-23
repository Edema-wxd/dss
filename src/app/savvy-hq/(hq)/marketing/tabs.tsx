import Link from "next/link";
import { ReportSlot } from "@/components/hq/report-slot";
import { PageHeader } from "@/components/hq/shell";
import { marketingTabsFor } from "@/lib/hq/access";
import { cn } from "@/lib/utils";

export const MARKETING_TABS = [
  ["overview", "Overview", "/savvy-hq/marketing"],
  ["accounts", "Accounts and insights", "/savvy-hq/marketing/accounts"],
  ["website", "Website", "/savvy-hq/marketing/website"],
  ["planner", "Content planner", "/savvy-hq/marketing/planner"],
  ["ads", "Ads", "/savvy-hq/marketing/ads"],
  ["publicity", "Publicity", "/savvy-hq/marketing/publicity"],
  ["news", "Marketing news", "/savvy-hq/marketing/news"],
] as const;

/** Tabs that exist in this build. */
export const BUILT_TABS: readonly string[] = ["overview", "accounts", "website", "planner", "ads", "publicity", "news"];

/** The Marketing heading and tabs. Someone limited to Publicity (a Talent Manager) sees just "Publicity". */
export function MarketingTabs({ roles, current }: { roles: readonly string[]; current: string }) {
  const allowed = marketingTabsFor(roles);
  const tabs = MARKETING_TABS.filter(([k]) => BUILT_TABS.includes(k) && (!allowed || allowed.includes(k)));
  if (allowed && tabs.length === 1)
    return <PageHeader title="Publicity" lead="Press, radio, TV, podcasts and blogs for our clients, our talent, DSS and Jane." />;
  return (
    <>
      <PageHeader title="Marketing, measured." lead="Our own channels, publicity for clients and talent, and what the market is doing.">
        <ReportSlot type="marketing" />
      </PageHeader>
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
