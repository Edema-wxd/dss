"use client";

import { useEffect, useRef, useTransition } from "react";
import { X } from "lucide-react";
import type { ActionResult } from "@/app/admin/actions";
import { useToast } from "@/components/desk/ui";
import { relDay } from "@/lib/hq/work";
import { cn } from "@/lib/utils";

// Small pieces every HQ page shares.

/** Runs a server action, toasts its outcome and resolves whether it worked. */
export function useRun() {
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult>) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        try {
          const r = await action();
          toast(r.ok ? (r.message ?? "Saved") : r.error);
          resolve(r.ok);
        } catch {
          toast("Something went wrong saving that. Check your connection and try again.");
          resolve(false);
        }
      }),
    );
  return { run, pending };
}

export type Tone = "ink" | "rose" | "sky" | "aqua" | "sunset" | "lime" | "ok" | "warn" | "bad" | "plain";

const TONES: Record<Tone, string> = {
  ink: "bg-ink text-lime",
  rose: "bg-pink-soft text-[#b8114a]",
  sky: "bg-[#eceef8] text-[#404f8c]",
  aqua: "bg-aqua/60 text-navy",
  sunset: "bg-peach/70 text-[#8a3b06]",
  lime: "bg-lime/40 text-ink",
  ok: "bg-[#e0f1e7] text-[#1e7a4c]",
  warn: "bg-[#fcedd9] text-[#a35c0a]",
  bad: "bg-[#fbe3e5] text-[#c42b3c]",
  plain: "bg-paper text-ink",
};

export function Pill({ tone = "plain", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** A due date: red when overdue, highlighted when today. */
export function DueChip({ due, today, done }: { due: string; today: string; done?: boolean }) {
  if (!due) return null;
  const over = !done && due < today;
  return (
    <span className={cn("text-xs font-medium whitespace-nowrap", over ? "text-[#c42b3c]" : due === today ? "text-pink" : "text-slate")}>
      {relDay(due, today)}
    </span>
  );
}

/** A thin progress bar; tone follows the percent unless given. */
export function Bar({ pct, tone, label }: { pct: number; tone?: "ok" | "warn" | "bad" | "ink"; label?: string }) {
  const t = tone ?? (pct >= 100 ? "ok" : pct >= 60 ? "warn" : "bad");
  const fill = { ok: "bg-[#1e7a4c]", warn: "bg-[#e7a33a]", bad: "bg-[#c42b3c]", ink: "bg-ink" }[t];
  return (
    <span role="progressbar" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} className="block h-2 overflow-hidden rounded-full bg-paper">
      <i className={cn("block h-full rounded-full", fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </span>
  );
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span aria-hidden title={name} className={cn("grid flex-none place-items-center rounded-full bg-sky font-bold text-white", size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs")}>
      {initials(name) || "?"}
    </span>
  );
}

export function EmptyNote({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 rounded-2xl border-2 border-dashed border-ink/20 px-4 py-6 text-center">
      <b className="font-semibold">{title}</b>
      {children && <span className="max-w-[48ch] text-sm text-slate">{children}</span>}
    </div>
  );
}

/** A modal dialog built on <dialog>, so focus and Escape behave natively. `side` opens it as a panel from the right. */
export function Dialog({ open, onClose, title, children, side, wide, xl }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; side?: boolean; wide?: boolean; xl?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={cn(
        "m-auto max-h-[92dvh] w-[calc(100%-24px)] overflow-y-auto rounded-[22px] border-2 border-ink bg-white p-0 text-ink backdrop:bg-ink/40",
        side ? "mr-0 h-dvh max-h-dvh w-full max-w-[520px] rounded-none rounded-l-[22px] border-y-0 border-r-0" : xl ? "max-w-[1280px]" : wide ? "max-w-[760px]" : "max-w-[560px]",
      )}
    >
      {open && (
        <div className="grid gap-4 p-5">
          <div className="flex items-start gap-3">
            <h2 className="flex-1 text-xl font-bold tracking-[-0.02em]">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full border-2 border-ink/15 hover:border-ink">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Panel heading with an optional count and link. */
export function CardHead({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2>
      {count !== undefined && <Pill tone={count ? "rose" : "plain"}>{count}</Pill>}
      <span className="flex-1" />
      {children}
    </div>
  );
}
