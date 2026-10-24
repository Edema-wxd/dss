"use client";

import Image from "next/image";
import { MenuIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "#look-up-test", label: "The look-up test" },
  { href: "#the-session", label: "What the session is" },
  { href: "#big-moments", label: "Built for big moments" },
  { href: "#strategist", label: "Who you'd work with" },
  { href: "#is-this-for-you", label: "Is this for you?" },
  { href: "#faq", label: "Straight answers" },
];

export function AnnouncementBar() {
  return (
    <div className="bg-ink px-2 py-2.5 text-center text-[11px] tracking-[-0.01em] leading-tight text-white">
      <span className="font-semibold text-lime">8 sessions open in November</span>{" "}
      · Reviewed personally by Janefrances
    </div>
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
        <Sheet>
          <SheetTrigger
            aria-label="Open menu"
            className="grid size-11 place-items-center rounded-full border-2 border-ink bg-white shadow-hard-sm"
          >
            <MenuIcon className="size-6" strokeWidth={2.5} />
          </SheetTrigger>
          <SheetContent side="right" className="border-l-2 border-ink bg-cream p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="font-display text-2xl font-bold">Menu</SheetTitle>
              <SheetDescription>
                The Visibility Session, a free brand review for 8 founders a month.
              </SheetDescription>
            </SheetHeader>
            <nav aria-label="Page sections">
              <ul className="flex flex-col">
                {navLinks.map((link) => (
                  <li key={link.href} className="border-b border-ink/15">
                    <SheetClose
                      render={<a href={link.href} />}
                      nativeButton={false}
                      className="font-display block py-3.5 text-xl font-semibold"
                    >
                      {link.label}
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </nav>
            <SheetClose
              render={<a href="#apply" />}
              nativeButton={false}
              className={cn(buttonVariants({ variant: "brand", size: "pill" }), "mt-auto w-full")}
            >
              Apply for one of 8 sessions →
            </SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
