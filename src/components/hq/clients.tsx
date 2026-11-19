"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus } from "lucide-react";
import {
  addClient,
  approveOnboarding,
  logClientUpdate,
  removeClient,
  saveClient,
  saveOnbTemplate,
  sendBackOnboarding,
  startOnboarding,
  submitOnboarding,
  tickStep,
} from "@/app/admin/(hq)/clients/actions";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { Task } from "@/lib/hq/data";
import type { Client, TimelineEntry } from "@/lib/hq/sales";
import { CLIENT_STATUS, CURRENCIES, HEALTH, LIVE, ONB_STATUS, SERVICES, contractState, label, stepDone } from "@/lib/hq/sales-model";
import { addDays, compactNaira, relDay, sortTasks } from "@/lib/hq/work";
import { cn } from "@/lib/utils";
import { Avatar, Bar, Dialog, DueChip, EmptyNote, Pill, type Tone, useRun } from "./kit";
import { TaskEditor, TaskRow, type WorkProps } from "./tasks";

export const healthTone = (h: string): Tone => (h === "risk" ? "bad" : h === "watch" ? "warn" : "ok");
const TINTS = ["bg-pink-soft", "bg-aqua/70", "bg-peach/70", "bg-lime/40", "bg-[#eceef8]"];
const tint = (id: string) => TINTS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length];
const money = (fee: number | null, currency: string) => (fee === null ? "" : currency === "NGN" ? compactNaira(fee) : `${currency} ${fee.toLocaleString("en-GB")}`);

type ContractLite = { clientId: string | null; status: string; end: string; noticeDays: number };

/* ── The list ────────────────────────────────────────────────────────── */

