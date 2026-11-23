"use client";

import { createContext, use, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { type DeskData, hoursSince } from "@/lib/desk/model";
import type { DeskUser } from "@/lib/desk/auth";
import type { SyncStatus } from "@/lib/desk/sheets";
import type { ActionResult } from "@/app/savvy-hq/actions";
import { PageHeader } from "@/components/hq/shell";
import { useToast } from "./ui";
import { Overview } from "./overview";
import { Applications, type AppFilter } from "./applications";
import { Leads } from "./leads";
import { MailView } from "./mail";
import { SettingsView } from "./settings";
import { AppDrawer, type DrawerTarget } from "./drawer";

const VIEWS = [
  ["overview", "Overview"],
  ["applications", "Applications"],
  ["leads", "Checklist leads"],
  ["mail", "Sent emails"],
  ["settings", "Website settings"],
] as const;
export type View = (typeof VIEWS)[number][0];

export type SheetInfo = { configured: boolean; url: string; last: SyncStatus };
export type MailInfo = { configured: boolean; from: string };
type DeskProps = { data: DeskData; user: DeskUser; team: string[]; sheet: SheetInfo; mail: MailInfo };

type DeskContextValue = {
  sheet: SheetInfo;
  mail: MailInfo;
  data: DeskData;
  user: DeskUser;
  team: string[];
  pending: boolean;
  /** Runs a server action, toasts its outcome and returns whether it worked. */
  run: (action: () => Promise<ActionResult>) => Promise<boolean>;
  go: (view: View, filter?: Partial<AppFilter>) => void;
  open: (target: DrawerTarget) => void;
};

const DeskContext = createContext<DeskContextValue | null>(null);
export function useDesk() {
  const ctx = use(DeskContext);
  if (!ctx) throw new Error("useDesk must be used inside the desk");
  return ctx;
}

const REFRESH_SECONDS = 90;

/** Visibility Sessions: the website's application desk, now one area of HQ. Toasts come from the HQ frame. */
export function Desk({ data, user, team, sheet, mail }: DeskProps) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<AppFilter>({ status: "open", q: "", owner: "", route: "" });
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  // keep the numbers fresh while the tab is visible and nobody is mid-edit
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !drawer) startRefresh(() => router.refresh());
    }, REFRESH_SECONDS * 1000);
    return () => clearInterval(t);
  }, [drawer, router]);

  const go = (v: View, f?: Partial<AppFilter>) => {
    setView(v);
    if (f) setFilter((x) => ({ ...x, ...f }));
    window.scrollTo(0, 0);
  };

  const run = (action: () => Promise<ActionResult>) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        try {
          const r = await action();
          toast(r.ok ? (r.message ?? "Saved") : r.error);
          resolve(r.ok);
        } catch {
          toast("Something went wrong saving that. Check your connection and try again.");
          resolve(false);
        }
      });
    });

  const newCount = data.apps.filter((a) => a.status === "New").length;
  // failed in the last week, so a problem with the mailbox shows on every view
  const failedMail = data.mails.filter((m) => m.status === "failed" && hoursSince(m.at) <= 24 * 7).length;
  const synced = new Date(data.loadedAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });

  return (
    <DeskContext value={{ data, user, team, sheet, mail, pending, run, go, open: setDrawer }}>
      <div className="mx-auto max-w-[1280px] px-4 pt-6 lg:px-8 lg:pt-8">
        <PageHeader title="Visibility Sessions" lead="Applications from the website, checklist leads, sent emails and the settings the site reads.">
          <div className="flex items-center gap-2 text-xs whitespace-nowrap text-slate">
            <span>{refreshing ? "Syncing…" : `Synced ${synced}`}</span>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              className="rounded-full border-2 border-ink bg-white px-3 py-1 font-semibold text-ink"
            >
              Refresh
            </button>
          </div>
        </PageHeader>
        <nav aria-label="Visibility Sessions views" className="-mx-1 mb-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {VIEWS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => go(k)}
              aria-current={view === k ? "page" : undefined}
              className={cn(
                "rounded-full border-2 border-transparent px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap text-slate hover:text-ink",
                view === k && "border-ink bg-ink text-white hover:text-white",
              )}
            >
              {label}
              {k === "applications" && newCount > 0 && (
                <span className="ml-1.5 rounded-full bg-pink px-1.5 font-mono text-[11px] text-white">{newCount}</span>
              )}
              {k === "mail" && failedMail > 0 && (
                <span className="ml-1.5 rounded-full bg-pink px-1.5 font-mono text-[11px] text-white" title="Failed in the last week">
                  {failedMail}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="mx-auto max-w-[1280px] px-4 pt-4 pb-20 lg:px-8">
        {view === "overview" && <Overview />}
        {view === "applications" && <Applications filter={filter} setFilter={setFilter} />}
        {view === "leads" && <Leads />}
        {view === "mail" && <MailView />}
        {view === "settings" && <SettingsView />}
      </main>

      {drawer && <AppDrawer key={drawer.kind === "edit" ? drawer.id : "new"} target={drawer} onClose={() => setDrawer(null)} />}
    </DeskContext>
  );
}

/** The five-colour brand bar. */
export function Spectrum({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex", className)}>
      <i className="flex-[2.2] bg-pink" />
      <i className="flex-[1.4] bg-[#5568af]" />
      <i className="flex-1 bg-aqua" />
      <i className="flex-1 bg-orange" />
      <i className="flex-[0.6] bg-lime" />
    </span>
  );
}
