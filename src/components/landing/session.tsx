import Image from "next/image";
import { BubblePair, Eyebrow } from "./primitives";
import { CardCarousel } from "./card-carousel";

const studyList = [
  "Your website and first impression",
  "Instagram, LinkedIn and TikTok",
  "What Google shows on page one",
  "Press, reviews and founder presence",
  "Your three closest competitors",
];

// TODO(copy): the design shows only the "Before we meet" card; this second card is drafted from the hero copy.
const sessionList = [
  "What's winning buyers over",
  "What's quietly sending them elsewhere",
  "Which gaps to close first",
];

function StudyCard({
  tag,
  title,
  items,
  image,
}: {
  tag: string;
  title: string;
  items: string[];
  image: { src: string; alt: string; width: number; height: number; position?: string };
}) {
  return (
    <article className="h-full rounded-[28px] border-2 border-ink bg-aqua p-6 shadow-hard-lg">
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes="(max-width: 600px) 90vw, 520px"
        className="aspect-[300/134] w-full rounded-[18px] border-2 border-ink object-cover"
        style={{ objectPosition: image.position }}
      />
      <p className="mt-5 inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
        {tag}
      </p>
      <h3 className="mt-2 text-[26px] leading-[1.05] font-bold">{title}</h3>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[15px]">
            <span aria-hidden className="text-pink">
              ✓
            </span>
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function Session() {
  return (
    <section id="the-session" aria-labelledby="session-title" className="scroll-mt-4 px-4 py-14">
      <div className="mx-auto max-w-xl">
        <Eyebrow>What the session is</Eyebrow>
        <h2 id="session-title" className="sr-only">
          Most free calls are a pitch. This one is homework we do for you.
        </h2>
        <div className="mt-6" aria-hidden>
          <BubblePair statement="Most free calls are a pitch." answer="This one is homework we do for you." />
        </div>

        <div className="mt-8">
          <CardCarousel
            label="What happens in the Visibility Session"
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
                tag="In the 30 minutes"
                title="We show you what we found"
                items={sessionList}
                image={{
                  src: "/images/instagram-tablet.jpg",
                  alt: "Reviewing a brand's Instagram grid on a tablet",
                  width: 760,
                  height: 1140,
                  position: "center 40%",
                }}
              />,
            ]}
          />
        </div>

        <div className="relative mt-8 rounded-[28px] border-2 border-ink bg-pink px-6 py-8 text-center text-white shadow-hard-lg">
          <p className="font-display relative inline-block text-[46px] leading-none font-black tracking-[-0.04em] text-lime">
            <span className="sr-only">Usually </span>₦250,000
            <span aria-hidden className="absolute inset-x-[-4px] top-1/2 h-1.5 -translate-y-1/2 bg-ink" />
          </p>
          <p className="font-display mt-3 text-[28px] leading-[1.05] font-bold">Free for 8 founders a month</p>
          <p className="mx-auto mt-3 max-w-[260px] text-sm leading-[1.8] text-white/90">
            Sessions are confirmed in the order qualified applications arrive.
          </p>
          <Image
            src="/images/cursor-grey.png"
            alt=""
            width={300}
            height={408}
            sizes="48px"
            className="absolute -right-3 -bottom-8 w-[48px]"
          />
        </div>
      </div>
    </section>
  );
}
