"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, Plus, Settings2, Trash2, X } from "lucide-react";
import { invoiceFromDeal, saveTalentBankAction } from "@/app/admin/(hq)/invoices/actions";
import { addDeal, addTalent, dealHistory, postDealUpdate, removeDeal, removeDealUpdate, removeTalent, saveDeal, saveTalent } from "@/app/admin/(hq)/talent/actions";
import { Button, Field, Panel, btn, fieldClass, useToast } from "@/components/desk/ui";
import type { Contact, TimelineEntry } from "@/lib/hq/sales";
import { CURRENCIES, HEALTH, TALENT_STAGES, label } from "@/lib/hq/sales-model";
import type { Deal, Talent } from "@/lib/hq/talent";
import {
  AGE_BANDS,
  CHANNELS,
  DEAL_STAGES,
  OPEN_STAGES,
  PACKAGES,
  PAY_FLOW,
  RATE_PLATFORMS,
  SOCIAL_PLATFORMS,
  TALENT_STATUS,
  TL_LISTS,
  WON_STAGES,
  addToList,
  followerChange,
  rateText,
  stageTone,
  totalFollowers,
} from "@/lib/hq/talent-model";
import { compactNaira } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Timeline, healthTone } from "./clients";
import { Avatar, Bar, Dialog, DueChip, EmptyNote, Pill, useRun } from "./kit";
import type { WorkProps } from "./tasks";

type Common = { w: WorkProps; money: boolean; fin?: boolean; talents: Talent[]; deals: Deal[]; contacts: Contact[] };
type TalentBank = { bank: string; name: string; number: string };
const compact = (n: number) => (n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1e3 ? `${Math.round(n / 100) / 10}k` : String(n));
const cash = (n: number | null, c = "NGN") => (n === null ? "-" : c === "NGN" ? `₦${n.toLocaleString("en-GB")}` : `${c} ${n.toLocaleString("en-GB")}`);
const STATUS_ORDER = ["signed", "trial", "prospect", "ended"];
const first = (s: string) => s.split(" ")[0];

/* ── Roster ──────────────────────────────────────────────────────────── */

