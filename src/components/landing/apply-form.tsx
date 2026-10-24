"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const fieldClass =
  "h-[52px] rounded-[12px] border-2 border-ink bg-white px-4 text-base placeholder:text-[#aaaaaa]";

const stepOneFields = [
  { id: "name", label: "Your name", autoComplete: "name" },
  { id: "role", label: "Your role", placeholder: "e.g. Founder, CEO", autoComplete: "organization-title" },
  { id: "company", label: "Company", autoComplete: "organization" },
  { id: "website", label: "Website or main social handle", placeholder: "yourbrand.com or @yourbrand" },
  { id: "email", label: "Work email", type: "email", autoComplete: "email" },
  { id: "whatsapp", label: "WhatsApp number", type: "tel", placeholder: "+234", autoComplete: "tel" },
];

// TODO(copy): step 2 isn't in the design yet; these questions mirror the fit criteria on the page.
const moments = ["A launch", "A raise", "A new market", "A rebrand", "Scaling up"];
const budgets = ["Under ₦800,000", "₦800,000 – ₦2m", "Over ₦2m"];

const chipClass =
  "h-10 rounded-full border-2 border-ink bg-white px-4 text-[13px] font-medium data-pressed:bg-pink-tint";

export function ApplyForm() {
  const [step, setStep] = useState<1 | 2 | "done">(1);

  if (step === "done") {
    return (
      <div role="status" className="rounded-[28px] border-2 border-ink bg-white p-6 text-center shadow-hard-lg">
        <p className="font-display text-[30px] leading-tight font-bold">Application received.</p>
        <p className="mt-3 text-[15px] leading-relaxed text-slate">
          Janefrances reads every application personally. You&apos;ll hear back within one working day.
        </p>
      </div>
    );
  }

  return (
    <form
      className="rounded-[28px] border-2 border-ink bg-white p-6 shadow-hard-lg"
      onSubmit={(e) => {
        e.preventDefault();
        // TODO: post the application to the backend / CRM.
        if (step === 1) setStep(2);
        else setStep("done");
      }}
    >
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-semibold">Step {step} of 2</span>
        <span className="text-slate">About two minutes</span>
      </div>
      <Progress
        value={step === 1 ? 50 : 100}
        aria-label="Application progress"
        className="mt-2 [&_[data-slot=progress-indicator]]:bg-lime [&_[data-slot=progress-track]]:h-3 [&_[data-slot=progress-track]]:border-2 [&_[data-slot=progress-track]]:border-ink [&_[data-slot=progress-track]]:bg-white"
      />

      {step === 1 ? (
        <>
          <h3 className="mt-6 text-[28px] font-bold tracking-[-0.02em]">Tell us who you are</h3>
          <div className="mt-4 flex flex-col gap-6">
            {stepOneFields.map((f) => (
              <div key={f.id} className="grid gap-2">
                <Label htmlFor={`apply-${f.id}`} className="text-[12px] font-semibold tracking-wide">
                  {f.label}
                </Label>
                <Input
                  id={`apply-${f.id}`}
                  name={f.id}
                  type={f.type ?? "text"}
                  placeholder={f.placeholder}
                  autoComplete={f.autoComplete}
                  required
                  className={fieldClass}
                />
              </div>
            ))}
          </div>
          <Button type="submit" variant="brand" size="xl" className="mt-8 w-full">
            Continue →
          </Button>
        </>
      ) : (
        <>
          <h3 className="mt-6 text-[28px] font-bold tracking-[-0.02em]">Tell us what&apos;s coming</h3>
          <fieldset className="mt-4">
            <legend className="mb-3 text-[12px] font-semibold tracking-wide">
              What&apos;s happening in the next six months?
            </legend>
            <ToggleGroup multiple spacing={2} className="flex-wrap">
              {moments.map((m) => (
                <ToggleGroupItem key={m} value={m} className={chipClass}>
                  {m}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </fieldset>
          <fieldset className="mt-6">
            <legend className="mb-3 text-[12px] font-semibold tracking-wide">Monthly marketing budget</legend>
            <ToggleGroup spacing={2} className="flex-wrap">
              {budgets.map((b) => (
                <ToggleGroupItem key={b} value={b} className={chipClass}>
                  {b}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </fieldset>
          <div className="mt-6 grid gap-2">
            <Label htmlFor="apply-goal" className="text-[12px] font-semibold tracking-wide">
              What do you want buyers to understand about you?
            </Label>
            <Textarea
              id="apply-goal"
              name="goal"
              rows={4}
              className="rounded-[12px] border-2 border-ink bg-white px-4 py-3 text-base"
            />
          </div>
          <div className="mt-8 flex gap-3">
            <Button type="button" variant="paper" size="xl" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button type="submit" variant="brand" size="xl" className="flex-1">
              Send application
            </Button>
          </div>
        </>
      )}
      <p className="mt-6 text-center text-[13px] text-slate">We never share your details.</p>
    </form>
  );
}
