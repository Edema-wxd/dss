import { Eyebrow } from "./primitives";
import { CardCarousel } from "./card-carousel";

// The design shows the launch card; the other moments come from the page's
// own ticker (raise, expand, rebrand). TODO(copy): confirm their wording.
const moments = [
  {
    title: "Before a launch",
    body: "Launch week attention is expensive. Spend it on a brand that's ready to convert it.",
    finding: "a message that explains the product but never names the buyer.",
    position: "0% 0%",
  },
  {
    title: "Before a raise",
    body: "Investors look you up before the second meeting. Make sure what they find matches the deck.",
    finding: "a founder with a strong story offline and no visible point of view online.",
    position: "100% 0%",
  },
  {
    title: "Before a new market",
    body: "A new market meets you online first. Give it a reason to take the call.",
    finding: "proof that's easy to find at home and invisible to a new buyer.",
    position: "0% 100%",
  },
  {
    title: "Before a rebrand",
    body: "A rebrand is a promise. Know what buyers believe today before you change it.",
    finding: "channels telling three different stories about who you serve.",
    position: "100% 100%",
  },
];

export function BigMoments() {
  return (
    <section id="big-moments" aria-labelledby="big-moments-title" className="scroll-mt-4 px-4 py-14">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Built for big moments</Eyebrow>
        <h2
          id="big-moments-title"
          className="mt-5 text-[46px] leading-[0.98] font-black tracking-[-0.04em]"
        >
          Proactive founders book this before the moment, not after it.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-slate">
          The cost of being misread is highest right before something important. That&apos;s when
          this session pays for itself.
        </p>

        <div className="mt-8">
          <CardCarousel
            label="Moments the session is built for"
            arrowTone="text-pink"
            slides={moments.map((m) => (
              <article
                key={m.title}
                className="h-full rounded-[28px] border-2 border-ink bg-pink-tint p-5 shadow-hard-lg"
              >
                {/* each moment shows one quadrant of the same four-hands photo */}
                <div
                  aria-hidden
                  className="aspect-[300/196] rounded-[18px] border-2 border-ink bg-[url(/images/devices-hands.jpg)] bg-[length:200%_200%] bg-no-repeat"
                  style={{ backgroundPosition: m.position }}
                />
                <h3 className="mt-4 text-[24px] font-bold">{m.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed">{m.body}</p>
                <p className="mt-4 rounded-[16px] border-2 border-ink bg-white px-4 py-3 text-[14px] leading-relaxed">
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
