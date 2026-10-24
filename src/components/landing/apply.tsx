import Image from "next/image";
import { Keycap } from "./primitives";
import { ApplyForm } from "./apply-form";

export function Apply() {
  return (
    <section
      id="apply"
      aria-labelledby="apply-title"
      className="scroll-mt-0 overflow-hidden border-b-2 border-ink bg-pink px-4 pt-12 pb-14 lg:overflow-visible lg:border-t-2 lg:px-10 lg:pt-[88px] lg:pb-[68px]"
    >
      <div className="relative mx-auto max-w-xl lg:max-w-[1280px]">
        <div className="relative h-[120px] lg:absolute lg:inset-x-0 lg:top-0 lg:h-0">
          <p className="absolute top-0 left-1/2 -translate-x-1/2 -rotate-6 rounded-[10px] border-2 border-ink bg-lime px-4 py-2 text-[15px] font-semibold whitespace-nowrap shadow-hard-sm lg:-top-[116px] lg:right-[58px] lg:left-auto lg:translate-x-0 lg:px-[18px] lg:py-3 lg:text-[16px] lg:shadow-hard">
            8 founders a month
          </p>
          <Image
            src="/images/cat-megaphone.png"
            alt=""
            width={755}
            height={555}
            sizes="(min-width: 1024px) 340px, 118px"
            className="absolute top-10 -left-2 w-[118px] lg:top-[2px] lg:-left-[34px] lg:w-[340px]"
          />
          <Image
            src="/images/camera-sticker.png"
            alt=""
            width={736}
            height={736}
            sizes="(min-width: 1024px) 325px, 96px"
            className="absolute top-12 right-0 w-[96px] lg:-top-[36px] lg:-right-[16px] lg:w-[325px]"
          />
        </div>

        <p className="relative mx-auto mt-2 flex w-fit lg:mt-0 items-center gap-2.5 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <span aria-hidden className="size-2 rounded-full bg-pink" />
          October applications open
        </p>

        <h2 id="apply-title" className="relative mt-6 text-center text-[44px] lg:mt-8 lg:text-[50px]">
          <span className="sr-only">Claim one of this month&apos;s 8 sessions.</span>
          <span aria-hidden className="flex flex-wrap justify-center gap-x-2 gap-y-5 lg:mx-auto lg:max-w-[700px] lg:gap-y-4">
            <Keycap tone="butter" className="-rotate-1">Claim</Keycap>
            <Keycap tone="aqua" className="rotate-1">one of</Keycap>
            <Keycap tone="paper" className="-rotate-1">this month&apos;s</Keycap>
            <Keycap tone="lime" className="-rotate-3">8</Keycap>
            <Keycap tone="pink" className="rotate-[-2deg]">sessions.</Keycap>
          </span>
        </h2>
        <p className="mx-auto mt-8 max-w-[300px] text-center text-[17px] leading-[1.6] text-white lg:mt-11 lg:max-w-[680px] lg:text-[26px] lg:leading-[1.15]">
          Two short steps. We read every application and reply within one working day
        </p>

        <div className="mt-10 lg:mx-auto lg:mt-12 lg:max-w-[860px]">
          <ApplyForm />
        </div>
      </div>
    </section>
  );
}
