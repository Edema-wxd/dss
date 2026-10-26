"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Hero paper-plane sticker. Click or tap sends it flying off the edge and back
 * in from the other side to its resting spot (the `fly` animation).
 */
export function PaperPlane({ className }: { className?: string }) {
  const [flying, setFlying] = useState(false);

  return (
    <button
      type="button"
      aria-label="Send the paper plane flying"
      onClick={() => setFlying(true)}
      className={cn("absolute cursor-pointer touch-manipulation", className)}
    >
      <span
        className={cn("block size-full", flying && "fly")}
        onAnimationEnd={() => setFlying(false)}
      >
        <svg viewBox="0 0 100 100" fill="none" aria-hidden className="float size-full overflow-visible [--float-delay:-2s]">
          <g>
            <path d="M15.78 61.81 84.54 9.62l-4.17 76.97-25.42-19.95-39.17-4.84Z" fill="#cdd629" stroke="#212121" strokeWidth="4.875" strokeLinejoin="round" />
            <path d="M84.54 9.62 54.95 64.52v2.12l29.59-57.02Z" fill="#ec1763" stroke="#212121" strokeWidth="4.875" strokeLinejoin="round" />
          </g>
        </svg>
      </span>
    </button>
  );
}
