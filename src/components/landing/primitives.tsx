import { cn } from "@/lib/utils";

/** Small outlined pill with a pink dot: "WHAT THE SESSION IS". */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2.5 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] uppercase",
        className,
      )}
    >
      <span aria-hidden className="size-2 rounded-full bg-pink" />
      {children}
    </p>
  );
}

const keycapTones = {
  paper: "bg-paper",
  pink: "bg-pink-tint",
  aqua: "bg-aqua",
  lime: "bg-[#e1e8a7]",
  butter: "bg-[#f7eeae]",
} as const;

/** A word set on a chunky keyboard key, as in "the look-up test." */
export function Keycap({
  children,
  tone = "paper",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof keycapTones;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-display inline-block rounded-[14px] border-2 border-ink px-3.5 pt-0.5 pb-1.5 leading-none font-extrabold tracking-[-0.03em] text-ink shadow-keycap",
        keycapTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Four-point sparkle used as decoration. */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-6", className)}
      fill="currentColor"
      stroke="#212121"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M12 1.5c.6 5.6 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7.1 12 1.5Z" />
    </svg>
  );
}

/** Chunky outlined arrow used under the carousels. */
export function ChunkyArrow({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 40"
      aria-hidden
      className={cn("h-9 w-11", direction === "left" && "-scale-x-100", className)}
      fill="currentColor"
      stroke="#212121"
      strokeWidth="4"
      strokeLinejoin="round"
    >
      <path d="M4 14h20V4l20 16-20 16V26H4z" />
    </svg>
  );
}
