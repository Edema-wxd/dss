"use client";

import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApplyResponse, responseFor } from "./apply-response";

const fieldClass =
  "h-[52px] rounded-[12px] border-2 border-ink bg-white px-4 text-base placeholder:text-[#8a8a8e]";
const labelClass = "text-[13px] font-semibold tracking-[0.04em]";

const stepOneFields = [
  { id: "name", label: "Your name", autoComplete: "name" },
  { id: "role", label: "Your role", placeholder: "e.g. Founder, CEO", autoComplete: "organization-title" },
  { id: "company", label: "Company", autoComplete: "organization" },
  { id: "website", label: "Website or main social handle", placeholder: "yourbrand.com or @yourbrand" },
  { id: "email", label: "Work email", type: "email", autoComplete: "email" },
  { id: "whatsapp", label: "WhatsApp number", type: "tel", placeholder: "+234", autoComplete: "tel" },
];

const stepOneIds = stepOneFields.map((f) => f.id);
const stepTwoIds = ["moment", "timing", "investment", "decider", "goal", "consent"];

type Errors = Record<string, string>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const domainPattern = /^(https?:\/\/)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(\/\S*)?$/i;
const handlePattern = /^@[a-z0-9._]{2,30}$/i;

/** Returns an error message, or "" when the field is valid. */
function validateField(id: string, raw: unknown): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  switch (id) {
    case "name":
      if (!value) return "Please tell us your name.";
      if (value.length < 2) return "Your name looks too short.";
      if (/^[\d\s\W]+$/.test(value)) return "Enter your name using letters.";
      return "";
    case "role":
      return value ? "" : "Please tell us your role, e.g. Founder or CEO.";
    case "company":
      return value ? "" : "Please enter your company name.";
    case "website":
      if (!value) return "Add your website or main social handle.";
      if (value.startsWith("@")) return handlePattern.test(value) ? "" : "Enter a valid handle, e.g. @yourbrand.";
      return domainPattern.test(value) ? "" : "Enter a website like yourbrand.com, or a handle like @yourbrand.";
    case "email":
      if (!value) return "Please enter your work email.";
      return emailPattern.test(value) ? "" : "Enter a valid email, e.g. you@company.com.";
    case "whatsapp": {
      if (!value) return "Please enter your WhatsApp number.";
      if (!/^\+?[\d\s\-()]+$/.test(value)) return "Use digits only, e.g. +234 801 234 5678.";
      const digits = value.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) return "Enter a full number with country code, e.g. +234 801 234 5678.";
      return "";
    }
    case "moment":
      return value ? "" : "Pick the moment that fits best.";
    case "timing":
      return value ? "" : "Tell us when it is.";
    case "investment":
      return value ? "" : "Choose a range.";
    case "decider":
      return value ? "" : "Choose who decides.";
    case "goal":
      return value.length > 500 ? "Please keep this under 500 characters." : "";
    case "consent":
      return raw === true ? "" : "Please agree so we can contact you about your application.";
    default:
      return "";
  }
}

const errorId = (id: string) => `apply-${id}-error`;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId(id)} role="alert" className="text-[13px] leading-snug font-medium text-pink">
      {message}
    </p>
  );
}

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

