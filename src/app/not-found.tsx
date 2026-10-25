import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Keycap, Sparkle } from "@/components/landing/primitives";
import { AnnouncementBar, SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found · Digital Savvy Studios",
};

// TODO(copy): no design for this page yet; wording drafted in the landing page's voice.
export default function NotFound() {
  return (
    <>
      <div
        id="top"
        className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(206,234,238,0.95)_0%,rgba(206,234,238,0.66)_45%,rgba(206,234,238,0)_100%)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(33,33,33,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(33,33,33,0.06)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(180deg,#000_60%,transparent)]"
        />
        <AnnouncementBar />
        <SiteHeader />

        <main className="relative mx-auto max-w-xl px-5 pt-16 pb-24 text-center lg:max-w-3xl lg:pt-28 lg:pb-36">
          <Sparkle className="twinkle absolute top-6 left-6 size-4 text-ink lg:left-0 lg:size-6" />
          <Sparkle className="twinkle absolute top-32 right-8 size-6 text-gold [--float-delay:-1.4s] lg:right-0 lg:size-8" />
          <Image
            src="/images/cursor-pink.png"
            alt=""
            width={300}
            height={408}
            sizes="(min-width: 1024px) 64px, 40px"
            className="float absolute top-24 left-4 w-10 [--float-delay:-2s] lg:top-36 lg:-left-10 lg:w-16"
          />
          <Image
            src="/images/folder-pink.png"
            alt=""
            width={320}
            height={347}
            sizes="(min-width: 1024px) 120px, 72px"
            className="float absolute top-[17rem] -right-1 w-[60px] [--float-delay:-3.4s] lg:top-auto lg:-right-16 lg:bottom-48 lg:w-[120px]"
          />

          <p aria-hidden className="rise-in flex justify-center gap-3 text-[84px] lg:gap-5 lg:text-[150px]">
            <Keycap tone="pink" className="-rotate-6">4</Keycap>
            <Keycap tone="aqua" className="rotate-3">0</Keycap>
            <Keycap tone="lime" className="-rotate-3">4</Keycap>
          </p>

          <p className="rise-in mt-10 inline-block border-[1.5px] border-dashed border-[#d4477a] bg-pink-soft px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-pink uppercase [--rise-delay:120ms] lg:mt-14 lg:text-[13px]">
            Page not found
          </p>
          <h1 className="rise-in mt-4 text-[42px] leading-[0.95] font-black tracking-[-0.04em] [--rise-delay:200ms] lg:text-[72px]">
            You looked us up. <span className="text-pink">This page didn&apos;t show up.</span>
          </h1>
          <p className="rise-in mx-auto mt-6 max-w-[440px] text-[16px] leading-[1.7] text-slate [--rise-delay:300ms] lg:text-[19px]">
            The link may be old or the page may have moved. Ironic, given what we do. Everything worth
            finding is one click away.
          </p>

          <div className="rise-in mt-10 flex flex-col gap-4 [--rise-delay:400ms] lg:flex-row lg:justify-center">
            <Link href="/" className={cn(buttonVariants({ variant: "brand", size: "xl" }), "w-full lg:w-auto lg:px-8")}>
              Back to the homepage
            </Link>
            <Link href="/#apply" className={cn(buttonVariants({ variant: "paper", size: "xl" }), "w-full lg:w-auto lg:px-8")}>
              Apply for one of 8 sessions →
            </Link>
          </div>
        </main>
      </div>
      <SiteFooter />
    </>
  );
}
