"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, MessageCircle, Plus, Search } from "lucide-react";
import { addContact, contactHistory, logTouch, moveContactKind, removeContact, saveContact } from "@/app/admin/(hq)/crm/actions";
import { Button, Field, btn, fieldClass, useToast } from "@/components/desk/ui";
import type { Contact, TimelineEntry } from "@/lib/hq/sales";
import { CURRENCIES, FOLLOW_UP_IN, REL_TYPES, SERVICES, SOURCES, TOUCH_TYPES, followUpDue, label, stagesFor } from "@/lib/hq/sales-model";
import { addDays, compactNaira, relDay } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { ClientForm, Timeline } from "./clients";
import { Avatar, Dialog, EmptyNote, Pill, useRun } from "./kit";
import type { WorkProps } from "./tasks";

type Props = { contacts: Contact[]; w: WorkProps; money: boolean; talents: { id: string; name: string }[] };

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function CrmView({ contacts, w, money, talents }: Props) {
  const { run } = useRun();
  const [kind, setKind] = useState<"sales" | "talent">("sales");
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [owner, setOwner] = useState("");
  const [stage, setStage] = useState("");
  const [due, setDue] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const stages = stagesFor(kind);
  const nameOf = (id: number | null) => w.people.find((p) => p.id === id)?.name ?? "";

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return contacts.filter(
      (c) =>
        c.kind === kind &&
        (!owner || (owner === "mine" ? c.ownerId === w.me.id : owner === "none" ? c.ownerId === null : c.ownerId === Number(owner))) &&
        (!stage || view === "pipeline" || c.stage === stage) &&
        (!due || followUpDue(c, w.today)) &&
        (!s || [c.name, c.company, c.email, c.phone, c.industry, c.source, c.location, ...c.tags].join(" ").toLowerCase().includes(s)),
    );
  }, [contacts, kind, owner, stage, view, due, q, w]);
  const dueCount = contacts.filter((c) => c.kind === kind && followUpDue(c, w.today)).length;
  const open = contacts.find((c) => c.id === openId) ?? null;

  const exportCsv = () => {
    const head = ["name", "company", "role", "email", "phone", "whatsapp", "instagram", "linkedin", "website", "location", "industry", "stage", "source", "owner", "next follow-up", "last touch", "notes"];
    const rows = list.map((c) => [c.name, c.company, c.role, c.email, c.phone, c.whatsapp, c.instagram, c.linkedin, c.website, c.location, c.industry, label(stages, c.stage), c.source, nameOf(c.ownerId), c.nextDate, c.lastTouch.slice(0, 10), c.notes]);
    const blob = new Blob([[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dss-${kind}-contacts-${w.today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const card = (c: Contact) => (
    <article key={c.id} draggable onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)} className="cursor-grab rounded-2xl border-2 border-ink/15 bg-white p-3 hover:border-ink">
      <button type="button" onClick={() => setOpenId(c.id)} className="grid w-full gap-1 text-left">
        <b className="truncate">{c.company || c.name}</b>
        {c.company && <span className="truncate text-xs text-slate">{[c.name, c.role].filter(Boolean).join(", ")}</span>}
        <span className="flex flex-wrap gap-1">
          {kind === "talent" ? (
            <>
              {c.relType && <Pill>{c.relType}</Pill>}
              {c.talentIds.map((t) => (
                <Pill key={t} tone="sky">
                  {talents.find((x) => x.id === t)?.name.split(" ")[0] ?? "Talent"}
                </Pill>
              ))}
            </>
          ) : (
            c.service && <Pill>{c.service}</Pill>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs">
          {c.ownerId && <Avatar name={nameOf(c.ownerId)} />}
          <span className={cn(c.nextDate && c.nextDate < w.today ? "font-semibold text-[#c42b3c]" : c.nextDate === w.today ? "text-pink" : "text-slate")}>{c.nextDate ? relDay(c.nextDate, w.today) : "No follow-up"}</span>
          <span className="flex-1" />
          {money && c.value ? compactNaira(c.value) : ""}
        </span>
      </button>
    </article>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="List" className="flex rounded-full border-2 border-ink bg-white p-0.5">
          {(
            [
              ["sales", "DSS sales"],
              ["talent", "Talent relationships"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => (setKind(k), setStage(""))}
              className={cn("rounded-full px-3.5 py-1 text-sm font-semibold", kind === k && "bg-ink text-white")}
            >
              {l} <span className="opacity-60">{contacts.filter((c) => c.kind === k).length}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Button onClick={exportCsv}>
          <Download className="size-4" aria-hidden /> Export
        </Button>
        <button type="button" onClick={() => setAdding(true)} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> {kind === "talent" ? "Add relationship" : "Add lead"}
        </button>
      </div>
      <p className="mb-3 text-sm text-slate">{kind === "talent" ? "Brands, agencies and media you work with for talent. Kept apart from DSS sales." : "Founders and businesses you're selling DSS services to."}</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="View" className="flex rounded-full border-2 border-ink bg-white p-0.5">
          {(["pipeline", "list"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("rounded-full px-3.5 py-1 text-sm font-semibold capitalize", view === v && "bg-ink text-white")}>
              {v === "pipeline" ? "Pipeline" : "List"}
            </button>
          ))}
        </div>
        <select aria-label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
          <option value="">Everyone&apos;s</option>
          <option value="mine">Mine</option>
          <option value="none">Unassigned</option>
          {w.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {view === "list" && (
          <select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
            <option value="">All stages</option>
            {stages.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        )}
        <button type="button" aria-pressed={due} onClick={() => setDue((v) => !v)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", due ? "bg-pink text-white" : "bg-white")}>
          Due now ({dueCount})
        </button>
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border-2 border-ink bg-white px-3">
          <Search className="size-4 text-slate" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, industry, tag" aria-label="Search contacts" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none" />
        </label>
      </div>

      {view === "pipeline" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map(([k, l]) => {
            const items = list.filter((c) => c.stage === k).sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
            const total = items.reduce((s, c) => s + (c.currency === "NGN" ? (c.value ?? 0) : 0), 0);
            return (
              <section
                key={k}
                aria-label={l}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) run(() => saveContact(dragId, { stage: k }));
                  setDragId(null);
                }}
                className="grid w-[240px] flex-none content-start gap-2 rounded-[20px] bg-paper/70 p-2.5"
              >
                <h2 className="flex items-center gap-2 px-1 text-sm font-bold">
                  {l} <Pill>{items.length}</Pill>
                  {money && total > 0 && <span className="ml-auto text-xs font-normal text-slate">{compactNaira(total)}</span>}
                </h2>
                {items.slice(0, 80).map(card)}
                {items.length > 80 && <p className="px-1 text-xs text-slate">{items.length - 80} more. Use the list view or search.</p>}
              </section>
            );
          })}
        </div>
      ) : list.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["Name", "Company", kind === "talent" ? "Type" : "Interest", "Stage", "Owner", "Next follow-up", "Last touch", "Source"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.slice(0, 400).map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-b border-ink/10 hover:bg-paper/50">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">{c.company}</td>
                  <td className="px-3 py-2">{kind === "talent" ? c.relType : c.service}</td>
                  <td className="px-3 py-2">
                    <Pill>{label(stages, c.stage)}</Pill>
                  </td>
                  <td className="px-3 py-2">{nameOf(c.ownerId) || "Unassigned"}</td>
                  <td className="px-3 py-2">{c.nextDate ? relDay(c.nextDate, w.today) : "None"}</td>
                  <td className="px-3 py-2">{c.lastTouch ? relDay(c.lastTouch.slice(0, 10), w.today) : "Never"}</td>
                  <td className="px-3 py-2">{c.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > 400 && <p className="p-3 text-sm text-slate">Showing the first 400. Narrow it with search or filters.</p>}
        </div>
      ) : (
        <EmptyNote title="No contacts match.">Add one, or clear your filters.</EmptyNote>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title={kind === "talent" ? "New brand or agency" : "New sales lead"} wide>
        {adding && <NewContact kind={kind} w={w} money={money} onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog open={open !== null} onClose={() => setOpenId(null)} title={open ? open.company || open.name : "Contact"} side>
        {open && <ContactPanel key={open.id} c={open} w={w} money={money} talents={talents} onClose={() => setOpenId(null)} />}
      </Dialog>
    </>
  );
}

function NewContact({ kind, w, money, onDone }: { kind: "sales" | "talent"; w: WorkProps; money: boolean; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    kind,
    company: "",
    name: "",
    role: "",
    industry: "",
    phone: "",
    email: "",
    relType: "Brand",
    stage: stagesFor(kind)[0][0],
    service: "",
    value: "",
    source: "Referral",
    ownerId: String(w.me.id),
    nextDate: addDays(w.today, 1),
    notes: "",
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => addContact(d)).then((ok) => ok && onDone()))}>
      <Field label="Company or brand">
        <input autoFocus className={fieldClass} {...bind("company")} />
      </Field>
      <Field label="Contact name">
        <input required className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="Their role">
        <input placeholder={kind === "talent" ? "e.g. Brand Manager" : "e.g. Founder"} className={fieldClass} {...bind("role")} />
      </Field>
      <Field label="Industry">
        <input className={fieldClass} {...bind("industry")} />
      </Field>
      <Field label="Phone or WhatsApp">
        <input inputMode="tel" className={fieldClass} {...bind("phone")} />
      </Field>
      <Field label="Email">
        <input type="email" className={fieldClass} {...bind("email")} />
      </Field>
      {kind === "talent" ? (
        <Field label="Type">
          <select className={fieldClass} {...bind("relType")}>
            {REL_TYPES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Interested in">
          <select className={fieldClass} {...bind("service")}>
            <option value="">Not sure yet</option>
            {SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Stage">
        <select className={fieldClass} {...bind("stage")}>
          {stagesFor(kind).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      {kind === "sales" && money && (
        <Field label="Est. monthly value (₦)">
          <input type="number" min={0} className={fieldClass} {...bind("value")} />
        </Field>
      )}
      <Field label="Source">
        <select className={fieldClass} {...bind("source")}>
          {SOURCES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Owner">
        <select className={fieldClass} {...bind("ownerId")}>
          {w.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="First follow-up">
        <input type="date" className={fieldClass} {...bind("nextDate")} />
      </Field>
      <Field label="Notes" full>
        <textarea rows={3} placeholder="Where you met, what they need, who introduced you" className={fieldClass} {...bind("notes")} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Add contact
      </button>
    </form>
  );
}

function ContactPanel({ c, w, money, talents, onClose }: { c: Contact; w: WorkProps; money: boolean; talents: { id: string; name: string }[]; onClose: () => void }) {
  const { run, pending } = useRun();
  const toast = useToast();
  const router = useRouter();
  const [history, setHistory] = useState<TimelineEntry[] | null>(null);
  const [touch, setTouch] = useState({ type: "call", note: "", nextIn: "3" });
  const [converting, setConverting] = useState(false);
  const stages = stagesFor(c.kind);
  const [d, setD] = useState({
    stage: c.stage,
    ownerId: c.ownerId ? String(c.ownerId) : "",
    nextDate: c.nextDate,
    nextAction: c.nextAction,
    service: c.service,
    relType: c.relType || "Brand",
    value: c.value === null ? "" : String(c.value),
    currency: c.currency || "NGN",
    name: c.name,
    company: c.company,
    role: c.role,
    industry: c.industry,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    instagram: c.instagram,
    linkedin: c.linkedin,
    website: c.website,
    location: c.location,
    source: c.source,
    tags: c.tags.join(", "),
    notes: c.notes,
  });
  const [tal, setTal] = useState<string[]>(c.talentIds);
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  const reload = () => contactHistory(c.id).then(setHistory);
  // the history loads when the panel opens and after each change
  useEffect(() => {
    contactHistory(c.id).then(setHistory);
  }, [c.id, c.stage, c.lastTouch]);
  const number = c.whatsapp || c.phone;
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      toast("Copied");
    } catch {
      toast("Couldn't copy. Select it and copy by hand.");
    }
  };

  if (converting)
    return (
      <ClientForm
        w={w}
        money={money}
        pre={{ name: c.company || c.name, contactName: c.name, email: c.email, service: c.service, fee: c.value === null ? "" : String(c.value), currency: c.currency, leadId: c.ownerId ? String(c.ownerId) : "", fromContact: c.id }}
        onDone={(id) => (id ? router.push(`/admin/clients/${id}`) : setConverting(false))}
      />
    );

  return (
    <div className="grid gap-5">
      <p className="-mt-3 text-sm text-slate">{[c.name, c.role].filter(Boolean).join(", ")}</p>
      {(number || c.email || c.linkedin || c.instagram) && (
        <div className="flex flex-wrap gap-2">
          {number && (
            <Button size="sm" onClick={() => copy(number)}>
              <Copy className="size-3.5" aria-hidden /> {number}
            </Button>
          )}
          {c.whatsapp && (
            <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.plain, btn.sm)}>
              <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
            </a>
          )}
          {c.email && (
            <Button size="sm" onClick={() => copy(c.email)}>
              Copy email
            </Button>
          )}
          {c.linkedin && (
            <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.plain, btn.sm)}>
              LinkedIn
            </a>
          )}
        </div>
      )}

      <form
        className="grid gap-2 rounded-2xl bg-paper/70 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => logTouch(c.id, touch.type, touch.note, touch.nextIn)).then((ok) => {
            if (ok) {
              setTouch((t) => ({ ...t, note: "" }));
              reload();
            }
          });
        }}
      >
        <div role="radiogroup" aria-label="What happened" className="flex flex-wrap gap-1.5">
          {TOUCH_TYPES.map(([k, l]) => (
            <label key={k} className="cursor-pointer rounded-full border-2 border-ink px-3 py-0.5 text-sm font-semibold has-checked:bg-ink has-checked:text-white">
              <input type="radio" name="touch" value={k} checked={touch.type === k} onChange={() => setTouch((t) => ({ ...t, type: k }))} className="sr-only" />
              {l}
            </label>
          ))}
        </div>
        <textarea rows={2} value={touch.note} onChange={(e) => setTouch((t) => ({ ...t, note: e.target.value }))} placeholder="What happened, in a line or two?" aria-label="What happened, in a line or two" className={fieldClass} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold" htmlFor={`next-${c.id}`}>
            Next follow-up
          </label>
          <select id={`next-${c.id}`} value={touch.nextIn} onChange={(e) => setTouch((t) => ({ ...t, nextIn: e.target.value }))} className={cn(fieldClass, "w-auto")}>
            {FOLLOW_UP_IN.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
            Log it
          </button>
        </div>
      </form>

      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveContact(c.id, { ...d, talentIds: tal })).then((ok) => {
            if (ok) reload();
          });
        }}
      >
        <Field label="Stage">
          <select className={fieldClass} {...bind("stage")}>
            {stages.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner">
          <select className={fieldClass} {...bind("ownerId")}>
            <option value="">Unassigned</option>
            {w.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Next follow-up">
          <input type="date" className={fieldClass} {...bind("nextDate")} />
        </Field>
        <Field label="Next action">
          <input placeholder="e.g. Send proposal" className={fieldClass} {...bind("nextAction")} />
        </Field>
        {c.kind === "talent" ? (
          <Field label="Type">
            <select className={fieldClass} {...bind("relType")}>
              {REL_TYPES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Interested in">
            <select className={fieldClass} {...bind("service")}>
              <option value="">Not sure yet</option>
              {SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        )}
        {c.kind === "sales" && money && (
          <>
            <Field label="Est. monthly value">
              <input type="number" min={0} className={fieldClass} {...bind("value")} />
            </Field>
            <Field label="Currency">
              <select className={fieldClass} {...bind("currency")}>
                {CURRENCIES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        {(["name", "company", "role", "industry", "email", "phone", "whatsapp", "instagram", "linkedin", "website", "location", "source"] as const).map((k) => (
          <Field key={k} label={{ name: "Contact name", company: "Company", role: "Role", industry: "Industry", email: "Email", phone: "Phone", whatsapp: "WhatsApp", instagram: "Instagram", linkedin: "LinkedIn", website: "Website", location: "Location", source: "Source" }[k]}>
            <input className={fieldClass} {...bind(k)} />
          </Field>
        ))}
        <Field label="Tags (comma separated)" full>
          <input className={fieldClass} {...bind("tags")} />
        </Field>
        {c.kind === "talent" && talents.length > 0 && (
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Relevant for</legend>
            <div className="flex flex-wrap gap-1.5">
              {talents.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tal.includes(t.id)}
                  onClick={() => setTal((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))}
                  className={cn("rounded-full border-2 border-ink px-3 py-0.5 text-sm font-semibold", tal.includes(t.id) ? "bg-sky text-white" : "bg-white")}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Notes" full>
          <textarea rows={3} className={fieldClass} {...bind("notes")} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
            Save
          </button>
          {c.kind === "sales" && !c.clientId && <Button onClick={() => setConverting(true)}>Won: make them a client</Button>}
          {c.clientId && (
            <Button onClick={() => router.push(`/admin/clients/${c.clientId}`)}>Open client</Button>
          )}
          <Button disabled={pending} onClick={() => run(() => moveContactKind(c.id))}>
            {c.kind === "talent" ? "Move to DSS sales" : "Move to talent relationships"}
          </Button>
          <span className="flex-1" />
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm(`Delete ${c.name}? This can't be undone.`) && run(() => removeContact(c.id)).then((ok) => ok && onClose())}>
            Delete
          </Button>
        </div>
      </form>

      <section>
        <h3 className="mb-2 font-bold">History</h3>
        {history ? <Timeline entries={history} /> : <p className="text-sm text-slate">Loading…</p>}
        <p className="mt-3 text-xs text-slate">
          Added {c.createdAt.slice(0, 10)}
          {c.batch ? `, imported (${c.batch})` : ""}
          {c.applicationId ? `, from Visibility Session application ${c.applicationId}` : ""}
        </p>
      </section>
    </div>
  );
}
