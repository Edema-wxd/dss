import Image from "next/image";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BubblePair, Eyebrow, Sparkle } from "./primitives";
import { ChecklistDialog } from "./checklist-dialog";

const forYou = [
  "You're the founder, CEO or the person who signs off on growth.",
  "You have a launch, raise, expansion or reputation moment in the next six months.",
  "You invest, or are ready to invest, ₦800,000 or more a month in marketing.",
  "You want senior thinking, and you act quickly on good advice.",
];

const notForYou = [
  "You're collecting quotes to find the cheapest option.",
  "You want someone to post for you without a strategy behind it.",
  "You're happy with how the market sees you today.",
];

export function FitCheck() {
  return (
    <section id="is-this-for-you" aria-labelledby="fit-title" className="scroll-mt-4 px-4 py-14">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Is this for you?</Eyebrow>
        <h2 id="fit-title" className="sr-only">
          Only 8 founders a month. Are you one of them?
        </h2>
        <div className="mt-6" aria-hidden>
          <BubblePair statement="Only 8 founders a month." answer="Are you one of them?" />
        </div>

        {/* "Admit one" ticket */}
        <div className="relative mt-8 rounded-[28px] border-2 border-ink bg-lime p-6 shadow-hard-lg">
          <span aria-hidden className="absolute top-12 -left-4 size-8 rounded-full border-2 border-ink bg-cream" />
          <span aria-hidden className="absolute top-12 -right-4 size-8 rounded-full border-2 border-ink bg-cream" />
          <div className="flex justify-between text-[11px] font-semibold tracking-[0.14em] uppercase">
            <span>Admit one</span>
            <span className="flex items-center gap-1.5">
              <Sparkle className="size-3 text-ink" /> 8 seats a month
            </span>
          </div>
          <h3 className="mt-8 text-[30px] font-bold">This is for you if</h3>
          <ul className="mt-4 flex flex-col gap-4">
            {forYou.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-[1.6]">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-white">
                  <CheckIcon aria-hidden className="size-4" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-8 rounded-[28px] border-2 border-dashed border-ink bg-white p-6 shadow-hard">
          <p className="absolute -top-0 right-5 mt-6 rotate-6 rounded-md border-2 border-pink px-3 py-1 text-[13px] font-semibold tracking-[0.14em] text-pink uppercase">
            Not this time
          </p>
          <h3 className="mt-14 text-[30px] font-bold">It isn&apos;t for you if</h3>
          <ul className="mt-4 flex flex-col gap-4">
            {notForYou.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-[1.6]">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink bg-pink text-white">
                  <XIcon aria-hidden className="size-4" strokeWidth={2.5} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <div className="mt-8 rounded-[20px] border-2 border-ink bg-aqua p-6">
            <h4 className="font-display text-[22px] font-bold">Not there yet?</h4>
            <p className="mt-1 text-[14px] leading-[1.6] text-slate">
              Grab the free Launch Visibility Checklist and close the biggest gaps yourself.
            </p>
            <ChecklistDialog
              trigger={
                <Button variant="lime" size="pill" className="mt-4">
                  Get the checklist →
                </Button>
              }
            />
          </div>
        </div>

        <div className="mt-12 flex items-end gap-3">
          <Image
            src="/images/janefrances-halftone.png"
            alt="Janefrances"
            width={217}
            height={230}
            sizes="64px"
            className="w-[64px] shrink-0"
          />
          <p className="mb-6 rounded-[22px] border-2 border-ink bg-white p-5 text-[14px] leading-[1.75] font-medium shadow-hard-md">
            If we&apos;re a fit afterwards, most clients start with a 90-day Visibility Sprint.
            Engagements start from ₦800,000 a month. You&apos;ll never be pushed into one.
          </p>
        </div>
      </div>
    </section>
  );
}
