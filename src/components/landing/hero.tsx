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

      <section className="relative mx-auto max-w-xl px-5 pt-14 pb-10 text-center lg:max-w-[1440px] lg:px-20 lg:pt-[148px] lg:pb-6">
        <Sparkle className="twinkle absolute top-2 left-6 size-3.5 text-ink lg:top-[88px] lg:left-[51px] lg:size-[26px]" />
        <Sparkle className="twinkle absolute top-0 right-1/2 size-3.5 text-gold [--float-delay:-1.2s] lg:top-[63px] lg:right-[calc(50%+min(28.7vw,413px))] lg:size-7" />
        <svg
          viewBox="0 0 40 36"
          aria-hidden
          className="float absolute top-12 left-5 h-8 w-9 -rotate-12 [--float-delay:-2s] lg:top-[136px] lg:right-[calc(50%+min(25.4vw,366px))] lg:left-auto lg:h-[78px] lg:w-[86px]"
        >
          <path d="M2 18 38 2 28 34 20 22Z" fill="#cdd629" stroke="#212121" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <Image
          src="/images/dss-keys.png"
          alt=""
          width={389}
          height={265}
          sizes="(min-width: 1024px) 180px, 96px"
          className="float hover-pop absolute top-8 -right-1 w-[96px] [--float-delay:-0.8s] lg:top-[97px] lg:right-auto lg:left-[calc(50%+min(27.4vw,395px))] lg:w-[180px]"
        />

        <p className="rise-in relative mx-auto inline-block border-[1.5px] border-dashed border-[#d4477a] bg-pink-soft px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-pink uppercase lg:rounded-[6px] lg:bg-pink-tint lg:px-5 lg:py-3 lg:text-[14px] lg:tracking-[0.1em] lg:text-ink">
          For founders who move first
          {/* speech-bubble tail on desktop */}
          <svg aria-hidden viewBox="0 0 24 14" className="absolute top-full left-[46px] -mt-px hidden h-3.5 w-6 lg:block">
            <path d="M0 0 12 13 24 0" fill="var(--color-pink-tint)" stroke="#d4477a" strokeWidth="1.5" strokeDasharray="3 2" />
          </svg>
        </p>
        <h1 className="rise-in mt-1 text-[38px] [--rise-delay:120ms] leading-[0.95] font-black tracking-[-0.04em] text-ink lg:mt-12 lg:text-[min(7.8vw,112px)] lg:leading-[1.01]">
          They loved the{" "}
          <RotatingWord
            words={["Pitch.", "Brand.", "Products.", "Service."]}
            srText="Pitch."
            interval={3000}
            className="text-pink"
          />{" "}
          <br className="max-lg:hidden" />
          Then they looked you up!
        </h1>

        <div className="relative mt-12 lg:mt-[78px]">
          <Image
            src="/images/wifi-heart.png"
            alt=""
            width={360}
            height={284}
            sizes="(min-width: 1024px) 86px, 44px"
            className="float hover-pop absolute -top-6 left-3 w-[44px] -rotate-12 [--float-delay:-3s] lg:-top-[118px] lg:right-[calc(50%+min(37.5vw,540px))] lg:left-auto lg:w-[min(6vw,86px)]"
          />
          <Image
            src="/images/cursor-pink.png"
            alt=""
            width={300}
            height={408}
            sizes="(min-width: 1024px) 56px, 28px"
            className="float hover-pop absolute -top-12 right-10 w-[28px] [--float-delay:-1.5s] lg:-top-[98px] lg:right-auto lg:left-[calc(50%+min(37.8vw,545px))] lg:w-[min(3.9vw,56px)]"
          />
          <p className="rise-in mx-auto max-w-[330px] text-[11px] [--rise-delay:240ms] leading-[1.75] text-slate lg:max-w-[1180px] lg:text-[20px] lg:leading-[1.65]">
            The Visibility Session is a <strong className="font-semibold text-ink">₦250,000</strong>{" "}
            brand review we give free to 8 founders a month. We look you up the way a serious buyer
            would, then show you in 30 minutes what&apos;s winning them over and what&apos;s quietly
            sending them to someone else.
          </p>
        </div>

        <div aria-hidden className="relative mt-4 flex h-[92px] items-end justify-between lg:pointer-events-none lg:absolute lg:inset-0 lg:mt-0 lg:block lg:h-auto">
          <Image src="/images/laptop-pink.png" alt="" width={380} height={333}
            sizes="(min-width: 1024px) 168px, 92px"
            className="float hover-pop w-[92px] -rotate-6 [--float-delay:-2.6s] lg:pointer-events-auto lg:absolute lg:right-[calc(50%+464px)] lg:bottom-[62px] lg:hidden lg:w-[168px] xl:block"
          />
          <Sparkle className="twinkle mb-0 size-3 text-ink [--float-delay:-0.6s] lg:absolute lg:right-[30px] lg:bottom-[53px] lg:size-6" />
          <Image src="/images/folder-pink.png" alt="" width={320} height={347}
            sizes="(min-width: 1024px) 118px, 72px"
            className="float hover-pop w-[72px] [--float-delay:-4s] lg:pointer-events-auto lg:absolute lg:bottom-[70px] lg:left-[calc(50%+400px)] lg:hidden lg:w-[118px] xl:block"
          />
          <Sparkle className="twinkle mb-10 size-6 text-gold [--float-delay:-1.9s] lg:absolute lg:right-[calc(50%+490px)] lg:bottom-[31px] lg:hidden lg:size-7 xl:block" />
        </div>

        <div className="rise-in relative mt-6 flex flex-col gap-4 [--rise-delay:360ms] lg:mt-12 lg:flex-row lg:justify-center">
          <a href="#apply" className={cn(buttonVariants({ variant: "brand", size: "xl" }), "press-loop w-full lg:h-[52px] lg:w-auto lg:px-7 lg:text-[15px]")}>
            Apply for one of 8 sessions →
          </a>
          <a href="#look-up-test" className={cn(buttonVariants({ variant: "paper", size: "xl" }), "press-loop w-full [--press-delay:3.4s] lg:h-[52px] lg:w-auto lg:px-7 lg:text-[15px]")}>
            Take the 60-second look-up test
          </a>
        </div>
        <p className="mx-auto mt-5 max-w-[300px] text-sm leading-relaxed text-slate lg:mt-10 lg:max-w-none">
          Two-minute application. Reviewed personally by Janefrances. Reply within one working day.
        </p>
      </section>
    </div>
  );
}
