"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Briefcase,
  CalendarCheck,
  Clock,
  Contact,
  FileChartColumn,
  FileSignature,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  type LucideIcon,
  Megaphone,
  Menu,
  MessageCircle,
  Receipt,
  Settings,
  Star,
  Sun,
  Target,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { logout } from "@/app/admin/actions";
import { NAV_GROUPS, type ModuleKey, type NavGroup } from "@/lib/hq/access";
import { cn } from "@/lib/utils";

const ICONS: Record<ModuleKey, LucideIcon> = {
  today: Sun,
  chat: MessageCircle,
  plan: Target,
  time: Clock,
  overview: LayoutDashboard,
  tasks: ListChecks,
  sessions: CalendarCheck,
  clients: Briefcase,
  crm: Contact,
  talent: Star,
  marketing: Megaphone,
  finance: Wallet,
  invoices: Receipt,
  kpis: Gauge,
  contracts: FileSignature,
  reports: FileChartColumn,
  procedures: BookOpen,
  team: UsersRound,
  activity: History,
  settings: Settings,
};

export type NavItem = { key: ModuleKey; label: string; group: NavGroup; badge?: number };

/** The items under each group heading, in sidebar order, leaving out empty groups. */
const grouped = (items: NavItem[]) =>
  NAV_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.key) })).filter((g) => g.items.length);

function GroupedLinks({ items, idPrefix, render }: { items: NavItem[]; idPrefix: string; render: (item: NavItem) => React.ReactNode }) {
  return grouped(items).map((g) => (
    <div key={g.key} role="group" aria-labelledby={`${idPrefix}-${g.key}`} className="grid gap-0.5">
      <p id={`${idPrefix}-${g.key}`} className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-[0.14em] text-hq-muted/80 uppercase first:pt-0">
        {g.label}
      </p>
      {g.items.map(render)}
    </div>
  ));
}

function Badge({ n, label }: { n?: number; label: string }) {
  if (!n) return null;
  return (
    <span className="ml-auto rounded-full bg-pink px-1.5 py-px text-[11px] leading-4 font-bold text-white" aria-label={`${n} ${label}`}>
      {n > 99 ? "99+" : n}
    </span>
  );
}
type Me = { name: string; email: string; role: string };

const hrefOf = (key: ModuleKey) => `/admin/${key}`;
const isHere = (path: string, key: ModuleKey) => path === hrefOf(key) || path.startsWith(`${hrefOf(key)}/`);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-2 pt-1 pb-4">
      <Image src="/icon.png" alt="" width={38} height={38} unoptimized className="size-[38px] rounded-[11px] bg-pink" />
      <span>
        <b className="block font-display text-xl leading-none font-bold tracking-[-0.01em]">
          DSS <i className="text-pink">HQ</i>
        </b>
        <small className="mt-1 block text-[10px] font-semibold tracking-[0.14em] text-hq-muted uppercase">Digital Savvy Studios</small>
      </span>
    </Link>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="grid size-9 flex-none place-items-center rounded-full bg-pink text-xs font-bold text-white">
      {initials(name)}
    </span>
  );
}

function SignOut({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <button type="submit" className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
        <LogOut className="size-4" aria-hidden />
        Sign out
      </button>
    </form>
  );
}

