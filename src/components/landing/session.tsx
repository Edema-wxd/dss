import Image from "next/image";
import { cn } from "@/lib/utils";
import { BubblePair } from "./chat-bubbles";
import { Eyebrow } from "./primitives";
import { CardCarousel } from "./card-carousel";

const studyList = [
  "Your website and first impression",
  "Instagram, LinkedIn and TikTok",
  "What Google shows on page one",
  "Press, reviews and founder presence",
  "Your three closest competitors",
];

const cardTones = {
  aqua: "bg-aqua",
  lime: "bg-lime",
  pink: "bg-pink-tint",
} as const;

function StudyCard({
  tag,
  title,
  items,
  body,
  tone = "aqua",
  image,
}: {
  tag: string;
  title: string;
  items?: string[];
  body?: string;
  tone?: keyof typeof cardTones;
  image: { src: string; alt: string; width: number; height: number; position?: string };
}) {
  return (
    <article className={cn("hover-lift h-full rounded-[28px] border-2 border-ink p-6 shadow-hard-lg lg:p-8", cardTones[tone])}>
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes="(max-width: 600px) 90vw, 600px"
        className="aspect-[300/134] w-full rounded-[18px] border-2 border-ink object-cover lg:aspect-auto lg:h-[175px]"
        style={{ objectPosition: image.position }}
      />
      <p className="mt-5 inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
        {tag}
      </p>
      <h3 className="mt-2 text-[26px] leading-[1.05] font-bold lg:mt-4">{title}</h3>
      {body && <p className="mt-3 text-[15px] leading-[1.6] lg:mt-4 lg:text-[16px]">{body}</p>}
      {items && (
        <ul className="mt-3 flex flex-col gap-2.5 lg:mt-4 lg:gap-3">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-[15px] lg:text-[16px]">
              <span aria-hidden className="text-pink">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function Session() {
  return (
    <section id="the-session" aria-labelledby="session-title" className="scroll-mt-4 px-4 py-14 lg:px-10 lg:pt-20 lg:pb-12">
      <div className="mx-auto max-w-xl lg:max-w-[1280px]">
        <Eyebrow>What the session is</Eyebrow>
        <h2 id="session-title" className="sr-only">
          Most free calls are a pitch. This one is homework we do for you.
        </h2>
        <div className="mt-6 lg:mt-8" aria-hidden>
          <BubblePair statement="Most free calls are a pitch." answer="This one is homework we do for you." />
        </div>

        <div className="mt-8 lg:mt-10">
          <CardCarousel
            label="What happens in the Visibility Session"
            gridClassName="grid-cols-3 gap-[26px]"
            entrance="reveal-pop"
            slides={[
              <StudyCard
                key="before"
                tag="Before we meet"
                title="We study you like a buyer would"
                items={studyList}
                image={{
                  src: "/images/before-we-meet.jpg",
                  alt: "A founder holding a business magazine",
                  width: 736,
                  height: 981,
                  position: "center 30%",
                }}
              />,
              <StudyCard
                key="during"
                tag="30 minutes together"
                title="We show you what we found"
                body="A senior strategist walks you through your one-page review: what's working, the three things costing you customers, and why they matter right now."
                tone="lime"
                image={{
                  src: "/images/session-review.jpg",
                  alt: "Printed brand photos spread across a desk beside a laptop",
                  width: 736,
                  height: 981,
                  position: "center 70%",
                }}
              />,
              <StudyCard
                key="after"
                tag="After the call"
                title="You keep three moves"
                body="Clear priorities you can hand to your team this week, whether or not we ever work together. If you don't leave with them, we send you the full written review, free."
                tone="pink"
                image={{
                  src: "/images/after-the-call.jpg",
                  alt: "A red chess queen towering over a smaller piece on a red and white board",
                  width: 735,
                  height: 719,
                  position: "center 60%",
                }}
              />,
            ]}
          />
        </div>

        {/* pops in, strikes the price, stamps it FREE; a cursor keeps tapping it */}
        <div className="reveal-pop hover-lift relative mt-8 rounded-[28px] border-2 border-ink bg-pink px-6 py-8 text-center text-white shadow-hard-lg lg:flex lg:items-center lg:gap-6 lg:px-11 lg:py-7 lg:text-left">
          <p className="font-display relative inline-block shrink-0 text-[46px] leading-none font-black tracking-[-0.04em] text-lime lg:text-[104px]">
            <span className="sr-only">Usually </span>₦250,000
            <span aria-hidden className="reveal-draw absolute inset-x-[-4px] top-1/2 h-1.5 -translate-y-1/2 bg-ink [--draw-delay:0.55s] lg:inset-x-[-12px] lg:h-3" />
            <span
              aria-hidden
              className="reveal-stamp absolute -top-5 -right-7 -rotate-12 rounded-[10px] border-2 border-ink bg-white px-2.5 py-1 font-sans text-[15px] font-bold tracking-[0.12em] text-pink shadow-hard-sm [--draw-delay:1.1s] lg:-top-7 lg:-right-12 lg:px-4 lg:py-1.5 lg:text-[24px] lg:shadow-hard"
            >
              FREE
            </span>
          </p>
          <div>
            <p className="font-display mt-3 text-[28px] leading-[1.05] font-bold lg:mt-0 lg:text-[30px]">Free for 8 founders a month</p>
            <p className="mx-auto mt-3 max-w-[260px] text-sm leading-[1.8] text-white/90 lg:mt-1 lg:max-w-none lg:text-[15px] lg:leading-normal">
              Sessions are confirmed in the order qualified applications arrive.
            </p>
          </div>
          <span aria-hidden className="absolute -right-3 -bottom-8 w-[48px] lg:right-5 lg:-bottom-9 lg:w-[66px]">
            {/* ripple sits at the cursor's tip */}
            <span className="tap-ripple absolute -top-3 -left-3 size-7 rounded-full border-[3px] border-white opacity-0 lg:size-9" />
            <Image
              src="/images/cursor-grey.png"
              alt=""
              width={300}
              height={408}
              sizes="(min-width: 1024px) 66px, 48px"
              className="cursor-tap relative w-full"
            />
          </span>
        </div>
      </div>
    </section>
  );
}
