"use client";

import { useState } from "react";
import { Check, Plus, Settings2, X } from "lucide-react";
import {
  applyTemplate,
  approveProposal,
  declineProposal,
  logNumbers,
  proposeKpi,
  removeKpi,
  reviseProposal,
  saveKpi,
  setCanPropose,
  withdrawProposal,
} from "@/app/admin/(hq)/kpis/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { KpiWithState, Proposal } from "@/lib/hq/data";
import { KPI_PERIODS, KPI_SOURCES, KPI_UNITS, formatKpi, personScore } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Bar, Dialog, EmptyNote, Pill, type Tone, useRun } from "./kit";

export type KpiPerson = { id: number; name: string; roleLabel: string; kpiSelf: boolean; template: string | null };
type Props = {
  me: { id: number; name: string; isOwner: boolean; canManage: boolean; canPropose: boolean };
  people: KpiPerson[];
  kpis: KpiWithState[];
  proposals: Proposal[];
};

const label = (list: readonly (readonly [string, string])[], k: string) => list.find(([x]) => x === k)?.[1] ?? k;
const pctTone = (pct: number): Tone => (pct >= 100 ? "ok" : pct >= 60 ? "warn" : "bad");

function ScoreRing({ score }: { score: number | null }) {
  const c = score === null ? "#d6cfb9" : score >= 90 ? "#1e7a4c" : score >= 60 ? "#e7a33a" : "#c42b3c";
  const p = Math.min(100, score ?? 0);
  return (
    <span
      role="img"
      aria-label={score === null ? "No score yet" : `Score ${score}%`}
      className="grid size-14 flex-none place-items-center rounded-full"
      style={{ background: `conic-gradient(${c} ${p * 3.6}deg, #f3efe3 0deg)` }}
    >
      <span className="grid size-11 place-items-center rounded-full bg-white text-sm font-bold tabular-nums">{score ?? "-"}</span>
    </span>
  );
}

type KpiDraft = { title: string; target: string; unit: string; period: string; direction: string; source: string; how: string; weight: string; why: string; note: string; ownerId: string };
const blank = (ownerId: number): KpiDraft => ({ title: "", target: "", unit: "number", period: "month", direction: "up", source: "manual", how: "", weight: "1", why: "", note: "", ownerId: String(ownerId) });

