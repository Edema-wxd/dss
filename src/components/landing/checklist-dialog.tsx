"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { Sparkle } from "./primitives";

const areas = [
  { label: "Positioning", tone: "bg-pink-tint" },
  { label: "Proof", tone: "bg-lime" },
  { label: "Content and channels", tone: "bg-aqua" },
  { label: "Systems", tone: "bg-peach" },
];

/** "What's next" answers, and how the thank-you screen opens for each. */
const nextUps: Record<string, string> = {
  "A launch": "With a launch ahead",
  Expansion: "With an expansion ahead",
  "Going premium": "With a move upmarket ahead",
  "Getting visible": "If getting seen is the goal",
};

const previewChecks = [
  "You can say who you're for and why you win in one sentence, and your whole team says it the same way.",
  "Your homepage names your customer and the outcome you deliver, not your history.",
  "A stranger can find proof of your results in under a minute.",
  "Your founder is visible with a clear point of view on the one platform your buyers trust most.",
  "Every enquiry lands in one place and gets a reply within a day.",
];

// Sent: never pop up again. Seen: not again this visit.
const sentKey = "dss-checklist-sent";
const seenKey = "dss-checklist-seen";

/** Whether the visitor already has the checklist or closed it this visit. */
export function checklistAlreadyHandled() {
  try {
    return localStorage.getItem(sentKey) === "1" || sessionStorage.getItem(seenKey) === "1";
  } catch {
    return false;
  }
}

function remember(storage: () => Storage, key: string) {
  try {
    storage().setItem(key, "1");
  } catch {
    // private mode or blocked storage: the pop-up may simply show again
  }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Errors = { firstName?: string; email?: string };

function validate(firstName: string, email: string): Errors {
  const errors: Errors = {};
  if (!firstName) errors.firstName = "Please tell us your first name.";
  else if (/^[\d\s\W]+$/.test(firstName)) errors.firstName = "Enter your name using letters.";
  if (!email) errors.email = "Please enter your email.";
  else if (!emailPattern.test(email)) errors.email = "Enter a valid email, e.g. you@company.com.";
  return errors;
}

const errorId = (id: string) => `checklist-${id}-error`;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={errorId(id)} role="alert" className="text-[13px] leading-snug font-medium text-pink">
      {message}
    </p>
  );
}

const fieldClass =
  "h-[52px] rounded-[12px] border-2 border-ink bg-white px-4 text-base aria-invalid:border-pink aria-invalid:ring-pink/20";
const labelClass = "text-[13px] font-semibold tracking-[0.04em]";
const tagClass =
  "inline-block rounded-full border-2 border-ink bg-lime px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase lg:text-[12px]";

/** Pink hazard-tape band with the scrolling "free checklist" line. */
function TapeTicker() {
  const run = ["Free checklist", "12 checks before your next big moment"];
  const items = [...run, ...run, ...run];
  const stripes = "h-3 bg-[repeating-linear-gradient(120deg,#fff_0_8px,transparent_8px_20px)] lg:h-3.5";
  return (
    <div aria-hidden className="overflow-hidden border-b-2 border-ink bg-pink text-white">
      <div className={stripes} />
      <div className="flex w-max animate-marquee py-1.5 text-[13px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase lg:py-2 lg:text-[15px]">
        {[0, 1].map((copy) => (
          <span key={copy} className="flex items-center">
            {items.map((item, i) => (
              <span key={i} className="flex items-center">
                {item}
                <Sparkle className="mx-5 size-3.5 text-lime lg:mx-6" />
              </span>
            ))}
          </span>
        ))}
      </div>
      <div className={stripes} />
    </div>
  );
}

