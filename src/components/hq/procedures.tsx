"use client";

import { useState } from "react";
import { ExternalLink, ListChecks, Plus, Search, Trash2 } from "lucide-react";
import { procedureToTask, removeProcedure, saveProcedure } from "@/app/admin/(hq)/procedures/actions";
import { Button, Field, btn, fieldClass } from "@/components/desk/ui";
import type { Sop } from "@/lib/hq/data";
import { SOP_AREAS } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Dialog, EmptyNote, Pill, type Tone, useRun } from "./kit";

type Props = {
  sops: Sop[];
  canEdit: boolean;
  me: number;
  people: { id: number; name: string }[];
  inProgress: { id: string; title: string; sopId: string }[];
};

const areaTone = (a: string): Tone => (["Clients", "Sales"].includes(a) ? "rose" : a === "Talent" ? "sunset" : a === "Finance" ? "lime" : "sky");
const updated = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

export function ProceduresView({ sops, canEdit, me, people, inProgress }: Props) {
  const { run, pending } = useRun();
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [viewing, setViewing] = useState<Sop | null>(null);
  const [editing, setEditing] = useState<Partial<Sop> | null>(null);
  const nameOf = (id: number | null) => people.find((p) => p.id === id)?.name ?? "";
  const s = q.trim().toLowerCase();
  const list = sops.filter((x) => (!area || x.area === area) && (!s || `${x.title} ${x.purpose} ${x.steps.map((y) => y.t).join(" ")}`.toLowerCase().includes(s)));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-full border-2 border-ink bg-white px-3">
          <Search className="size-4 text-slate" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search procedures" aria-label="Search procedures" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none" />
        </label>
        <div role="group" aria-label="Area" className="flex flex-wrap gap-1.5">
          {["", ...SOP_AREAS].map((a) => (
            <button key={a || "all"} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", area === a ? "bg-ink text-white" : "bg-white")}>
              {a || "All"}
            </button>
          ))}
        </div>
        {canEdit && (
          <button type="button" onClick={() => setEditing({ ownerId: me, area: "Clients" })} className={cn(btn.base, btn.primary)}>
            <Plus className="size-4" aria-hidden /> Procedure
          </button>
        )}
      </div>

      {list.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((x) => (
            <button key={x.id} type="button" onClick={() => setViewing(x)} className="grid content-start gap-2 rounded-[20px] border-2 border-ink bg-white p-4 text-left transition-transform hover:-translate-y-0.5">
              <span className="flex items-center gap-2">
                <Pill tone={areaTone(x.area)}>{x.area || "General"}</Pill>
                <span className="flex-1" />
                <span className="text-xs text-slate">{x.steps.length} steps</span>
              </span>
              <h2 className="text-lg font-bold tracking-[-0.02em]">{x.title}</h2>
              <p className="text-sm text-slate">{x.purpose}</p>
              <span className="text-xs text-slate">
                {x.ownerId ? `Owned by ${nameOf(x.ownerId).split(" ")[0]}. ` : ""}
                {x.updatedAt && `Updated ${updated(x.updatedAt)}`}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyNote title={s || area ? "Nothing matches." : "No procedures yet."}>Write down how the jobs you repeat get done, so anyone on the team can pick them up.</EmptyNote>
      )}

      <Dialog open={viewing !== null} onClose={() => setViewing(null)} title={viewing?.title ?? "Procedure"} wide>
        {viewing && (
          <div className="grid gap-4">
            <Pill tone={areaTone(viewing.area)} className="justify-self-start">
              {viewing.area || "General"}
            </Pill>
            {viewing.purpose && <p>{viewing.purpose}</p>}
            <ol className="grid list-decimal gap-2.5 pl-6 marker:font-bold marker:text-pink">
              {viewing.steps.map((st, i) => (
                <li key={i}>
                  <b className="font-semibold">{st.t}</b>
                  {st.note && <span className="block text-sm text-slate">{st.note}</span>}
                </li>
              ))}
            </ol>
            {viewing.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {viewing.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.plain, btn.sm)}>
                    <ExternalLink className="size-3.5" aria-hidden /> {l.label || "Open"}
                  </a>
                ))}
              </div>
            )}
            {inProgress.some((t) => t.sopId === viewing.id) && (
              <p className="text-sm text-slate">
                In progress now: {inProgress.filter((t) => t.sopId === viewing.id).map((t) => t.title).join(", ")}
              </p>
            )}
            <p className="text-xs text-slate">
              {viewing.ownerId ? `Owned by ${nameOf(viewing.ownerId)}. ` : ""}
              {viewing.updatedAt && `Last updated ${updated(viewing.updatedAt)}`}
              {viewing.updatedBy ? ` by ${nameOf(viewing.updatedBy).split(" ")[0]}` : ""}.
            </p>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  onClick={() => {
                    setEditing(viewing);
                    setViewing(null);
                  }}
                >
                  Edit
                </Button>
              )}
              <span className="flex-1" />
              <button type="button" disabled={pending} onClick={() => run(() => procedureToTask(viewing.id)).then((ok) => ok && setViewing(null))} className={cn(btn.base, btn.primary)}>
                <ListChecks className="size-4" aria-hidden /> Make it a task
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit procedure" : "New procedure"} wide>
        {editing && <SopForm key={editing.id ?? "new"} sop={editing} people={people} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function SopForm({ sop, people, onDone }: { sop: Partial<Sop>; people: { id: number; name: string }[]; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    title: sop.title ?? "",
    area: sop.area ?? "Clients",
    ownerId: sop.ownerId ? String(sop.ownerId) : "",
    purpose: sop.purpose ?? "",
    steps: (sop.steps ?? []).map((x) => x.t + (x.note ? `: ${x.note}` : "")).join("\n"),
    links: (sop.links ?? []).map((l) => `${l.label} | ${l.url}`).join("\n"),
  });
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveProcedure(sop.id ?? null, d)).then((ok) => ok && onDone());
      }}
    >
      <Field label="Name" full>
        <input required autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Monthly invoice run" className={fieldClass} />
      </Field>
      <Field label="Area">
        <select value={d.area} onChange={(e) => set("area", e.target.value)} className={fieldClass}>
          {SOP_AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Field>
      <Field label="Owner (keeps it current)">
        <select value={d.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={fieldClass}>
          <option value="">No owner</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="When to use it" full>
        <input value={d.purpose} onChange={(e) => set("purpose", e.target.value)} placeholder="One line on what it's for" className={fieldClass} />
      </Field>
      <Field label="Steps, one per line. Add detail after a colon." full>
        <textarea required rows={8} value={d.steps} onChange={(e) => set("steps", e.target.value)} placeholder="Send the welcome packet: use the template in Drive" className={fieldClass} />
      </Field>
      <Field label="Links, one per line as Label | URL" full>
        <textarea rows={3} value={d.links} onChange={(e) => set("links", e.target.value)} placeholder="Invoice template | https://..." className={fieldClass} />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          Save procedure
        </button>
        <span className="flex-1" />
        {sop.id && (
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm(`Delete "${sop.title}"?`) && run(() => removeProcedure(sop.id!)).then((ok) => ok && onDone())}>
            <Trash2 className="size-4" aria-hidden /> Delete
          </Button>
        )}
      </div>
    </form>
  );
}
