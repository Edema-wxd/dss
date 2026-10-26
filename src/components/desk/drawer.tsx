"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  type ApplicationEdit,
  BANDS,
  EDIT_KEYS,
  ROUTES,
  SLOT_STATUSES,
  STATUSES,
  bandLabel,
  digits,
  monthName,
  monthOf,
  nowStamp,
  thisMonth,
} from "@/lib/desk/model";
import { clientStats, isSlot, monthStats } from "@/lib/desk/logic";
import { addApplication, removeApplication, saveApplication } from "@/app/admin/actions";
import { useDesk } from "./desk";
import { Button, Field, RouteTag, ago, copyText, fieldClass, useToast } from "./ui";

export type DrawerTarget = { kind: "edit"; id: string } | { kind: "new" };

const NEW_FIELDS = [
  ["name", "Name"],
  ["role", "Role"],
  ["company", "Company"],
  ["site", "Website or handle"],
  ["email", "Email"],
  ["whatsapp", "WhatsApp"],
  ["moment", "Next big moment"],
  ["when", "When"],
] as const;

export function AppDrawer({ target, onClose }: { target: DrawerTarget; onClose: () => void }) {
  const { data, team, user, run, pending } = useDesk();
  const toast = useToast();
  const a = target.kind === "edit" ? data.apps.find((x) => x.id === target.id) : undefined;

  const [form, setForm] = useState<ApplicationEdit>(() => {
    const f = {} as ApplicationEdit;
    for (const k of EDIT_KEYS) f[k] = a ? a[k] : "";
    if (!a) {
      f.status = "New";
      f.owner = team.includes(user.name) ? user.name : "";
    }
    return f;
  });
  const [extra, setExtra] = useState<Record<string, string>>({ budget: "800k-1.5m", route: "fit", source: "" });
  const set = (k: keyof ApplicationEdit) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (target.kind === "edit" && !a) return null;

  const ms = monthStats(data.apps, data.settings);
  const cs = clientStats(data.apps, data.settings);
  const countedAlready = a && isSlot(a) && monthOf(a.sessionDate) === thisMonth();
  const overSessions = SLOT_STATUSES.includes(form.status as never) && monthOf(form.sessionDate) === thisMonth() && !countedAlready && ms.remaining <= 0;
  const overPlaces = form.status === "Won" && a?.status !== "Won" && cs.left <= 0;

  const firstName = (a?.name ?? "").split(" ")[0];
  const bookingMsg = a
    ? `Hi ${firstName}, thank you for applying for a Visibility Session with Digital Savvy Studios. We've reviewed your application for ${a.company} and would love to book you in. Choose a time that suits you here: ${data.settings.booking_link ?? ""}`
    : "";
  const wa = a?.whatsapp ? `https://wa.me/${digits(a.whatsapp)}` : "";

  const save = async () => {
    const ok = a
      ? await run(() => saveApplication(a.id, a.version, form))
      : await run(() => addApplication({ ...extra, ...form }));
    if (ok) onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 border-l-2 border-ink bg-cream p-0 data-[side=right]:sm:max-w-[640px]">
        <div className="border-b-2 border-ink bg-white px-5 py-4 pr-14">
          <p className="text-[11px] font-bold tracking-[0.1em] text-slate uppercase">{a ? a.id : "Add by hand"}</p>
          <SheetTitle className="font-display text-xl font-bold">{a ? a.name : "New application"}</SheetTitle>
        </div>

        <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-5">
          {a ? (
            <>
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
                <Detail label="Company">
                  {a.company}
                  {a.site && ` · ${a.site}`}
                </Detail>
                <Detail label="Role">{a.role}</Detail>
                <Detail label="Email">
                  <a className="text-pink underline" href={`mailto:${a.email}`}>
                    {a.email}
                  </a>
                </Detail>
                <Detail label="WhatsApp">{a.whatsapp}</Detail>
                <Detail label="Next big moment">{[a.moment, a.when].filter(Boolean).join(", ")}</Detail>
                <Detail label="Monthly budget">
                  {bandLabel(a.budget)} <RouteTag route={a.route} />
                </Detail>
                <Detail label="Decides">{a.decider}</Detail>
                <Detail label="Source">{a.source}</Detail>
                {a.score !== "" && <Detail label="Look-up test">{a.score} of 5 passed</Detail>}
                <Detail label="Applied">
                  {a.submitted} ({ago(a.submitted)} ago)
                </Detail>
                <Detail label="Consent">{a.consent ? "Given" : "Not recorded"}</Detail>
              </dl>
              {a.worth && (
                <div>
                  <p className="mb-1.5 text-[11px] font-bold tracking-[0.1em] text-slate uppercase">In their words</p>
                  <p className="rounded-xl bg-paper px-3.5 py-3 text-sm whitespace-pre-wrap">{a.worth}</p>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {form.firstReply ? (
                  <span className="text-sm text-slate">First reply {form.firstReply}</span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => {
                      setForm((f) => ({ ...f, firstReply: nowStamp(), status: f.status === "New" ? "Qualified" : f.status }));
                      toast("Marked as replied. Save to keep it.");
                    }}
                  >
                    Mark replied now
                  </Button>
                )}
                <Button size="sm" onClick={() => copyText(bookingMsg, toast, "Booking message copied")}>
                  Copy booking message
                </Button>
                {wa && (
                  <a className="inline-flex min-h-8 items-center rounded-full border-2 border-ink bg-white px-3 text-[13px] font-semibold" href={wa} target="_blank" rel="noopener noreferrer">
                    Open WhatsApp
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {NEW_FIELDS.map(([k, label]) => (
                <Field key={k} label={label}>
                  <input className={fieldClass} value={extra[k] ?? ""} onChange={(e) => setExtra((x) => ({ ...x, [k]: e.target.value }))} type={k === "email" ? "email" : "text"} />
                </Field>
              ))}
              <Field label="Monthly budget">
                <select className={fieldClass} value={extra.budget} onChange={(e) => setExtra((x) => ({ ...x, budget: e.target.value }))}>
                  {BANDS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Route">
                <select className={fieldClass} value={extra.route} onChange={(e) => setExtra((x) => ({ ...x, route: e.target.value }))}>
                  {ROUTES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Source" full>
                <input className={fieldClass} placeholder="e.g. Moonshot, referral from Tola" value={extra.source} onChange={(e) => setExtra((x) => ({ ...x, source: e.target.value }))} />
              </Field>
            </div>
          )}

          {overPlaces && (
            <Warning>
              All client places are filled. Saving as Won takes you over the number you set. Add a place in Website settings first, or agree a later start date with the founder.
            </Warning>
          )}
          {overSessions && (
            <Warning>
              {monthName(thisMonth())} already has {ms.booked.length} of {ms.per} sessions booked. Saving goes over the limit. Consider Waitlist, or add a session in Website settings.
            </Warning>
          )}

          <section className="grid gap-3">
            <p className="text-[11px] font-bold tracking-[0.1em] text-slate uppercase">Progress</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status">
                <select className={fieldClass} value={form.status} onChange={set("status")}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Owner">
                <select className={fieldClass} value={form.owner} onChange={set("owner")}>
                  <option value="">Unassigned</option>
                  {team.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
              <Field label="Session date">
                <input type="date" className={fieldClass} value={form.sessionDate} onChange={set("sessionDate")} />
              </Field>
              <Field label="Session time">
                <input type="time" className={fieldClass} value={form.sessionTime} onChange={set("sessionTime")} />
              </Field>
              <Field label="Review link" full>
                <input type="url" className={fieldClass} placeholder="Link to the one-page review" value={form.reviewLink} onChange={set("reviewLink")} />
              </Field>
              <Field label="Outcome" full>
                <input className={fieldClass} placeholder="e.g. Proposed the 90-day Visibility Sprint" value={form.outcome} onChange={set("outcome")} />
              </Field>
              <Field label="Deal value per month (₦)">
                <input inputMode="numeric" className={fieldClass} value={digits(form.dealValue)} onChange={set("dealValue")} />
              </Field>
              <Field label="Follow-up date">
                <input type="date" className={fieldClass} value={form.followUp} onChange={set("followUp")} />
              </Field>
              <Field label="Notes" full>
                <textarea className={`${fieldClass} min-h-24 resize-y`} value={form.notes} onChange={set("notes")} />
              </Field>
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t-2 border-ink bg-white px-5 py-3">
          {a && (
            <Button
              size="sm"
              tone="ghost"
              className="text-pink"
              disabled={pending}
              onClick={async () => {
                if (!window.confirm(`Delete ${a.name}'s application? This can't be undone.`)) return;
                if (await run(() => removeApplication(a.id))) onClose();
              }}
            >
              Delete
            </Button>
          )}
          <span className="ml-auto" />
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={pending} onClick={save}>
            {pending ? "Saving…" : a ? "Save" : "Add application"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate">{label}</dt>
      <dd className="mb-1 [overflow-wrap:anywhere] sm:mb-0">{children || "Not given"}</dd>
    </>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border-2 border-orange bg-peach/60 px-3.5 py-3 text-sm text-[#7a3404]">{children}</p>;
}
