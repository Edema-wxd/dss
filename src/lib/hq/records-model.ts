import { HEALTH, label, stagesFor } from "./sales-model";
import { AGE_BANDS, COSTS, DEAL_STAGES, MEDIA_STATUS, MEDIA_TYPES, PITCH_STATUS, REGIONS, totalFollowers } from "./talent-model";
import type { Goal, Rate, Social, Audience, DealUpdate, Deliverable } from "./talent-model";
import { TASK_STATUS } from "./work";

// The nightly "DSS HQ Records" sheet (HQ's scheduled task 04): one tab per area, column A is
// always the HQ id. A read-only copy for the team; HQ stays the source of truth. Pure builders.

type Cell = string | number;
type Named = { id: number; name: string };

const join = (xs: readonly string[] | undefined) => (xs ?? []).join(", ");
const num = (v: number | null | undefined): Cell => (v === null || v === undefined ? "" : v);
const latest = (updates: readonly DealUpdate[] | undefined, notes: string) => {
  const u = [...(updates ?? [])].sort((a, b) => a.at.localeCompare(b.at)).pop();
  return u ? `${u.at.slice(0, 10)}: ${u.text}` : notes;
};

export type RecordsInput = {
  people: Named[];
  tasks: { id: string; title: string; assigneeId: number | null; due: string; status: string; priority: string; clientId: string | null; notes: string; doneAt: string }[];
  clients: { id: string; name: string; service: string; status: string; health: string; fee: number | null; currency: string; billing: string; startDate: string; endDate: string; contactName: string; contactRole: string; nextDeliverable: string; nextDate: string }[];
  contacts: { id: string; name: string; company: string; kind: string; stage: string; industry: string; location: string; service: string; relType: string; source: string; ownerId: number | null; nextDate: string; notes: string }[];
  talents: { id: string; name: string; category: string; status: string; package: string; commission: number | null; payFlow: string; coManager: string; goals: Goal[]; interests: string[]; industries: string[]; avoid: string[]; partners: string[]; socials: Social[]; audience: Audience | null; rates: Rate[] }[];
  deals: { id: string; talentId: string | null; brand: string; title: string; stage: string; health: string; contactPerson: string; contactRole: string; proposed: number | null; fee: number | null; received: number | null; currency: string; commissionPct: number | null; deliverables: Deliverable[]; nextStep: string; nextDate: string; dueDate: string; updates: DealUpdate[]; notes: string }[];
  media: { id: string; name: string; type: string; show: string; host: string; industries: string[]; city: string; region: string; reach: string; cost: string; contactName: string; contactRole: string; email: string; phone: string; link: string; status: string; nextDate: string; howToPitch: string; notes: string }[];
  pitches: { id: string; forKey: string; outletId: string | null; angle: string; status: string; pitchedOn: string; runDate: string; link: string; ownerId: number | null; nextDate: string; updates: DealUpdate[] }[];
};

export function buildRecords(d: RecordsInput): Record<string, Cell[][]> {
  const person = (id: number | null) => d.people.find((p) => p.id === id)?.name ?? "";
  const client = (id: string | null) => d.clients.find((c) => c.id === id)?.name ?? "";
  const talent = (id: string | null) => d.talents.find((t) => t.id === id)?.name ?? "";
  const forName = (k: string) => (k === "dss" ? "Digital Savvy Studios" : k === "jane" ? "Janefrances (personal brand)" : k.startsWith("client:") ? client(k.slice(7)) : k.startsWith("talent:") ? talent(k.slice(7)) : k);
  return {
    Tasks: d.tasks.map((t) => [t.id, t.title, person(t.assigneeId), t.due, label(TASK_STATUS, t.status), t.priority, client(t.clientId), t.notes, t.doneAt.slice(0, 10)]),
    Clients: d.clients.map((c) => [
      c.id, c.name, c.service, c.status, label(HEALTH, c.health), num(c.fee), c.currency, c.billing, c.startDate, c.endDate,
      c.contactName + (c.contactRole ? ` (${c.contactRole})` : ""), c.nextDeliverable, c.nextDate,
    ]),
    CRM: d.contacts.map((c) => [
      c.id, c.name, c.company, c.kind === "talent" ? "Talent relationships" : "DSS sales", label(stagesFor(c.kind), c.stage), c.industry, c.location,
      c.kind === "talent" ? c.relType : c.service, c.source, person(c.ownerId), c.nextDate, c.notes,
    ]),
    Talent: d.talents.map((t) => [
      t.id, t.name, t.category, t.status, t.package, num(t.commission), t.payFlow === "direct" ? "Brand pays talent" : "Brand pays DSS", t.coManager,
      t.goals.map((g) => (g.done ? `[done] ${g.t}` : g.t)).join(" | "), join(t.interests), join(t.industries), join(t.avoid), join(t.partners),
      totalFollowers(t.socials), t.socials.map((s) => `${s.platform} ${s.handle} ${s.followers ?? ""}`.trim()).join("; "),
      num(t.audience?.female), num(t.audience?.male),
      AGE_BANDS.filter(([k]) => t.audience?.ages?.[k] !== null && t.audience?.ages?.[k] !== undefined).map(([k, l]) => `${l}: ${t.audience!.ages![k]}%`).join(", "),
      t.audience?.locations ?? "",
    ]),
    "Brand tracker": d.deals.map((x) => [
      x.id, talent(x.talentId), x.brand, x.title, label(DEAL_STAGES, x.stage), label(HEALTH, x.health), x.contactPerson, x.contactRole,
      num(x.proposed), num(x.fee), num(x.received), x.currency, num(x.commissionPct), x.deliverables.filter((y) => y.done).length, x.deliverables.length,
      x.nextStep, x.nextDate || x.dueDate, latest(x.updates, x.notes),
    ]),
    "Rate cards": d.talents.flatMap((t) => t.rates.map((r) => [`${t.id}:${r.id}`, t.name, r.platform, r.item, r.price, r.currency, r.notes ?? ""])),
    "Media list": [...d.media]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => [
        m.id, m.name, label(MEDIA_TYPES, m.type), m.show, m.host, join(m.industries), m.city, label(REGIONS, m.region), m.reach, label(COSTS, m.cost),
        m.contactName, m.contactRole, m.email, m.phone, m.link, label(MEDIA_STATUS, m.status), m.nextDate, m.howToPitch, m.notes,
      ]),
    Pitches: d.pitches.map((p) => [
      p.id, forName(p.forKey), d.media.find((m) => m.id === p.outletId)?.name ?? "", p.angle, label(PITCH_STATUS, p.status), p.pitchedOn, p.runDate, p.link,
      person(p.ownerId), p.nextDate, latest(p.updates, ""),
    ]),
  };
}

export type LedgerRow = { id: string; date: string; description: string; party: string; kind: string; acct: string; amount: number; currency: string; method?: string };

/** Income and Expenses only ever gain rows: the ones whose id isn't in column A yet, by date. */
export function newLedgerRows(rows: readonly LedgerRow[], existingIds: ReadonlySet<string>, expenses: boolean): Cell[][] {
  return rows
    .filter((r) => !existingIds.has(r.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => (expenses ? [r.id, r.date, r.description, r.party, r.kind, r.acct, r.amount, r.currency, r.method ?? ""] : [r.id, r.date, r.description, r.party, r.kind, r.acct, r.amount, r.currency]));
}

/** "19 Nov 2026, 23:17 Lagos", for the Read me tab. */
export const lagosStamp = (now = new Date()) =>
  `${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })}, ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Lagos" })} Lagos`;
