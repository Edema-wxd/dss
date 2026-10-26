"use client";

import { createContext, use, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { hoursSince, parseWhen } from "@/lib/desk/model";

/* ── Formatting ──────────────────────────────────────────────────────── */

export const fmtDay = (s: string) =>
  parseWhen(s)?.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) ?? "";

export function ago(s: string) {
  if (!s) return "";
  const h = hoursSince(s);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

/* ── Toasts ──────────────────────────────────────────────────────────── */

const ToastContext = createContext<(msg: string) => void>(() => {});
export const useToast = () => use(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msgs, setMsgs] = useState<{ id: number; text: string }[]>([]);
  const show = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setMsgs((m) => [...m, { id, text }]);
    setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-5 z-[70] flex flex-col items-center gap-2">
        {msgs.map((m) => (
          <p key={m.id} role="status" className="rise-in max-w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-hard-sm">
            {m.text}
          </p>
        ))}
      </div>
    </ToastContext>
  );
}

/* ── Pieces ──────────────────────────────────────────────────────────── */

const STATUS_TONES: Record<string, string> = {
  New: "bg-peach text-[#8a3b06]",
  Qualified: "bg-aqua text-navy",
  Waitlist: "bg-aqua text-navy",
  Booked: "bg-lime/60 text-ink",
  Held: "bg-lime/60 text-ink",
  "Review sent": "bg-lime/60 text-ink",
  "Proposal sent": "bg-pink-soft text-pink",
  Won: "bg-ink text-lime",
  "No-show": "bg-pink text-white",
  Exploring: "bg-paper text-slate",
  "Not a fit": "bg-paper text-slate",
};

export function StatusPill({ status }: { status: string }) {
  const s = status || "New";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_TONES[s] ?? "bg-paper")}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s}
    </span>
  );
}

export function RouteTag({ route }: { route: string }) {
  return (
    <span className={cn("text-[11px] font-bold tracking-[0.08em] uppercase", route === "priority" ? "text-pink" : "text-slate")}>
      {route || "fit"}
    </span>
  );
}

export function Panel({ title, aside, children, className }: { title?: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[20px] border-2 border-ink bg-white p-4 lg:p-5", className)}>
      {(title || aside) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2>}
          {aside && <div className="text-xs text-slate">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-5 text-center text-sm text-slate">{children}</p>;
}

export const btn = {
  base: "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border-2 border-ink px-4 text-sm font-semibold whitespace-nowrap transition-transform hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50",
  primary: "bg-pink text-white shadow-hard-sm",
  plain: "bg-white text-ink",
  sm: "min-h-8 px-3 text-[13px]",
  ghost: "border-transparent bg-transparent",
};

export function Button({ tone = "plain", size, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "plain" | "ghost"; size?: "sm" }) {
  return <button type="button" className={cn(btn.base, btn[tone], size && btn.sm, className)} {...props} />;
}

export function Toggle({ checked, onChange, label, disabled, dark }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; disabled?: boolean; dark?: boolean }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-sm font-semibold", disabled && "opacity-50")}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={cn(
          "relative h-6 w-11 flex-none cursor-pointer appearance-none rounded-full border-2 transition-colors",
          "after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-5",
          dark ? "border-white/40 bg-white/20 checked:border-lime checked:bg-lime after:checked:bg-ink" : "border-ink bg-paper checked:bg-ink",
        )}
      />
      {label}
    </label>
  );
}

export function Stepper({ value, onChange, label, dark, disabled }: { value: number; onChange: (n: number) => void; label: string; dark?: boolean; disabled?: boolean }) {
  const b = cn("grid size-8 place-items-center rounded-lg border-2 text-lg leading-none font-semibold disabled:opacity-40", dark ? "border-white/30 bg-white/10 text-white" : "border-ink bg-paper");
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className={b} disabled={disabled || value <= 0} onClick={() => onChange(Math.max(0, value - 1))} aria-label={`One fewer: ${label}`}>
        −
      </button>
      <b className="min-w-7 text-center font-mono tabular-nums">{value}</b>
      <button type="button" className={b} disabled={disabled} onClick={() => onChange(value + 1)} aria-label={`One more: ${label}`}>
        +
      </button>
    </span>
  );
}

export const fieldClass =
  "w-full min-w-0 rounded-xl border-2 border-ink bg-white px-3 py-2 text-[15px] placeholder:text-[#8a8a8e] focus-visible:outline-3 focus-visible:outline-pink/40";

export function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("grid min-w-0 gap-1", full && "sm:col-span-2")}>
      <span className="text-xs font-bold tracking-[0.04em] text-slate">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate">{hint}</span>}
    </label>
  );
}

export async function copyText(text: string, toast: (m: string) => void, msg = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Couldn't copy. Select the text and copy it by hand.");
  }
}
