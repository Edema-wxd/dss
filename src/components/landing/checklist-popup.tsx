"use client";

import { useEffect, useState } from "react";
import { ChecklistDialog, checklistAlreadyHandled } from "./checklist-dialog";

const delayMs = 40_000;
const scrollDepth = 0.6;
const retryMs = 5_000;

/** Someone mid-form or in another dialog shouldn't be interrupted. */
function isBusy() {
  const active = document.activeElement;
  const typing = active instanceof HTMLElement && active.matches("input, textarea, select, [contenteditable]");
  return typing || document.querySelector('[role="dialog"]') !== null;
}

/**
 * Opens the checklist once per visit, on whichever comes first: exit intent
 * (pointer leaving through the top of the window), 40 seconds on the page, or
 * 60% scroll depth. Never again once the checklist has been sent.
 */
export function ChecklistPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (checklistAlreadyHandled()) return;

    let done = false;
    let retry: number | undefined;

    const show = () => {
      if (done || checklistAlreadyHandled()) return cleanup();
      if (isBusy()) {
        window.clearTimeout(retry);
        retry = window.setTimeout(show, retryMs);
        return;
      }
      done = true;
      cleanup();
      setOpen(true);
    };

    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable > 0 && window.scrollY / scrollable >= scrollDepth) show();
    };
    const onMouseOut = (e: MouseEvent) => {
      if (!e.relatedTarget && e.clientY <= 0) show();
    };

    const timer = window.setTimeout(show, delayMs);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseout", onMouseOut);

    function cleanup() {
      window.clearTimeout(timer);
      window.clearTimeout(retry);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onMouseOut);
    }
    return cleanup;
  }, []);

  return <ChecklistDialog open={open} onOpenChange={setOpen} />;
}