export function ClientsView({ clients, tasks, w, money: seesMoney, owner, template }: { clients: Client[]; tasks: Task[]; w: WorkProps; money: boolean; owner: boolean; template: string }) {
  const [filter, setFilter] = useState("live");
  const [adding, setAdding] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const groups: [string, string, (c: Client) => boolean][] = [
    ["live", "Live", (c) => LIVE.includes(c.status)],
    ["paused", "Paused", (c) => c.status === "paused"],
    ["ended", "Ended", (c) => c.status === "ended"],
    ["all", "All", () => true],
  ];
  const shown = clients.filter(groups.find(([k]) => k === filter)![2]);
  const live = clients.filter((c) => LIVE.includes(c.status));
  const mrr = live.filter((c) => c.billing === "monthly" && c.currency === "NGN").reduce((s, c) => s + (c.fee ?? 0), 0);
  const nameOf = (id: number | null) => w.people.find((p) => p.id === id)?.name ?? "";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-slate">
          {live.length} live engagement{live.length === 1 ? "" : "s"}
          {seesMoney && mrr > 0 ? `, ${compactNaira(mrr)} a month in naira retainers` : ""}
        </p>
        {owner && <Button onClick={() => setEditingTemplate(true)}>Onboarding template</Button>}
        <button type="button" onClick={() => setAdding(true)} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> New client
        </button>
      </div>
      <div role="group" aria-label="Show" className="mb-4 flex flex-wrap gap-1.5">
        {groups.map(([k, l, f]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold", filter === k ? "bg-ink text-white" : "bg-white")}>
            {l} <span className="opacity-60">{clients.filter(f).length}</span>
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const open = tasks.filter((t) => t.clientId === c.id && t.status !== "done");
            const late = open.filter((t) => t.due && t.due < w.today).length;
            const onbDone = c.onb ? c.onb.steps.filter((s) => s.done).length : 0;
            return (
              <Link key={c.id} href={`/admin/clients/${c.id}`} className="grid overflow-hidden rounded-[20px] border-2 border-ink bg-white transition-transform hover:-translate-y-0.5">
                <span className={cn("px-4 py-2 text-xs font-bold", tint(c.id))}>{c.service || "Service not set"}</span>
                <span className="grid gap-2 p-4">
                  <span className="flex flex-wrap gap-1">
                    {c.status === "offboarding" && <Pill tone="warn">Leaving{c.leavingOn ? ` ${relDay(c.leavingOn, w.today)}` : ""}</Pill>}
                    {c.onb && c.onb.status !== "approved" && (
                      <Pill tone={ONB_STATUS[c.onb.status][1]}>{c.onb.status === "in_progress" ? `Onboarding ${onbDone}/${c.onb.steps.length}` : ONB_STATUS[c.onb.status][0]}</Pill>
                    )}
                    {c.payMode === "auto" && <Pill tone="sky">Auto-pay</Pill>}
                    <Pill tone={healthTone(c.health)}>{label(HEALTH, c.health, "On track")}</Pill>
                  </span>
                  <h2 className="text-lg font-bold tracking-[-0.02em]">{c.name}</h2>
                  {c.contactName && <span className="text-sm text-slate">{[c.contactName, c.contactRole].filter(Boolean).join(", ")}</span>}
                  <span className="text-sm">
                    <b>Next:</b> {c.nextDeliverable || "Not set"}
                    {c.nextDate ? `, ${relDay(c.nextDate, w.today).toLowerCase()}` : ""}
                  </span>
                  <span className="flex flex-wrap gap-x-4 text-sm text-slate">
                    {seesMoney && c.fee !== null && (
                      <span>
                        Fee {money(c.fee, c.currency)}
                        {c.billing === "monthly" ? "/mo" : ""}
                      </span>
                    )}
                    {c.endDate && <span>Contract ends {relDay(c.endDate, w.today)}</span>}
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    {c.leadId && <Avatar name={nameOf(c.leadId)} />}
                    {c.pointId && <Avatar name={nameOf(c.pointId)} />}
                    <span className="text-slate">
                      {open.length} open task{open.length === 1 ? "" : "s"}
                    </span>
                    {late > 0 && <Pill tone="bad">{late} late</Pill>}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyNote title="No clients here yet.">Add a client, or use &ldquo;Won: make them a client&rdquo; on a CRM prospect.</EmptyNote>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="New client" wide>
        {adding && <ClientForm w={w} money={seesMoney} onDone={() => setAdding(false)} />}
      </Dialog>
      <Dialog open={editingTemplate} onClose={() => setEditingTemplate(false)} title="Onboarding template" wide>
        {editingTemplate && <TemplateForm initial={template} onDone={() => setEditingTemplate(false)} />}
      </Dialog>
    </>
  );
}

function TemplateForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const { run, pending } = useRun();
  const [v, setV] = useState(initial);
  return (
    <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), run(() => saveOnbTemplate(v)).then((ok) => ok && onDone()))}>
      <p className="text-sm text-slate">
        Every new client gets these steps, as tasks for their lead or point guard. &quot;lead&quot; is the client lead, &quot;point&quot; is the point guard. Once all steps are ticked, the client comes to you for sign-off.
      </p>
      <Field label="One step per line: what | day after start | lead or point">
        <textarea rows={12} value={v} onChange={(e) => setV(e.target.value)} className={cn(fieldClass, "font-mono text-sm")} />
      </Field>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Save template
      </button>
    </form>
  );
}

