import Image from "next/image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnnouncementBar, SiteHeader } from "./site-header";
import { Sparkle } from "./primitives";
import { RotatingWord } from "./rotating-word";

export function Hero() {
  return (
    <div
      id="top"
      className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(206,234,238,0.95)_0%,rgba(206,234,238,0.66)_45%,rgba(206,234,238,0)_100%)]"
    >
      {/* faint grid behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(33,33,33,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(33,33,33,0.06)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:linear-gradient(180deg,#000_60%,transparent)]"
      />
      <AnnouncementBar />
      <SiteHeader />

      <section className="relative mx-auto max-w-xl px-5 pt-14 pb-10 text-center">
        <Sparkle className="absolute top-2 left-6 size-3.5 text-ink" />
        <Sparkle className="absolute top-0 right-1/2 size-3.5 text-gold" />
        <svg
          viewBox="0 0 40 36"
          aria-hidden
          className="absolute top-12 left-5 h-8 w-9 -rotate-12"
        >
          <path d="M2 18 38 2 28 34 20 22Z" fill="#cdd629" stroke="#212121" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <Image
          src="/images/dss-keys.png"
          alt=""
          width={389}
          height={265}
          sizes="96px"
          className="absolute top-8 -right-1 w-[96px]"
        />

        <p className="mx-auto inline-block border-[1.5px] border-dashed border-[#d4477a] bg-pink-soft px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-pink uppercase">
          For founders who move first
        </p>
        <h1 className="mt-1 text-[38px] leading-[0.95] font-black tracking-[-0.04em] text-ink">
          They loved the{" "}
          <RotatingWord
            words={["Pitch.", "Brand.", "Products.", "Service."]}
            srText="Pitch."
            interval={3000}
            className="text-pink"
          />{" "}
          Then they looked you up!
        </h1>

        <div className="relative mt-12">
          <Image
            src="/images/wifi-heart.png"
            alt=""
            width={360}
            height={284}
            sizes="44px"
            className="absolute -top-6 left-3 w-[44px] -rotate-12"
          />
          <Image
            src="/images/cursor-pink.png"
            alt=""
            width={300}
            height={408}
            sizes="28px"
            className="absolute -top-12 right-10 w-[28px]"
          />
          <p className="mx-auto max-w-[330px] text-[11px] leading-[1.75] text-slate">
            The Visibility Session is a <strong className="font-semibold text-ink">₦250,000</strong>{" "}
            brand review we give free to 8 founders a month. We look you up the way a serious buyer
            would, then show you in 30 minutes what&apos;s winning them over and what&apos;s quietly
            sending them to someone else.
          </p>
        </div>

        <div aria-hidden className="relative mt-4 flex h-[92px] items-end justify-between">
          <Image src="/images/laptop-pink.png" alt="" width={380} height={333}
            sizes="92px"
            className="w-[92px] -rotate-6"
          />
          <Sparkle className="mb-0 size-3 text-ink" />
          <Image src="/images/folder-pink.png" alt="" width={320} height={347}
            sizes="72px"
            className="w-[72px]"
          />
          <Sparkle className="mb-10 size-6 text-gold" />
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <a href="#apply" className={cn(buttonVariants({ variant: "brand", size: "xl" }), "w-full")}>
            Apply for one of 8 sessions →
          </a>
          <a href="#look-up-test" className={cn(buttonVariants({ variant: "paper", size: "xl" }), "w-full")}>
            Take the 60-second look-up test
          </a>
        </div>
        <p className="mx-auto mt-5 max-w-[300px] text-sm leading-relaxed text-slate">
          Two-minute application. Reviewed personally by Janefrances. Reply within one working day.
        </p>
      </section>
    </div>
  );
}
