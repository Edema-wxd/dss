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
      className="scroll-mt-4 bg-[linear-gradient(180deg,#e6f1f0_0%,var(--color-cream)_45%)] px-4 pt-10 pb-16 lg:bg-none lg:px-10 lg:pt-[78px] lg:pb-32"
    >
      <div className="mx-auto max-w-xl lg:grid lg:max-w-[1280px] lg:grid-cols-[minmax(0,582fr)_minmax(0,640fr)] lg:items-start lg:gap-x-[58px]">
        <div>
          <p aria-hidden className="flex flex-wrap gap-x-2 gap-y-4 px-1 text-[30px] lg:max-w-[440px] lg:gap-x-2 lg:gap-y-3 lg:px-0 lg:text-[60px]">
            <Keycap tone="paper" className="-rotate-2">the</Keycap>
            <Keycap tone="pink" className="rotate-[-3deg]">look-up</Keycap>
            <Keycap tone="aqua" className="rotate-2">test.</Keycap>
            <Keycap tone="lime" className="-rotate-3">&lt;3</Keycap>
          </p>
          <h2
            id="look-up-test-title"
            className="mt-6 px-1 text-[50px] leading-[0.95] font-black tracking-[-0.05em] lg:mt-5 lg:px-0 lg:text-[62px] lg:leading-[1.02]"
          >
            <span className="sr-only">The look-up test. </span>
            Every serious buyer does the same <span className="text-pink lg:text-ink">four things</span> before they reach out.
          </h2>

          <ol className="mt-8 flex flex-col gap-3 lg:mt-8 lg:gap-3.5">
            {steps.map(({ icon: Icon, text, tone }) => (
              <li
                key={text}
                className="flex items-center gap-4 rounded-[18px] border-2 border-ink bg-white px-5 py-4 text-[15px] leading-snug lg:min-h-[70px] lg:px-6 lg:text-[16px]"
              >
                <Icon aria-hidden className={`size-8 shrink-0 ${tone}`} strokeWidth={2} />
                {text}
              </li>
            ))}
          </ol>

          <figure className="relative mt-8 lg:mt-9 rounded-[22px] border-2 border-dashed border-ink/70 p-0 shadow-[0_0_0_6px_rgba(255,255,255,0.8),0_0_46px_rgba(236,23,99,0.28)]">
            <figcaption className="absolute -top-4 left-4 z-10 rounded-md border-[1.5px] border-dashed border-[#d4477a] bg-pink-soft px-3 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
              They open your Instagram
            </figcaption>
            <Image
              src="/images/instagram-tablet.jpg"
              alt="A buyer scrolling a brand's Instagram grid on a tablet"
              width={760}
              height={1140}
              sizes="(max-width: 600px) 100vw, 584px"
              className="aspect-[350/290] w-full rounded-[20px] object-cover lg:aspect-[584/290]"
            />
            <Image
              src="/images/laptop-sticker.png"
              alt=""
              width={360}
              height={339}
              sizes="130px"
              className="absolute -right-3 -bottom-8 w-[130px] lg:-right-1 lg:-bottom-7"
            />
          </figure>
        </div>

        <div>
          <div className="mt-16 lg:mt-0">
            <LookupQuiz />
          </div>
          <p className="mt-8 px-2 text-lg leading-relaxed text-slate lg:mt-6 lg:max-w-[540px] lg:px-0 lg:text-[19px]">
            You won&apos;t be in the room for any of it. Answer five questions honestly and see what
            they&apos;d likely find.
          </p>
        </div>
      </div>
    </section>
  );
}
