"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AUDIT_ACTIONS, type AuditEntry } from "@/lib/desk/model";
import { useDesk } from "./desk";
import { ago } from "./ui";

// the first part of an action key, so the filter can group them
const GROUPS = [
  ["", "All"],
  ["application", "Applications"],
  ["lead", "Leads"],
  ["settings", "Settings"],
  ["team", "Team"],
  ["auth", "Sign-ins"],
  ["mail", "Email"],
  ["sheet", "Sheet"],
] as const;

const TONE: Record<string, string> = {
  "auth.login_failed": "bg-pink text-white",
  "application.delete": "bg-pink-soft",
  "lead.delete": "bg-pink-soft",
  "team.remove": "bg-pink-soft",
  "settings.update": "bg-orange/30",
  "team.add": "bg-aqua",
};

function ActionPill({ action }: { action: string }) {
  return (
    <span className={cn("inline-flex rounded-full border border-ink/15 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", TONE[action] ?? "bg-paper")}>
      {AUDIT_ACTIONS[action as keyof typeof AUDIT_ACTIONS] ?? action}
    </span>
  );
}

const clip = (v: string) => (v.length > 80 ? `${v.slice(0, 80)}…` : v) || "(blank)";

function Changes({ changes }: { changes: AuditEntry["changes"] }) {
  const rows = Object.entries(changes ?? {});
  if (!rows.length) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-semibold text-slate">
        {rows.length} field{rows.length === 1 ? "" : "s"}
      </summary>
      <dl className="mt-1.5 grid gap-1 text-xs">
        {rows.map(([field, [before, after]]) => (
          <div key={field} className="grid gap-0.5">
            <dt className="font-mono text-slate">{field}</dt>
            <dd className="break-words">
              <s className="text-slate">{clip(before)}</s> → <b className="font-semibold">{clip(after)}</b>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function ActivityView() {
  const { data } = useDesk();
  const entries = data.audit;
  const [group, setGroup] = useState("");
  const [who, setWho] = useState("");
  const people = [...new Set(entries.map((e) => e.actor).filter(Boolean))].sort();
  const shown = entries.filter((e) => (!group || e.action.startsWith(`${group}.`)) && (!who || e.actor === who));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Activity</h1>
        <span className="text-sm text-slate">Everything done on the desk, newest first. Only admins see this.</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-2">
          {GROUPS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={group === value}
              onClick={() => setGroup(value)}
              className={cn(
                "rounded-full border-2 border-ink px-3.5 py-1 text-sm font-semibold",
                group === value ? "bg-ink text-white" : "bg-white",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by person"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          className="ml-auto rounded-full border-2 border-ink bg-white px-3 py-1 text-sm font-semibold"
        >
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {shown.length ? (
        <div className="overflow-x-auto rounded-[20px] border-2 border-ink bg-white">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="bg-paper text-left text-[11px] tracking-[0.08em] text-slate uppercase">
                {["When", "Who", "Action", "What"].map((h) => (
                  <th key={h} className="border-b-2 border-ink px-3 py-2.5 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-b border-ink/10 align-top last:border-b-0">
                  <td className="px-3 py-3 whitespace-nowrap" title={e.at}>
                    {ago(e.at)} ago
                    <small className="block text-xs text-slate">{e.at}</small>
                  </td>
                  <td className="px-3 py-3">
                    <b className="block font-semibold">{e.actor || "Unknown"}</b>
                    {e.actorEmail && <small className="text-xs text-slate">{e.actorEmail}</small>}
                  </td>
                  <td className="px-3 py-3">
                    <ActionPill action={e.action} />
                  </td>
                  <td className="max-w-[460px] px-3 py-3">
                    <span className="break-words">{e.summary}</span>
                    {e.target && e.target !== e.actorEmail && <small className="block font-mono text-xs text-slate">{e.target}</small>}
                    <Changes changes={e.changes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-[24px] border-2 border-dashed border-ink/30 bg-white px-6 py-10 text-center">
          <h2 className="text-xl font-bold">{entries.length ? "Nothing matches that filter" : "No activity yet"}</h2>
          <p className="max-w-[56ch] text-slate">
            Sign-ins, edits to applications and leads, settings changes, team changes and resent emails are all logged here.
          </p>
        </div>
      )}
    </>
  );
}
