"use client";

import { useEffect, useRef, useState } from "react";
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./primitives";

// Copy and open-state colours from the FAQ designs (one colour per question).
const faqs = [
  {
    q: "Is it really free?",
    a: "Yes. We price the review at ₦250,000 because that's what the work is worth, and we give 8 of them a month to founders we'd like to work with. There's no card, no deposit and no catch.",
    open: "data-open:bg-aqua",
    question: "",
    answer: "text-slate",
    icon: "text-pink",
  },
  {
    q: "Is this a sales call in disguise?",
    a: "No. You get the review and three moves whether or not we ever work together. If there's a fit, we'll say so at the end and you can decide in your own time.",
    open: "data-open:bg-pink",
    question: "group-data-open/item:text-white",
    answer: "text-white",
    icon: "group-data-open/item:text-white",
  },
  {
    q: "Who will I speak with?",
    a: "A senior strategist, usually Janefrances herself. You won't be handed to a junior or a sales rep.",
    open: "data-open:bg-lime",
    question: "",
    answer: "text-ink",
    icon: "group-data-open/item:text-ink",
  },
  {
    q: "We're not ready to spend yet. Should we still apply?",
    a: "Apply when you're within six months of a big moment and ready to invest ₦800,000 or more a month. If you're earlier than that, we'll send you our Launch Visibility Checklist so you can close the biggest gaps yourself.",
    open: "data-open:bg-orange",
    question: "group-data-open/item:text-white",
    answer: "text-white",
    icon: "group-data-open/item:text-white",
  },
  {
    q: "How soon will my session be?",
    a: "Usually within two weeks of approval. If your launch or raise is sooner, tell us in the application and we'll do our best to move you up.",
    open: "data-open:bg-maroon",
    question: "group-data-open/item:text-white",
    answer: "text-white/90",
    icon: "group-data-open/item:text-white",
  },
  {
    q: "We're outside Nigeria. Can we apply?",
    a: 'Yes. We work with brands entering or growing in Nigeria and with founders abroad. Choose "We budget in USD or another currency" and we\'ll quote you in your currency.',
    open: "data-open:bg-navy",
    question: "group-data-open/item:text-white",
    answer: "text-white/90",
    icon: "group-data-open/item:text-white",
  },
];

const ease = "ease-[cubic-bezier(0.22,1,0.36,1)]";

/** Plus that folds into a minus when its item opens. */
function PlusMinus({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative mt-1.5 size-4 shrink-0 text-pink transition-colors duration-300", className)}>
      <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-current" />
      <span
        className={cn(
          "absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-current transition-transform duration-300",
          ease,
          "group-data-open/item:scale-y-0 group-data-open/item:rotate-90",
        )}
      />
    </span>
  );
}

/** Cards rise in one after another the first time the list scrolls into view. */
function useRevealOnce<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<"static" | "waiting" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen at load: leave it as rendered.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState("waiting");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return { ref, state };
}

export function Faq() {
  const { ref, state } = useRevealOnce<HTMLDivElement>();

  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-4 px-4 py-14 lg:px-10 lg:pt-[116px] lg:pb-16">
      <div className="mx-auto max-w-xl lg:max-w-[1280px]">
        <Eyebrow>Straight answers</Eyebrow>
        <div className="mt-5 flex items-center gap-3 lg:mt-5 lg:gap-2.5">
          <h2
            id="faq-title"
            className="rounded-[22px] rounded-bl-md border-2 border-ink bg-white px-5 py-3 text-[24px] font-bold shadow-hard lg:rounded-[26px] lg:px-7 lg:py-4 lg:text-[50px] lg:shadow-hard-lg"
          >
            Before you <span className="text-pink">apply.</span>
          </h2>
          <span aria-hidden className="flex gap-1 rounded-full border-2 border-ink bg-white px-4 py-3 lg:gap-1.5 lg:px-[18px]">
            <span className="size-2 animate-bounce rounded-full bg-ink [animation-delay:-0.3s] motion-reduce:animate-none" />
            <span className="size-2 animate-bounce rounded-full bg-ink [animation-delay:-0.15s] motion-reduce:animate-none" />
            <span className="size-2 animate-bounce rounded-full bg-ink motion-reduce:animate-none" />
          </span>
        </div>

        <div ref={ref}>
          <Accordion multiple={false} className="mt-8 gap-4 lg:mt-11">
            {faqs.map((item, i) => (
              <AccordionItem
                key={item.q}
                value={item.q}
                style={{ transitionDelay: state === "shown" ? `${i * 70}ms, ${i * 70}ms, 0ms` : undefined }}
                className={cn(
                  "group/item rounded-[21px] border-2 border-ink bg-white not-last:border-2",
                  "transition-[opacity,translate,background-color] duration-500",
                  ease,
                  state === "waiting" && "translate-y-6 opacity-0",
                  item.open,
                )}
              >
                <AccordionPrimitive.Header className="flex">
                  <AccordionPrimitive.Trigger
                    className={cn(
                      "font-display flex min-h-[70px] flex-1 items-start justify-between gap-5 rounded-[19px] px-6 py-5 text-left text-[18px] leading-[1.15] font-bold text-ink outline-none lg:min-h-[76px] lg:px-7 lg:text-[22px]",
                      "transition-[color,scale] duration-300 focus-visible:ring-3 focus-visible:ring-pink/50 active:scale-[0.985]",
                      item.question,
                    )}
                  >
                    <span className="self-center">{item.q}</span>
                    <PlusMinus className={item.icon} />
                  </AccordionPrimitive.Trigger>
                </AccordionPrimitive.Header>
                <AccordionPrimitive.Panel
                  className={cn(
                    "h-(--accordion-panel-height) overflow-hidden transition-[height] duration-400 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none",
                    ease,
                  )}
                >
                  <p
                    className={cn(
                      "px-6 pb-6 text-[15px] leading-[1.6] lg:max-w-[920px] lg:px-7 lg:pb-7 lg:text-[17px]",
                      "translate-y-2 opacity-0 transition-[opacity,translate] delay-100 duration-300 group-data-open/item:translate-y-0 group-data-open/item:opacity-100 motion-reduce:translate-y-0",
                      ease,
                      item.answer,
                    )}
                  >
                    {item.a}
                  </p>
                </AccordionPrimitive.Panel>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
