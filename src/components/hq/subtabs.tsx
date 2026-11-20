import Link from "next/link";
import { cn } from "@/lib/utils";

/** A row of page tabs under a heading, as links. */
export function SubTabs({ label, tabs, current }: { label: string; tabs: readonly (readonly [key: string, text: string, href: string])[]; current: string }) {
  return (
    <nav aria-label={label} className="-mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1">
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
  );
}

export const TEAM_TABS = [
  ["people", "People and access", "/admin/team"],
  ["leave", "Leave and availability", "/admin/team/leave"],
] as const;