/** Desktop-only artwork: a tilted preview of the checklist, the cat and stickers. */
function PreviewArt() {
  return (
    <div
      aria-hidden
      className="relative hidden overflow-hidden border-r-2 border-ink bg-aqua shadow-[inset_0_16px_0_rgb(33_33_33/0.04)] lg:block"
    >
      <Sparkle className="twinkle absolute top-6 left-6 size-8 text-white" />
      <Sparkle className="twinkle absolute top-6 left-[330px] size-9 text-gold [--float-delay:0.8s]" />

      <div className="absolute top-[72px] left-7 w-[304px] -rotate-[4deg] rounded-[6px] border-2 border-ink bg-white px-6 pt-7 pb-20 shadow-hard-lg">
        <p className="text-[10px] font-semibold tracking-[0.18em] text-pink uppercase">Digital Savvy Studios</p>
        <p className="font-display mt-2 text-[22px] leading-[1.08] font-black tracking-[-0.02em]">
          The Launch Visibility Checklist
        </p>
        <ul className="mt-4 space-y-3 text-[12.5px] leading-[1.45]">
          {previewChecks.map((c, i) => (
            <li key={c} className={cn("flex gap-2.5", i > 2 && "opacity-40 blur-[1.5px]")}>
              <span className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border-2 border-ink" />
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-4 pl-6 text-[12px] font-medium">+ 9 more checks</p>
      </div>

      <p className="absolute top-[408px] left-[226px] rotate-[-5deg] rounded-[8px] border-2 border-ink bg-lime px-4 py-2 text-[16px] font-medium shadow-hard">
        free · 5 minutes
      </p>
      <Image
        src="/images/cursor-pink.png"
        alt=""
        width={300}
        height={408}
        className="float absolute bottom-[140px] left-[300px] w-[66px] rotate-[-8deg] [--float-delay:0.6s]"
      />
      <Image
        src="/images/cat-megaphone.png"
        alt=""
        width={755}
        height={555}
        className="absolute -bottom-2 -left-11 w-[372px] max-w-none"
      />
    </div>
  );
}

function ChecklistForm({ onSent }: { onSent: (lead: { firstName: string; email: string; nextUp: string }) => void }) {
  const [nextUp, setNextUp] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const fieldProps = (id: keyof Errors) => ({
    "aria-invalid": errors[id] ? true : undefined,
    "aria-describedby": errors[id] ? errorId(id) : undefined,
    onChange: () => errors[id] && setErrors((e) => ({ ...e, [id]: undefined })),
  });

  return (
    <form
      noValidate
      className="mt-7 flex flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const firstName = String(data.get("firstName") ?? "").trim();
        const email = String(data.get("email") ?? "").trim();
        const found = validate(firstName, email);
        setErrors(found);
        const firstInvalid = (["firstName", "email"] as const).find((id) => found[id]);
        if (firstInvalid) {
          document.getElementById(`checklist-${firstInvalid}`)?.focus();
          return;
        }
        // TODO: send to the email provider once one is chosen.
        onSent({ firstName, email, nextUp });
      }}
    >
      <ul aria-label="What the 12 checks cover" className="flex flex-wrap gap-2.5">
        {areas.map((a) => (
          <li
            key={a.label}
            className="flex h-10 items-center gap-2.5 rounded-full border-2 border-ink bg-white pr-4 pl-1.5 text-[15px]"
          >
            <span className={cn("grid size-7 place-items-center rounded-full border-2 border-ink text-[13px]", a.tone)}>
              3
            </span>
            {a.label}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:gap-4">
        <div className="grid gap-2.5">
          <Label htmlFor="checklist-firstName" className={labelClass}>
            First name
          </Label>
          <Input
            id="checklist-firstName"
            name="firstName"
            autoComplete="given-name"
            className={fieldClass}
            {...fieldProps("firstName")}
          />
          <FieldError id="firstName" message={errors.firstName} />
        </div>
        <div className="grid gap-2.5">
          <Label htmlFor="checklist-email" className={labelClass}>
            <span className="lg:hidden">Work email</span>
            <span className="hidden lg:inline">Email</span>
          </Label>
          <Input
            id="checklist-email"
            name="email"
            type="email"
            inputMode="email"
            aria-label="Work email"
            autoComplete="email"
            className={fieldClass}
            {...fieldProps("email")}
          />
          <FieldError id="email" message={errors.email} />
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className={`${labelClass} mb-3`}>
          What&apos;s next for you? <span className="font-normal tracking-[0.06em] text-slate">(optional)</span>
        </legend>
        <ToggleGroup
          value={nextUp ? [nextUp] : []}
          onValueChange={(v) => setNextUp(v[0] ?? "")}
          spacing={2.5}
          className="flex-wrap"
        >
          {Object.keys(nextUps).map((n) => (
            <ToggleGroupItem
              key={n}
              value={n}
              className="h-11 rounded-full border-2 border-ink bg-white px-5 text-[15px] font-normal hover:bg-cream data-pressed:bg-pink-tint"
            >
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </fieldset>

      <Button type="submit" variant="brand" size="xl" className="mt-6 h-[52px] w-full text-[15px] lg:mt-5">
        Send me the checklist
      </Button>
      <p className="mt-4 text-[13px] leading-[1.6] text-slate lg:text-[12px]">
        One email with the checklist, then The Visibility Brief now and then. Unsubscribe anytime. Handled in line
        with the Nigeria Data Protection Act 2023.
      </p>
      <DialogClose className="mt-3 self-center text-[15px] text-slate underline underline-offset-4 hover:text-ink">
        No thanks
      </DialogClose>
    </form>
  );
}

/**
 * The Launch Visibility Checklist lead magnet. Opens from `trigger`, or is
 * driven through `open` / `onOpenChange` (the timed pop-up).
 */
export function ChecklistDialog({
  trigger,
  open,
  onOpenChange,
}: {
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [lead, setLead] = useState<{ firstName: string; email: string; nextUp: string } | null>(null);
  const goToApply = useRef(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) remember(() => sessionStorage, seenKey);
        onOpenChange?.(next);
      }}
      onOpenChangeComplete={(next) => {
        if (next) return;
        setLead(null);
        // once fully closed, so the scroll lock and restored focus don't undo it
        if (goToApply.current) document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
        goToApply.current = false;
      }}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2.5rem)] max-w-[420px] gap-0 overflow-y-auto overscroll-contain rounded-[26px] border-2 border-ink bg-white p-0 shadow-hard-lg ring-0 sm:max-w-[420px] lg:w-[calc(100%-3.5rem)] lg:max-w-[1180px]"
      >
        <TapeTicker />
        <div className="lg:grid lg:min-h-[560px] lg:grid-cols-[400px_1fr]">
          <PreviewArt />
          <div className="relative px-6 pt-8 pb-8 lg:px-12 lg:pt-9 lg:pb-7">
            <DialogClose
              aria-label="Close"
              className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border-2 border-ink bg-lime text-ink shadow-hard-sm transition-transform hover:-translate-y-0.5 lg:top-4 lg:right-4"
            >
              <svg viewBox="0 0 12 12" aria-hidden className="size-3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </DialogClose>

            {lead ? (
              <div role="status">
                <p className={tagClass}>It&apos;s on its way</p>
                <DialogTitle className="font-display mt-5 text-[44px] leading-[1] font-black tracking-[-0.04em] lg:mt-4 lg:text-[46px]">
                  Check your inbox, {lead.firstName}.
                </DialogTitle>
                <DialogDescription className="mt-5 text-[17px] leading-[1.7] text-slate lg:mt-3 lg:text-[15px] lg:leading-[1.65]">
                  The checklist is heading to <span className="wrap-anywhere">{lead.email}</span>. Here&apos;s the first
                  check while you wait:{" "}
                  <strong className="font-semibold text-ink">
                    can you say who you&apos;re for and why you win in one sentence, and would your team say it the
                    same way?
                  </strong>
                </DialogDescription>
                <p className="mt-5 text-[17px] leading-[1.7] text-slate lg:mt-3 lg:text-[15px] lg:leading-[1.65]">
                  {nextUps[lead.nextUp] ?? "Before your next big moment"}, the fastest way to close the gaps is to
                  have us run all 12 for you, free.
                </p>
                <div className="mt-8 flex flex-col items-center gap-5 lg:mt-7 lg:gap-4">
                  <DialogClose
                    render={<Button variant="brand" size="xl" className="h-[52px] w-full text-[15px]" />}
                    onClick={() => (goToApply.current = true)}
                  >
                    Apply for a Visibility Session
                  </DialogClose>
                  <DialogClose className="text-[15px] text-slate underline underline-offset-4 hover:text-ink">
                    Keep reading the page
                  </DialogClose>
                </div>
              </div>
            ) : (
              <>
                <p className={cn(tagClass, "mr-12")}>Free · 12 checks · 5 minutes</p>
                <DialogTitle className="font-display mt-5 text-[42px] leading-[1.02] font-black tracking-[-0.04em] lg:mt-4 lg:text-[46px]">
                  Launching, raising or scaling soon?{" "}
                  <span className="font-bold text-pink italic">Check your brand first.</span>
                </DialogTitle>
                <DialogDescription className="mt-5 text-[16px] leading-[1.55] text-slate lg:mt-4 lg:text-[15px] lg:leading-[1.65]">
                  Serious buyers decide what you&apos;re worth before they ever speak to you. These are the 12 checks we
                  run before our clients make their next big move, so you see what they&apos;ll see first.
                </DialogDescription>
                <ChecklistForm
                  onSent={(l) => {
                    remember(() => localStorage, sentKey);
                    setLead(l);
                  }}
                />
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
