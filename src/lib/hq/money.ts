// How money reads on screen, as HQ showed it. Pure, for the server and the browser.

/** ₦250,000 (no kobo for naira), $1,200.50; `compact` gives ₦1.2M. */
export function money(n: number | null | undefined, cur = "NGN", compact = false) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: cur || "NGN",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : cur === "NGN" || !cur ? 0 : 2,
  }).format(n);
}

/** Profit and loss cells: ₦1.2M, ₦45K, ₦3.4K, with negatives in brackets. */
export function shortN(n: number) {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : String(Math.round(a));
  return n < -0.5 ? `(₦${s})` : `₦${s}`;
}

/** A figure, or "-" when it rounds to nothing. */
export const cell = (n: number) => (Math.abs(n) < 0.5 ? "-" : shortN(n));
