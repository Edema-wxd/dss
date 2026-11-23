import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, LogOut } from "lucide-react";
import { logout } from "@/app/savvy-hq/actions";

// The Session Desk's top bar: which app this is, a way over to DSS HQ, and who's signed in.
// Signing out here signs out of HQ too, since they share one session.

export function DeskBar({ name, roles }: { name: string; roles: string }) {
  return (
    <header className="bg-hq-side text-cream">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-8">
        <Link href="/session-desk" className="flex items-center gap-2.5">
          <Image src="/icon.png" alt="" width={32} height={32} unoptimized className="size-8 rounded-[10px] bg-pink" />
          <b className="font-display text-lg leading-none font-bold tracking-[-0.01em]">
            Session <i className="text-pink">Desk</i>
          </b>
        </Link>
        <span className="flex-1" />
        <Link href="/savvy-hq" className="inline-flex items-center gap-1 text-sm font-semibold text-hq-muted hover:text-cream">
          DSS HQ <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <span className="hidden min-w-0 text-right sm:block">
          <b className="block truncate text-sm font-medium">{name}</b>
          <span className="block truncate text-xs text-hq-muted">{roles}</span>
        </span>
        <form action={logout}>
          <input type="hidden" name="from" value="desk" />
          <button type="submit" className="inline-flex items-center gap-1.5 text-sm font-medium text-hq-muted hover:text-cream">
            <LogOut className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
