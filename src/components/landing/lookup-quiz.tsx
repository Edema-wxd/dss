"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

const statements = [
  "A stranger understands what you do, and who it's for, within five seconds of landing on your homepage.",
  "Your Instagram and LinkedIn tell the same story about who you serve.",
  "Search your company name. Page one shows something you'd be proud for a buyer to see.",
  "Your founder has a visible point of view online, not just a job title.",
  "A buyer can find proof, such as results, press or reviews, in under a minute.",
];

type Answer = "true" | "not-yet";

// TODO(copy): result wording is drafted; confirm with Janefrances.
function resultFor(score: number) {
  if (score === 5)
    return {
      title: "They'd likely find a brand that's ready.",
      body: "Your basics hold up. The session shows you what's winning buyers over, so you can do more of it before your next big moment.",
    };
  if (score >= 3)
    return {
      title: "Close, but a buyer would notice the gaps.",
      body: "A serious buyer would find enough to keep looking, and enough to hesitate. The session shows you exactly where they hesitate.",
    };
  return {
    title: "A buyer is likely leaving with doubts.",
    body: "The good news: these are fixable, and quickly. This is exactly what the session is for.",
  };
}

export function LookupQuiz() {
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() =>
    statements.map(() => undefined),
  );
  const answered = answers.filter(Boolean).length;
  const score = answers.filter((a) => a === "true").length;
  const done = answered === statements.length;
  const result = resultFor(score);

  return (
    <div className="rounded-[28px] border-2 border-ink bg-white p-6 shadow-hard-lg">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-pink uppercase">
        Answer all five to see your result
      </p>
      <ol className="mt-4">
        {statements.map((statement, i) => (
          <li key={statement} className="border-t-2 border-dashed border-paper py-5 first:border-t-[#dcd8c8]">
            <p id={`q-${i}`} className="text-[15px] leading-[1.45]">
              {statement}
            </p>
            <ToggleGroup
              aria-labelledby={`q-${i}`}
              value={answers[i] ? [answers[i]] : []}
              onValueChange={(value) =>
                setAnswers((prev) => prev.map((a, j) => (j === i ? (value[0] as Answer | undefined) : a)))
              }
              spacing={3}
              className="mt-3"
            >
              {(
                [
                  ["true", "True", "data-pressed:bg-lime"],
                  ["not-yet", "Not yet", "data-pressed:bg-pink data-pressed:text-white"],
                ] as const
              ).map(([value, label, pressed]) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  className={cn(
                    "h-10 rounded-full border-2 border-ink bg-white px-5 text-[13px] font-semibold hover:bg-cream",
                    pressed,
                  )}
                >
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </li>
        ))}
      </ol>

      <div aria-live="polite" className="mt-2 rounded-[20px] bg-ink p-6 text-white">
        <div className="flex gap-2" aria-hidden>
          {answers.map((a, i) => (
            <span
              key={i}
              className={cn(
                "h-2 flex-1 rounded-full bg-white/25 transition-colors",
                a === "true" && "bg-lime",
                a === "not-yet" && "bg-pink",
              )}
            />
          ))}
        </div>
        {done ? (
          <>
            <p className="mt-5 text-[11px] font-semibold tracking-[0.14em] text-lime uppercase">
              {score} of 5 true
            </p>
            <h3 className="mt-1 text-[26px] leading-[1.05] font-bold">{result.title}</h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-white/80">{result.body}</p>
            <a href="#apply" className={cn(buttonVariants({ variant: "lime", size: "pill" }), "mt-5")}>
              Apply for one of 8 sessions →
            </a>
          </>
        ) : (
          <>
            <h3 className="mt-5 text-[26px] leading-[1.05] font-bold">Answer all five to see your result.</h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-white/80">
              There are no wrong answers. The point is to see your brand the way a stranger with money
              to spend would.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
