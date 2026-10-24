"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cycles through words in place. Every word sits in the same grid cell and the
 * slot eases to the current word's width, so spacing stays natural.
 * Screen readers get `srText` only; the moving words are hidden from them.
 */
export function RotatingWord({
  words,
  srText,
  interval = 2800,
  className,
}: {
  words: string[];
  srText: string;
  interval?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [widths, setWidths] = useState<number[]>([]);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [words.length, interval]);

  // Measure once the display font is in, and again if the viewport changes.
  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (!cancelled) setWidths(wordRefs.current.map((el) => el?.offsetWidth ?? 0));
    };
    document.fonts.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", measure);
    };
  }, [words]);

  const exiting = (index - 1 + words.length) % words.length;

  return (
    <span
      className={cn(
        "inline-grid justify-items-start overflow-hidden align-bottom transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        className,
      )}
      style={widths[index] ? { width: widths[index] } : undefined}
    >
      <span className="sr-only">{srText}</span>
      {words.map((word, i) => (
        <span
          key={word}
          ref={(el) => {
            wordRefs.current[i] = el;
          }}
          aria-hidden
          data-state={i === index ? "active" : i === exiting ? "exit" : "idle"}
          className="col-start-1 row-start-1 translate-y-full whitespace-nowrap opacity-0 transition-[translate,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=active]:translate-y-0 data-[state=active]:opacity-100 data-[state=exit]:-translate-y-full motion-reduce:translate-y-0 motion-reduce:transition-opacity motion-reduce:data-[state=exit]:translate-y-0"
        >
          {word}
        </span>
      ))}
    </span>
  );
}
