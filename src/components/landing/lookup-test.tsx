import Image from "next/image";
import { ClipboardListIcon, HeartIcon, MessageSquareMoreIcon, SearchIcon } from "lucide-react";
import { Keycap } from "./primitives";
import { LookupQuiz } from "./lookup-quiz";

const steps = [
  { icon: SearchIcon, text: "They search your company name.", tone: "text-ink" },
  { icon: HeartIcon, text: "They open your Instagram and your website.", tone: "text-orange fill-orange/30" },
  { icon: ClipboardListIcon, text: "They check the founder on LinkedIn.", tone: "text-ink" },
  { icon: MessageSquareMoreIcon, text: "They ask someone who knows you.", tone: "text-pink fill-pink/20" },
];

export function LookupTest() {
  return (
    <section
      id="look-up-test"
      aria-labelledby="look-up-test-title"
      className="scroll-mt-4 bg-[linear-gradient(180deg,#e6f1f0_0%,var(--color-cream)_45%)] px-4 pt-10 pb-16"
    >
      <div className="mx-auto max-w-xl">
        <p aria-hidden className="flex flex-wrap gap-x-2 gap-y-4 px-1 text-[30px]">
          <Keycap tone="paper" className="-rotate-2">the</Keycap>
          <Keycap tone="pink" className="rotate-[-3deg]">look-up</Keycap>
          <Keycap tone="aqua" className="rotate-2">test.</Keycap>
          <Keycap tone="lime" className="-rotate-3">&lt;3</Keycap>
        </p>
        <h2
          id="look-up-test-title"
          className="mt-6 px-1 text-[50px] leading-[0.95] font-black tracking-[-0.05em]"
        >
          <span className="sr-only">The look-up test. </span>
          Every serious buyer does the same <span className="text-pink">four things</span> before they reach out.
        </h2>

        <ol className="mt-8 flex flex-col gap-3">
          {steps.map(({ icon: Icon, text, tone }) => (
            <li
              key={text}
              className="flex items-center gap-4 rounded-[18px] border-2 border-ink bg-white px-5 py-4 text-[15px] leading-snug"
            >
              <Icon aria-hidden className={`size-8 shrink-0 ${tone}`} strokeWidth={2} />
              {text}
            </li>
          ))}
        </ol>

        <figure className="relative mt-8 rounded-[22px] border-2 border-dashed border-ink/70 p-0 shadow-[0_0_0_6px_rgba(255,255,255,0.8),0_0_46px_rgba(236,23,99,0.28)]">
          <figcaption className="absolute -top-4 left-4 z-10 rounded-md border-[1.5px] border-dashed border-[#d4477a] bg-pink-soft px-3 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
            They open your Instagram
          </figcaption>
          <Image
            src="/images/instagram-tablet.jpg"
            alt="A buyer scrolling a brand's Instagram grid on a tablet"
            width={760}
            height={1140}
            sizes="(max-width: 600px) 100vw, 560px"
            className="aspect-[350/290] w-full rounded-[20px] object-cover"
          />
          <Image
            src="/images/laptop-sticker.png"
            alt=""
            width={360}
            height={339}
            sizes="130px"
            className="absolute -right-3 -bottom-8 w-[130px]"
          />
        </figure>

        <div className="mt-16">
          <LookupQuiz />
        </div>
        <p className="mt-8 px-2 text-lg leading-relaxed text-slate">
          You won&apos;t be in the room for any of it. Answer five questions honestly and see what
          they&apos;d likely find.
        </p>
      </div>
    </section>
  );
}
