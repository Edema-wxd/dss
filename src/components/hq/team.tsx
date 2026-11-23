"use client";

import { useActionState, useState } from "react";
import { addTeamMember, removeTeamMember, setTeamActive, setTeamPassword, setTeamRoles, syncSheet } from "@/app/savvy-hq/actions";
import type { DeskUser, TeamMember } from "@/lib/desk/auth";
import type { SyncStatus } from "@/lib/desk/sheets";
import { ROLES, ROLE_NOTES, type Role } from "@/lib/hq/access";
import { Button, Field, Panel, btn, fieldClass } from "@/components/desk/ui";
import { useRun } from "./kit";
import { cn } from "@/lib/utils";

type Props = {
  me: DeskUser;
  members: TeamMember[];
  canManage: boolean;
  canSync: boolean;
  sheet: { configured: boolean; url: string; last: SyncStatus };
};

function RolePicker({ value, onChange, name }: { value: Role[]; onChange?: (v: Role[]) => void; name?: string }) {
  return (
    <fieldset className="grid gap-1.5 sm:grid-cols-2">
      <legend className="mb-1 text-xs font-bold tracking-[0.04em] text-slate">Roles</legend>
      {ROLES.map((r) => (
        <label key={r} className="flex cursor-pointer items-start gap-2 rounded-xl border border-ink/15 bg-white p-2 text-sm has-checked:border-ink has-checked:bg-aqua/40">
          <input
            type="checkbox"
            name={name}
            value={r}
            checked={onChange ? value.includes(r) : undefined}
            defaultChecked={onChange ? undefined : value.includes(r)}
            onChange={onChange ? (e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r)) : undefined}
            className="mt-1 accent-pink"
          />
          <span>
            <b className="block font-semibold">{r}</b>
            <span className="text-xs text-slate">{ROLE_NOTES[r]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function MemberRow({ m, me, canManage }: { m: TeamMember; me: DeskUser; canManage: boolean }) {
  const { run, pending } = useRun();
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<Role[]>(m.roles);
  const [password, setPassword] = useState("");
  const isMe = m.id === me.id;

  return (
    <li className={cn("border-t border-ink/10 py-3 first:border-t-0", !m.active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-48 flex-1">
          <b className="block">
            {m.name}
            {isMe && <span className="ml-1.5 text-xs font-normal text-slate">(you)</span>}
          </b>
          <span className="text-xs break-words text-slate">{m.email}</span>
        </span>
        <span className="flex flex-1 flex-wrap justify-end gap-1">
          {m.roles.map((r) => (
            <span key={r} className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", r === "Owner" ? "bg-ink text-lime" : "bg-paper")}>
              {r}
            </span>
          ))}
          {!m.active && <span className="rounded-full bg-pink-soft px-2.5 py-0.5 text-xs font-semibold text-pink">Switched off</span>}
          {!m.hasPassword && <span className="rounded-full bg-peach px-2.5 py-0.5 text-xs font-semibold">No password yet</span>}
        </span>
        {canManage && (
          <Button size="sm" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Manage"}
          </Button>
        )}
      </div>

      {canManage && editing && (
        <div className="mt-3 grid gap-4 rounded-2xl bg-paper/60 p-3">
          <RolePicker value={roles} onChange={setRoles} />
          <div className="flex flex-wrap gap-2">
            <Button tone="primary" size="sm" disabled={pending || !roles.length} onClick={() => run(() => setTeamRoles(m.id, roles))}>
              Save roles
            </Button>
            {!roles.length && <span className="self-center text-xs text-pink">Pick at least one role.</span>}
          </div>

          <div className="grid gap-2 border-t border-ink/15 pt-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label={m.hasPassword ? "Set a new temporary password" : "Set their first password"} hint="At least 10 characters. They are signed out everywhere and use this next time.">
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" minLength={10} autoComplete="off" className={fieldClass} />
            </Field>
            <Button size="sm" disabled={pending || password.length < 10} onClick={() => run(() => setTeamPassword(m.id, password)).then((ok) => ok && setPassword(""))}>
              Set password
            </Button>
          </div>

          {!isMe && (
            <div className="flex flex-wrap gap-2 border-t border-ink/15 pt-3">
              <Button size="sm" disabled={pending} onClick={() => run(() => setTeamActive(m.id, !m.active))}>
                {m.active ? "Switch off access" : "Switch access back on"}
              </Button>
              <Button
                size="sm"
                tone="ghost"
                className="text-pink"
                disabled={pending}
                onClick={() => window.confirm(`Remove ${m.name}'s account? Their name stays on past activity.`) && run(() => removeTeamMember(m.id))}
              >
                Remove account
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AddMember() {
  const [state, add, adding] = useActionState(addTeamMember, null);
  return (
    <form action={add} className="mt-4 grid gap-3 border-t-2 border-ink pt-4 sm:grid-cols-2">
      <p className="font-semibold sm:col-span-2">Add someone to HQ</p>
      <Field label="Name">
        <input name="name" required className={fieldClass} autoComplete="off" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required className={fieldClass} autoComplete="off" />
      </Field>
      <Field label="Temporary password" hint="At least 10 characters. Share it with them privately." full>
        <input name="password" type="text" required minLength={10} className={fieldClass} autoComplete="off" />
      </Field>
      <div className="sm:col-span-2">
        <RolePicker value={["Contributor"]} name="roles" />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={adding} className={cn(btn.base, btn.primary)}>
          {adding ? "Adding…" : "Give access"}
        </button>
        {state && <span className={cn("text-sm", state.ok ? "text-ink" : "text-pink")}>{state.ok ? state.message : state.error}</span>}
      </div>
    </form>
  );
}

export function TeamView({ me, members, canManage, canSync, sheet }: Props) {
  const { run, pending } = useRun();
  const active = members.filter((m) => m.active).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Panel title="People" aside={`${active} with access${members.length > active ? `, ${members.length - active} switched off` : ""}`}>
        <ul>
          {members.map((m) => (
            <MemberRow key={m.id} m={m} me={me} canManage={canManage} />
          ))}
        </ul>
        {canManage ? <AddMember /> : <p className="mt-3 text-sm text-slate">Ask an owner to add people or change roles.</p>}
      </Panel>

      <div className="grid content-start gap-5">
        {canSync && (
          <Panel title="Google Sheet copy" aside={sheet.configured ? "On" : "Not set up"}>
            <p className="text-sm">
              Every change to Visibility Sessions is copied to the{" "}
              <a className="font-semibold text-pink underline" href={sheet.url} target="_blank" rel="noopener noreferrer">
                DSS Visibility Session Backend
              </a>{" "}
              sheet a few seconds later. HQ stays the original: edits made in the Sheet are overwritten on the next copy.
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
        )}

        <Panel title="How access works">
          <ul className="grid list-disc gap-2 pl-5 text-sm">
            <li>Everyone signs in at /savvy-hq/login with their own email and password.</li>
            <li>Roles decide which areas of HQ someone can open. Someone with two roles gets both sets of areas.</li>
            <li>The server checks the role on every page and every save, so hiding an area in the menu is never the only protection.</li>
            <li>Only an Owner can add people, change roles, set passwords or switch someone off. Switching someone off signs them out straight away.</li>
            <li>There is always at least one Owner, so the team can never be locked out.</li>
          </ul>
        </Panel>

        <Panel title="How the website connects">
          <ol className="grid list-decimal gap-2.5 pl-5 text-sm">
            <li>
              The database is Neon Postgres. Its connection string is the <code className="rounded bg-paper px-1">DATABASE_URL</code> environment
              variable, set in <code className="rounded bg-paper px-1">.env.local</code> locally and in the host&apos;s environment settings in
              production. It is never committed to the code.
            </li>
            <li>The tables are created and updated automatically the first time HQ or the website touches the database.</li>
            <li>
              The application form and the checklist pop-up post to <code className="rounded bg-paper px-1">/api/visibility</code>. Every
              submission lands in Visibility Sessions.
            </li>
            <li>Founders never see HQ. Everything under /savvy-hq needs an account.</li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}
