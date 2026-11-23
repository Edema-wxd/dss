"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import { addMissingClientContracts, removeContract, renewContract, renewalTask, saveContractAction } from "@/app/savvy-hq/(hq)/contracts/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { Contract } from "@/lib/hq/sales";
import { CT_KINDS, CT_RENEW, CT_STATUS, CURRENCIES, contractRank, contractState, label, renewedEnd } from "@/lib/hq/sales-model";
import { compactNaira } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Bar, Dialog, EmptyNote, Pill, useRun } from "./kit";
import type { WorkProps } from "./tasks";

type Named = { id: string; name: string };
type Props = { contracts: Contract[]; clients: (Named & { status: string; service: string })[]; talents: Named[]; w: WorkProps; money: boolean };

const fmt = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "open");

export function ContractsView({ contracts, clients, talents, w, money }: Props) {
  const { run, pending } = useRun();
  const [kind, setKind] = useState("");
  const [editing, setEditing] = useState<Partial<Contract> | null>(null);
  const [renewing, setRenewing] = useState<Contract | null>(null);
  const partyOf = (c: Partial<Contract>) => c.party || clients.find((x) => x.id === c.clientId)?.name || talents.find((x) => x.id === c.talentId)?.name || "Unnamed";
  const rows = contracts
    .map((c) => ({ c, s: contractState(c, w.today) }))
    .filter(({ c }) => !kind || c.kind === kind)
    .sort((a, b) => contractRank(a.s) - contractRank(b.s) || (a.c.end || "9999").localeCompare(b.c.end || "9999"));
  const live = contracts.filter((c) => c.status === "active");
  const soon = contracts.map((c) => ({ c, s: contractState(c, w.today) })).filter(({ s }) => ["soon", "decide", "lapsed"].includes(s.k));
  const decide = soon.filter(({ s }) => s.k !== "soon");
  const uncovered = clients.filter((c) => ["active", "onboarding", "paused"].includes(c.status) && !contracts.some((k) => k.clientId === c.id));
  const soonValue = soon.reduce((t, { c }) => t + (c.currency === "NGN" ? (c.value ?? 0) : 0), 0);

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Live contracts", live.length, `${contracts.filter((c) => c.status === "draft").length} waiting to be signed`],
          ["Ending in 90 days", soon.length, money && soonValue ? `${compactNaira(soonValue)} up for renewal` : "plan the conversations early"],
          ["Decide now", decide.length, "notice window open or passed"],
          ["Clients without one", uncovered.length, uncovered.length ? "add their agreements" : "every client is covered"],
        ].map(([l, v, s]) => (
          <div key={String(l)} className="grid gap-1 rounded-[20px] border-2 border-ink bg-white p-4">
            <span className="text-xs font-bold tracking-[0.06em] text-slate uppercase">{l}</span>
            <b className="font-display text-3xl tabular-nums">{v}</b>
            <span className="text-sm text-slate">{s}</span>
          </div>
        ))}
      </div>
      {uncovered.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#eceef8] p-3 text-sm">
          <span className="flex-1">
            <b>
              {uncovered.length} client{uncovered.length === 1 ? " has" : "s have"} no contract on file:
            </b>{" "}
            {uncovered.map((c) => c.name).join(", ")}.
          </span>
          <Button size="sm" disabled={pending} onClick={() => run(addMissingClientContracts)}>
            Add them from client dates
          </Button>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {[["", "All"], ...CT_KINDS].map(([k, l]) => (
          <button key={k || "all"} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", kind === k ? "bg-ink text-white" : "bg-white")}>
            {l}
          </button>
        ))}
        <span className="flex-1" />
        <button type="button" onClick={() => setEditing({ kind: "client", status: "active", renewal: "manual", noticeDays: 30, period: "month", currency: "NGN", ownerId: w.me.id })} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Contract
        </button>
      </div>
      {rows.length ? (
        <Panel>
          <ul>
            {rows.map(({ c, s }) => {
              const span = c.start && c.end ? Math.max(1, Date.parse(c.end) - Date.parse(c.start)) : 0;
              const done = span ? Math.min(100, Math.max(0, ((Date.parse(w.today) - Date.parse(c.start)) / span) * 100)) : 0;
              return (
                <li key={c.id} className="grid gap-2 border-t border-ink/10 py-3 first:border-t-0 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Pill>{label(CT_KINDS, c.kind)}</Pill>
                      <b>{partyOf(c)}</b>
                      {c.title && <span className="text-slate">{c.title}</span>}
                    </span>
                    <span className="text-xs text-slate">
                      {fmt(c.start)} to {fmt(c.end)}, {label(CT_RENEW, c.renewal).toLowerCase()}, {c.noticeDays} days&apos; notice
                      {c.ownerId ? `, ${w.people.find((p) => p.id === c.ownerId)?.name.split(" ")[0] ?? ""}` : ""}
                      {money && c.value !== null ? `. ${c.currency === "NGN" ? compactNaira(c.value) : `${c.currency} ${c.value}`}${c.period === "month" ? "/mo" : ""}` : ""}
                    </span>
                    {span > 0 && c.status !== "ended" && (
                      <span className="max-w-[320px]">
                        <Bar pct={done} tone="ink" label="Through the term" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={s.tone}>{s.l}</Pill>
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noopener noreferrer" aria-label="Open the signed copy" className={cn(btn.base, btn.plain, btn.sm)}>
                        <ExternalLink className="size-3.5" aria-hidden /> Open
                      </a>
                    )}
                    {["soon", "decide", "lapsed"].includes(s.k) && (
                      <>
                        <Button size="sm" onClick={() => setRenewing(c)}>
                          Renewed
                        </Button>
                        <Button size="sm" disabled={pending} onClick={() => run(() => renewalTask(c.id))}>
                          Task
                        </Button>
                      </>
                    )}
                    <Button size="sm" tone="ghost" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : (
        <EmptyNote title="No contracts yet.">Add each signed agreement with its end date and notice period. HQ warns you on Today and the Command centre before the notice window closes.</EmptyNote>
      )}
      <p className="mt-3 text-xs text-slate">
        DSS standard: 30 days&apos; notice to end an engagement. &ldquo;Decide by&rdquo; is the end date minus the notice period. Contracts show here 14 days before that date.
      </p>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? "Edit contract" : "Add a contract"} wide>
        {editing && <ContractForm key={editing.id ?? "new"} c={editing} clients={clients} talents={talents} w={w} money={money} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={renewing !== null} onClose={() => setRenewing(null)} title={renewing ? `Renew ${partyOf(renewing)}` : "Renew"}>
        {renewing && <RenewForm c={renewing} money={money} onDone={() => setRenewing(null)} />}
      </Dialog>
    </>
  );
}

function ContractForm({ c, clients, talents, w, money, onDone }: { c: Partial<Contract>; clients: Named[]; talents: Named[]; w: WorkProps; money: boolean; onDone: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    kind: c.kind ?? "client",
    status: c.status ?? "active",
    clientId: c.clientId ?? "",
    talentId: c.talentId ?? "",
    party: c.party ?? "",
    title: c.title ?? "",
    start: c.start ?? "",
    end: c.end ?? "",
    renewal: c.renewal ?? "manual",
    noticeDays: String(c.noticeDays ?? 30),
    value: c.value === null || c.value === undefined ? "" : String(c.value),
    period: c.period ?? "month",
    currency: c.currency ?? "NGN",
    ownerId: c.ownerId ? String(c.ownerId) : "",
    link: c.link ?? "",
    notes: c.notes ?? "",
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
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => saveContractAction(c.id ?? null, d)).then((ok) => ok && onDone()))}>
      {sel("kind", "Kind", CT_KINDS)}
      {sel("status", "Status", CT_STATUS)}
      {sel("clientId", "Client", [["", "None"], ...clients.map((x) => [x.id, x.name] as [string, string])])}
      {sel("talentId", "Talent", [["", "None"], ...talents.map((x) => [x.id, x.name] as [string, string])])}
      <Field label="Other party">
        <input placeholder="When it isn't a client or talent" className={fieldClass} {...bind("party")} />
      </Field>
      <Field label="What it covers">
        <input className={fieldClass} {...bind("title")} />
      </Field>
      <Field label="Starts">
        <input type="date" className={fieldClass} {...bind("start")} />
      </Field>
      <Field label="Ends">
        <input type="date" className={fieldClass} {...bind("end")} />
      </Field>
      {sel("renewal", "Renewal", CT_RENEW)}
      <Field label="Notice period (days)">
        <input type="number" min={0} max={365} className={fieldClass} {...bind("noticeDays")} />
      </Field>
      {money && (
        <>
          <Field label="Value">
            <input type="number" min={0} className={fieldClass} {...bind("value")} />
          </Field>
          {sel("period", "Value is", [
            ["month", "Per month"],
            ["total", "Total"],
          ])}
          {sel("currency", "Currency", CURRENCIES.map((x) => [x, x]))}
        </>
      )}
      {sel("ownerId", "Looked after by", [["", "No one yet"], ...w.people.map((p) => [String(p.id), p.name] as [string, string])])}
      <Field label="Signed copy (Drive link)">
        <input type="url" className={fieldClass} {...bind("link")} />
      </Field>
      <Field label="Key terms to remember" full>
        <textarea rows={3} className={fieldClass} {...bind("notes")} />
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
          Save contract
        </button>
        <span className="flex-1" />
        {c.id && (
          <Button tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm("Delete this contract? This can't be undone.") && run(() => removeContract(c.id!)).then((ok) => ok && onDone())}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

function RenewForm({ c, money, onDone }: { c: Contract; money: boolean; onDone: () => void }) {
  const { run, pending } = useRun();
  const [end, setEnd] = useState(c.end ? renewedEnd(c.start, c.end) : "");
  const [value, setValue] = useState(c.value === null ? "" : String(c.value));
  const [link, setLink] = useState("");
  return (
    <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), run(() => renewContract(c.id, { end, value, link })).then((ok) => ok && onDone()))}>
      <Field label="New end date">
        <input type="date" required value={end} onChange={(e) => setEnd(e.target.value)} className={fieldClass} />
      </Field>
      {money && (
        <Field label="New value">
          <input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} className={fieldClass} />
        </Field>
      )}
      <Field label="Signed renewal (Drive link)">
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} className={fieldClass} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Save renewal
      </button>
    </form>
  );
}
