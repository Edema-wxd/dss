import { cn } from "@/lib/utils";
import { Eyebrow } from "./primitives";
import { CardCarousel } from "./card-carousel";

const moments = [
  {
    title: "Before a launch",
    body: "Launch week attention is expensive. Spend it on a brand that's ready to convert it.",
    finding: "a message that explains the product but never names the buyer.",
    position: "0% 0%",
    tone: "bg-pink-tint",
  },
  {
    title: "Before a raise",
    body: "Investors look you up before the second meeting. Your brand is part of the deck whether you planned it or not.",
    finding: "a founder with a strong story and no visible point of view.",
    position: "100% 0%",
    tone: "bg-aqua",
  },
  {
    title: "Before a new market",
    body: "A new city or country means strangers who've never heard your name. First impressions have to do all the work.",
    finding: "proof that's buried, local or impossible to find in a minute.",
    position: "0% 100%",
    tone: "bg-[#f2f5b8]",
  },
  {
    title: "When a competitor gets louder",
    body: "A weaker offer that communicates better will win more often than it should. Clarity beats quality when buyers are in a hurry.",
    finding: "channels telling different stories, so none of them builds trust.",
    position: "100% 100%",
    tone: "bg-peach",
  },
];

export function BigMoments() {
  return (
    <section id="big-moments" aria-labelledby="big-moments-title" className="scroll-mt-4 px-4 py-14 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-xl lg:max-w-[1280px]">
        <Eyebrow>Built for big moments</Eyebrow>
        <h2
          id="big-moments-title"
          className="reveal mt-5 text-[46px] leading-[0.98] font-black tracking-[-0.04em] lg:mt-6 lg:max-w-[900px] lg:text-[70px] lg:leading-[0.93]"
        >
          Proactive founders book this before the moment, not after it.
        </h2>
        <p className="reveal mt-5 text-lg leading-relaxed text-slate lg:mt-7 lg:max-w-[640px] lg:text-[19px]">
          The cost of being misread is highest right before something important. That&apos;s when
          this session pays for itself.
        </p>

        <div className="mt-8 lg:mt-12">
          <CardCarousel
            label="Moments the session is built for"
            gridClassName="grid-cols-2 gap-[22px] xl:grid-cols-4"
            arrowTone="text-pink"
            slides={moments.map((m) => (
              <article
                key={m.title}
                className={cn("hover-lift h-full rounded-[28px] border-2 border-ink bg-pink-tint p-5 shadow-hard-lg", m.tone)}
              >
                {/* each moment shows one quadrant of the same four-hands photo */}
                <div
                  aria-hidden
                  className="aspect-[300/196] rounded-[18px] lg:aspect-auto lg:h-[170px] border-2 border-ink bg-[url(/images/devices-hands.jpg)] bg-[length:200%_200%] bg-no-repeat"
                  style={{ backgroundPosition: m.position }}
                />
                <h3 className="mt-4 text-[24px] font-bold lg:leading-[1.05]">{m.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed lg:mt-2 lg:text-[15px] lg:leading-[1.5]">{m.body}</p>
                <p className="mt-4 rounded-[16px] border-2 border-ink bg-white px-4 py-3 text-[14px] leading-relaxed lg:leading-[1.55]">
                  <strong className="font-semibold text-pink">We often find:</strong> {m.finding}
                </p>
              </article>
            ))}
          />
        </div>
      </div>
    </section>
  );
}
