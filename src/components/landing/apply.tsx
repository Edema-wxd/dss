import Image from "next/image";
import { getSlotStatus } from "@/lib/slots";
import { Keycap } from "./primitives";
import { ApplyForm } from "./apply-form";

export async function Apply() {
  const slots = await getSlotStatus();

  return (
    <section
      id="apply"
      aria-labelledby="apply-title"
      className="scroll-mt-0 overflow-x-clip border-b-2 border-ink bg-pink px-4 pt-12 pb-14 lg:overflow-visible lg:border-t-2 lg:px-10 lg:pt-[88px] lg:pb-[68px]"
    >
      <div className="relative mx-auto max-w-xl lg:max-w-[1280px]">
        <div className="relative h-[100px] lg:absolute lg:inset-x-0 lg:top-0 lg:h-0">
          {/* straddles the section's top edge; the wrapper bobs, the badge blinks */}
          <div className="float absolute -top-[70px] left-1/2 z-10 -translate-x-1/2 [--float-delay:-3.2s] lg:-top-[116px] lg:right-[58px] lg:left-auto lg:translate-x-0">
            <p className="blink -rotate-6 rounded-[10px] border-2 border-ink bg-lime px-4 py-2 text-[15px] font-semibold whitespace-nowrap shadow-hard-sm lg:px-[18px] lg:py-3 lg:text-[16px] lg:shadow-hard">
              {slots.per} founders a month
            </p>
          </div>
          <Image
            src="/images/cat-megaphone.png"
            alt=""
            width={755}
            height={555}
            sizes="(min-width: 1024px) 340px, 118px"
            className="float hover-pop absolute top-3 -left-2 w-[118px] [--float-delay:-0.7s] lg:top-[127px] lg:right-[calc(50%+350px)] lg:left-auto lg:w-[calc(50%-316px)] lg:max-w-[340px] lg:-translate-y-1/2"
          />
          <Image
            src="/images/camera-sticker.png"
            alt=""
            width={736}
            height={736}
            sizes="(min-width: 1024px) 325px, 96px"
            className="float hover-pop absolute top-5 right-0 w-[96px] [--float-delay:-2.4s] lg:top-[126px] lg:right-auto lg:left-[calc(50%+350px)] lg:w-[calc(50%-334px)] lg:max-w-[325px] lg:-translate-y-1/2"
          />
        </div>

        <p className="relative mx-auto mt-2 flex w-fit lg:mt-0 items-center gap-2.5 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase">
          <span aria-hidden className="pulse-dot size-2 rounded-full bg-pink" />
          {!slots.open
            ? "Applications are closed for now"
            : `${slots.thisMonthFull ? "This month is full · " : ""}${slots.month} applications open`}
        </p>

        <h2 id="apply-title" className="relative mt-6 text-center text-[44px] lg:mt-8 lg:text-[50px]">
          <span className="sr-only">{`Claim one of ${slots.month}'s ${slots.per} sessions.`}</span>
          <span aria-hidden className="flex flex-wrap justify-center gap-x-2 gap-y-5 lg:mx-auto lg:max-w-[700px] lg:gap-y-4">
            <Keycap tone="butter" className="reveal key-press -rotate-1 [--press-delay:1.2s]">Claim</Keycap>
            <Keycap tone="aqua" className="reveal key-press rotate-1 [--press-delay:1.45s]">one of</Keycap>
            <Keycap tone="paper" className="reveal key-press -rotate-1 [--press-delay:1.7s]">{slots.month}&apos;s</Keycap>
            <Keycap tone="lime" className="reveal key-press -rotate-3 [--press-delay:1.95s]">{slots.per}</Keycap>
            <Keycap tone="pink" className="reveal key-press rotate-[-2deg] [--press-delay:2.2s]">sessions.</Keycap>
          </span>
        </h2>
        <p className="mx-auto mt-8 max-w-[300px] text-center text-[17px] leading-[1.6] text-white lg:mt-11 lg:max-w-[680px] lg:text-[26px] lg:leading-[1.15]">
          Two short steps. We read every application and reply within one working day
        </p>

        <div className="reveal mt-10 lg:mx-auto lg:mt-12 lg:max-w-[860px]">
          <ApplyForm />
        </div>
      </div>
    </section>
  );
}
