"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { hoursSince } from "@/lib/desk/model";
import { resendMail } from "@/app/admin/actions";
import { useDesk } from "./desk";
import { ago } from "./ui";

const STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: "Sent", tone: "bg-aqua text-ink" },
  failed: { label: "Failed", tone: "bg-pink text-white" },
  skipped: { label: "Not sent", tone: "bg-paper text-slate" },
};

const FILTERS = [
  ["", "All"],
  ["sent", "Sent"],
  ["failed", "Failed"],
  ["skipped", "Not sent"],
] as const;

const WEEK_HOURS = 24 * 7;

function MailPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "bg-paper" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", s.tone)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export function MailView() {
  const { data, mail, run, pending } = useDesk();
  const { mails, leads } = data;
  const [filter, setFilter] = useState<string>("");
  const names = new Map(leads.map((l) => [l.id, l.name]));
  const week = mails.filter((m) => hoursSince(m.at) <= WEEK_HOURS);
  const count = (list: typeof mails, status: string) => list.filter((m) => m.status === status).length;
  const shown = filter ? mails.filter((m) => m.status === filter) : mails;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Sent emails</h1>
        <span className="text-sm text-slate">Every email the website sends, newest first</span>
      </div>

      <p
        className={cn(
          "mb-5 rounded-[16px] border-2 border-ink px-4 py-3 text-sm",
          mail.configured ? "bg-white" : "bg-pink-soft font-semibold",
        )}
      >
        {mail.configured
          ? `Sending from ${mail.from} through MangoMail.`
          : "Email isn't set up on this server, so the checklist isn't being emailed. Add the SMTP settings to the host's environment and redeploy."}
      </p>

      <dl className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(
          [
            ["Sent this week", count(week, "sent"), "bg-white"],
            ["Failed this week", count(week, "failed"), count(week, "failed") ? "bg-pink text-white" : "bg-white"],
            ["Not sent this week", count(week, "skipped"), "bg-white"],
            ["All time", mails.length, "bg-paper"],
          ] as const
        ).map(([label, n, tone]) => (
          <div key={label} className={cn("rounded-[18px] border-2 border-ink px-4 py-3", tone)}>
            <dt className="text-xs font-bold tracking-[0.08em] uppercase opacity-70">{label}</dt>
            <dd className="font-display mt-1 text-3xl font-bold">{n}</dd>
          </div>
        ))}
      </dl>

      <div role="group" aria-label="Filter by status" className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button
            key={label}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "rounded-full border-2 border-ink px-3.5 py-1 text-sm font-semibold",
              filter === value ? "bg-ink text-white" : "bg-white",
            )}
          >
            {label}
            <span className="ml-1.5 font-mono text-xs opacity-70">{value ? count(mails, value) : mails.length}</span>
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["To", "Email", "Status", "Details", "When", ""].map((h, i) => (
                  <th key={i} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id} className="border-b border-ink/10 align-top last:border-b-0">
                  <td className="px-3 py-3">
                    {m.leadId && names.get(m.leadId) && <b className="block font-semibold">{names.get(m.leadId)}</b>}
                    <a className="text-xs text-slate underline" href={`mailto:${m.to}`}>
                      {m.to}
                    </a>
                  </td>
                  <td className="px-3 py-3">{m.subject}</td>
                  <td className="px-3 py-3">
                    <MailPill status={m.status} />
                  </td>
                  <td className="max-w-[340px] px-3 py-3">
                    <small className={cn("break-words", m.status === "sent" ? "text-slate" : "text-ink")}>{m.detail}</small>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap" title={m.at}>
                    {ago(m.at)} ago
                  </td>
                  <td className="px-3 py-3">
                    {m.status !== "sent" && (
                      <button
                        type="button"
                        disabled={pending || !mail.configured}
                        className="text-xs font-semibold text-pink underline disabled:opacity-40"
                        onClick={() => run(() => resendMail(m.id))}
                      >
                        Send again
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-[24px] border-2 border-dashed border-ink/30 bg-white px-6 py-10 text-center">
          <h2 className="text-xl font-bold">{mails.length ? "Nothing with that status" : "No emails sent yet"}</h2>
          <p className="max-w-[56ch] text-slate">
            Each time someone takes the Launch Visibility Checklist, the email the website sends them is logged here.
          </p>
        </div>
      )}
    </>
  );
}