/** New client, optionally prefilled from a CRM contact. */
export function ClientForm({ w, money: seesMoney, onDone, pre = {} }: { w: WorkProps; money: boolean; onDone: (id?: string) => void; pre?: Record<string, string> }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    name: pre.name ?? "",
    service: pre.service || SERVICES[0],
    status: "onboarding",
    fee: pre.fee ?? "",
    currency: pre.currency || "NGN",
    payMode: "invoice",
    payDay: "",
    billing: "monthly",
    startDate: w.today,
    endDate: addDays(w.today, 90),
    leadId: pre.leadId || String(w.me.id),
    pointId: "",
    contactName: pre.contactName ?? "",
    email: pre.email ?? "",
  });
  const [onboard, setOnboard] = useState(true);
  const bind = (k: keyof typeof d) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  const people = (blank: string) => (
    <>
      <option value="">{blank}</option>
      {w.people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await addClient({ ...d, startOnboarding: onboard, fromContact: pre.fromContact ?? "" });
          if (r.ok) onDone(r.id);
          return r;
        });
      }}
    >
      <Field label="Client or company name" full>
        <input required autoFocus className={fieldClass} {...bind("name")} />
      </Field>
      <Field label="Service">
        <select className={fieldClass} {...bind("service")}>
          {SERVICES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select className={fieldClass} {...bind("status")}>
          {CLIENT_STATUS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      {seesMoney && (
        <>
          <Field label="Fee">
            <input type="number" min={0} className={fieldClass} {...bind("fee")} />
          </Field>
          <Field label="Currency">
            <select className={fieldClass} {...bind("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </>
      )}
      <Field label="Billing">
        <select className={fieldClass} {...bind("billing")}>
          <option value="monthly">Monthly retainer</option>
          <option value="project">Project fee</option>
        </select>
      </Field>
      <Field label="How they pay">
        <select className={fieldClass} {...bind("payMode")}>
          <option value="invoice">We send an invoice</option>
          <option value="auto">Automatic payment, no invoice</option>
        </select>
      </Field>
      {d.payMode === "auto" && (
        <Field label="Day of the month they pay">
          <input type="number" min={1} max={28} className={fieldClass} {...bind("payDay")} />
        </Field>
      )}
      <Field label="Start date">
        <input type="date" className={fieldClass} {...bind("startDate")} />
      </Field>
      <Field label="Contract ends or renews" hint="DSS engagements run at least three months.">
        <input type="date" className={fieldClass} {...bind("endDate")} />
      </Field>
      <Field label="Lead">
        <select className={fieldClass} {...bind("leadId")}>
          {people("No lead")}
        </select>
      </Field>
      <Field label="Point guard">
        <select className={fieldClass} {...bind("pointId")}>
          {people("None")}
        </select>
      </Field>
      <Field label="Main contact">
        <input className={fieldClass} {...bind("contactName")} />
      </Field>
      <Field label="Email">
        <input type="email" className={fieldClass} {...bind("email")} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={onboard} onChange={(e) => setOnboard(e.target.checked)} className="size-4 accent-pink" />
        Start the onboarding checklist (tasks for each step, then your sign-off)
      </label>
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Add client
      </button>
    </form>
  );
}

/* ── One client ──────────────────────────────────────────────────────── */

type DetailProps = {
  client: Client;
  tasks: Task[];
  timeline: TimelineEntry[];
  contract: ContractLite | null;
  w: WorkProps;
  money: boolean;
  owner: boolean;
  canContracts: boolean;
};

const TABS = [
  ["overview", "Overview"],
  ["onboarding", "Onboarding"],
  ["work", "Work"],
  ["updates", "Updates"],
] as const;

export function ClientDetail(p: DetailProps) {
  const { client: c, w } = p;
  const [tab, setTab] = useState<(typeof TABS)[number][0]>(c.onb && c.onb.status !== "approved" ? "onboarding" : "overview");
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const open = sortTasks(p.tasks.filter((t) => t.status !== "done"));
  const late = open.filter((t) => t.due && t.due < w.today).length;
  const doneIds = new Set(p.tasks.filter((t) => t.status === "done").map((t) => t.id));
  const ct = p.contract ? contractState(p.contract, w.today) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {p.canContracts && (
          <Link href="/admin/contracts" className="rounded-2xl bg-white px-3 py-2 ring-1 ring-ink/15 hover:ring-ink">
            <b className="block text-xs text-slate">Contract</b>
            <span className={cn(ct?.tone === "bad" && "font-semibold text-[#c42b3c]")}>{ct ? ct.l : "None on file, add it"}</span>
          </Link>
        )}
        {c.onb && c.onb.status !== "approved" && (
          <button type="button" onClick={() => setTab("onboarding")} className="rounded-2xl bg-white px-3 py-2 text-left ring-1 ring-ink/15 hover:ring-ink">
            <b className="block text-xs text-slate">Onboarding</b>
            {c.onb.steps.filter((s) => stepDone(s, doneIds)).length}/{c.onb.steps.length}, {ONB_STATUS[c.onb.status][0].toLowerCase()}
          </button>
        )}
        <button type="button" onClick={() => setTab("work")} className="rounded-2xl bg-white px-3 py-2 text-left ring-1 ring-ink/15 hover:ring-ink">
          <b className="block text-xs text-slate">Work</b>
          {open.length} open{late ? `, ${late} late` : ""}
        </button>
      </div>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded-full border-2 border-ink px-3.5 py-1 text-sm font-semibold", tab === k ? "bg-ink text-white" : "bg-white")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview {...p} />}
      {tab === "onboarding" && <OnboardingTab {...p} doneIds={doneIds} />}
      {tab === "work" && (
        <Panel>
          <div className="mb-2 flex items-center gap-2">
            <b className="flex-1">{open.length} open</b>
            <Button size="sm" onClick={() => setEditing({ clientId: c.id })}>
              <Plus className="size-3.5" aria-hidden /> Task
            </Button>
          </div>
          {open.length ? open.map((t) => <TaskRow key={t.id} task={t} w={w} onOpen={setEditing} showWho />) : <EmptyNote title="No open work.">Add the next deliverable.</EmptyNote>}
          {p.tasks.some((t) => t.status === "done") && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate">Recently done</summary>
              {p.tasks
                .filter((t) => t.status === "done")
                .slice(0, 10)
                .map((t) => (
                  <TaskRow key={t.id} task={t} w={w} onOpen={setEditing} showWho />
                ))}
            </details>
          )}
        </Panel>
      )}
      {tab === "updates" && <Updates id={c.id} timeline={p.timeline} />}
      <TaskEditor task={editing} w={w} onClose={() => setEditing(null)} />
    </>
  );
}