function ChipGroup({
  id,
  label,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <fieldset aria-describedby={error ? errorId(id) : undefined} aria-invalid={error ? true : undefined}>
      <legend className={`${labelClass} mb-3`}>
        {label}
        <Required />
      </legend>
      <ToggleGroup
        value={value ? [value] : []}
        onValueChange={(v) => onChange(v[0] ?? "")}
        orientation="vertical"
        spacing={2.5}
        id={`apply-${id}`}
        className="data-vertical:items-start lg:data-vertical:flex-row lg:data-vertical:flex-wrap"
      >
        {options.map((o) => (
          <ToggleGroupItem key={o} value={o} className={cn(chipClass, error && "border-pink")}>
            {o}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <input type="hidden" name={id} value={value} />
      <div className="mt-2 empty:hidden">
        <FieldError id={id} message={error} />
      </div>
    </fieldset>
  );
}

function SelectField({
  id,
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  placeholder: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div className="grid gap-3">
      <Label id={`${id}-label`} className={`${labelClass} gap-0`}>
        {label}
        <Required />
      </Label>
      <Select name={id} value={value || null} onValueChange={(v) => onChange(v ?? "")}>
        <SelectTrigger
          aria-labelledby={`${id}-label`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId(id) : undefined}
          className={cn(selectTriggerClass, "aria-invalid:border-pink aria-invalid:ring-pink/20")}
        >
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
      <FieldError id={id} message={error} />
    </div>
  );
}

export function ApplyForm() {
  const [step, setStep] = useState<1 | 2 | "done">(1);
  const [errors, setErrors] = useState<Errors>({});
  const [choices, setChoices] = useState({ moment: "", timing: "", investment: "", decider: "" });
  const [consent, setConsent] = useState(false);
  const [applicant, setApplicant] = useState<{ firstName: string; company: string } | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);

  // the response is much shorter than the form, so bring it into view
  useEffect(() => {
    if (step === "done") responseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const readValue = (id: string): unknown => {
    if (id === "consent") return consent;
    if (id in choices) return choices[id as keyof typeof choices];
    return "";
  };

  /** Validates the given fields, updates their error state and returns the first invalid id. */
  const validate = (ids: string[], overrides: Record<string, unknown> = {}) => {
    const next: Errors = {};
    let first: string | undefined;
    for (const id of ids) {
      const message = validateField(id, id in overrides ? overrides[id] : readValue(id));
      if (message) {
        next[id] = message;
        first ??= id;
      }
    }
    setErrors((prev) => {
      const merged = { ...prev };
      for (const id of ids) delete merged[id];
      return { ...merged, ...next };
    });
    return first;
  };

  const focusField = (id: string) => {
    const root = document.getElementById(`apply-${id}`) ?? document.querySelector<HTMLElement>(`[aria-labelledby="${id}-label"]`);
    const target = root?.matches("input,textarea,button") ? root : root?.querySelector<HTMLElement>("button");
    target?.focus();
  };

  const choose = (id: keyof typeof choices, value: string) => {
    setChoices((c) => ({ ...c, [id]: value }));
    if (errors[id] || value) validate([id], { [id]: value });
  };

  const fieldProps = (id: string) => ({
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? errorId(id) : undefined,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => validate([id], { [id]: e.target.value }),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (errors[id]) validate([id], { [id]: e.target.value });
    },
  });

  if (step === "done" && applicant) {
    return (
      <div ref={responseRef} className="scroll-mt-6">
        <ApplyResponse
          kind={responseFor(choices.investment, choices.timing)}
          firstName={applicant.firstName}
          company={applicant.company}
        />
      </div>
    );
  }

  return (
    <form
      noValidate
      className="rounded-[28px] border-2 border-ink bg-white p-6 shadow-hard-lg lg:px-9 lg:pt-10 lg:pb-8"
      onSubmit={(e) => {
        e.preventDefault();
        const typed = Object.fromEntries(new FormData(e.currentTarget));
        const firstInvalid = validate(step === 1 ? stepOneIds : stepTwoIds, { ...typed, consent });
        if (firstInvalid) {
          focusField(firstInvalid);
          return;
        }
        // TODO: post the application to the backend / CRM.
        if (step === 1) setStep(2);
        else {
          setApplicant({
            firstName: String(typed.name ?? "").trim().split(/\s+/)[0],
            company: String(typed.company ?? "").trim(),
          });
          setStep("done");
        }
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
        <h3 className="mt-6 text-[30px] leading-[1.02] font-bold tracking-[-0.03em] lg:mt-9">Tell us who you are</h3>
        <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-10">
          {stepOneFields.map((f) => (
            <div key={f.id} className="grid gap-3">
              <Label htmlFor={`apply-${f.id}`} className={`${labelClass} gap-0`}>
                {f.label}
                <Required />
              </Label>
              <Input
                id={`apply-${f.id}`}
                name={f.id}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                className={cn(fieldClass, "aria-invalid:border-pink aria-invalid:ring-pink/20")}
                {...fieldProps(f.id)}
              />
              <FieldError id={f.id} message={errors[f.id]} />
            </div>
          ))}
        </div>
        <div className="lg:mt-12 lg:flex lg:items-center lg:justify-between lg:gap-6">
          <p className="mt-8 text-center text-[13px] text-slate lg:mt-0">We never share your details.</p>
          <Button type="submit" variant="brand" size="xl" className="mt-6 h-[52px] w-full lg:mt-0 lg:w-auto lg:px-7 lg:text-[15px]">
            Continue →
          </Button>
        </div>
      </div>

      <div hidden={step !== 2}>
        <h3 className="mt-6 text-[30px] leading-[1.02] font-bold tracking-[-0.03em] lg:mt-9">
          Tell us about the moment
        </h3>
        <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-10">
          <div className="lg:col-span-2">
            <ChipGroup id="moment" label="What's your next big moment?" options={moments} value={choices.moment} onChange={(v) => choose("moment", v)} error={errors.moment} />
          </div>
          <div className="lg:col-span-2">
            <ChipGroup id="timing" label="When is it?" options={timings} value={choices.timing} onChange={(v) => choose("timing", v)} error={errors.timing} />
          </div>
          <SelectField
            id="investment"
            label="Monthly marketing investment"
            placeholder="Choose a range"
            options={investments}
            value={choices.investment}
            onChange={(v) => choose("investment", v)}
            error={errors.investment}
          />
          <SelectField id="decider" label="Who decides on this?" placeholder="Choose one" options={deciders} value={choices.decider} onChange={(v) => choose("decider", v)} error={errors.decider} />
          <div className="grid gap-3 lg:col-span-2">
            <Label htmlFor="apply-goal" className={labelClass}>
              What would make this session worth your 30 minutes? (optional)
            </Label>
            <Textarea
              id="apply-goal"
              name="goal"
              rows={3}
              placeholder="e.g. We launch in Abuja in February and I want to know if our brand is ready."
              className="min-h-[100px] rounded-[12px] border-2 border-ink bg-white px-4 py-3 text-base placeholder:text-[#8a8a8e] aria-invalid:border-pink aria-invalid:ring-pink/20"
              {...fieldProps("goal")}
            />
            <FieldError id="goal" message={errors.goal} />
          </div>
          <div className="grid gap-2 lg:col-span-2">
            <Label className="items-start gap-3 text-[14px] leading-[1.5] font-normal text-slate">
              <Checkbox
                id="apply-consent"
                name="consent"
                checked={consent}
                onCheckedChange={(checked) => {
                  setConsent(checked);
                  validate(["consent"], { consent: checked });
                }}
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? errorId("consent") : undefined}
                className="mt-0.5 size-[18px] rounded-[4px] border-[1.5px] border-slate aria-invalid:border-pink aria-invalid:ring-pink/20"
              />
              Digital Savvy Studios can contact me about my application by email or WhatsApp. My
              details are handled in line with the Nigeria Data Protection Act 2023, and I can opt out
              anytime.
            </Label>
            <FieldError id="consent" message={errors.consent} />
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-4 lg:mt-12 lg:flex-row lg:justify-between">
          <Button type="button" variant="paper" size="xl" className="h-[52px] w-full lg:w-auto lg:px-7 lg:text-[15px]" onClick={() => setStep(1)}>
            ← Back
          </Button>
          <Button type="submit" variant="brand" size="xl" className="h-[52px] w-full lg:w-auto lg:px-7 lg:text-[15px]">
            Submit my application
          </Button>
        </div>
      </div>
    </form>
  );
}
