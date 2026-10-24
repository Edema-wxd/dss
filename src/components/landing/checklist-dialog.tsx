"use client";

import { useState } from "react";
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
import { Sparkle } from "./primitives";

const areas = [
  { label: "Positioning", tone: "bg-pink-tint" },
  { label: "Proof", tone: "bg-aqua" },
  { label: "Content and channels", tone: "bg-peach" },
  { label: "Systems", tone: "bg-[#e1e8a7]" },
];

const nextUps = ["A launch", "A raise", "A new market", "Scaling up"];

/** The Launch Visibility Checklist lead magnet, opened from any trigger. */
export function ChecklistDialog({ trigger }: { trigger: React.ReactElement }) {
  const [sent, setSent] = useState(false);

  return (
    <Dialog onOpenChange={(open) => !open && setSent(false)}>
      <DialogTrigger render={trigger} />
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-[24px] border-2 border-ink bg-white p-0 shadow-hard-lg ring-0 sm:max-w-md lg:max-w-[640px]"
      >
        <div className="flex items-center justify-between bg-ink px-5 py-3 text-[10px] font-semibold tracking-[0.14em] text-white uppercase">
          <span className="flex items-center gap-2">
            Free checklist <Sparkle className="size-3 text-lime" /> 12 checks before your next big moment
          </span>
          <DialogClose aria-label="Close" className="-mr-2 grid size-9 place-items-center text-xl leading-none">
            ×
          </DialogClose>
        </div>
        {/* striped pink edge from the design */}
        <div aria-hidden className="h-2 bg-[repeating-linear-gradient(90deg,#fff_0_6px,#ec1763_6px_12px)]" />

        <div className="p-6 lg:px-9 lg:pt-7 lg:pb-8">
          <p className="inline-block rounded-full border-2 border-ink bg-lime px-3 py-1 text-[11px] font-semibold">
            Free · 12 checks · 5 minutes
          </p>
          <DialogTitle className="font-display mt-4 text-[36px] leading-[1.02] lg:text-[40px] font-black tracking-[-0.04em]">
            Launching, raising or expanding soon? <span className="text-pink">Check</span> your brand first.
          </DialogTitle>
          <DialogDescription className="mt-3 text-[15px] leading-[1.6] text-slate">
            The Launch Visibility Checklist is the 12-point check we run before every launch, raise and
            market entry. Count how many are true today and you&apos;ll know exactly where buyers lose
            confidence.
          </DialogDescription>

          <ul className="mt-5 grid grid-cols-2 gap-2">
            {areas.map((a) => (
              <li
                key={a.label}
                className={`flex items-center gap-2 rounded-[12px] border-2 border-ink px-3 py-2 text-[13px] font-medium ${a.tone}`}
              >
                <span className="font-display grid size-6 shrink-0 place-items-center rounded-full bg-white text-sm font-bold">
                  3
                </span>
                {a.label}
              </li>
            ))}
          </ul>

          {sent ? (
            <div role="status" className="mt-6 rounded-[16px] border-2 border-ink bg-aqua p-5">
              <p className="font-display text-xl font-bold">It&apos;s on its way.</p>
              <p className="mt-1 text-sm text-slate">Check your inbox for the Launch Visibility Checklist.</p>
            </div>
          ) : (
            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                // TODO: send to the email provider once one is chosen.
                setSent(true);
              }}
            >
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cl-name" className="text-xs font-semibold">
                    First name
                  </Label>
                  <Input id="cl-name" name="firstName" required autoComplete="given-name" className="h-12 rounded-[12px] border-2 bg-white px-4 text-base" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cl-email" className="text-xs font-semibold">
                    Work email
                  </Label>
                  <Input id="cl-email" name="email" type="email" required autoComplete="email" className="h-12 rounded-[12px] border-2 bg-white px-4 text-base" />
                </div>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-xs font-semibold">
                  What&apos;s next for you? <span className="font-normal text-slate">(optional)</span>
                </legend>
                <ToggleGroup spacing={2} className="flex-wrap">
                  {nextUps.map((n) => (
                    <ToggleGroupItem
                      key={n}
                      value={n}
                      className="h-9 rounded-full border-2 border-ink bg-white px-4 text-[13px] data-pressed:bg-pink-tint"
                    >
                      {n}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </fieldset>
              <Button type="submit" variant="brand" size="xl" className="mt-1 w-full">
                Send me the checklist
              </Button>
              <p className="text-[11px] leading-[1.5] text-slate">
                One email with the checklist, then The Visibility Brief now and then. Unsubscribe
                anytime. Handled in line with the Nigeria Data Protection Act 2023.
              </p>
              <DialogClose className="self-center text-sm text-slate underline underline-offset-4">
                No thanks
              </DialogClose>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