function Overview({ client: c, w, money: seesMoney }: DetailProps) {
  const { run, pending } = useRun();
  const router = useRouter();
  const [d, setD] = useState({
    name: c.name,
    service: c.service,
    status: c.status,
    health: c.health || "good",
    fee: c.fee === null ? "" : String(c.fee),
    currency: c.currency || "NGN",
    billing: c.billing,
    payMode: c.payMode,
    payDay: c.payDay ? String(c.payDay) : "",
    startDate: c.startDate,
    endDate: c.endDate,
    leadId: c.leadId ? String(c.leadId) : "",
    pointId: c.pointId ? String(c.pointId) : "",
    nextDeliverable: c.nextDeliverable,
    nextDate: c.nextDate,
    contactName: c.contactName,
    contactRole: c.contactRole,
    email: c.email,
    phone: c.phone,
    drive: c.links?.drive ?? "",
    portal: c.links?.portal ?? "",
    contract: c.links?.contract ?? "",
    notes: c.notes,
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
  const people: [string, string][] = [["", "None"], ...w.people.map((p) => [String(p.id), p.name] as [string, string])];
  const links = [
    ["Drive", c.links?.drive],
    ["Portal", c.links?.portal],
    ["Agreement", c.links?.contract],
  ].filter(([, u]) => u) as [string, string][];
  return (
    <Panel>
      {links.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {links.map(([l, u]) => (
            <a key={l} href={u} target="_blank" rel="noopener noreferrer" className={cn(btn.base, btn.plain, btn.sm)}>
              <ExternalLink className="size-3.5" aria-hidden /> {l}
            </a>
          ))}
        </div>
      )}
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const { drive, portal, contract, ...rest } = d;
          run(() => saveClient(c.id, { ...rest, links: { drive, portal, contract } }));
        }}
      >
        <Field label="Name">
          <input required className={fieldClass} {...bind("name")} />
        </Field>
        {sel("service", "Service", SERVICES.map((s) => [s, s]))}
        {sel("status", "Status", CLIENT_STATUS)}
        {sel("health", "Health", HEALTH)}
        {seesMoney && (
          <>
            <Field label="Fee">
              <input type="number" min={0} className={fieldClass} {...bind("fee")} />
            </Field>
            {sel("currency", "Currency", CURRENCIES.map((x) => [x, x]))}
          </>
        )}
        {sel("billing", "Billing", [
          ["monthly", "Monthly retainer"],
          ["project", "Project fee"],
        ])}
        {sel("payMode", "How they pay", [
          ["invoice", "We send an invoice"],
          ["auto", "Automatic payment, no invoice"],
        ])}
        {d.payMode === "auto" && (
          <Field label="Day of the month they pay">
            <input type="number" min={1} max={28} className={fieldClass} {...bind("payDay")} />
          </Field>
        )}
        <Field label="Started">
          <input type="date" className={fieldClass} {...bind("startDate")} />
        </Field>
        <Field label="Contract ends or renews">
          <input type="date" className={fieldClass} {...bind("endDate")} />
        </Field>
        {sel("leadId", "Lead", people)}
        {sel("pointId", "Point guard", people)}
        <Field label="Next deliverable">
          <input className={fieldClass} {...bind("nextDeliverable")} />
        </Field>
        <Field label="Due">
          <input type="date" className={fieldClass} {...bind("nextDate")} />
        </Field>
        <Field label="Main contact">
          <input className={fieldClass} {...bind("contactName")} />
        </Field>
        <Field label="Their role">
          <input className={fieldClass} {...bind("contactRole")} />
        </Field>
        <Field label="Email">
          <input type="email" className={fieldClass} {...bind("email")} />
        </Field>
        <Field label="Phone">
          <input className={fieldClass} {...bind("phone")} />
        </Field>
        <Field label="Drive folder">
          <input type="url" className={fieldClass} {...bind("drive")} />
        </Field>
        <Field label="Studio Desk portal">
          <input type="url" className={fieldClass} {...bind("portal")} />
        </Field>
        <Field label="Signed agreement">
          <input type="url" className={fieldClass} {...bind("contract")} />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Notes">
            <textarea rows={4} className={fieldClass} {...bind("notes")} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary)}>
            Save
          </button>
          <span className="flex-1" />
          <Button
            tone="ghost"
            className="text-pink"
            disabled={pending}
            onClick={() => window.confirm(`Delete ${c.name}? This can't be undone.`) && run(() => removeClient(c.id)).then((ok) => ok && router.push("/admin/clients"))}
          >
            Delete
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function OnboardingTab({ client: c, owner, w, doneIds }: DetailProps & { doneIds: ReadonlySet<string> }) {
  const { run, pending } = useRun();
  if (!c.onb)
    return (
      <Panel>
        <EmptyNote title={`No onboarding checklist for ${c.name}.`}>Start one from your template. Steps are ticked off here, then the client comes to Jane for sign-off.</EmptyNote>
        <div className="mt-3 flex justify-center gap-2">
          <Button tone="primary" disabled={pending} onClick={() => run(() => startOnboarding(c.id, true))}>
            Start with tasks
          </Button>
          <Button disabled={pending} onClick={() => run(() => startOnboarding(c.id, false))}>
            Checklist only
          </Button>
        </div>
      </Panel>
    );
  const onb = c.onb;
  const done = onb.steps.filter((s) => stepDone(s, doneIds)).length;
  const all = done === onb.steps.length;
  const [statusLabel, tone] = ONB_STATUS[onb.status];
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Pill tone={tone}>{statusLabel}</Pill>
        <span className="text-sm text-slate">
          {done} of {onb.steps.length} done
        </span>
        <span className="min-w-[120px] flex-1">
          <Bar pct={(done / Math.max(1, onb.steps.length)) * 100} tone="ok" label="Onboarding progress" />
        </span>
      </div>
      {onb.status === "changes" && onb.note && <p className="mb-3 rounded-2xl bg-[#fbe3e5] p-3 text-sm">Jane: {onb.note}</p>}
      {onb.status === "approved" && <p className="mb-3 text-sm text-slate">Signed off{onb.approvedAt ? ` on ${onb.approvedAt.slice(0, 10)}` : ""}.</p>}
      <ul className="grid gap-1.5">
        {onb.steps.map((s, i) => {
          const viaTask = Boolean(s.taskId && doneIds.has(s.taskId));
          return (
            <li key={i} className="flex items-center gap-2.5">
              <input
                type="checkbox"
                checked={stepDone(s, doneIds)}
                disabled={viaTask || pending || onb.status === "approved"}
                title={viaTask ? "Done through its task" : undefined}
                onChange={(e) => run(() => tickStep(c.id, i, e.target.checked))}
                aria-label={s.t}
                className="size-4 accent-pink"
              />
              <span className="flex-1 text-sm">{s.t}</span>
              <span className="text-xs text-slate">{s.who === "point" ? "Point guard" : "Lead"}</span>
              {c.startDate && <DueChip due={addDays(c.startDate, s.day)} today={w.today} done={stepDone(s, doneIds)} />}
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
        {owner && onb.status === "submitted" ? (
          <>
            <Button
              disabled={pending}
              onClick={() => {
                const note = window.prompt("What still needs doing?");
                if (note) run(() => sendBackOnboarding(c.id, note));
              }}
            >
              Send back
            </Button>
            <Button tone="primary" disabled={pending} onClick={() => run(() => approveOnboarding(c.id))}>
              Approve and make active
            </Button>
          </>
        ) : onb.status !== "approved" ? (
          <>
            <span className="flex-1 text-sm text-slate">{all ? "Every step is done." : "Tick each step as it happens."}</span>
            <Button tone="primary" disabled={!all || onb.status === "submitted" || pending} onClick={() => run(() => submitOnboarding(c.id))}>
              {onb.status === "submitted" ? "Waiting for Jane" : "Send to Jane for sign-off"}
            </Button>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <p className="text-sm text-slate">Nothing logged yet.</p>;
  return (
    <ol className="grid gap-2.5">
      {entries.map((e) => (
        <li key={e.id} className="border-l-2 border-pink/40 pl-3">
          <p className="text-sm">{e.text}</p>
          <p className="text-xs text-slate">
            {e.actor.split(" ")[0] || "HQ"}, {new Date(e.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Updates({ id, timeline }: { id: string; timeline: TimelineEntry[] }) {
  const { run, pending } = useRun();
  const [t, setT] = useState("");
  const [type, setType] = useState("update");
  return (
    <Panel>
      <form className="mb-4 grid gap-2" onSubmit={(e) => (e.preventDefault(), run(() => logClientUpdate(id, type, t)).then((ok) => ok && setT("")))}>
        <textarea rows={3} value={t} onChange={(e) => setT(e.target.value)} placeholder="What happened? Meeting notes, approvals, feedback, decisions." aria-label="Update" className={fieldClass} />
        <div className="flex gap-2">
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={cn(fieldClass, "w-auto")}>
            {[
              ["update", "Update"],
              ["meeting", "Meeting"],
              ["call", "Call"],
              ["email", "Email"],
              ["whatsapp", "WhatsApp"],
            ].map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button type="submit" disabled={pending || !t.trim()} className={cn(btn.base, btn.primary)}>
            Log it
          </button>
        </div>
      </form>
      <Timeline entries={timeline} />
    </Panel>
  );
}
