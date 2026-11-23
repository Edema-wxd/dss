"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { endFocus } from "@/app/savvy-hq/(hq)/tasks/actions";
import { btn } from "@/components/desk/ui";
import { FOCUS_LENGTHS, type FocusClock, clockText, left, newClock, pause, running, spentMinutes, start, started } from "@/lib/hq/focus-model";
import { cn } from "@/lib/utils";
import { useRun } from "./kit";

// Focus mode, as in HQ: the whole screen goes to one task and a countdown. The minutes go on
// the task when you stop, and "Done with it" ticks it off as well. Escape doesn't close it, so a
// stray key press can't end a session; Stop does.

type FocusTask = { id: string; title: string };
const FocusContext = createContext<((t: FocusTask) => void) | null>(null);

/** Starts focus mode on a task. Null outside HQ's frame. */
export const useFocus = () => useContext(FocusContext);

const R = 46;
const C = 2 * Math.PI * R;

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [task, setTask] = useState<FocusTask | null>(null);
  return (
    <FocusContext.Provider value={setTask}>
      {children}
      {task && <FocusMode key={task.id} task={task} onEnd={() => setTask(null)} />}
    </FocusContext.Provider>
  );
}

function FocusMode({ task, onEnd }: { task: FocusTask; onEnd: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { run, pending } = useRun();
  const [clock, setClock] = useState<FocusClock>(() => newClock());
  const [now, setNow] = useState(() => Date.now());
  const remaining = left(clock, now);
  const over = remaining <= 0;
  const ticking = running(clock) && !over;

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  // the clock face, twice a second while it runs; the time is worked out from the start, not counted
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [ticking]);

  // time's up: a buzz on phones that have one
  useEffect(() => {
    if (!over) return;
    try {
      navigator.vibrate?.(200);
    } catch {}
  }, [over]);

  // the countdown in the tab's title, so it shows from another tab
  useEffect(() => {
    const was = document.title;
    return () => {
      document.title = was;
    };
  }, []);
  useEffect(() => {
    if (started(clock, now)) document.title = over ? "Time's up · DSS HQ" : `${clockText(remaining)} · ${task.title}`;
  }, [clock, now, over, remaining, task.title]);

  // a warning before the tab is closed with a session going
  useEffect(() => {
    if (!started(clock, now) || over) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [clock, now, over]);

  const toggle = () => {
    const t = Date.now();
    setNow(t);
    setClock((c) => (running(c) ? pause(c, t) : start(c, t)));
  };

  const finish = (done: boolean) => {
    const t = Date.now();
    const mins = spentMinutes(clock, t);
    ref.current?.close();
    onEnd();
    if (mins || done) run(() => endFocus(task.id, mins, done));
  };

  const canPick = !started(clock, now);
  const frac = clock.total ? remaining / clock.total : 0;

  return (
    <dialog
      ref={ref}
      aria-label="Focus mode"
      onCancel={(e) => e.preventDefault()}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-hq-side p-0 text-cream backdrop:bg-hq-side"
    >
      <div className="grid min-h-dvh place-items-center px-5 pt-[calc(24px+env(safe-area-inset-top))] pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="grid w-full max-w-[640px] justify-items-center gap-6 text-center">
          <span className="text-xs font-semibold tracking-[0.18em] text-lime uppercase">{over ? "Time's up" : "Focus mode"}</span>
          <h2 className="font-display text-3xl leading-tight font-bold tracking-[-0.02em] text-balance sm:text-4xl">{task.title}</h2>

          <div className="relative size-[min(68vw,280px)]">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" stroke="#3A3349" strokeWidth="5" />
              <circle
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke="#EC1763"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                className="transition-[stroke-dashoffset] duration-500 ease-linear motion-reduce:transition-none"
              />
            </svg>
            <span
              role="timer"
              aria-label={`${Math.ceil(remaining / 60)} minute${Math.ceil(remaining / 60) === 1 ? "" : "s"} left`}
              className="absolute inset-0 grid place-items-center font-display text-[clamp(44px,13vw,64px)] font-bold tabular-nums"
            >
              {clockText(remaining)}
            </span>
          </div>

          {canPick && (
            <div role="group" aria-label="How long" className="flex flex-wrap justify-center gap-2">
              {FOCUS_LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={clock.total === m * 60}
                  onClick={() => setClock(newClock(m))}
                  className={cn(
                    "min-h-10 rounded-full border-2 border-hq-side-2 px-4 text-sm font-semibold text-hq-muted hover:border-cream hover:text-cream",
                    clock.total === m * 60 && "border-cream bg-cream text-hq-side hover:text-hq-side",
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            {!over && (
              <button type="button" autoFocus onClick={toggle} className={cn(btn.base, btn.primary, "min-w-32")}>
                {ticking ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                {ticking ? "Pause" : canPick ? "Start" : "Resume"}
              </button>
            )}
            <button type="button" disabled={pending} onClick={() => finish(true)} className={cn(btn.base, "border-cream bg-transparent text-cream hover:bg-cream hover:text-hq-side")}>
              <Check className="size-4" aria-hidden /> Done with it
            </button>
            <button type="button" disabled={pending} onClick={() => finish(false)} className={cn(btn.base, "border-hq-side-2 bg-transparent text-hq-muted hover:border-cream hover:text-cream")}>
              Stop
            </button>
          </div>

          <p className="max-w-[46ch] text-sm text-hq-muted">Everything else can wait. If a thought pops up, put it in the capture bar later.</p>
        </div>
      </div>
    </dialog>
  );
}
