"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const fieldClass =
  "h-[52px] rounded-[12px] border-2 border-ink bg-white px-4 text-base placeholder:text-[#8a8a8e]";
const labelClass = "text-[13px] font-semibold tracking-[0.04em]";

const stepOneFields = [
  { id: "name", label: "Your name", autoComplete: "name" },
  { id: "role", label: "Your role", placeholder: "e.g. Founder, CEO", autoComplete: "organization-title", required: true },
  { id: "company", label: "Company", autoComplete: "organization" },
  { id: "website", label: "Website or main social handle", placeholder: "yourbrand.com or @yourbrand" },
  { id: "email", label: "Work email", type: "email", autoComplete: "email", required: true },
  { id: "whatsapp", label: "WhatsApp number", type: "tel", placeholder: "+234", autoComplete: "tel" },
];

const moments = [
  "A product or brand launch",
  "A fundraise",
  "Expansion into a new market",
  "A rebrand or reputation reset",
  "Scaling what already works",
];
const timings = ["Within 30 days", "1 to 3 months", "3 to 6 months", "Just exploring"];

// TODO(copy): the design shows these dropdowns closed; their options are drafted.
// "We budget in USD…" is named in the FAQ, so it must stay.
const investments = [
  "Under ₦800,000",
  "₦800,000 to ₦1.5m",
  "₦1.5m to ₦3m",
  "Over ₦3m",
  "We budget in USD or another currency",
];
const deciders = ["I do", "I decide with a co-founder or partner", "A board or leadership team", "Someone else"];

const chipClass =
  "h-[42px] rounded-full border-2 border-ink bg-white px-4 text-[15px] font-normal hover:bg-cream data-pressed:bg-lime";
const selectTriggerClass =
  "w-full rounded-[12px] border-2 border-ink bg-white pr-4 pl-5 text-base data-[size=default]:h-[52px] data-placeholder:text-ink [&_svg]:size-5 [&_svg]:text-ink";

function Required() {
  return (
    <span aria-hidden className="text-pink">
      *
    </span>
  );
}

function ChipGroup({ label, name, options }: { label: string; name: string; options: string[] }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <fieldset>
      <legend className={`${labelClass} mb-3`}>{label}</legend>
      <ToggleGroup
        value={value}
        onValueChange={setValue}
        orientation="vertical"
        spacing={2.5}
        className="data-vertical:items-start"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o} value={o} className={chipClass}>
            {o}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <input type="hidden" name={name} value={value[0] ?? ""} />
    </fieldset>
  );
}

function SelectField({
  id,
  label,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: string[];
}) {
  return (
    <div className="grid gap-3">
      <Label id={`${id}-label`} className={labelClass}>
        {label}
      </Label>
      <Select name={id}>
        <SelectTrigger aria-labelledby={`${id}-label`} className={selectTriggerClass}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="rounded-[12px] border-2 border-ink p-1 shadow-hard ring-0">
          {options.map((o) => (
            <SelectItem key={o} value={o} className="rounded-[8px] py-2.5 pl-3 text-[15px]">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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

      {/* both steps stay mounted so answers survive "Back" and "Continue" */}
      <div hidden={step !== 1}>
        <h3 className="mt-6 text-[30px] leading-[1.02] font-bold tracking-[-0.03em]">Tell us who you are</h3>
        <div className="mt-6 flex flex-col gap-8">
          {stepOneFields.map((f) => (
            <div key={f.id} className="grid gap-3">
              <Label htmlFor={`apply-${f.id}`} className={`${labelClass} gap-0`}>
                {f.label}
                {f.required && <Required />}
              </Label>
              <Input
                id={`apply-${f.id}`}
                name={f.id}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                required={f.required && step === 1}
                className={fieldClass}
              />
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-[13px] text-slate">We never share your details.</p>
        <Button type="submit" variant="brand" size="xl" className="mt-6 h-[52px] w-full">
          Continue →
        </Button>
      </div>

      <div hidden={step !== 2}>
        <h3 className="mt-6 text-[30px] leading-[1.02] font-bold tracking-[-0.03em]">
          Tell us about the moment
        </h3>
        <div className="mt-6 flex flex-col gap-8">
          <ChipGroup label="What's your next big moment?" name="moment" options={moments} />
          <ChipGroup label="When is it?" name="timing" options={timings} />
          <SelectField
            id="investment"
            label="Monthly marketing investment"
            placeholder="Choose a range"
            options={investments}
          />
          <SelectField id="decider" label="Who decides on this?" placeholder="Choose one" options={deciders} />
          <div className="grid gap-3">
            <Label htmlFor="apply-goal" className={labelClass}>
              What would make this session worth your 30 minutes? (optional)
            </Label>
            <Textarea
              id="apply-goal"
              name="goal"
              rows={3}
              placeholder="e.g. We launch in Abuja in February and I want to know if our brand is ready."
              className="min-h-[100px] rounded-[12px] border-2 border-ink bg-white px-4 py-3 text-base placeholder:text-[#8a8a8e]"
            />
          </div>
          <Label className="items-start gap-3 text-[14px] leading-[1.5] font-normal text-slate">
            <Checkbox name="consent" required={step === 2} className="mt-0.5 size-[18px] rounded-[4px] border-[1.5px] border-slate" />
            Digital Savvy Studios can contact me about my application by email or WhatsApp. My
            details are handled in line with the Nigeria Data Protection Act 2023, and I can opt out
            anytime.
          </Label>
        </div>
        <div className="mt-10 flex flex-col gap-4">
          <Button type="button" variant="paper" size="xl" className="h-[52px] w-full" onClick={() => setStep(1)}>
            ← Back
          </Button>
          <Button type="submit" variant="brand" size="xl" className="h-[52px] w-full">
            Submit my application
          </Button>
        </div>
      </div>
    </form>
  );
}
