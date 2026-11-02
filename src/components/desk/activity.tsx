"use client";

import { useMemo, useState, useTransition } from "react";
import { type ActivityChange, type ActivityEntry, ACTIVITY_AREAS, areaOf } from "@/lib/desk/model";
import { olderActivity } from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import { useDesk } from "./desk";
import { Button, fieldClass, useToast } from "./ui";

const PAGE = 300; // matches ACTIVITY_PAGE on the server

const AREA_TONES: Record<string, string> = {
  application: "bg-pink-soft text-pink",
  lead: "bg-aqua text-navy",
  settings: "bg-peach text-[#8a3b06]",
  team: "bg-lime/60 text-ink",
  auth: "bg-paper text-slate",
  sheet: "bg-paper text-slate",
};
const areaName = (kind: string) => ACTIVITY_AREAS.find(([a]) => a === areaOf(kind))?.[1] ?? "Other";

/** Today's date in Lagos, "YYYY-MM-DD". */
const lagosDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);

function dayHeading(day: string) {
  if (day === lagosDay()) return "Today";
  if (day === lagosDay(new Date(Date.now() - 864e5))) return "Yesterday";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function since(ms: number) {
  const min = (Date.now() - ms) / 6e4;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

const shown = (v: string) => (v === "TRUE" ? "On" : v === "FALSE" ? "Off" : v);

export function ActivityView() {
  const { activity, data, open } = useDesk();
  const toast = useToast();
  const [older, setOlder] = useState<ActivityEntry[]>([]);
  const [more, setMore] = useState(activity.length >= PAGE);
  const [loading, startLoading] = useTransition();
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [area, setArea] = useState("");

  // the newest page refreshes with the desk; older pages are kept underneath it
  const all = useMemo(() => {
    const seen = new Set(activity.map((e) => e.id));
    return [...activity, ...older.filter((e) => !seen.has(e.id))];
  }, [activity, older]);

  const people = useMemo(() => [...new Set(all.map((e) => e.actor))].sort((a, b) => a.localeCompare(b)), [all]);
  const term = q.trim().toLowerCase();
  const list = all.filter((e) => {
    if (who && e.actor !== who) return false;
    if (area && areaOf(e.kind) !== area) return false;
    if (term && ![e.summary, e.actor, e.actorEmail, e.target, ...e.changes.flatMap((c) => [c.field, c.from, c.to])].join(" ").toLowerCase().includes(term))
      return false;
    return true;
  });

  const days: [string, ActivityEntry[]][] = [];
  for (const e of list) {
    const day = e.at.slice(0, 10);
    if (days.at(-1)?.[0] === day) days.at(-1)![1].push(e);
    else days.push([day, [e]]);
  }

  const loadOlder = () =>
    startLoading(async () => {
      try {
        const next = await olderActivity(all.at(-1)!.id);
        setOlder((o) => [...o, ...next]);
        setMore(next.length >= PAGE);
      } catch {
        toast("Couldn't load older activity. Check your connection and try again.");
      }
    });

  const chips: [string, string, number][] = [
    ["", "Everything", all.length],
    ...ACTIVITY_AREAS.map(([a, label]) => [a, label, all.filter((e) => areaOf(e.kind) === a).length] as [string, string, number]),
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.03em]">Activity log</h1>
          <p className="mt-1 text-sm text-slate">
            Who did what on the desk, and what arrived from the website, newest first. Times are Lagos time (WAT).
          </p>
        </div>
        <Button disabled={!list.length} onClick={() => downloadCsv(list)}>
          Download CSV
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search the activity log"
          placeholder="Search names, emails, changes"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={cn(fieldClass, "w-auto min-w-56 flex-1 rounded-full sm:flex-none")}
        />
        <select aria-label="Who" value={who} onChange={(e) => setWho(e.target.value)} className={cn(fieldClass, "w-auto rounded-full")}>
          <option value="">Anyone</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {chips.map(([v, label, n]) => (
          <button
            key={v || "all"}
            type="button"
            aria-pressed={area === v}
            onClick={() => setArea(v)}
            className="rounded-full border-2 border-ink/20 bg-white px-3 py-1 text-[13px] font-semibold text-slate aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
          >
            {label} <span className="font-mono">{n}</span>
          </button>
        ))}
      </div>

      {days.length ? (
        <div className="grid gap-5">
          {days.map(([day, entries]) => (
            <section key={day} className="rounded-[20px] border-2 border-ink bg-white">
              <h2 className="flex items-baseline justify-between gap-2 border-b-2 border-ink bg-paper px-4 py-2.5 first:rounded-t-[18px]">
                <span className="font-bold">{dayHeading(day)}</span>
                <span className="text-xs text-slate">
                  {entries.length} {entries.length === 1 ? "entry" : "entries"}
                </span>
              </h2>
              <ol>
                {entries.map((e) => {
                  const app = areaOf(e.kind) === "application" && e.kind !== "application.deleted" ? data.apps.find((a) => a.id === e.target) : undefined;
                  const failed = e.kind === "auth.signin_failed";
                  return (
                    <li key={e.id} className="grid gap-x-4 gap-y-1 border-b border-ink/10 px-4 py-3 last:border-b-0 sm:grid-cols-[88px_1fr]">
                      <time dateTime={new Date(e.ms).toISOString()} title={`${e.at} WAT, ${since(e.ms)}`} className="font-mono text-sm tabular-nums text-ink">
                        {e.at.slice(11)}
                        <span className="ml-2 font-sans text-xs text-slate sm:ml-0 sm:block">{since(e.ms)}</span>
                      </time>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold tracking-[0.06em] uppercase", failed ? "bg-pink text-white" : AREA_TONES[areaOf(e.kind)])}>
                            {areaName(e.kind)}
                          </span>
                          <span className={cn("font-semibold", failed && "text-pink")}>{e.summary}</span>
                          {app && (
                            <button type="button" className="text-xs font-semibold text-pink underline" onClick={() => open({ kind: "edit", id: app.id })}>
                              Open
                            </button>
                          )}
                        </div>
                        {e.changes.length > 0 && <Changes changes={e.changes} />}
                        <p className="mt-1 text-xs text-slate">
                          {e.actor}
                          {e.actorEmail && e.actorEmail !== e.actor && ` · ${e.actorEmail}`}
                          {e.target && areaOf(e.kind) === "application" && ` · ${e.target}`}
                          {e.ip && ` · from ${e.ip}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-[24px] border-2 border-dashed border-ink/30 bg-white px-6 py-10 text-center">
          <h2 className="text-xl font-bold">{all.length ? "Nothing matches" : "No activity yet"}</h2>
          <p className="max-w-[56ch] text-slate">
            {all.length
              ? "Try another filter or search."
              : "Sign-ins, edits to applications, leads, settings and the team, and every submission from the website will be listed here as they happen."}
          </p>
        </div>
      )}

      {more && all.length > 0 && (
        <div className="mt-5 flex justify-center">
          <Button disabled={loading} onClick={loadOlder}>
            {loading ? "Loading…" : "Show older activity"}
          </Button>
        </div>
      )}
    </>
  );
}

/** A change as one line of text: "old → new", just the value when it is context, or "old (cleared)". */
const changeText = (c: ActivityChange) =>
  c.from && c.to ? `${shown(c.from)} → ${shown(c.to)}` : c.to ? shown(c.to) : `${shown(c.from)} (cleared)`;

function Changes({ changes }: { changes: ActivityChange[] }) {
  return (
    <dl className="mt-1.5 grid gap-1 text-[13px]">
      {changes.map((c, i) => (
        <div key={i} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <dt className="font-semibold text-slate">{c.field}</dt>
          <dd className="min-w-0 break-words">
            {c.from && <span className="text-slate line-through decoration-ink/30">{shown(c.from)}</span>}
            {c.from && c.to && <span className="px-1.5 text-slate">→</span>}
            {c.to && <span>{shown(c.to)}</span>}
            {c.from && !c.to && <span className="ml-1.5 text-xs text-slate italic">cleared</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function downloadCsv(entries: ActivityEntry[]) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = [
    ["Time (WAT)", "Who", "Email", "Area", "What happened", "Changes", "Record", "IP address"],
    ...entries.map((e) => [
      e.at,
      e.actor,
      e.actorEmail,
      areaName(e.kind),
      e.summary,
      e.changes.map((c) => `${c.field}: ${changeText(c)}`).join("; "),
      e.target,
      e.ip,
    ]),
  ];
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `desk-activity-${lagosDay()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
