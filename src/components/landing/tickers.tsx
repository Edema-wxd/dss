import { cn } from "@/lib/utils";

function Ticker({
  items,
  className,
  reverse,
}: {
  items: string[];
  className?: string;
  reverse?: boolean;
}) {
  const run = items.map((item) => `${item} ✦ `).join("");
  return (
    <div className={cn("overflow-hidden border-y-2 border-ink py-2.5 whitespace-nowrap", className)}>
      <div
        className={cn(
          "flex w-max text-[13px] font-semibold tracking-[0.12em] uppercase",
          reverse ? "animate-marquee-reverse" : "animate-marquee",
        )}
      >
        {/* the run is doubled so the -50% loop is seamless */}
        <span className="pr-1">{run.repeat(3)}</span>
        <span aria-hidden className="pr-1">
          {run.repeat(3)}
        </span>
      </div>
    </div>
  );
}

export function Tickers() {
  return (
    <div
      aria-label="Moving first? Get seen first. Great brands lose to louder ones."
      role="img"
      className="relative h-[150px] overflow-hidden"
    >
      <Ticker
        items={["Moving first? Get seen first", "Launch", "Raise", "Expand", "Rebrand", "Scale"]}
        className="absolute top-10 -left-8 w-[130%] rotate-[8deg] bg-lime text-ink"
      />
      <Ticker
        reverse
        items={["Do not ignore", "Great brands lose to louder ones", "Built boldly? Make it visible"]}
        className="absolute top-10 -left-8 w-[130%] -rotate-[8deg] bg-pink text-white"
      />
    </div>
  );
}
