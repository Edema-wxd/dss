"use client";

import { useActionState } from "react";
import { addTeamMember, removeTeamMember, syncSheet } from "@/app/admin/actions";
import { useDesk } from "./desk";
import { Button, Field, Panel, btn, fieldClass } from "./ui";
import { cn } from "@/lib/utils";

export function TeamView() {
  const { user, users, sheet, run, pending } = useDesk();
  const [state, add, adding] = useActionState(addTeamMember, null);
  const isAdmin = user.role === "admin";

  return (
    <>
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">Team and setup</h1>
        <p className="mt-1 text-sm text-slate">Who can open the desk, and how the website talks to it.</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="People with access" aside={`${users.length} account${users.length === 1 ? "" : "s"}`}>
          <ul>
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/10 py-2.5 first:border-t-0">
                <span className="min-w-0 flex-1">
                  <b className="block">
                    {u.name}
                    {u.id === user.id && <span className="ml-1.5 text-xs font-normal text-slate">(you)</span>}
                  </b>
                  <span className="text-xs text-slate">{u.email}</span>
                </span>
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-xs font-semibold capitalize">{u.role}</span>
                {isAdmin && u.id !== user.id && (
                  <Button size="sm" tone="ghost" className="text-pink" disabled={pending} onClick={() => window.confirm(`Remove ${u.name}'s access?`) && run(() => removeTeamMember(u.id))}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <form action={add} className="mt-4 grid gap-3 border-t-2 border-ink pt-4 sm:grid-cols-2">
              <p className="font-semibold sm:col-span-2">Add someone, for example your EA, VA or developer</p>
              <Field label="Name">
                <input name="name" required className={fieldClass} autoComplete="off" />
              </Field>
              <Field label="Email">
                <input name="email" type="email" required className={fieldClass} autoComplete="off" />
              </Field>
              <Field label="Temporary password" hint="At least 10 characters. Share it with them privately.">
                <input name="password" type="text" required minLength={10} className={fieldClass} autoComplete="off" />
              </Field>
              <Field label="Access">
                <select name="role" className={fieldClass} defaultValue="team">
                  <option value="team">Team: manage applications and settings</option>
                  <option value="admin">Admin: also add and remove people</option>
                </select>
              </Field>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <button type="submit" disabled={adding} className={cn(btn.base, btn.primary)}>
                  {adding ? "Adding…" : "Give access"}
                </button>
                {state && <span className={cn("text-sm", state.ok ? "text-ink" : "text-pink")}>{state.ok ? state.message : state.error}</span>}
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-slate">Ask an admin to add or remove people.</p>
          )}
        </Panel>

        <Panel title="Google Sheet copy" aside={sheet.configured ? "On" : "Not set up"}>
          <p className="text-sm">
            Every change on the desk and every submission from the website is copied to the{" "}
            <a className="font-semibold text-pink underline" href={sheet.url} target="_blank" rel="noopener noreferrer">
              DSS Visibility Session Backend
            </a>{" "}
            sheet a few seconds later. The desk stays the original: edits made in the Sheet are overwritten on the next copy, so make changes here.
          </p>
          {sheet.configured ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={pending} onClick={() => run(syncSheet)}>
                Copy everything to the Sheet now
              </Button>
              {sheet.last ? (
                <span className={cn("text-sm", sheet.last.ok ? "text-slate" : "font-medium text-pink")}>
                  {sheet.last.ok ? "Last copied" : "Last copy failed"}{" "}
                  {new Date(sheet.last.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: {sheet.last.detail}
                </span>
              ) : (
                <span className="text-sm text-slate">Not copied yet.</span>
              )}
            </div>
          ) : (
            <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm">
              <li>In Google Cloud, create a service account, turn on the Google Sheets API, and download a JSON key.</li>
              <li>Share the Sheet with the service account&apos;s email address as an Editor.</li>
              <li>
                Add <code className="rounded bg-paper px-1">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and{" "}
                <code className="rounded bg-paper px-1">GOOGLE_PRIVATE_KEY</code> (the <code className="rounded bg-paper px-1">private_key</code> from the
                JSON) to <code className="rounded bg-paper px-1">.env.local</code> and the host&apos;s environment settings, then redeploy.
              </li>
            </ol>
          )}
        </Panel>

        <Panel title="How the website connects">
          <ol className="grid list-decimal gap-2.5 pl-5 text-sm">
            <li>
              The database is Neon Postgres. Its connection string is the <code className="rounded bg-paper px-1">DATABASE_URL</code> environment
              variable, set in <code className="rounded bg-paper px-1">.env.local</code> locally and in the host&apos;s environment settings in
              production. It is never committed to the code.
            </li>
            <li>The tables are created automatically the first time the desk or the website touches the database.</li>
            <li>
              The application form and the checklist pop-up post to <code className="rounded bg-paper px-1">/api/visibility</code>. Every
              submission lands on this desk.
            </li>
            <li>
              The website reads the live session count, the waitlist switch and the booking link from a GET to the same address. Only public
              settings are returned.
            </li>
            <li>Founders never see the desk. Everything under /admin needs a desk account.</li>
          </ol>
        </Panel>
      </div>
    </>
  );
}
