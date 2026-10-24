"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// 0 waiting · 1 typing first · 2 first shown · 3 typing reply · 4 both shown
type Phase = 0 | 1 | 2 | 3 | 4;
const steps: [Phase, number][] = [
  [1, 0],
  [2, 1100],
  [3, 1600],
  [4, 2800],
];

const pop = "transition-[opacity,scale] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]";

function Typing({ show, tone, className }: { show: boolean; tone: "white" | "pink"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 flex -translate-y-1/2 gap-1.5 rounded-[22px] border-2 border-ink px-5 py-4 shadow-hard-md lg:px-7 lg:py-6",
        tone === "white" ? "rounded-bl-md bg-white text-ink" : "bg-pink text-white",
        pop,
        show ? "scale-100 opacity-100" : "pointer-events-none scale-50 opacity-0",
        className,
      )}
    >
      {[0, 150, 300].map((d) => (
        <span
          key={d}
          className="size-2 animate-bounce rounded-full bg-current lg:size-3"
          style={{ animationDelay: `${d - 450}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * The two-bubble exchange, played like a chat the first time it scrolls into
 * view: typing… statement, typing… pink reply. Both bubbles hold their space
 * throughout, and everything shows at once without JS or with reduced motion.
 */
export function BubblePair({ statement, answer }: { statement: React.ReactNode; answer: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>(4);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;
    setPhase(0);

    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        for (const [p, at] of steps) timers.push(window.setTimeout(() => setPhase(p), at));
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const shown = (p: Phase) => (phase >= p ? "scale-100 opacity-100" : "scale-[0.6] opacity-0");

  return (
    <div ref={ref} className="flex flex-col gap-4 lg:gap-2.5">
      <div className="flex items-center gap-3 lg:gap-4">
        <Image
          src="/images/iconmark-pink.png"
          alt=""
          width={72}
          height={72}
          sizes="(min-width: 1024px) 140px, 64px"
          className={cn(
            "size-16 shrink-0 -rotate-6 lg:-my-7 lg:-mr-5 lg:-ml-7 lg:size-[140px]",
            pop,
            shown(1),
          )}
        />
        <div className="relative">
          <Typing show={phase === 1} tone="white" className="left-0" />
          <p
            className={cn(
              "font-display origin-bottom-left rounded-[22px] rounded-bl-md border-2 border-ink bg-white px-5 py-3.5 text-[22px] leading-[1.1] font-bold shadow-hard-md lg:rounded-[26px] lg:px-7 lg:py-4 lg:text-[50px] lg:shadow-hard-lg",
              pop,
              shown(2),
            )}
          >
            {statement}
          </p>
        </div>
      </div>
      <div className="relative lg:self-end">
        <Typing show={phase === 3} tone="pink" className="left-0 lg:right-0 lg:left-auto" />
        <p
          className={cn(
            "font-display origin-bottom-left -rotate-1 rounded-[22px] border-2 border-ink bg-pink px-5 py-3.5 text-[22px] leading-[1.1] font-bold text-white shadow-hard-md lg:origin-bottom-right lg:rounded-[26px] lg:px-7 lg:py-4 lg:text-[50px] lg:shadow-hard-lg",
            pop,
            shown(4),
          )}
        >
          {answer}
        </p>
      </div>
    </div>
  );
}
