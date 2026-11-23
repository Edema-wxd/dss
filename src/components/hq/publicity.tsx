"use client";

import { useState } from "react";
import { ExternalLink, Plus, Search } from "lucide-react";
import { removeMedia, removePitch, saveMediaAction, savePitchAction } from "@/app/savvy-hq/(hq)/marketing/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import { label } from "@/lib/hq/sales-model";
import type { Media, Pitch } from "@/lib/hq/talent";
import { COSTS, MEDIA_STATUS, MEDIA_TYPES, PITCH_OPEN, PITCH_STATUS, REGIONS, mediaTone, pitchTone } from "@/lib/hq/talent-model";
import { cn } from "@/lib/utils";
import { Dialog, DueChip, EmptyNote, Pill, useRun } from "./kit";
import type { WorkProps } from "./tasks";

type Props = { media: Media[]; pitches: Pitch[]; forOpts: [string, string][]; w: WorkProps };

export function PublicityView({ media, pitches, forOpts, w }: Props) {
  const [view, setView] = useState<"media" | "pitches">("media");
  const [type, setType] = useState("");
  const [industry, setIndustry] = useState("");
  const [q, setQ] = useState("");
  const [pst, setPst] = useState("open");
  const [pfor, setPfor] = useState("");
  const [editMedia, setEditMedia] = useState<Partial<Media> | null>(null);
  const [editPitch, setEditPitch] = useState<Partial<Pitch> | null>(null);
  const month = w.today.slice(0, 7);
  const forName = (k: string) => (forOpts.find(([v]) => v === k)?.[1] ?? "Not set").replace(/^(Client|Talent): /, "");
  const outlet = (id: string | null) => media.find((m) => m.id === id);
  const open = pitches.filter((p) => PITCH_OPEN.includes(p.status));
  const published = pitches.filter((p) => p.status === "published");
  const due = media.filter((m) => m.status !== "nofit" && m.nextDate && m.nextDate <= w.today).length + open.filter((p) => p.nextDate && p.nextDate <= w.today).length;
  const industries = [...new Set(media.flatMap((m) => m.industries))].sort();
  const s = q.trim().toLowerCase();
  const shownMedia = media
    .filter((m) => (!type || m.type === type) && (!industry || m.industries.includes(industry)) && (!s || [m.name, m.show, m.host, m.contactName, m.city, ...m.industries].join(" ").toLowerCase().includes(s)))
    .sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999") || a.name.localeCompare(b.name));
  const pstFilters: [string, string, (p: Pitch) => boolean][] = [
    ["open", "In play", (p) => PITCH_OPEN.includes(p.status)],
    ["published", "Published", (p) => p.status === "published"],
    ["declined", "Declined", (p) => p.status === "declined"],
    ["all", "All", () => true],
  ];
  const shownPitches = pitches.filter((p) => pstFilters.find(([k]) => k === pst)![2](p) && (!pfor || p.forKey === pfor));
  const newPitch = (outletId?: string) => (media.length ? setEditPitch({ forKey: "dss", outletId: outletId ?? "", status: "pitched", pitchedOn: w.today, ownerId: w.me.id }) : setEditMedia({ type: "radio", region: "Nigeria", status: "new", ownerId: w.me.id }));

  return (
    <>
      <p className="mb-4 text-sm text-slate">Press, radio, TV, podcasts and blogs for our clients, our talent, DSS and Jane. Keep every outlet here so the whole team pitches from one list.</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Media contacts", media.length, `${media.filter((m) => ["warm", "featured"].includes(m.status)).length} warm or have featured us`],
          ["Pitches in play", open.length, `${pitches.filter((p) => p.status === "booked").length} booked`],
          ["Placements this month", published.filter((p) => p.runDate.slice(0, 7) === month).length, `${published.length} all time`],
          ["Follow-ups due", due, due ? "Today or overdue" : "All caught up"],
        ].map(([l, v, sub]) => (
          <div key={String(l)} className="grid gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
            <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{l}</span>
            <b className="font-display text-3xl tabular-nums">{v}</b>
            <span className="text-sm text-slate">{sub}</span>
          </div>
        ))}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="View" className="flex rounded-full border-2 border-ink bg-white p-0.5">
          {(
            [
              ["media", "Media list"],
              ["pitches", "Pitches and placements"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={cn("rounded-full px-3.5 py-1 text-sm font-semibold", view === k && "bg-ink text-white")}>
              {l}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <Button onClick={() => setEditMedia({ type: "radio", region: "Nigeria", status: "new", ownerId: w.me.id })}>
          <Plus className="size-4" aria-hidden /> Media contact
        </Button>
        <button type="button" onClick={() => newPitch()} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Pitch
        </button>
      </div>

      {view === "media" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {[["", "All"], ...MEDIA_TYPES].map(([k, l]) => (
              <button key={k || "all"} type="button" aria-pressed={type === k} onClick={() => setType(k)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", type === k ? "bg-ink text-white" : "bg-white")}>
                {l} <span className="opacity-60">{k ? media.filter((m) => m.type === k).length : media.length}</span>
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border-2 border-ink bg-white px-3">
              <Search className="size-4 text-slate" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, host, contact" aria-label="Search media" className="min-w-0 flex-1 bg-transparent py-1.5 outline-none" />
            </label>
            <select aria-label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
              <option value="">All industries</option>
              {industries.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </div>
          {shownMedia.length ? (
            <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
              <table className="w-full min-w-[960px] text-sm">
                <thead>
                  <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                    {["Outlet", "Type", "Industries", "Where", "Contact", "Relationship", "Pitches", "Follow up", ""].map((h, i) => (
                      <th key={i} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownMedia.map((m) => (
                    <tr key={m.id} onClick={() => setEditMedia(m)} className="cursor-pointer border-b border-ink/10 align-top hover:bg-paper/50">
                      <td className="px-3 py-2">
                        <b>{m.name}</b>
                        {(m.show || m.host) && <span className="block text-xs text-slate">{[m.show, m.host && `with ${m.host}`].filter(Boolean).join(" ")}</span>}
                        {m.reach && <span className="block text-xs text-slate">{m.reach}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Pill>{label(MEDIA_TYPES, m.type)}</Pill>
                      </td>
                      <td className="px-3 py-2 text-xs">{m.industries.slice(0, 4).join(", ")}</td>
                      <td className="px-3 py-2 text-xs">{[m.city, label(REGIONS, m.region)].filter(Boolean).join(", ")}</td>
                      <td className="px-3 py-2 text-xs">{m.contactName ? [m.contactName, m.contactRole || m.email].filter(Boolean).join(", ") : <span className="text-slate">No contact yet</span>}</td>
                      <td className="px-3 py-2">
                        <Pill tone={mediaTone(m.status)}>{label(MEDIA_STATUS, m.status)}</Pill>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{pitches.filter((p) => p.outletId === m.id).length || "-"}</td>
                      <td className="px-3 py-2">
                        <DueChip due={m.nextDate} today={w.today} />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" onClick={() => newPitch(m.id)}>
                          Pitch
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote title={media.length ? "Nothing matches those filters." : "No media contacts yet."}>Add agencies, radio stations, TV shows, podcasts and blogs, with the industries they cover.</EmptyNote>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {pstFilters.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={pst === k} onClick={() => setPst(k)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", pst === k ? "bg-ink text-white" : "bg-white")}>
                {l}
              </button>
            ))}
            <select aria-label="For" value={pfor} onChange={(e) => setPfor(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
              <option value="">Everyone we pitch for</option>
              {forOpts.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {shownPitches.length ? (
            <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                    {["For", "Outlet", "Story or angle", "Status", "Pitched", "Runs", "Latest", "Follow up"].map((h) => (
                      <th key={h} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownPitches.map((p) => {
                    const o = outlet(p.outletId);
                    const last = p.updates[p.updates.length - 1];
                    return (
                      <tr key={p.id} onClick={() => setEditPitch(p)} className="cursor-pointer border-b border-ink/10 align-top hover:bg-paper/50">
                        <td className="px-3 py-2 font-semibold">{forName(p.forKey)}</td>
                        <td className="px-3 py-2">
                          {o?.name ?? "Outlet removed"}
                          {o && <span className="block text-xs text-slate">{label(MEDIA_TYPES, o.type)}</span>}
                        </td>
                        <td className="max-w-[240px] px-3 py-2">{p.angle}</td>
                        <td className="px-3 py-2">
                          <Pill tone={pitchTone(p.status)}>{label(PITCH_STATUS, p.status)}</Pill>
                        </td>
                        <td className="px-3 py-2">{p.pitchedOn || "-"}</td>
                        <td className="px-3 py-2">
                          {p.runDate || "-"}
                          {p.link && (
                            <a href={p.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Open the feature" className="ml-1 inline-block align-[-2px] text-pink">
                              <ExternalLink className="size-3.5" aria-hidden />
                            </a>
                          )}
                        </td>
                        <td className="max-w-[200px] px-3 py-2 text-xs">{last ? `${last.text} (${last.at.slice(0, 10)})` : ""}</td>
                        <td className="px-3 py-2">
                          <DueChip due={p.nextDate} today={w.today} done={!PITCH_OPEN.includes(p.status)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote title="No pitches here yet.">Log every pitch, booking and feature, so you can show clients and talent what PR delivered.</EmptyNote>
          )}
        </>
      )}

      <Dialog open={editMedia !== null} onClose={() => setEditMedia(null)} title={editMedia?.id ? `Edit ${editMedia.name}` : "Add a media contact"} wide>
        {editMedia && <MediaForm m={editMedia} w={w} onPitch={() => (setEditMedia(null), newPitch(editMedia.id))} onDone={() => setEditMedia(null)} />}
      </Dialog>
      <Dialog open={editPitch !== null} onClose={() => setEditPitch(null)} title={editPitch?.id ? "Update pitch" : "Log a pitch"} wide>
        {editPitch && <PitchForm p={editPitch} media={media} forOpts={forOpts} w={w} onDone={() => setEditPitch(null)} />}
      </Dialog>
    </>
  );
}

function MediaForm({ m, w, onPitch, onDone }: { m: Partial<Media>; w: WorkProps; onPitch: () => void; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    name: m.name ?? "",
    type: m.type ?? "radio",
    show: m.show ?? "",
    host: m.host ?? "",
    industries: (m.industries ?? []).join(", "),
    city: m.city ?? "",
    region: m.region ?? "Nigeria",
    reach: m.reach ?? "",
    cost: m.cost ?? "",
    contactName: m.contactName ?? "",
    contactRole: m.contactRole ?? "",
    email: m.email ?? "",
    phone: m.phone ?? "",
    link: m.link ?? "",
    status: m.status ?? "new",
    nextDate: m.nextDate ?? "",
    ownerId: m.ownerId ? String(m.ownerId) : "",
    howToPitch: m.howToPitch ?? "",
    notes: m.notes ?? "",
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  const sel = (k: keyof typeof d, l: string, opts: readonly (readonly [string, string])[]) => (
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
  const input = (k: keyof typeof d, l: string, ph = "") => (
    <Field label={l}>
      <input placeholder={ph} className={fieldClass} {...bind(k)} />
    </Field>
  );
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveMediaAction(m.id ?? null, d)).then((ok) => ok && onDone()))}>
      <Field label="Outlet or agency name" full>
        <input required autoFocus placeholder="e.g. Cool FM 96.9" className={fieldClass} {...bind("name")} />
      </Field>
      {sel("type", "Type", MEDIA_TYPES)}
      {input("show", "Show, segment or column", "e.g. The Morning Rush")}
      {input("host", "Host or editor")}
      {input("industries", "Industries and topics they cover", "e.g. Business, Tech, Lifestyle (separate with commas)")}
      {input("city", "City", "e.g. Lagos")}
      {sel("region", "Region", REGIONS)}
      {input("reach", "Audience or reach", "e.g. 1.2M Instagram followers")}
      {sel("cost", "Editorial or paid", COSTS)}
      {input("contactName", "Contact person")}
      {input("contactRole", "Their role", "e.g. Producer")}
      {input("email", "Email")}
      {input("phone", "Phone or WhatsApp")}
      {input("link", "Website or social link")}
      {sel("status", "Relationship", MEDIA_STATUS)}
      <Field label="Next follow-up">
        <input type="date" className={fieldClass} {...bind("nextDate")} />
      </Field>
      {sel("ownerId", "Relationship owner", [["", "No one yet"], ...w.people.map((p) => [String(p.id), p.name] as [string, string])])}
      <Field label="How to pitch them" full>
        <textarea rows={2} placeholder="e.g. Email the producer a 3 line story, 2 weeks ahead. They like founder stories." className={fieldClass} {...bind("howToPitch")} />
      </Field>
      <Field label="Notes" full>
        <textarea rows={2} className={fieldClass} {...bind("notes")} />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          {m.id ? "Save" : "Add"}
        </button>
        {m.id && <Button onClick={onPitch}>Log a pitch to {m.name}</Button>}
        <span className="flex-1" />
        {m.id && (
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm("Delete this media contact? This can't be undone.") && run(() => removeMedia(m.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function PitchForm({ p, media, forOpts, w, onDone }: { p: Partial<Pitch>; media: Media[]; forOpts: [string, string][]; w: WorkProps; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    forKey: p.forKey ?? "dss",
    outletId: p.outletId ?? "",
    angle: p.angle ?? "",
    status: p.status ?? "pitched",
    pitchedOn: p.pitchedOn ?? "",
    runDate: p.runDate ?? "",
    nextDate: p.nextDate ?? "",
    link: p.link ?? "",
    ownerId: p.ownerId ? String(p.ownerId) : "",
    note: "",
  });
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => savePitchAction(p.id ?? null, d)).then((ok) => ok && onDone()))}>
      <Field label="Who is it for">
        <select required className={fieldClass} {...bind("forKey")}>
          {forOpts.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Outlet">
        <select required className={fieldClass} {...bind("outletId")}>
          <option value="">Choose</option>
          {[...media]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({label(MEDIA_TYPES, m.type)})
              </option>
            ))}
        </select>
      </Field>
      <Field label="Story or angle" full>
        <input required placeholder="e.g. How a Lagos brand built trust online" className={fieldClass} {...bind("angle")} />
      </Field>
      <Field label="Status">
        <select className={fieldClass} {...bind("status")}>
          {PITCH_STATUS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pitched on">
        <input type="date" className={fieldClass} {...bind("pitchedOn")} />
      </Field>
      <Field label="Runs or aired on">
        <input type="date" className={fieldClass} {...bind("runDate")} />
      </Field>
      <Field label="Next follow-up">
        <input type="date" className={fieldClass} {...bind("nextDate")} />
      </Field>
      <Field label="Link to the feature" hint="Add it once it's live">
        <input type="url" className={fieldClass} {...bind("link")} />
      </Field>
      <Field label="Handled by">
        <select className={fieldClass} {...bind("ownerId")}>
          <option value="">No one yet</option>
          {w.people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={p.id ? "Add a status update" : "First note"} full>
        <textarea rows={2} placeholder="e.g. Producer replied, wants a guest for the 14 Dec show" className={fieldClass} {...bind("note")} />
      </Field>
      {p.updates && p.updates.length > 0 && (
        <Panel className="sm:col-span-2">
          <h3 className="mb-1 font-bold">History</h3>
          <ul className="grid gap-1 text-sm">
            {[...p.updates].reverse().map((u) => (
              <li key={u.at}>
                {u.at.slice(0, 10)}: {u.text}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          {p.id ? "Save" : "Log pitch"}
        </button>
        <span className="flex-1" />
        {p.id && (
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm("Delete this pitch? This can't be undone.") && run(() => removePitch(p.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