function KpiFields({ d, set, allowRevenue, extra }: { d: KpiDraft; set: (k: keyof KpiDraft, v: string) => void; allowRevenue: boolean; extra?: React.ReactNode }) {
  const sel = (k: keyof KpiDraft, l: string, list: readonly (readonly [string, string])[]) => (
    <Field label={l}>
      <select value={d[k]} onChange={(e) => set(k, e.target.value)} className={fieldClass}>
        {list.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="What's measured" full>
        <input required autoFocus value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Brand pitches sent" className={fieldClass} />
      </Field>
      <Field label="Target">
        <input required type="number" min={0} step="any" value={d.target} onChange={(e) => set("target", e.target.value)} className={fieldClass} />
      </Field>
      {sel("unit", "Unit", KPI_UNITS)}
      {sel("period", "Period", KPI_PERIODS)}
      {sel("direction", "Better is", [
        ["up", "Higher"],
        ["down", "Lower"],
      ])}
      {sel("source", "How it's counted", allowRevenue ? KPI_SOURCES : KPI_SOURCES.filter(([k]) => k !== "auto_revenue"))}
      <Field label="How we check it" full>
        <input value={d.how} onChange={(e) => set("how", e.target.value)} placeholder="e.g. Count of pitch emails in the CRM" className={fieldClass} />
      </Field>
      {extra}
    </div>
  );
}

/** One form for setting, proposing, and revising a proposal. */
function KpiDialog({
  open,
  onClose,
  title,
  initial,
  mode,
  people,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: KpiDraft;
  mode: "set" | "propose" | "revise";
  people: KpiPerson[];
  onSave: (d: KpiDraft) => Promise<boolean>;
  onDelete?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {open && <KpiDialogForm initial={initial} mode={mode} people={people} onSave={onSave} onDelete={onDelete} />}
    </Dialog>
  );
}

function KpiDialogForm({
  initial,
  mode,
  people,
  onSave,
  onDelete,
}: {
  initial: KpiDraft;
  mode: "set" | "propose" | "revise";
  people: KpiPerson[];
  onSave: (d: KpiDraft) => Promise<boolean>;
  onDelete?: () => void;
}) {
  const [d, setD] = useState(initial);
  const set = (k: keyof KpiDraft, v: string) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
    >
      <KpiFields
        d={d}
        set={set}
        allowRevenue={mode !== "propose"}
        extra={
          <>
            {mode === "set" && (
              <>
                <Field label="Whose KPI">
                  <select value={d.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={fieldClass}>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Weight in their score">
                  <input type="number" min={1} max={10} value={d.weight} onChange={(e) => set("weight", e.target.value)} className={fieldClass} />
                </Field>
              </>
            )}
            {mode === "propose" && (
              <Field label="Why this matters" full>
                <textarea required rows={3} value={d.why} onChange={(e) => set("why", e.target.value)} placeholder="How it moves DSS forward and why the target is right" className={fieldClass} />
              </Field>
            )}
            {mode === "revise" && (
              <Field label="Why you changed it (they'll see this)" full>
                <textarea required rows={2} value={d.note} onChange={(e) => set("note", e.target.value)} className={fieldClass} />
              </Field>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={cn(btn.base, btn.primary)}>
          {mode === "propose" ? "Send for approval" : mode === "revise" ? "Reject and set this KPI" : "Save KPI"}
        </button>
        <span className="flex-1" />
        {onDelete && (
          <Button tone="ghost" className="text-pink" onClick={onDelete}>
            Remove this KPI
          </Button>
        )}
      </div>
    </form>
  );
}

function UpdateNumbers({ open, onClose, kpis }: { open: boolean; onClose: () => void; kpis: KpiWithState[] }) {
  const { run, pending } = useRun();
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <Dialog open={open} onClose={onClose} title="Update my numbers">
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => logNumbers(values)).then((ok) => ok && onClose());
        }}
      >
        <p className="text-sm text-slate">Your number so far this period. Leave a box empty to keep it as it is.</p>
        {kpis.map((k) => (
          <Field key={k.id} label={`${k.title} (${label(KPI_PERIODS, k.period).toLowerCase()}, target ${formatKpi(k.unit, k.target)})`}>
            <input type="number" step="any" placeholder={k.actual === null ? "" : String(k.actual)} value={values[k.id] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [k.id]: e.target.value }))} className={fieldClass} />
          </Field>
        ))}
        <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
          Save numbers
        </button>
      </form>
    </Dialog>
  );
}

const draftFrom = (k: { title: string; target: number; unit: string; period: string; direction: string; source: string; how: string; weight?: number | null }, ownerId: number): KpiDraft => ({
  ...blank(ownerId),
  title: k.title,
  target: String(k.target),
  unit: k.unit,
  period: k.period,
  direction: k.direction,
  source: k.source,
  how: k.how,
  weight: String(k.weight ?? 1),
});

const STATUS: Record<string, [string, Tone]> = {
  pending: ["Waiting for the owner", "warn"],
  approved: ["Approved", "ok"],
  revised: ["Changed by the owner", "sky"],
  declined: ["Declined", "bad"],
};

