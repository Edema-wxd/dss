import Image from "next/image";
import { Eyebrow } from "./primitives";

const caseStudyWork = [
  "A full-year digital marketing strategy and social media audit",
  "A 120-concept quarterly content calendar",
  "A standing weekly patient education series",
  "Awareness campaigns built around key health months",
];

export function Strategist() {
  return (
    <section id="strategist" aria-labelledby="strategist-title" className="scroll-mt-4 px-4 py-14 lg:px-10 lg:py-20">
      <div className="mx-auto max-w-xl lg:max-w-[1280px]">
        <Eyebrow>Who you&apos;d be working with</Eyebrow>
        <h2
          id="strategist-title"
          className="mt-5 text-[60px] leading-[0.92] font-black tracking-[-0.05em] lg:mt-6 lg:max-w-[960px] lg:text-[70px] lg:leading-[0.93]"
        >
          Trusted with brands that can&apos;t afford to look ordinary.
        </h2>

        <div className="lg:mt-12 lg:grid lg:grid-cols-[minmax(0,620fr)_minmax(0,618fr)] lg:items-start lg:gap-x-[42px]">
          <Image
            src="/images/strategist-collage.png"
            alt="Janefrances C. Obiajulu, your strategist, with Digital Savvy Studios brand stickers"
            width={1460}
            height={1380}
            sizes="(max-width: 600px) 100vw, 640px"
            className="mt-10 h-auto w-full lg:mt-0"
          />

          <div>
            <figure className="relative mt-10 lg:mt-0">
              <blockquote className="font-display rounded-[28px] border-2 border-ink bg-white p-6 pb-24 text-[19px] leading-[1.35] font-medium shadow-hard-lg lg:px-8 lg:pt-10 lg:pb-[104px] lg:text-[22px]">
                &ldquo;The best founders I meet build with courage. Too many still lose ground to
                competitors who simply communicate better. Every Visibility Session starts with us doing
                the work first, because that&apos;s how I&apos;d want to be treated.&rdquo;
              </blockquote>
              <figcaption className="absolute right-6 bottom-6 left-6 flex items-center gap-4 lg:right-8 lg:left-8 lg:bottom-8">
                <Image
                  src="/images/janefrances-halftone.png"
                  alt=""
                  width={217}
                  height={230}
                  sizes="56px"
                  className="size-14 shrink-0"
                />
                <span>
                  <span className="block font-semibold">Janefrances C. Obiajulu</span>
                  <span className="block text-[13px] leading-snug text-slate">
                    Founder and Creative Director, Digital Savvy Studios
                  </span>
                </span>
              </figcaption>
              {/* speech-bubble tail */}
              <span
                aria-hidden
                className="absolute -bottom-5 left-12 size-0 border-t-[22px] border-r-[22px] border-t-ink border-r-transparent"
              />
            </figure>

            <article className="mt-10 rounded-[28px] border-2 border-ink bg-pink p-6 text-white shadow-hard-lg lg:mt-9 lg:px-10 lg:pt-10 lg:pb-12">
              <p className="inline-flex items-center gap-2.5 rounded-full border-2 border-white px-4 py-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-white" />
                Healthcare · Retainer since March 2026
              </p>
              <h3 className="mt-4 text-[34px] leading-none font-bold lg:mt-5 lg:text-[36px]">A leading Lagos fertility clinic</h3>
              <p className="mt-3 text-[16px] leading-[1.6] text-white/95 lg:text-[17px]">
                A specialist brand in a sensitive category that needs to educate patients and earn trust
                before the first appointment.
              </p>
              <ul className="mt-5">
                {caseStudyWork.map((item) => (
                  <li key={item} className="border-t border-white/40 py-3 text-[14px] leading-[1.6] lg:text-[15px]">
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