export function ShellNav({ items, me }: { items: NavItem[]; me: Me }) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const sideNav = useRef<HTMLElement>(null);
  // keep the current page's link in sight when the list is taller than the screen
  useEffect(() => {
    sideNav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [path]);

  return (
    <>
      <aside
        aria-label="DSS HQ navigation"
        className="sticky top-0 hidden h-dvh flex-col gap-1 bg-hq-side px-3.5 pt-5 pb-4 text-cream lg:flex"
      >
        <Brand />
        <nav ref={sideNav} className="-mx-1 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-1 pb-3">
          <GroupedLinks
            items={items}
            idPrefix="nav"
            render={({ key, label, badge }) => {
              const Icon = ICONS[key];
              const here = isHere(path, key);
              return (
                <Link
                  key={key}
                  href={hrefOf(key)}
                  aria-current={here ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-[7px] text-[15px] font-medium text-hq-muted hover:bg-hq-side-2 hover:text-cream",
                    here && "bg-cream text-hq-side hover:bg-cream hover:text-hq-side",
                  )}
                >
                  <Icon className={cn("size-[18px] flex-none", here && "text-pink")} aria-hidden />
                  {label}
                  <Badge n={badge} label="unread" />
                </Link>
              );
            }}
          />
        </nav>
        <div className="grid flex-none gap-2 rounded-2xl bg-hq-side-2 p-2.5">
          <div className="flex items-center gap-2.5">
            <Avatar name={me.name} />
            <span className="min-w-0">
              <b className="block truncate text-sm font-medium">{me.name}</b>
              <span className="block truncate text-xs text-hq-muted">{me.role}</span>
            </span>
          </div>
          <SignOut className="px-1 text-hq-muted hover:text-cream" />
        </div>
      </aside>

      {/* phones and tablets: a floating pill of areas, and a menu with the rest */}
      <nav
        aria-label="Quick navigation"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center bg-gradient-to-t from-cream from-60% to-transparent px-3.5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="pointer-events-auto flex gap-1 rounded-full bg-hq-side p-1.5 shadow-[0_30px_70px_-30px_rgba(32,28,43,.5)]">
          {items.slice(0, 4).map(({ key, label, badge }) => {
            const Icon = ICONS[key];
            const here = isHere(path, key);
            return (
              <Link
                key={key}
                href={hrefOf(key)}
                aria-label={badge ? `${label}, ${badge} unread` : label}
                aria-current={here ? "page" : undefined}
                className={cn("relative grid h-[46px] w-[52px] place-items-center rounded-full text-hq-muted", here && "bg-cream text-pink")}
              >
                <Icon className="size-5" aria-hidden />
                {!!badge && <i className="absolute top-2 right-3 size-2.5 rounded-full border-2 border-hq-side bg-pink" aria-hidden />}
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="grid h-[46px] w-[52px] place-items-center rounded-full text-hq-muted"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-50 flex flex-col bg-hq-side px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] text-cream lg:hidden">
          <div className="flex items-start justify-between">
            <Brand />
            <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="grid size-11 place-items-center rounded-full bg-hq-side-2">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <nav className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pb-3">
            <GroupedLinks
              items={items}
              idPrefix="menu"
              render={({ key, label, badge }) => {
                const Icon = ICONS[key];
                const here = isHere(path, key);
                return (
                  <Link
                    key={key}
                    href={hrefOf(key)}
                    aria-current={here ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                    className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-hq-muted", here && "bg-cream text-hq-side")}
                  >
                    <Icon className={cn("size-5", here && "text-pink")} aria-hidden />
                    {label}
                    <Badge n={badge} label="unread" />
                  </Link>
                );
              }}
            />
          </nav>
          <div className="flex flex-none items-center gap-3 rounded-2xl bg-hq-side-2 p-3">
            <Avatar name={me.name} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-sm font-medium">{me.name}</b>
              <span className="block truncate text-xs text-hq-muted">{me.role}</span>
            </span>
            <SignOut className="text-hq-muted" />
          </div>
        </div>
      )}
    </>
  );
}

/** The heading at the top of every HQ page. */
export function PageHeader({ title, lead, children }: { title: string; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3 border-b-[1.5px] border-ink pb-4">
      <div className="min-w-0 flex-1">
        <p className="mb-2 font-display text-[13px] font-bold tracking-[0.05em] text-[#b8114a]">Digital Savvy Studios</p>
        <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        {lead && <p className="mt-1.5 max-w-[70ch] text-sm text-slate">{lead}</p>}
      </div>
      {children}
    </header>
  );
}
