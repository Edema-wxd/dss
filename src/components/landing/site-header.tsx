"use client";

import Image from "next/image";
import { ArrowUpRightIcon, MenuIcon, StarIcon } from "lucide-react";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AnnouncementBar() {
  return (
    <div className="bg-ink px-2 py-2.5 text-center text-[11px] tracking-[-0.01em] leading-tight text-white">
      <span className="font-semibold text-lime">8 sessions open in November</span>{" "}
      · Reviewed personally by Janefrances
    </div>
  );
}

/** Speech-bubble menu: the live offer, then a placeholder for what's next. */
function SiteMenu() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Open menu"
        className="grid size-11 place-items-center rounded-full border-2 border-ink bg-white shadow-hard-sm transition-colors data-popup-open:bg-lime"
      >
        <MenuIcon className="size-6" strokeWidth={2.5} />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={14}
        className="w-[min(330px,calc(100vw-32px))] gap-3 overflow-visible rounded-[26px] border-2 border-ink bg-white p-4 shadow-hard-lg ring-0"
      >
        {/* tail pointing up at the menu button */}
        <svg
          aria-hidden
          viewBox="0 0 20 12"
          className="absolute -top-[10px] right-[14px] h-3 w-5"
        >
          <path d="M0 12 10 1l10 11" fill="#ffffff" stroke="#212121" strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <nav aria-label="Services">
          <PopoverClose
            render={<a href="#the-session" />}
            nativeButton={false}
            className="flex h-[66px] items-center gap-3 rounded-[18px] border-2 border-ink bg-lime pr-2.5 pl-4 shadow-hard transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
          >
            <span className="text-[13px] font-medium tracking-[0.08em] text-ink/70">01</span>
            <span className="font-display flex-1 text-[20px] leading-none font-bold tracking-[-0.03em] whitespace-nowrap">
              Visibility Session
            </span>
            <span className="grid size-10 place-items-center rounded-full border-2 border-ink bg-white">
              <ArrowUpRightIcon aria-hidden className="size-5" strokeWidth={2.5} />
            </span>
          </PopoverClose>
        </nav>
        <div
          aria-label="More services coming soon"
          role="note"
          className="flex h-[66px] items-center gap-3 rounded-[18px] border-2 border-dashed border-[#9b948a] bg-[repeating-linear-gradient(135deg,#f5f4f1_0_8px,#ffffff_8px_16px)] pr-2.5 pl-4"
        >
          <StarIcon aria-hidden className="size-6 shrink-0 fill-[#f6eea5] text-ink" strokeWidth={2} />
          <span className="font-display flex-1 text-[21px] leading-none font-medium tracking-[-0.02em] whitespace-nowrap text-[#6c6c70] italic">
            Coming soon
          </span>
          <span className="rotate-3 rounded-full border-2 border-ink bg-[#f6eea5] px-3.5 py-1 text-[11px] font-bold tracking-[0.16em] uppercase">
            Soon
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SiteHeader() {
  return (
    <header className="relative z-20 flex items-center justify-between gap-3 px-4 pt-5">
      <a href="#top" aria-label="Digital Savvy Studios home">
        <Image
          src="/images/lockup-black.png"
          alt="Digital Savvy Studios"
          width={1262}
          height={468}
          priority
          sizes="118px"
          className="h-auto w-[118px]"
        />
      </a>
      <div className="flex items-center gap-3">
        <a
          href="#apply"
          className="rounded-full border-2 border-ink bg-pink px-3.5 py-2.5 text-[10px] font-semibold text-white shadow-hard-sm"
        >
          5 slots left in November
        </a>
        <SiteMenu />
      </div>
    </header>
  );
}
