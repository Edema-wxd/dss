"use client";

import { useActionState } from "react";
import { login, setupFirstUser } from "@/app/admin/actions";
import { cn } from "@/lib/utils";
import { Field, btn, fieldClass } from "./ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="grid gap-4">
      <p className="text-slate">Sign in to manage Visibility Session applications, slots and website settings.</p>
      <Field label="Email">
        <input name="email" type="email" required autoComplete="username" className={fieldClass} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className={fieldClass} />
      </Field>
      {state && !state.ok && (
        <p role="alert" className="text-sm font-medium text-pink">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "min-h-11")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useActionState(setupFirstUser, null);
  return (
    <form action={action} className="grid gap-4">
      <p className="text-slate">
        No one has a desk account yet. Create the first one. It becomes the admin account, which can add your EA, VA and developer later.
      </p>
      <Field label="Your name">
        <input name="name" required autoComplete="name" className={fieldClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required autoComplete="username" className={fieldClass} />
      </Field>
      <Field label="Password" hint="At least 10 characters.">
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className={fieldClass} />
      </Field>
      {state && !state.ok && (
        <p role="alert" className="text-sm font-medium text-pink">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={cn(btn.base, btn.primary, "min-h-11")}>
        {pending ? "Creating…" : "Create the admin account"}
      </button>
    </form>
  );
}
