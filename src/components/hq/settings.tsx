"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { saveGoals, saveProfile } from "@/app/savvy-hq/(hq)/settings/actions";
import { Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import type { GeneralSettings, Person, Workday } from "@/lib/hq/data";
import { cn } from "@/lib/utils";
import type { InvoiceSettings } from "@/lib/hq/invoice-model";
import { InvoiceDetails } from "./invoice-settings";
import { Pill, useRun } from "./kit";

type Props = {
  me: Person;
  canEditGoals: boolean;
  owner: boolean;
  general: GeneralSettings;
  workday: Workday;
  backupDays: number | null;
  invoice: InvoiceSettings | null;
};

function useForm<T extends Record<string, string>>(initial: T) {
  const [d, setD] = useState(initial);
  const bind = (k: keyof T) => ({ value: d[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value })) });
  return { d, bind };
}

export function SettingsView({ me, canEditGoals, owner, general, workday, backupDays, invoice }: Props) {
  const { run, pending } = useRun();
  const profile = useForm({
    name: me.name,
    title: me.title,
    hours: String(me.hours ?? 6),
    whatsapp: me.whatsapp,
    notifyEmail: me.notifyEmail || me.email,
    notifyMode: me.notifyMode || "instant",
  });
  const goals = useForm({
    monthlyGoal: String(general.monthlyGoal ?? 20000000),
    annualGoal: String(general.annualGoal ?? 240000000),
    fxUSD: String(general.fx?.USD ?? ""),
    fxGBP: String(general.fx?.GBP ?? ""),
    fxEUR: String(general.fx?.EUR ?? ""),
    fxCAD: String(general.fx?.CAD ?? ""),
    studioDesk: general.studioDesk ?? "",
    start: workday.start,
    end: workday.end,
    fullHours: String(workday.fullHours),
    halfHours: String(workday.halfHours),
    grace: String(workday.grace),
  });

  return (
    <div className="grid gap-4">
      {owner && (
        <Panel className={cn(backupDays === null || backupDays > 30 ? "border-pink" : "")}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">Monthly backup</h2>
              <p className="text-sm text-slate">
                Download everything in HQ as one file and keep it in Google Drive. Passwords are never included.{" "}
                {backupDays === null ? "No backup yet." : `Last backup ${backupDays === 0 ? "today" : `${backupDays} day${backupDays === 1 ? "" : "s"} ago`}.`}
              </p>
            </div>
            {(backupDays === null || backupDays > 30) && <Pill tone="rose">Due</Pill>}
            <a href="/savvy-hq/settings/backup" download className={cn(btn.base, btn.primary)}>
              <Download className="size-4" aria-hidden /> Download a backup
            </a>
          </div>
        </Panel>
      )}

      <Panel>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveProfile(profile.d));
          }}
        >
          <h2 className="text-lg font-bold sm:col-span-2">Your profile</h2>
          <Field label="Name">
            <input required className={fieldClass} {...profile.bind("name")} />
          </Field>
          <Field label="Title">
            <input className={fieldClass} {...profile.bind("title")} />
          </Field>
          <Field label="Email for HQ notifications">
            <input type="email" className={fieldClass} {...profile.bind("notifyEmail")} />
          </Field>
          <Field label="Email me">
            <select className={fieldClass} {...profile.bind("notifyMode")}>
              <option value="instant">Every update, plus a morning summary</option>
              <option value="digest">Only the morning summary</option>
              <option value="off">Nothing, I&apos;ll check HQ</option>
            </select>
          </Field>
          <Field label="Focused hours you can give in a day" hint="Today's load bar measures your plan against this.">
            <input type="number" min={1} max={12} className={fieldClass} {...profile.bind("hours")} />
          </Field>
          <Field label="WhatsApp number">
            <input inputMode="tel" className={fieldClass} {...profile.bind("whatsapp")} />
          </Field>
          <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
            Save profile
          </button>
        </form>
      </Panel>

      {canEditGoals && (
        <Panel>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => saveGoals(goals.d));
            }}
          >
            <div className="sm:col-span-2">
              <h2 className="text-lg font-bold">Goals, exchange rates and working hours</h2>
              <p className="text-sm text-slate">The goals feed the Command centre. Foreign currency counts toward them once its rate is set. Working hours set lateness and full or half days in Attendance.</p>
            </div>
            <Field label="Monthly revenue goal (₦)">
              <input type="number" min={0} className={fieldClass} {...goals.bind("monthlyGoal")} />
            </Field>
            <Field label="Annual revenue goal (₦)">
              <input type="number" min={0} className={fieldClass} {...goals.bind("annualGoal")} />
            </Field>
            {(["USD", "GBP", "EUR", "CAD"] as const).map((c) => (
              <Field key={c} label={`₦ per 1 ${c}`}>
                <input type="number" min={0} step="any" placeholder="Today's rate" className={fieldClass} {...goals.bind(`fx${c}`)} />
              </Field>
            ))}
            <Field label="Workday starts">
              <input type="time" className={fieldClass} {...goals.bind("start")} />
            </Field>
            <Field label="Workday ends">
              <input type="time" className={fieldClass} {...goals.bind("end")} />
            </Field>
            <Field label="Hours worked for a full day">
              <input type="number" min={1} max={16} step="0.25" className={fieldClass} {...goals.bind("fullHours")} />
            </Field>
            <Field label="Hours worked for a half day">
              <input type="number" min={0.5} max={12} step="0.25" className={fieldClass} {...goals.bind("halfHours")} />
            </Field>
            <Field label="Minutes of grace before someone is late">
              <input type="number" min={0} max={120} className={fieldClass} {...goals.bind("grace")} />
            </Field>
            <Field label="Studio Desk link (client portal)">
              <input type="url" placeholder="https://" className={fieldClass} {...goals.bind("studioDesk")} />
            </Field>
            <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "justify-self-start")}>
              Save
            </button>
          </form>
        </Panel>
      )}
      {invoice && <InvoiceDetails s={invoice} />}
    </div>
  );
}
