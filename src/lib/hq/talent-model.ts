// Talent, the brand tracker and Publicity: HQ's constants (z-talent.js, za-pub.js), word for word.

export const DEAL_STAGES = [
  ["prospect", "To approach"],
  ["pitching", "Pitching"],
  ["negotiating", "Negotiating"],
  ["contracted", "Contracted"],
  ["delivering", "Delivering"],
  ["completed", "Completed"],
  ["lost", "Lost"],
] as const;
export const OPEN_STAGES = ["prospect", "pitching", "negotiating", "contracted", "delivering"];
export const WON_STAGES = ["contracted", "delivering", "completed"];
export const stageTone = (s: string) => (s === "completed" ? "ok" : s === "lost" ? "plain" : ["contracted", "delivering"].includes(s) ? "sky" : s === "negotiating" ? "sunset" : "plain") as "ok" | "plain" | "sky" | "sunset";

export const CHANNELS = [
  ["", "Not set"],
  ["email", "Email"],
  ["whatsapp", "WhatsApp"],
  ["call", "Phone"],
  ["dm", "Social DM"],
  ["agency", "Through their agency"],
  ["inperson", "In person"],
] as const;

export const SOCIAL_PLATFORMS = ["Instagram", "TikTok", "YouTube", "X", "LinkedIn", "Facebook", "Snapchat", "Threads", "Substack", "Other"] as const;
export const RATE_PLATFORMS = [...SOCIAL_PLATFORMS, "Events and appearances", "Packages"] as const;

export const AGE_BANDS = [
  ["13_17", "13 to 17"],
  ["18_24", "18 to 24"],
  ["25_34", "25 to 34"],
  ["35_44", "35 to 44"],
  ["45_plus", "45 and over"],
] as const;

export const TL_LISTS = [
  ["interests", "Interests", "e.g. Fitness, Afrobeats, Gaming"],
  ["industries", "Favoured industries", "e.g. Beverages, Tech, Fashion"],
  ["avoid", "Off limits or conflicts", "e.g. Skincare (CeraVe exclusivity)"],
  ["partners", "Past and current brand partners", "e.g. Tecno"],
] as const;

export const TALENT_STATUS = [
  ["signed", "Signed"],
  ["trial", "Trial period"],
  ["prospect", "Prospect"],
  ["ended", "Ended"],
] as const;
export const PACKAGES = [
  ["", "Choose"],
  ["The Deal", "The Deal (15%)"],
  ["The Roster", "The Roster (20%)"],
  ["Custom", "Custom terms"],
] as const;
export const PAY_FLOW = [
  ["via_dss", "Brand pays DSS, DSS pays talent"],
  ["direct", "Brand pays talent, talent pays commission"],
] as const;

export type Goal = { t: string; done: boolean; at?: string; doneAt?: string | null };
export type Social = { id: string; platform: string; handle: string; url?: string; followers: number | null; er?: number | null; avgViews?: number | null; at?: string; hist?: { d: string; f: number }[] };
export type Rate = { id: string; item: string; platform: string; price: number; currency: string; notes?: string };
export type Audience = { female?: number | null; male?: number | null; ages?: Partial<Record<string, number | null>>; locations?: string; notes?: string; source?: string };
export type Deliverable = { t: string; due?: string; done: boolean };
export type DealUpdate = { at: string; by: number | null; text: string };

/** Total followers across a talent's accounts. */
export const totalFollowers = (socials: readonly Social[]) => socials.reduce((s, x) => s + (Number(x.followers) || 0), 0);

/** A new follower count for today replaces today's point; history keeps the last 24. */
export function withFollowerPoint(hist: readonly { d: string; f: number }[] = [], day: string, followers: number) {
  return [...hist.filter((h) => h.d !== day), { d: day, f: followers }].sort((a, b) => a.d.localeCompare(b.d)).slice(-24);
}

/** "+1,200 since 3 Oct": the change between the last two follower counts, or null. */
export function followerChange(hist: readonly { d: string; f: number }[] = []) {
  if (hist.length < 2) return null;
  const [a, b] = hist.slice(-2);
  return b.f - a.f ? { diff: b.f - a.f, since: a.d } : null;
}

/** HQ's copy-ready rate card. */
export function rateText(name: string, rates: readonly Rate[], notes: string, money: (n: number, c: string) => string) {
  const out = [`${name}: rate card`];
  for (const p of [...new Set(rates.map((r) => r.platform))]) {
    out.push("", p);
    for (const r of rates.filter((x) => x.platform === p)) out.push(`- ${r.item}: ${money(r.price, r.currency)}${r.notes ? ` (${r.notes})` : ""}`);
  }
  if (notes) out.push("", notes);
  out.push("", "Managed by Digital Savvy Studios");
  return out.join("\n");
}

/** Comma-separated input added to a list without repeats. */
export const addToList = (list: readonly string[], input: string) => [...new Set([...list, ...input.split(",").map((x) => x.trim()).filter(Boolean)])];

/* ── Publicity ───────────────────────────────────────────────────────── */

export const MEDIA_TYPES = [
  ["agency", "PR or media agency"],
  ["radio", "Radio station"],
  ["tv", "TV show"],
  ["podcast", "Podcast"],
  ["blog", "Blog or online publication"],
  ["print", "Newspaper or magazine"],
  ["creator", "Creator or community page"],
] as const;
export const MEDIA_STATUS = [
  ["new", "Not contacted"],
  ["contacted", "Contacted"],
  ["warm", "Warm relationship"],
  ["featured", "Has featured us"],
  ["nofit", "Not a fit"],
] as const;
export const mediaTone = (s: string) => (s === "warm" ? "ok" : s === "featured" ? "lime" : s === "contacted" ? "sky" : "plain") as "ok" | "lime" | "sky" | "plain";
export const PITCH_STATUS = [
  ["idea", "Idea"],
  ["pitched", "Pitched"],
  ["following", "Following up"],
  ["booked", "Booked"],
  ["published", "Published or aired"],
  ["declined", "Declined"],
] as const;
export const PITCH_OPEN = ["idea", "pitched", "following", "booked"];
export const pitchTone = (s: string) => (s === "published" ? "ok" : s === "booked" ? "sky" : s === "following" ? "sunset" : s === "pitched" ? "rose" : "plain") as "ok" | "sky" | "sunset" | "rose" | "plain";
export const REGIONS = [
  ["Nigeria", "Nigeria"],
  ["Africa", "Rest of Africa"],
  ["UK", "UK"],
  ["US", "US"],
  ["Canada", "Canada"],
  ["Global", "Global"],
] as const;
export const COSTS = [
  ["", "Not sure"],
  ["free", "Free editorial"],
  ["paid", "Paid placement"],
  ["both", "Both"],
] as const;

/**
 * Logging a pitch warms up the outlet: booked or published means it has featured us, anything
 * else means contacted. It only ever moves up (HQ also lifted "Not a fit" outlets, so we do too).
 */
export function mediaStatusAfterPitch(current: string, pitchStatus: string) {
  const rank: Record<string, number> = { nofit: -1, new: 0, contacted: 1, warm: 2, featured: 3 };
  const target = ["booked", "published"].includes(pitchStatus) ? "featured" : "contacted";
  return (rank[current] ?? 0) < rank[target] ? target : current;
}