export function TalentRoster(p: Common) {
  const { run } = useRun();
  const [tab, setTab] = useState<"deals" | "brands">("deals");
  const [addingTalent, setAddingTalent] = useState(false);
  const [newDeal, setNewDeal] = useState<Partial<Deal> | null>(null);
  const [openDeal, setOpenDeal] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const tname = (id: string | null) => p.talents.find((t) => t.id === id)?.name ?? "No talent";
  const roster = [...p.talents].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
  const brands = p.contacts.filter((c) => c.kind === "talent").sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button onClick={() => setAddingTalent(true)}>
          <Plus className="size-4" aria-hidden /> Talent
        </Button>
        <button type="button" onClick={() => (p.talents.length ? setNewDeal({}) : undefined)} disabled={!p.talents.length} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Brand or deal
        </button>
      </div>
      {roster.length ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {roster.map((t) => {
            const goal = t.goals.find((g) => !g.done);
            const inPlay = p.deals.filter((d) => d.talentId === t.id && OPEN_STAGES.includes(d.stage)).length;
            return (
              <Link key={t.id} href={`/admin/talent/${t.id}`} className="grid content-start gap-1.5 rounded-[20px] border-2 border-ink bg-white p-4 transition-transform hover:-translate-y-0.5">
                <span className="flex flex-wrap gap-1">
                  <Pill tone={t.status === "signed" ? "ok" : t.status === "trial" ? "warn" : "plain"}>{t.status === "trial" ? "Trial" : label(TALENT_STATUS, t.status)}</Pill>
                  {t.package && <Pill>{t.package}</Pill>}
                </span>
                <h2 className="text-lg font-bold">{t.name}</h2>
                <span className="text-sm text-slate">{t.category}</span>
                {goal && <span className="text-sm">Goal: {goal.t}</span>}
                <span className="flex flex-wrap gap-x-3 text-xs text-slate">
                  <span>{compact(totalFollowers(t.socials))} followers</span>
                  <span>
                    {inPlay} brand{inPlay === 1 ? "" : "s"} in play
                  </span>
                  {p.money && t.commission !== null && <span>{t.commission}%</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mb-6">
          <EmptyNote title="No talent on the roster yet." />
        </div>
      )}
      <div role="group" aria-label="Show" className="mb-3 flex w-fit rounded-full border-2 border-ink bg-white p-0.5">
        {(
          [
            ["deals", "All brands and deals"],
            ["brands", "Brands and agencies"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={cn("rounded-full px-3.5 py-1 text-sm font-semibold", tab === k && "bg-ink text-white")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "deals" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {DEAL_STAGES.map(([k, l]) => {
            const items = p.deals.filter((d) => d.stage === k);
            const total = items.reduce((s, d) => s + (d.currency === "NGN" ? (d.fee ?? d.proposed ?? 0) : 0), 0);
            return (
              <section
                key={k}
                aria-label={l}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) run(() => saveDeal(dragId, { stage: k }));
                  setDragId(null);
                }}
                className="grid w-[230px] flex-none content-start gap-2 rounded-[20px] bg-paper/70 p-2.5"
              >
                <h2 className="flex items-center gap-2 px-1 text-sm font-bold">
                  {l} <Pill>{items.length}</Pill>
                  {p.money && total > 0 && <span className="ml-auto text-xs font-normal text-slate">{compactNaira(total)}</span>}
                </h2>
                {items.map((d) => (
                  <article key={d.id} draggable onDragStart={() => setDragId(d.id)} onDragEnd={() => setDragId(null)} className="cursor-grab rounded-2xl border-2 border-ink/15 bg-white p-3 hover:border-ink">
                    <button type="button" onClick={() => setOpenDeal(d.id)} className="grid w-full gap-1 text-left">
                      <span className="flex flex-wrap gap-1">
                        <Pill tone="sky">{first(tname(d.talentId))}</Pill>
                        {d.health !== "good" && <Pill tone={healthTone(d.health)}>{label(HEALTH, d.health)}</Pill>}
                      </span>
                      <b className="text-sm">
                        {d.brand}
                        {d.title ? `, ${d.title}` : ""}
                      </b>
                      <span className="flex items-center gap-2 text-xs">
                        {d.ownerId && <Avatar name={p.w.people.find((x) => x.id === d.ownerId)?.name ?? ""} />}
                        <DueChip due={d.nextDate || d.dueDate} today={p.w.today} done={d.stage === "completed"} />
                        <span className="flex-1" />
                        {p.money && (d.fee ?? d.proposed) !== null ? cash(d.fee ?? d.proposed, d.currency) : ""}
                      </span>
                    </button>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : brands.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((c) => (
            <div key={c.id} className="grid gap-1 rounded-[20px] border-2 border-ink/15 bg-white p-4">
              <b>{c.company || c.name}</b>
              <span className="text-sm text-slate">{[c.name, c.role].filter(Boolean).join(", ")}</span>
              <span className="flex flex-wrap gap-1">
                <Pill>{label(TALENT_STAGES, c.stage)}</Pill>
                {c.relType && <Pill>{c.relType}</Pill>}
                {c.talentIds.map((id) => (
                  <Pill key={id} tone="sky">
                    {first(tname(id))}
                  </Pill>
                ))}
              </span>
              {c.nextDate && <DueChip due={c.nextDate} today={p.w.today} />}
            </div>
          ))}
        </div>
      ) : (
        <EmptyNote title="No brands or agencies yet.">Add them in CRM under Talent relationships.</EmptyNote>
      )}
      <Dialog open={addingTalent} onClose={() => setAddingTalent(false)} title="Add talent">
        {addingTalent && <NewTalent w={p.w} money={p.money} onDone={() => setAddingTalent(false)} />}
      </Dialog>
      <DealDialogs {...p} newDeal={newDeal} setNewDeal={setNewDeal} openDeal={openDeal} setOpenDeal={setOpenDeal} />
    </>
  );
}

function NewTalent({ w, onDone }: { w: WorkProps; money: boolean; onDone: () => void }) {
  const { run, pending } = useRun();
  const router = useRouter();
  const [d, setD] = useState({ name: "", category: "", status: "signed", package: "The Roster", commission: "20", payFlow: "via_dss", startDate: w.today, managerId: String(w.me.id) });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await addTalent(d);
          if (r.ok && r.id) router.push(`/admin/talent/${r.id}`);
          return r;
        }).then((ok) => ok && onDone());
      }}
    >
      <Field label="Name" full>
        <input required autoFocus className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="What they do" full>
        <input placeholder="e.g. Creator and confidence coach" className={fieldClass} {...bind("category")} />
      </Field>
      <Field label="Status">
        <select className={fieldClass} {...bind("status")}>
          {TALENT_STATUS.filter(([k]) => k !== "ended").map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Package">
        <select className={fieldClass} {...bind("package")}>
          {PACKAGES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Commission %">
        <input type="number" min={0} max={100} className={fieldClass} {...bind("commission")} />
      </Field>
      <Field label="How brands pay">
        <select className={fieldClass} {...bind("payFlow")}>
          <option value="via_dss">Brands pay DSS</option>
          <option value="direct">Brands pay talent directly</option>
        </select>
      </Field>
      <Field label="Signed on">
        <input type="date" className={fieldClass} {...bind("startDate")} />
      </Field>
      <Field label="Lead manager">
        <select className={fieldClass} {...bind("managerId")}>
          {w.people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Add talent
      </button>
    </form>
  );
}

/* ── Deals: new and open ─────────────────────────────────────────────── */

type DealDialogProps = Common & { newDeal: Partial<Deal> | null; setNewDeal: (d: Partial<Deal> | null) => void; openDeal: string | null; setOpenDeal: (id: string | null) => void };

export function DealDialogs(p: DealDialogProps) {
  const deal = p.deals.find((d) => d.id === p.openDeal) ?? null;
  const t = p.talents.find((x) => x.id === (p.newDeal?.talentId ?? ""));
  return (
    <>
      <Dialog open={p.newDeal !== null} onClose={() => p.setNewDeal(null)} title={p.newDeal?.stage === "prospect" && t ? `Add a brand for ${first(t.name)}` : "New talent deal"} wide>
        {p.newDeal && <NewDeal {...p} pre={p.newDeal} onDone={() => p.setNewDeal(null)} />}
      </Dialog>
      <Dialog open={deal !== null} onClose={() => p.setOpenDeal(null)} title={deal ? [deal.brand, deal.title].filter(Boolean).join(", ") : "Deal"} side>
        {deal && <DealPanel key={deal.id} {...p} d={deal} onClose={() => p.setOpenDeal(null)} />}
      </Dialog>
    </>
  );
}

function NewDeal({ talents, contacts, w, money, pre, onDone }: Common & { pre: Partial<Deal>; onDone: () => void }) {
  const { run, pending } = useRun();
  const t0 = talents.find((x) => x.id === pre.talentId);
  const contact = contacts.find((c) => c.id === pre.contactId);
  const [d, setD] = useState({
    talentId: pre.talentId ?? talents[0]?.id ?? "",
    brand: contact ? contact.company || contact.name : "",
    title: "",
    stage: pre.stage ?? "pitching",
    contactPerson: contact?.name ?? "",
    contactRole: contact?.role ?? "",
    payFlow: t0?.payFlow || "via_dss",
    proposed: "",
    fee: "",
    currency: "NGN",
    commissionPct: String(t0?.commission ?? 20),
    dueDate: "",
    note: "",
    ownerId: String(w.me.id),
    contactId: pre.contactId ?? "",
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => addDeal(d)).then((ok) => ok && onDone()))}>
      <Field label="Talent">
        <select required className={fieldClass} {...bind("talentId")}>
          {talents.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Brand">
        <input required autoFocus className={fieldClass} {...bind("brand")} />
      </Field>
      <Field label="Campaign or deal" full>
        <input placeholder="e.g. Festive season campaign, 3 months" className={fieldClass} {...bind("title")} />
      </Field>
      <Field label="Stage">
        <select className={fieldClass} {...bind("stage")}>
          {DEAL_STAGES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Payment flow">
        <select className={fieldClass} {...bind("payFlow")}>
          <option value="via_dss">Brand pays DSS</option>
          <option value="direct">Brand pays talent directly</option>
        </select>
      </Field>
      <Field label="In contact with">
        <input placeholder="Name, if you have one" className={fieldClass} {...bind("contactPerson")} />
      </Field>
      <Field label="Their role">
        <input placeholder="e.g. Brand manager" className={fieldClass} {...bind("contactRole")} />
      </Field>
      {money && (
        <>
          <Field label="Proposed fee">
            <input type="number" min={0} className={fieldClass} {...bind("proposed")} />
          </Field>
          <Field label="Agreed fee" hint="Leave empty until it's agreed">
            <input type="number" min={0} className={fieldClass} {...bind("fee")} />
          </Field>
          <Field label="Currency">
            <select className={fieldClass} {...bind("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="DSS commission %">
            <input type="number" min={0} max={100} className={fieldClass} {...bind("commissionPct")} />
          </Field>
        </>
      )}
      <Field label="Key date">
        <input type="date" className={fieldClass} {...bind("dueDate")} />
      </Field>
      <Field label="Managed by">
        <select className={fieldClass} {...bind("ownerId")}>
          {w.people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="First status update" full>
        <textarea rows={2} placeholder="e.g. Good fit: they sponsor dance content. Reaching out through their agency." className={fieldClass} {...bind("note")} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Add deal
      </button>
    </form>
  );
}

function DealPanel({ d, talents, contacts, w, money, fin, onClose }: Common & { d: Deal; onClose: () => void }) {
  const { run, pending } = useRun();
  const router = useRouter();
  const toast = useToast();
  const [invoicing, setInvoicing] = useState(false);
  const raiseInvoice = async () => {
    setInvoicing(true);
    const r = await invoiceFromDeal(d.id);
    setInvoicing(false);
    if (!r.ok) return toast(r.error);
    toast(r.message ?? "Draft created.");
    if (r.id) router.push(`/admin/invoices?open=${encodeURIComponent(r.id)}`);
  };
  const [note, setNote] = useState("");
  const [health, setHealth] = useState("");
  const [history, setHistory] = useState<TimelineEntry[] | null>(null);
  const [item, setItem] = useState({ t: "", due: "" });
  useEffect(() => {
    dealHistory(d.id).then(setHistory);
  }, [d.id, d.updates.length, d.stage]);
  const [f, setF] = useState({
    talentId: d.talentId ?? "",
    stage: d.stage,
    brand: d.brand,
    contactId: d.contactId ?? "",
    contactPerson: d.contactPerson,
    contactRole: d.contactRole,
    contactChannel: d.contactChannel,
    health: d.health,
    title: d.title,
    proposed: d.proposed === null ? "" : String(d.proposed),
    fee: d.fee === null ? "" : String(d.fee),
    received: d.received === null ? "" : String(d.received),
    currency: d.currency || "NGN",
    commissionPct: d.commissionPct === null ? "" : String(d.commissionPct),
    nextStep: d.nextStep,
    nextDate: d.nextDate,
    payFlow: d.payFlow || "via_dss",
    dueDate: d.dueDate,
    ownerId: d.ownerId ? String(d.ownerId) : "",
    usage: d.usage,
    notes: d.notes,
  });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value })) });
  const sel = (k: keyof typeof f, l: string, opts: readonly (readonly [string, string])[]) => (
    <Field label={l}>
      <select className={fieldClass} {...bind(k)}>
        {opts.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </Field>
  );
  const pct = d.commissionPct ?? 20;
  const setDeliverables = (list: Deal["deliverables"]) => run(() => saveDeal(d.id, { deliverables: list }));
  return (
    <div className="grid gap-5">
      <p className="-mt-3 text-sm text-slate">{talents.find((t) => t.id === d.talentId)?.name}</p>
      {money && d.fee !== null && (
        <p className="rounded-2xl bg-lime/30 p-3 text-sm">
          DSS commission {cash(Math.round((d.fee * pct) / 100), d.currency)}, talent receives {cash(Math.round(d.fee * (1 - pct / 100)), d.currency)}
        </p>
      )}
      {fin && (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={invoicing} onClick={raiseInvoice}>
            {d.payFlow === "direct" ? "Invoice talent for commission" : "Invoice the brand"}
          </Button>
          <span className="text-xs text-slate">Makes a draft in Invoices for you to check and send.</span>
        </div>
      )}
      <section className="grid gap-2 rounded-2xl bg-paper/70 p-3">
        <h3 className="flex items-center gap-2 font-bold">
          Status report <Pill tone={healthTone(d.health)}>{label(HEALTH, d.health)}</Pill>
        </h3>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="How is it going? e.g. Sent the deck to their brand manager, they want rates for 3 Reels" aria-label="Status update" className={fieldClass} />
        <div className="flex flex-wrap gap-2">
          <select aria-label="How it's going" value={health} onChange={(e) => setHealth(e.target.value)} className={cn(fieldClass, "w-auto")}>
            <option value="">Keep: {label(HEALTH, d.health)}</option>
            {HEALTH.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <Button tone="primary" disabled={pending || !note.trim()} onClick={() => run(() => postDealUpdate(d.id, note, health)).then((ok) => ok && (setNote(""), setHealth("")))}>
            Post update
          </Button>
        </div>
        {d.updates.length ? (
          <ol className="grid gap-2">
            {[...d.updates].reverse().map((u) => (
              <li key={u.at} className="flex gap-2 text-sm">
                <span className="flex-1">
                  {u.text}
                  <span className="block text-xs text-slate">
                    {first(w.people.find((x) => x.id === u.by)?.name ?? "Someone")}, {u.at.slice(0, 10)}
                  </span>
                </span>
                {u.by === w.me.id && (
                  <button type="button" aria-label="Remove this update" onClick={() => run(() => removeDealUpdate(d.id, u.at))} className="text-slate hover:text-pink">
                    <X className="size-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate">No updates yet. Post one after every call, email or meeting.</p>
        )}
      </section>

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveDeal(d.id, f)))}>
        {sel("talentId", "Talent", talents.map((t) => [t.id, t.name] as [string, string]))}
        {sel("stage", "Stage", DEAL_STAGES)}
        <Field label="Brand">
          <input required className={fieldClass} {...bind("brand")} />
        </Field>
        {sel("contactId", "Brand in CRM", [["", "None"], ...contacts.filter((c) => c.kind === "talent").map((c) => [c.id, c.company || c.name] as [string, string])])}
        <Field label="In contact with">
          <input className={fieldClass} {...bind("contactPerson")} />
        </Field>
        <Field label="Their role">
          <input className={fieldClass} {...bind("contactRole")} />
        </Field>
        {sel("contactChannel", "Talking through", CHANNELS)}
        {sel("health", "How it's going", HEALTH)}
        <Field label="Campaign or deal" full>
          <input className={fieldClass} {...bind("title")} />
        </Field>
        {money && (
          <>
            <Field label="Proposed fee">
              <input type="number" min={0} className={fieldClass} {...bind("proposed")} />
            </Field>
            <Field label="Agreed fee">
              <input type="number" min={0} className={fieldClass} {...bind("fee")} />
            </Field>
            <Field label="Received so far">
              <input type="number" min={0} className={fieldClass} {...bind("received")} />
            </Field>
            {sel("currency", "Currency", CURRENCIES.map((c) => [c, c]))}
            <Field label="DSS commission %">
              <input type="number" min={0} max={100} className={fieldClass} {...bind("commissionPct")} />
            </Field>
          </>
        )}
        <Field label="Next step">
          <input placeholder="e.g. Follow up on the counter offer" className={fieldClass} {...bind("nextStep")} />
        </Field>
        <Field label="Next step by">
          <input type="date" className={fieldClass} {...bind("nextDate")} />
        </Field>
        {sel("payFlow", "Payment flow", PAY_FLOW)}
        <Field label="Key date">
          <input type="date" className={fieldClass} {...bind("dueDate")} />
        </Field>
        {sel("ownerId", "Managed by", [["", "No one yet"], ...w.people.map((x) => [String(x.id), x.name] as [string, string])])}
        <Field label="Usage rights and exclusivity" full>
          <textarea rows={2} className={fieldClass} {...bind("usage")} />
        </Field>
        <Field label="Notes" full>
          <textarea rows={2} className={fieldClass} {...bind("notes")} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
            Save
          </button>
          <span className="flex-1" />
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm("Delete this deal? This can't be undone.") && run(() => removeDeal(d.id)).then((ok) => ok && onClose())}>
            Delete
          </Button>
        </div>
      </form>

      <section className="grid gap-2">
        <h3 className="font-bold">Deliverables</h3>
        {d.deliverables.map((x, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={x.done} onChange={(e) => setDeliverables(d.deliverables.map((y, j) => (j === i ? { ...y, done: e.target.checked } : y)))} className="size-4 accent-pink" />
            <span className={cn("flex-1", x.done && "text-slate line-through")}>{x.t}</span>
            {x.due && <DueChip due={x.due} today={w.today} done={x.done} />}
            <button type="button" aria-label={`Remove ${x.t}`} onClick={() => setDeliverables(d.deliverables.filter((_, j) => j !== i))} className="text-slate hover:text-pink">
              <Trash2 className="size-4" aria-hidden />
            </button>
          </label>
        ))}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (item.t.trim()) setDeliverables([...d.deliverables, { t: item.t.trim(), due: item.due, done: false }]).then((ok) => ok && setItem({ t: "", due: "" }));
          }}
        >
          <input value={item.t} onChange={(e) => setItem((x) => ({ ...x, t: e.target.value }))} placeholder="e.g. 2 TikToks, 1 Instagram Reel" aria-label="New deliverable" className={cn(fieldClass, "min-w-[180px] flex-1")} />
          <input type="date" value={item.due} onChange={(e) => setItem((x) => ({ ...x, due: e.target.value }))} aria-label="Due" className={cn(fieldClass, "w-auto")} />
          <Button type="submit">Add</Button>
        </form>
      </section>

      <section>
        <h3 className="mb-2 font-bold">History</h3>
        {history ? <Timeline entries={history} /> : <p className="text-sm text-slate">Loading…</p>}
      </section>
    </div>
  );
}

/* ── One talent ──────────────────────────────────────────────────────── */

const TABS = [
  ["tracker", "Brand tracker"],
  ["profile", "Profile and audience"],
  ["rates", "Rate card"],
  ["terms", "Terms and admin"],
] as const;

export function TalentProfile(p: Common & { t: Talent; bank?: TalentBank | null }) {
  const { t, w, money } = p;
  const toast = useToast();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("tracker");
  const [newDeal, setNewDeal] = useState<Partial<Deal> | null>(null);
  const [openDeal, setOpenDeal] = useState<string | null>(null);
  const deals = p.deals.filter((d) => d.talentId === t.id);
  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const won = deals.filter((d) => WON_STAGES.includes(d.stage));
  const ngn = (x: Deal, k: "fee" | "received" | "proposed") => (x.currency === "NGN" ? (x[k] ?? 0) : 0);
  const fname = first(t.name);
  const copyRates = async () => {
    try {
      await navigator.clipboard.writeText(rateText(t.name, t.rates, t.rateNotes, (n, c) => cash(n, c)));
      toast("Rate card copied.");
    } catch {
      toast("Couldn't copy.");
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/talent" className={cn(btn.base, btn.plain, btn.sm)} aria-label="All talent">
          <ArrowLeft className="size-4" aria-hidden /> All talent
        </Link>
        <span className="flex-1" />
        {t.mediaKit && (
          <a href={t.mediaKit} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.plain)}>
            <ExternalLink className="size-4" aria-hidden /> Media kit
          </a>
        )}
        {t.rates.length > 0 && (
          <Button onClick={copyRates}>
            <Copy className="size-4" aria-hidden /> Copy rate card
          </Button>
        )}
        <button type="button" onClick={() => setNewDeal({ talentId: t.id, stage: "prospect" })} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Add a brand
        </button>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Brands in play", open.length, `${deals.length} in the tracker`],
          ["Followers", totalFollowers(t.socials) ? compact(totalFollowers(t.socials)) : "-", `${t.socials.length} account${t.socials.length === 1 ? "" : "s"}`],
          ...(money
            ? [
                ["Secured", compactNaira(won.reduce((s, d) => s + ngn(d, "fee"), 0)), `${won.length} deal${won.length === 1 ? "" : "s"} won`],
                ["Received", compactNaira(deals.reduce((s, d) => s + ngn(d, "received"), 0)), `${compactNaira(open.reduce((s, d) => s + (d.currency === "NGN" ? (d.proposed ?? d.fee ?? 0) : 0), 0))} on the table`],
              ]
            : [["Deals won", won.length, "contracted to completed"]]),
        ].map(([l, v, s]) => (
          <div key={String(l)} className="grid gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
            <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{l}</span>
            <b className="font-display text-3xl tabular-nums">{v}</b>
            <span className="text-sm text-slate">{s}</span>
          </div>
        ))}
      </div>
      <Panel className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">What {fname} wants from management</h2>
          <Button size="sm" onClick={() => setTab("profile")}>
            Edit goals
          </Button>
        </div>
        {t.goals.length ? (
          <ol className="grid list-decimal gap-1 pl-5 text-sm">
            {t.goals.map((g, i) => (
              <li key={i}>
                {g.t} {g.done && <Pill tone="ok">Achieved</Pill>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate">No goals yet. Add 3 to 5 so everyone remembers what this management is for.</p>
        )}
        {t.goals.length > 0 && t.goals.length < 3 && <p className="mt-1 text-xs text-slate">Add {3 - t.goals.length} more so the team has 3 to 5 goals to work toward.</p>}
      </Panel>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-full border-2 border-ink px-3.5 py-1 text-sm font-semibold", tab === k ? "bg-ink text-white" : "bg-white")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "tracker" && <Tracker {...p} deals={deals} onOpen={setOpenDeal} onAdd={setNewDeal} />}
      {tab === "profile" && <ProfileTab t={t} />}
      {tab === "rates" && <RatesTab t={t} onCopy={copyRates} />}
      {tab === "terms" && <TermsTab t={t} w={w} money={money} fin={!!p.fin} bank={p.bank ?? null} />}
      <DealDialogs {...p} newDeal={newDeal} setNewDeal={setNewDeal} openDeal={openDeal} setOpenDeal={setOpenDeal} />
    </>
  );
}

function Tracker({ t, deals, contacts, w, money, onOpen, onAdd }: Common & { t: Talent; onOpen: (id: string) => void; onAdd: (d: Partial<Deal>) => void }) {
  const [filter, setFilter] = useState("open");
  const filters: [string, string, (d: Deal) => boolean][] = [
    ["open", "In play", (d) => OPEN_STAGES.includes(d.stage)],
    ["completed", "Completed", (d) => d.stage === "completed"],
    ["lost", "Lost", (d) => d.stage === "lost"],
    ["all", "All", () => true],
  ];
  const rows = deals
    .filter(filters.find(([k]) => k === filter)![2])
    .sort((a, b) => DEAL_STAGES.findIndex(([k]) => k === b.stage) - DEAL_STAGES.findIndex(([k]) => k === a.stage) || (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
  const tagged = contacts.filter((c) => c.talentIds.includes(t.id) && !deals.some((d) => d.contactId === c.id));
  const sum = (k: "proposed" | "fee" | "received") => rows.reduce((s, d) => s + (d.currency === "NGN" ? (d[k] ?? 0) : 0), 0);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {filters.map(([k, l, f]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", filter === k ? "bg-ink text-white" : "bg-white")}>
            {l} <span className="opacity-60">{deals.filter(f).length}</span>
          </button>
        ))}
        <span className="ml-2 text-xs text-slate">Click a brand to post a status update, set deliverables or change the stage.</span>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Brand", "In contact with", "Stage", "How it's going", "Latest status", ...(money ? ["Proposed", "Agreed", "Received"] : []), "Deliverables", "Next step"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const last = d.updates[d.updates.length - 1];
                const done = d.deliverables.filter((x) => x.done).length;
                const contact = contacts.find((c) => c.id === d.contactId);
                return (
                  <tr key={d.id} onClick={() => onOpen(d.id)} className="cursor-pointer border-b border-ink/10 align-top hover:bg-paper/50">
                    <td className="px-3 py-2">
                      <b>{d.brand}</b>
                      {d.title && <span className="block text-xs text-slate">{d.title}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {d.contactPerson || contact?.name || <span className="text-slate">No contact yet</span>}
                      <span className="block text-xs text-slate">{[d.contactRole, d.contactChannel ? label(CHANNELS, d.contactChannel) : ""].filter(Boolean).join(", ")}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone={stageTone(d.stage)}>{label(DEAL_STAGES, d.stage)}</Pill>
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone={healthTone(d.health)}>{label(HEALTH, d.health)}</Pill>
                    </td>
                    <td className="max-w-[240px] px-3 py-2">
                      {last ? (
                        <>
                          {last.text}
                          <span className="block text-xs text-slate">
                            {last.at.slice(0, 10)}, {first(w.people.find((x) => x.id === last.by)?.name ?? "")}
                          </span>
                        </>
                      ) : (
                        d.notes || <span className="text-slate">No update yet</span>
                      )}
                    </td>
                    {money &&
                      (["proposed", "fee", "received"] as const).map((k) => (
                        <td key={k} className="px-3 py-2 tabular-nums">
                          {cash(d[k], d.currency)}
                        </td>
                      ))}
                    <td className="px-3 py-2">
                      {d.deliverables.length ? (done === d.deliverables.length ? "All delivered" : `${done}/${d.deliverables.length} done`) : <span className="text-slate">None set</span>}
                    </td>
                    <td className="px-3 py-2">
                      {d.nextStep || "-"}
                      {(d.nextDate || d.dueDate) && (
                        <span className="block">
                          <DueChip due={d.nextDate || d.dueDate} today={w.today} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {money && rows.length > 1 && (
                <tr className="bg-paper/60 font-semibold">
                  <td className="px-3 py-2" colSpan={5}>
                    Total (in naira)
                  </td>
                  <td className="px-3 py-2">{compactNaira(sum("proposed"))}</td>
                  <td className="px-3 py-2">{compactNaira(sum("fee"))}</td>
                  <td className="px-3 py-2">{compactNaira(sum("received"))}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote title={filter === "open" ? `No brands in play for ${first(t.name)} yet.` : "Nothing here."}>
          Add brands you want to approach for them, then log every conversation as a status update.
        </EmptyNote>
      )}
      {tagged.length > 0 && (
        <Panel className="mt-4">
          <h3 className="mb-2 font-bold">Tagged for {first(t.name)} in CRM, not in the tracker yet</h3>
          {tagged.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border-t border-ink/10 py-2 first:border-t-0">
              <span className="flex-1">{c.company || c.name}</span>
              <Button size="sm" onClick={() => onAdd({ talentId: t.id, contactId: c.id, stage: "prospect" })}>
                Track
              </Button>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

function ProfileTab({ t }: { t: Talent }) {
  const { run, pending } = useRun();
  const [goal, setGoal] = useState("");
  const [social, setSocial] = useState<Record<string, string> | null>(null);
  const [about, setAbout] = useState({ category: t.category, location: t.location, email: t.email, phone: t.phone, mediaKit: t.mediaKit, bio: t.bio });
  const [aud, setAud] = useState({
    female: String(t.audience?.female ?? ""),
    male: String(t.audience?.male ?? ""),
    locations: t.audience?.locations ?? "",
    notes: t.audience?.notes ?? "",
    source: t.audience?.source ?? "",
    ...Object.fromEntries(AGE_BANDS.map(([k]) => [k, String(t.audience?.ages?.[k] ?? "")])),
  } as Record<string, string>);
  const [listInput, setListInput] = useState<Record<string, string>>({});
  const save = (patch: Record<string, unknown>) => run(() => saveTalent(t.id, patch));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <h3 className="mb-1 flex items-center gap-2 font-bold">
          Goals <Pill>{t.goals.length}/5</Pill>
        </h3>
        <p className="mb-2 text-sm text-slate">What they want to get out of management. Keep 3 to 5.</p>
        {t.goals.length ? (
          <ul className="grid gap-1.5">
            {t.goals.map((g, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={g.done} aria-label={g.t} onChange={(e) => save({ goals: t.goals.map((x, j) => (j === i ? { ...x, done: e.target.checked, doneAt: null } : x)) })} className="size-4 accent-pink" />
                <span className={cn("flex-1", g.done && "text-slate line-through")}>{g.t}</span>
                <button type="button" aria-label={`Remove ${g.t}`} onClick={() => save({ goals: t.goals.filter((_, j) => j !== i) })} className="text-slate hover:text-pink">
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate">No goals yet.</p>
        )}
        {t.goals.length < 5 ? (
          <form className="mt-2 flex gap-2" onSubmit={(e) => (e.preventDefault(), goal.trim() && save({ goals: [...t.goals, { t: goal.trim(), done: false }] }).then((ok) => ok && setGoal("")))}>
            <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Land a pan-African brand ambassadorship" aria-label="New goal" className={fieldClass} />
            <Button type="submit">Add</Button>
          </form>
        ) : (
          <p className="mt-2 text-xs text-slate">Five goals is the limit. Remove one to add another.</p>
        )}
      </Panel>

      <Panel>
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 font-bold">Social accounts</h3>
          <Button size="sm" onClick={() => setSocial({ platform: "Instagram", handle: "", followers: "", er: "", avgViews: "", url: "" })}>
            <Plus className="size-3.5" aria-hidden /> Account
          </Button>
        </div>
        {t.socials.length ? (
          <ul className="grid gap-2">
            {t.socials.map((s) => {
              const ch = followerChange(s.hist);
              return (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="grid size-8 place-items-center rounded-full bg-paper text-xs font-bold">{s.platform.slice(0, 2)}</span>
                  <span className="min-w-0 flex-1">
                    <b>{s.platform}</b> {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-pink underline">{s.handle}</a> : s.handle}
                    <span className="block text-xs text-slate">
                      {[s.er ? `${s.er}% engagement` : "", s.avgViews ? `${compact(s.avgViews)} avg views` : "", s.at ? `updated ${s.at}` : ""].filter(Boolean).join(", ")}
                    </span>
                    {ch && <span className="block text-xs text-[#1e7a4c]">{ch.diff > 0 ? "+" : ""}{ch.diff.toLocaleString("en-GB")} since {ch.since}</span>}
                  </span>
                  <b className="tabular-nums">{s.followers === null ? "-" : compact(s.followers)}</b>
                  <button
                    type="button"
                    aria-label={`Update ${s.platform}`}
                    onClick={() => setSocial({ id: s.id, platform: s.platform, handle: s.handle, followers: String(s.followers ?? ""), er: String(s.er ?? ""), avgViews: String(s.avgViews ?? ""), url: s.url ?? "" })}
                    className="grid size-8 place-items-center rounded-full hover:bg-paper"
                  >
                    <Settings2 className="size-4" aria-hidden />
                  </button>
                </li>
              );
            })}
            <li className="text-sm font-semibold">Total reach {compact(totalFollowers(t.socials))} followers</li>
          </ul>
        ) : (
          <p className="text-sm text-slate">Add each platform with its follower count. Update the count each month to track growth.</p>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-2 font-bold">About</h3>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save(about))}>
          {(
            [
              ["category", "What they do", "e.g. Actor and on-screen talent"],
              ["location", "Based in", "e.g. Lagos"],
              ["email", "Email", ""],
              ["phone", "Phone or WhatsApp", ""],
              ["mediaKit", "Media kit link", "https://"],
            ] as const
          ).map(([k, l, ph]) => (
            <Field key={k} label={l}>
              <input value={about[k]} placeholder={ph} onChange={(e) => setAbout((x) => ({ ...x, [k]: e.target.value }))} className={fieldClass} />
            </Field>
          ))}
          <Field label="Short bio for pitches" full>
            <textarea rows={3} value={about.bio} onChange={(e) => setAbout((x) => ({ ...x, bio: e.target.value }))} className={fieldClass} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
            Save
          </button>
        </form>
      </Panel>

      <Panel>
        <h3 className="mb-1 font-bold">Audience</h3>
        <p className="mb-2 text-sm text-slate">From their platform insights. Percentages of followers.</p>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save({ audience: { female: aud.female, male: aud.male, locations: aud.locations, notes: aud.notes, source: aud.source, ages: Object.fromEntries(AGE_BANDS.map(([k]) => [k, aud[k]])) } });
          }}
        >
          <Field label="Women %">
            <input type="number" min={0} max={100} value={aud.female} onChange={(e) => setAud((x) => ({ ...x, female: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="Men %">
            <input type="number" min={0} max={100} value={aud.male} onChange={(e) => setAud((x) => ({ ...x, male: e.target.value }))} className={fieldClass} />
          </Field>
          {AGE_BANDS.map(([k, l]) => (
            <div key={k} className="grid gap-1 sm:col-span-2 sm:grid-cols-[110px_80px_1fr] sm:items-center">
              <label htmlFor={`age-${k}`} className="text-sm">
                {l}
              </label>
              <input id={`age-${k}`} type="number" min={0} max={100} value={aud[k]} onChange={(e) => setAud((x) => ({ ...x, [k]: e.target.value }))} className={fieldClass} />
              <Bar pct={Number(aud[k]) || 0} tone="ink" label={`${l} share`} />
            </div>
          ))}
          <Field label="Top cities and countries" full>
            <input value={aud.locations} placeholder="e.g. Lagos 41%, Abuja 12%, London 6%" onChange={(e) => setAud((x) => ({ ...x, locations: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="What else brands should know" full>
            <input value={aud.notes} onChange={(e) => setAud((x) => ({ ...x, notes: e.target.value }))} className={fieldClass} />
          </Field>
          <Field label="Source and date" full>
            <input value={aud.source} placeholder="e.g. Instagram insights, November 2026" onChange={(e) => setAud((x) => ({ ...x, source: e.target.value }))} className={fieldClass} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
            Save audience
          </button>
        </form>
      </Panel>

      <Panel className="lg:col-span-2">
        <h3 className="mb-2 font-bold">Interests and industries</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {TL_LISTS.map(([k, l, ph]) => (
            <div key={k}>
              <b className="text-sm">{l}</b>
              <div className="my-1.5 flex flex-wrap gap-1">
                {t[k].map((x) => (
                  <span key={x} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", k === "avoid" ? "bg-[#fbe3e5] text-[#c42b3c]" : "bg-paper")}>
                    {x}
                    <button type="button" aria-label={`Remove ${x}`} onClick={() => save({ [k]: t[k].filter((y) => y !== x) })}>
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), (listInput[k] ?? "").trim() && save({ [k]: addToList(t[k], listInput[k]) }).then((ok) => ok && setListInput((x) => ({ ...x, [k]: "" }))))}>
                <input value={listInput[k] ?? ""} onChange={(e) => setListInput((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} aria-label={`Add to ${l}`} className={fieldClass} />
                <Button type="submit">Add</Button>
              </form>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate">Separate several with commas. Off limits flags brands that would clash with an exclusivity or that the talent won&apos;t work with.</p>
      </Panel>

      <Dialog open={social !== null} onClose={() => setSocial(null)} title={social?.id ? `Update ${social.platform}` : "Add a social account"}>
        {social && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save({ social }).then((ok) => ok && setSocial(null)))}>
            <Field label="Platform">
              <select value={social.platform} onChange={(e) => setSocial((x) => ({ ...x!, platform: e.target.value }))} className={fieldClass}>
                {SOCIAL_PLATFORMS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Handle">
              <input value={social.handle} placeholder="@handle" onChange={(e) => setSocial((x) => ({ ...x!, handle: e.target.value }))} className={fieldClass} />
            </Field>
            <Field label="Followers">
              <input required type="number" min={0} value={social.followers} onChange={(e) => setSocial((x) => ({ ...x!, followers: e.target.value }))} className={fieldClass} />
            </Field>
            <Field label="Engagement rate %">
              <input type="number" min={0} max={100} step="any" value={social.er} onChange={(e) => setSocial((x) => ({ ...x!, er: e.target.value }))} className={fieldClass} />
            </Field>
            <Field label="Average views per post">
              <input type="number" min={0} value={social.avgViews} onChange={(e) => setSocial((x) => ({ ...x!, avgViews: e.target.value }))} className={fieldClass} />
            </Field>
            <Field label="Profile link">
              <input type="url" value={social.url} onChange={(e) => setSocial((x) => ({ ...x!, url: e.target.value }))} className={fieldClass} />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
                {social.id ? "Save" : "Add account"}
              </button>
              <span className="flex-1" />
              {social.id && (
                <Button tone="ghost" className="text-pink" onClick={() => save({ removeSocial: social.id }).then((ok) => ok && setSocial(null))}>
                  Remove account
                </Button>
              )}
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

function RatesTab({ t, onCopy }: { t: Talent; onCopy: () => void }) {
  const { run, pending } = useRun();
  const [rate, setRate] = useState<Record<string, string> | null>(null);
  const [notes, setNotes] = useState(t.rateNotes);
  const platforms = [...new Set(t.rates.map((r) => r.platform))];
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-bold">Rate card</h3>
        {t.rateAt && <span className="text-xs text-slate">Updated {t.rateAt.slice(0, 10)}</span>}
        <span className="flex-1" />
        {t.rates.length > 0 && <Button onClick={onCopy}>Copy as text</Button>}
        <Button tone="primary" onClick={() => setRate({ item: "", platform: "Instagram", price: "", currency: "NGN", notes: "" })}>
          <Plus className="size-4" aria-hidden /> Rate
        </Button>
      </div>
      {t.rates.length ? (
        platforms.map((pl) => (
          <section key={pl} className="mb-3">
            <h4 className="text-sm font-bold text-slate">{pl}</h4>
            {t.rates
              .filter((r) => r.platform === pl)
              .map((r) => (
                <div key={r.id} className="flex items-center gap-2 border-t border-ink/10 py-2 text-sm first:border-t-0">
                  <span className="flex-1">
                    {r.item}
                    {r.notes && <span className="block text-xs text-slate">{r.notes}</span>}
                  </span>
                  <b className="tabular-nums">{cash(r.price, r.currency)}</b>
                  <Button size="sm" tone="ghost" onClick={() => setRate({ id: r.id, item: r.item, platform: r.platform, price: String(r.price), currency: r.currency, notes: r.notes ?? "" })}>
                    Edit
                  </Button>
                  <button type="button" aria-label={`Remove ${r.item}`} onClick={() => run(() => saveTalent(t.id, { removeRate: r.id }))} className="text-slate hover:text-pink">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
          </section>
        ))
      ) : (
        <EmptyNote title="No rates yet.">Add a line for each deliverable: an Instagram Reel, a TikTok, a story set, an event appearance, a brand ambassadorship per month.</EmptyNote>
      )}
      <form className="mt-3 grid gap-2" onSubmit={(e) => (e.preventDefault(), run(() => saveTalent(t.id, { rateNotes: notes })))}>
        <Field label="Terms that go with the rate card">
          <textarea rows={2} value={notes} placeholder="e.g. Prices exclude VAT. Usage rights 3 months. Exclusivity adds 30%. Valid until March 2027." onChange={(e) => setNotes(e.target.value)} className={fieldClass} />
        </Field>
        <Button type="submit" disabled={pending} className="justify-self-start">
          Save terms
        </Button>
      </form>
      <Dialog open={rate !== null} onClose={() => setRate(null)} title={rate?.id ? "Edit rate" : "Add a rate"}>
        {rate && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveTalent(t.id, { rate })).then((ok) => ok && setRate(null)))}>
            <Field label="Deliverable" full>
              <input required value={rate.item} placeholder="e.g. 1 Instagram Reel with 3 stories" onChange={(e) => setRate((x) => ({ ...x!, item: e.target.value }))} className={fieldClass} />
            </Field>
            <Field label="Platform">
              <select value={rate.platform} onChange={(e) => setRate((x) => ({ ...x!, platform: e.target.value }))} className={fieldClass}>
                {RATE_PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="Price">
              <input required type="number" min={0} value={rate.price} onChange={(e) => setRate((x) => ({ ...x!, price: e.target.value }))} className={fieldClass} />
            </Field>
            <Field label="Currency">
              <select value={rate.currency} onChange={(e) => setRate((x) => ({ ...x!, currency: e.target.value }))} className={fieldClass}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <input value={rate.notes} placeholder="e.g. Includes 30 days usage" onChange={(e) => setRate((x) => ({ ...x!, notes: e.target.value }))} className={fieldClass} />
            </Field>
            <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
              {rate.id ? "Save" : "Add rate"}
            </button>
          </form>
        )}
      </Dialog>
    </Panel>
  );
}

function TermsTab({ t, w, money, fin, bank }: { t: Talent; w: WorkProps; money: boolean; fin: boolean; bank: TalentBank | null }) {
  const { run, pending } = useRun();
  const router = useRouter();
  const [d, setD] = useState({
    name: t.name,
    status: t.status,
    package: t.package,
    commission: t.commission === null ? "" : String(t.commission),
    payFlow: t.payFlow || "via_dss",
    managerId: t.managerId ? String(t.managerId) : "",
    coManager: t.coManager,
    startDate: t.startDate,
    trialEnds: t.trialEnds,
    terms: t.terms,
    priorities: t.priorities,
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <Panel>
      <h3 className="mb-3 font-bold">Management terms</h3>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveTalent(t.id, d)))}>
        <Field label="Name">
          <input required className={fieldClass} {...bind("name")} />
        </Field>
        <Field label="Status">
          <select className={fieldClass} {...bind("status")}>
            {TALENT_STATUS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Package">
          <select className={fieldClass} {...bind("package")}>
            {PACKAGES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {money && (
          <Field label="Commission %">
            <input type="number" min={0} max={100} className={fieldClass} {...bind("commission")} />
          </Field>
        )}
        <Field label="How brands pay">
          <select className={fieldClass} {...bind("payFlow")}>
            <option value="via_dss">Brands pay DSS</option>
            <option value="direct">Brands pay talent directly</option>
          </select>
        </Field>
        <Field label="Lead manager">
          <select className={fieldClass} {...bind("managerId")}>
            <option value="">Unassigned</option>
            {w.people.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Co-manager">
          <input className={fieldClass} {...bind("coManager")} />
        </Field>
        <Field label="Signed on">
          <input type="date" className={fieldClass} {...bind("startDate")} />
        </Field>
        <Field label="Trial or contract review">
          <input type="date" className={fieldClass} {...bind("trialEnds")} />
        </Field>
        {money && (
          <Field label="Commercial terms" full>
            <textarea rows={3} className={fieldClass} {...bind("terms")} />
          </Field>
        )}
        <Field label="Other notes on what they want" full>
          <textarea rows={3} className={fieldClass} {...bind("priorities")} />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
            Save
          </button>
          <span className="flex-1" />
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm(`Remove ${t.name} from the roster? Their deals stay.`) && run(() => removeTalent(t.id)).then((ok) => ok && router.push("/admin/talent"))}>
            Remove from roster
          </Button>
        </div>
      </form>
      {fin && <PayoutAccount talentId={t.id} bank={bank} />}
    </Panel>
  );
}

/** Where the talent's share of a brand payment goes. Invoices access only. */
function PayoutAccount({ talentId, bank }: { talentId: string; bank: TalentBank | null }) {
  const { run, pending } = useRun();
  const [b, setB] = useState({ bank: bank?.bank ?? "", name: bank?.name ?? "", number: bank?.number ?? "" });
  const bind = (k: keyof typeof b) => ({ value: b[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setB((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="mt-6 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-3" onSubmit={(e) => (e.preventDefault(), run(() => saveTalentBankAction(talentId, b)))}>
      <h3 className="font-bold sm:col-span-3">Payout account (finance only)</h3>
      <Field label="Bank">
        <input className={fieldClass} {...bind("bank")} />
      </Field>
      <Field label="Account name">
        <input className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="Account number">
        <input inputMode="numeric" className={fieldClass} {...bind("number")} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.sm, "justify-self-start")}>
        Save payout account
      </button>
    </form>
  );
}
