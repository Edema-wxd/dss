"use client";

import { useState } from "react";
import { type EditableSetting, BANDS, STATUSES, STATUS_NOTES, SLOT_STATUSES, digits, monthName, thisMonth, toDateInput, truthy } from "@/lib/desk/model";
import { monthStats } from "@/lib/desk/logic";
import { saveSettings } from "@/app/admin/actions";
import { useDesk } from "./desk";
import { Button, Panel, StatusPill, Stepper, Toggle, fieldClass } from "./ui";

type Kind = "stepper" | "toggle" | "money" | "number" | "band" | "text" | "date";

const FIELDS: { k: EditableSetting; t: Kind; h: string; p: string }[] = [
  { k: "sessions_per_month", t: "stepper", h: "Complimentary sessions each month", p: "The website counts down from this number as you book founders." },
  { k: "applications_open", t: "toggle", h: "Applications open", p: "Turn off to close the form on the website, for example during a holiday." },
  { k: "waitlist_when_full", t: "toggle", h: "Offer a waitlist when full", p: "When every session is booked, the form invites founders to join next month's waitlist." },
  { k: "minimum_monthly_budget", t: "money", h: "Minimum monthly budget (₦)", p: "Below this, applicants see the \"you're a little early\" message." },
  { k: "priority_from_band", t: "band", h: "Priority from this budget band", p: "Applications from this band upwards are flagged as priority and get a personal reply from Janefrances." },
  { k: "session_value", t: "money", h: "Review value shown (₦)", p: "The value the website shows crossed out next to \"free\"." },
  { k: "reply_promise_hours", t: "number", h: "Reply promise (hours)", p: "Applications older than this without a reply are flagged on the Overview." },
  { k: "booking_link", t: "text", h: "Booking link", p: "The link sent to qualified founders to choose a time." },
  { k: "whatsapp_number", t: "text", h: "WhatsApp number", p: "International format without the plus sign, for example 2348012345678." },
  { k: "client_slots_total", t: "stepper", h: "Client places this period", p: "How many new clients you're open to onboarding. Separate from the free sessions. Each founder marked Won fills one." },
  { k: "client_period_start", t: "date", h: "Client period started", p: "Move this forward when you reset the client places, for example at the start of each quarter." },
  { k: "clients_won_other_routes", t: "number", h: "Clients onboarded another way", p: "Referrals or existing contacts who took a place without a session." },
];

export function SettingsView() {
  const { data, run, pending } = useDesk();
  const s = data.settings;
  const ms = monthStats(data.apps, s);
  const [form, setForm] = useState<Record<EditableSetting, string>>(() => {
    const f = {} as Record<EditableSetting, string>;
    for (const { k, t } of FIELDS) f[k] = t === "date" ? toDateInput(s[k] ?? "") : t === "money" ? digits(s[k]) : (s[k] ?? "");
    return f;
  });
  const set = (k: EditableSetting, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = FIELDS.some(({ k, t }) => form[k] !== (t === "date" ? toDateInput(s[k] ?? "") : t === "money" ? digits(s[k]) : (s[k] ?? "")));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">Website settings</h1>
          <p className="mt-1 text-sm text-slate">The Visibility Session page reads these live. Changes show on the site straight away.</p>
        </div>
        <Button tone="primary" disabled={pending || !dirty} onClick={() => run(() => saveSettings(form))}>
          {pending ? "Saving…" : dirty ? "Save settings" : "All saved"}
        </Button>
      </div>
      <p className="mb-5 rounded-2xl bg-aqua px-4 py-3 text-sm">
        <b>The website currently says:</b> {s.site_seats_line}. {ms.booked.length} of {ms.per} sessions in {monthName(thisMonth())} are booked.{" "}
        <b>Client places:</b> {s.site_clients_line}.
      </p>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
        {FIELDS.map((f) => (
          <div key={f.k} className="grid content-start gap-2 rounded-[18px] border-2 border-ink bg-white p-4">
            <h3 className="text-base font-bold">{f.h}</h3>
            <p className="text-[13px] text-slate">{f.p}</p>
            {f.t === "stepper" && <Stepper label={f.h} value={Number(form[f.k]) || 0} onChange={(n) => set(f.k, String(n))} />}
            {f.t === "toggle" && <Toggle checked={truthy(form[f.k])} onChange={(v) => set(f.k, v ? "TRUE" : "FALSE")} label={truthy(form[f.k]) ? "On" : "Off"} />}
            {f.t === "band" && (
              <select aria-label={f.h} className={fieldClass} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)}>
                {BANDS.slice(1, 5).map(([b, l]) => (
                  <option key={b} value={b}>
                    {l}
                  </option>
                ))}
              </select>
            )}
            {f.t === "date" && <input aria-label={f.h} type="date" className={fieldClass} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} />}
            {(f.t === "money" || f.t === "number") && (
              <input
                aria-label={f.h}
                inputMode="numeric"
                className={fieldClass}
                value={f.t === "money" ? Number(form[f.k] || 0).toLocaleString("en-NG") : form[f.k]}
                onChange={(e) => set(f.k, digits(e.target.value))}
              />
            )}
            {f.t === "text" && <input aria-label={f.h} className={fieldClass} value={form[f.k]} onChange={(e) => set(f.k, e.target.value)} />}
          </div>
        ))}
      </div>

      <Panel title="What each status means" aside="Statuses that use a slot count towards the month's sessions" className="mt-5">
        <table className="w-full text-sm">
          <tbody>
            {STATUSES.map((st) => (
              <tr key={st} className="border-b border-ink/10 last:border-b-0">
                <td className="w-40 py-2.5 pr-3">
                  <StatusPill status={st} />
                </td>
                <td className="py-2.5">{STATUS_NOTES[st]}</td>
                <td className="w-24 py-2.5 text-right text-xs text-slate">{SLOT_STATUSES.includes(st) ? "Uses a slot" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
