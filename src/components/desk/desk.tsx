"use client";

import { createContext, use, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { DeskData } from "@/lib/desk/model";
import type { DeskUser } from "@/lib/desk/auth";
import { type ActionResult, logout } from "@/app/admin/actions";
import { ToastProvider, useToast } from "./ui";
import { Overview } from "./overview";
import { Applications, type AppFilter } from "./applications";
import { Leads } from "./leads";
import { SettingsView } from "./settings";
import { TeamView } from "./team";
import { AppDrawer, type DrawerTarget } from "./drawer";

const VIEWS = [
  ["overview", "Overview"],
  ["applications", "Applications"],
  ["leads", "Checklist leads"],
  ["settings", "Website settings"],
  ["team", "Team and setup"],
] as const;
export type View = (typeof VIEWS)[number][0];

type DeskContextValue = {
  data: DeskData;
  user: DeskUser;
  users: DeskUser[];
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

export function Desk(props: { data: DeskData; user: DeskUser; users: DeskUser[]; team: string[] }) {
  return (
    <ToastProvider>
      <DeskInner {...props} />
    </ToastProvider>
  );
}

function DeskInner({ data, user, users, team }: { data: DeskData; user: DeskUser; users: DeskUser[]; team: string[] }) {
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
  const synced = new Date(data.loadedAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });

  return (
    <DeskContext value={{ data, user, users, team, pending, run, go, open: setDrawer }}>
      <header className="sticky top-0 z-30 bg-ink text-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 lg:px-6">
          <div className="flex items-center gap-2.5 whitespace-nowrap">
            <Spectrum className="size-7 overflow-hidden rounded-lg" />
            <span className="font-display text-lg font-bold">Session Desk</span>
            <span className="hidden text-sm text-white/60 sm:inline">Visibility Session</span>
          </div>
          <nav aria-label="Desk views" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto lg:order-none lg:ml-auto lg:w-auto">
            {VIEWS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => go(k)}
                aria-current={view === k ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-white/65 hover:text-white",
                  view === k && "bg-white/15 text-white",
                )}
              >
                {label}
                {k === "applications" && newCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-pink px-1.5 font-mono text-[11px] text-white">{newCount}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-xs whitespace-nowrap text-white/60 lg:ml-0">
            <span>{refreshing ? "Syncing…" : `Synced ${synced}`}</span>
            <button
              type="button"
              onClick={() => startRefresh(() => router.refresh())}
              className="rounded-full border border-white/25 bg-white/10 px-3 py-1 font-semibold text-white"
            >
              Refresh
            </button>
            <form action={logout}>
              <button type="submit" className="rounded-full px-2 py-1 font-semibold text-white/70 hover:text-white" title={`Signed in as ${user.email}`}>
                Sign out {user.name.split(" ")[0]}
              </button>
            </form>
          </div>
        </div>
        <Spectrum className="h-1" />
      </header>

      <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-20 lg:px-6">
        {view === "overview" && <Overview />}
        {view === "applications" && <Applications filter={filter} setFilter={setFilter} />}
        {view === "leads" && <Leads />}
        {view === "settings" && <SettingsView />}
        {view === "team" && <TeamView />}
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
