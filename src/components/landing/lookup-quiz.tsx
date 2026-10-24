"use client";

import { useState } from "react";
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

const wideGap =
  "Your business is likely ahead of how it looks online. That gap is costing you clients you never hear from. This is exactly what the session is for.";

// Result copy per number of "Not yet" answers, from the result-state design.
// TODO(copy): the 1-gap and 5-gap states aren't in the design; they follow its pattern.
function resultFor(gaps: number) {
  if (gaps === 0)
    return {
      title: "Strong first impression.",
      body: "Buyers likely find a brand that matches your ambition. The session would focus on what to sharpen before your next big moment.",
      cta: "Apply for a session",
    };
  if (gaps === 1)
    return {
      title: "1 door left open.",
      body: "A serious buyer could leave with doubts on one point. It's usually quick to fix once you can see it clearly.",
      cta: "Let's find it together",
    };
  if (gaps === 2)
    return {
      title: "2 doors left open.",
      body: "A serious buyer could leave with doubts on two points. These are usually quick to fix once you can see them clearly.",
      cta: "Let's find them together",
    };
  return { title: `${gaps} of 5 doors left open.`, body: wideGap, cta: "Apply for one of 8 sessions" };
}

export function LookupQuiz() {
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() =>
    statements.map(() => undefined),
  );
  const answered = answers.filter(Boolean).length;
  const gaps = answers.filter((a) => a === "not-yet").length;
  const done = answered === statements.length;
  const result = resultFor(gaps);

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
                "h-2.5 flex-1 rounded-full bg-white/25 transition-colors",
                a === "true" && "bg-lime",
                a === "not-yet" && "bg-pink",
              )}
            />
          ))}
        </div>
        {done ? (
          <>
            <h3 className="mt-5 text-[28px] leading-[1.02] font-bold tracking-[-0.02em]">{result.title}</h3>
            <p className="mt-3 text-[15px] leading-[1.6] text-white/85">
              {result.body}{" "}
              <a
                href="#apply"
                className="font-semibold text-lime underline decoration-2 underline-offset-[3px] hover:decoration-white"
              >
                {result.cta}
              </a>
            </p>
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
