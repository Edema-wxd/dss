"use client";

import { useState } from "react";
import { Download, FileChartColumn, Plus } from "lucide-react";
import { fileReport, rebuildReport } from "@/app/admin/(hq)/reports/actions";
import { Button, Field, btn, fieldClass, useToast } from "@/components/desk/ui";
import { addMonth, monthName } from "@/lib/hq/finance-model";
import { REP_TYPES, type RepType, defaultReportMonth } from "@/lib/hq/report-model";
import type { ReportRow } from "@/lib/hq/reports";
import { cn } from "@/lib/utils";
import { Dialog, EmptyNote, Pill, useRun } from "./kit";

// The report archive, and the "Monthly report" button every dashboard carries.

const pdfHref = (type: string, m: string) => `/admin/reports/${type}_${m}/pdf`;
const shortD = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "");

/** Builds a report, files it when the person can, then downloads the slides. */
function ReportForm({ types, type, month, today, onDone }: { types: RepType[]; type?: string; month?: string; today: string; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState<string>(types.includes(type as RepType) ? (type as RepType) : types[0]);
  const [m, setM] = useState(month ?? defaultReportMonth(today));
  const months = Array.from({ length: 12 }, (_, i) => addMonth(today.slice(0, 7), -i));
  const submit = async () => {
    setBusy(true);
    const r = await fileReport(t, m);
    setBusy(false);
    if (!r.ok) return toast(r.error);
    toast(`${r.message} Building the slides…`);
    window.location.assign(pdfHref(t, m));
    onDone();
  };
  return (
    <form className="grid gap-3" onSubmit={(e) => (e.preventDefault(), submit())}>
      <p className="text-sm text-slate">Builds a slide deck from the month&apos;s numbers, files it in the Reports archive and downloads it as a PDF.</p>
      <Field label="Report">
        <select className={fieldClass} value={t} onChange={(e) => setT(e.target.value)}>
          {REP_TYPES.filter(([k]) => types.includes(k)).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Month">
        <select className={fieldClass} value={m} onChange={(e) => setM(e.target.value)}>
          {months.map((x) => (
            <option key={x} value={x}>
              {monthName(x)}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={busy} className={cn(btn.base, btn.primary, "justify-self-start")}>
        Save and download slides
      </button>
    </form>
  );
}

/** "Monthly report" on a dashboard. `types` are the reports this person can make. */
export function ReportButton({ type, month, types, today }: { type: RepType; month?: string; types: RepType[]; today: string }) {
  const [open, setOpen] = useState(false);
  if (!types.length) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <FileChartColumn className="size-4" aria-hidden /> Monthly report
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Monthly report">
        {open && <ReportForm types={types} type={type} month={month} today={today} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

export function ReportsView({ reports, types, today }: { reports: ReportRow[]; types: RepType[]; today: string }) {
  const { run, pending } = useRun();
  const [filter, setFilter] = useState<string>("");
  const [making, setMaking] = useState(false);
  const list = reports.filter((r) => !filter || r.type === filter);
  const months = [...new Set(list.map((r) => r.month))];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Report type" className="inline-flex flex-wrap gap-1 rounded-full border-2 border-ink bg-white p-0.5">
          {[["", "All"] as const, ...REP_TYPES.filter(([k]) => types.includes(k))].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("rounded-full px-3 py-1 text-sm font-semibold text-slate", filter === k && "bg-ink text-white")}>
              {l}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" onClick={() => setMaking(true)} className={cn(btn.base, btn.primary)}>
          <Plus className="size-4" aria-hidden /> Make a report
        </button>
      </div>
      {months.length ? (
        <div className="grid gap-4">
          {months.map((m) => {
            const here = list.filter((r) => r.month === m);
            return (
              <section key={m} className="rounded-[20px] border-2 border-ink bg-white p-4">
                <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
                  {monthName(m)} <Pill tone="rose">{here.length}</Pill>
                </h2>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {here.map((r) => (
                    <li key={r.id} className="grid gap-3 rounded-2xl bg-paper p-3">
                      <div>
                        <b>{REP_TYPES.find(([k]) => k === r.type)?.[1] ?? r.type}</b>
                        <span className="block text-xs text-slate">
                          {r.slideCount} slides · {r.auto ? "filed automatically" : `by ${r.byName.split(" ")[0] || "someone"}`} · {shortD(r.createdAt)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a href={pdfHref(r.type, r.month)} className={cn(btn.base, btn.sm, btn.primary)}>
                          <Download className="size-3.5" aria-hidden /> Slides PDF
                        </a>
                        <Button
                          size="sm"
                          tone="ghost"
                          title="Rebuild with today's data"
                          disabled={pending}
                          onClick={() => window.confirm("Rebuild this report? It will be replaced with today's numbers for that month.") && run(() => rebuildReport(r.type, r.month))}
                        >
                          Rebuild
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyNote title="No reports yet.">On the 1st of each month, last month&apos;s reports are filed here automatically. You can also make one now from any dashboard.</EmptyNote>
      )}
      <Dialog open={making} onClose={() => setMaking(false)} title="Monthly report">
        {making && <ReportForm types={types} type={filter || undefined} today={today} onDone={() => setMaking(false)} />}
      </Dialog>
    </>
  );
}