export function KpisView({ me, people, kpis, proposals }: Props) {
  const { run, pending } = useRun();
  const [who, setWho] = useState("");
  const [dialog, setDialog] = useState<null | { mode: "set" | "propose" | "revise"; title: string; initial: KpiDraft; id?: string }>(null);
  const [updating, setUpdating] = useState(false);
  const shown = people.filter((p) => !who || String(p.id) === who);
  const nameOf = (id: number) => people.find((p) => p.id === id)?.name ?? "Someone";
  const myManual = kpis.filter((k) => k.ownerId === me.id && (k.source || "manual") === "manual");

  const save = async (d: KpiDraft) => {
    if (!dialog) return false;
    const body = { ...d, target: Number(d.target), weight: Number(d.weight) };
    const ok = await run(() =>
      dialog.mode === "propose" ? proposeKpi(body) : dialog.mode === "revise" ? reviseProposal(dialog.id!, body) : saveKpi(dialog.id ?? null, body),
    );
    if (ok) setDialog(null);
    return ok;
  };

  const pendingForOwner = me.isOwner ? proposals.filter((p) => p.status === "pending") : [];
  const mine = me.isOwner ? [] : proposals.filter((p) => p.userId === me.id);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {me.canManage && people.length > 1 && (
          <select aria-label="Person" value={who} onChange={(e) => setWho(e.target.value)} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-semibold">
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        {myManual.length > 0 && (
          <Button onClick={() => setUpdating(true)} className="bg-lime">
            Update my numbers
          </Button>
        )}
        {me.canPropose && (
          <Button onClick={() => setDialog({ mode: "propose", title: "Propose a KPI", initial: blank(me.id) })}>
            <Plus className="size-4" aria-hidden /> Propose a KPI
          </Button>
        )}
      </div>

      {pendingForOwner.length > 0 && (
        <Panel className="mb-4 border-pink">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
            KPIs waiting for your approval <Pill tone="rose">{pendingForOwner.length}</Pill>
          </h2>
          {pendingForOwner.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-3 border-t border-ink/10 py-3 first:border-t-0">
              <div className="min-w-[220px] flex-1">
                <b className="block">{p.title}</b>
                <span className="text-sm text-slate">
                  {nameOf(p.userId)} proposes <b>{formatKpi(p.unit, p.target)}</b> {label(KPI_PERIODS, p.period).toLowerCase()}
                  {p.direction === "down" ? " (lower is better)" : ""}
                </span>
                {p.why && (
                  <p className="mt-1 text-sm">
                    <b>Why:</b> {p.why}
                  </p>
                )}
                {p.how && <p className="text-sm text-slate">How it&apos;s checked: {p.how}</p>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" tone="ghost" className="text-pink" disabled={pending} onClick={() => {
                  const note = window.prompt(`Tell ${nameOf(p.userId).split(" ")[0]} why you're declining`);
                  if (note) run(() => declineProposal(p.id, note));
                }}>
                  Decline
                </Button>
                <Button size="sm" disabled={pending} onClick={() => setDialog({ mode: "revise", id: p.id, title: `Set ${nameOf(p.userId).split(" ")[0]}'s KPI`, initial: draftFrom(p, p.userId) })}>
                  Reject and set mine
                </Button>
                <Button size="sm" tone="primary" disabled={pending} onClick={() => run(() => approveProposal(p.id))}>
                  <Check className="size-3.5" aria-hidden /> Approve
                </Button>
              </div>
            </div>
          ))}
        </Panel>
      )}

      {(mine.length > 0 || me.canPropose) && (
        <Panel className="mb-4">
          <h2 className="mb-2 text-lg font-bold">My KPI proposals</h2>
          {mine.length ? (
            mine.slice(0, 8).map((p) => {
              const [l, tone] = STATUS[p.status] ?? STATUS.pending;
              return (
                <div key={p.id} className="flex items-start gap-3 border-t border-ink/10 py-2.5 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <b className="block">{p.title}</b>
                    <span className="text-sm text-slate">
                      You proposed {formatKpi(p.unit, p.target)} {label(KPI_PERIODS, p.period).toLowerCase()}
                      {p.final && (
                        <>
                          . The owner set <b>{p.final}</b>
                        </>
                      )}
                    </span>
                    {p.note && <p className="mt-1 text-sm">The owner: {p.note}</p>}
                  </div>
                  <Pill tone={tone}>{l}</Pill>
                  {p.status === "pending" && (
                    <button type="button" aria-label="Withdraw" onClick={() => run(() => withdrawProposal(p.id))} className="text-slate hover:text-pink">
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate">Set targets you believe you can own. The owner approves them, or sets a version that fits the business and tells you why.</p>
          )}
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((p) => {
          const ks = kpis.filter((k) => k.ownerId === p.id);
          const score = personScore(ks.map((k) => ({ pct: k.pct, weight: k.weight })));
          return (
            <Panel key={p.id}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ScoreRing score={score} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold">{p.name}</h2>
                  <p className="text-sm text-slate">{p.roleLabel}, this period</p>
                </div>
                {me.canManage && (
                  <Button size="sm" onClick={() => setDialog({ mode: "set", title: `New KPI for ${p.name.split(" ")[0]}`, initial: blank(p.id) })}>
                    <Plus className="size-3.5" aria-hidden /> KPI
                  </Button>
                )}
                {me.isOwner && p.id !== me.id && (
                  <Button size="sm" tone={p.kpiSelf ? "primary" : "plain"} aria-pressed={p.kpiSelf} disabled={pending} onClick={() => run(() => setCanPropose(p.id, !p.kpiSelf))} title="Let them propose their own KPIs for your approval">
                    {p.kpiSelf ? "Can propose" : "Let them propose"}
                  </Button>
                )}
              </div>
              {ks.length ? (
                <div className="grid gap-4">
                  {ks.map((k) => (
                    <div key={k.id} className="grid gap-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <b className="min-w-0 flex-1 text-sm font-semibold">{k.title}</b>
                        {k.proposedBy && <Pill>Self-set</Pill>}
                        <Pill>{label(KPI_PERIODS, k.period)}</Pill>
                        {me.canManage && (
                          <button
                            type="button"
                            aria-label={`Edit ${k.title}`}
                            onClick={() => setDialog({ mode: "set", id: k.id, title: "Edit KPI", initial: draftFrom(k, k.ownerId ?? p.id) })}
                            className="grid size-7 place-items-center rounded-full text-slate hover:bg-paper hover:text-ink"
                          >
                            <Settings2 className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2">
                        <b className="text-xl tabular-nums">{formatKpi(k.unit, k.actual)}</b>
                        <span className="text-sm text-slate">
                          of {formatKpi(k.unit, k.target)} {k.direction === "down" ? "(lower is better)" : ""}
                        </span>
                        <span className="flex-1" />
                        <Pill tone={pctTone(k.pct)}>{k.actual === null ? "Not counted yet" : `${k.pct}%`}</Pill>
                      </div>
                      <Bar pct={k.pct} label={k.title} />
                      <span className="text-xs text-slate">
                        {label(KPI_SOURCES, k.source || "manual")}
                        {k.source === "auto_touches" ? ". Counted once the CRM arrives" : k.source === "auto_revenue" ? ". Counted once Finance arrives" : ""}
                        {k.how ? `. ${k.how}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyNote title="No KPIs yet.">
                  {me.canManage && p.template ? (
                    <Button size="sm" className="mt-2" disabled={pending} onClick={() => run(() => applyTemplate(p.id))}>
                      Use the {p.template} template
                    </Button>
                  ) : p.id === me.id && me.canPropose ? (
                    "Propose your first KPI above. The owner will approve it or set their version."
                  ) : (
                    "The owner will set these with you."
                  )}
                </EmptyNote>
              )}
            </Panel>
          );
        })}
      </div>

      {dialog && (
        <KpiDialog
          open
          onClose={() => setDialog(null)}
          title={dialog.title}
          initial={dialog.initial}
          mode={dialog.mode}
          people={people}
          onSave={save}
          onDelete={
            dialog.mode === "set" && dialog.id
              ? () => window.confirm("Remove this KPI? Its logged numbers go too.") && run(() => removeKpi(dialog.id!)).then((ok) => ok && setDialog(null))
              : undefined
          }
        />
      )}
      <UpdateNumbers open={updating} onClose={() => setUpdating(false)} kpis={myManual} />
    </>
  );
}
