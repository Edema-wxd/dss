// The words of the change alerts: what someone gets when another person gives them work or
// answers their request. Pure, so it can be tested. Never put money in an alert: these go out by
// email. The callers queue them with notify(), which skips you when you made the change.

export type Alert = { title: string; body: string; path: string };

const first = (name: string) => name.trim().split(" ")[0] || name;
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dueText = (due?: string | null) => (due ? `, due ${day(due)}` : "");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── Tasks ───────────────────────────────────────────────────────────── */

export const taskGiven = (by: string, t: { title: string; due?: string | null; notes?: string | null }): Alert => ({
  title: `New task: ${t.title}`,
  body: `${first(by)} gave you a task${dueText(t.due)}.${t.notes?.trim() ? `\n\n${t.notes.trim().slice(0, 600)}` : ""}`,
  path: "tasks",
});

export const taskPassed = (by: string, t: { title: string; due?: string | null }): Alert => ({
  title: `New task: ${t.title}`,
  body: `${first(by)} passed this task to you${dueText(t.due)}.`,
  path: "tasks",
});

/** Several tasks at once, such as an onboarding checklist. */
export const tasksGiven = (by: string, n: number, what: string): Alert => ({
  title: `${plural(n, "new task")} for ${what}`,
  body: `${first(by)} gave you ${plural(n, "task")} for ${what}. They're on your Tasks page with their due dates.`,
  path: "tasks",
});

/* ── Talent ──────────────────────────────────────────────────────────── */

export const dealHandedOver = (by: string, talent: string, brand: string, talentId: string | null): Alert => ({
  title: `You're now managing ${talent} x ${brand}`,
  body: `${first(by)} handed this brand conversation to you. Open the talent's brand tracker for the latest status.`,
  path: talentId ? `talent/${talentId}` : "talent",
});

/* ── Client onboarding ───────────────────────────────────────────────── */

export const onboardingSubmitted = (client: string, clientId: string): Alert => ({
  title: `${client} is ready for onboarding sign-off`,
  body: "Every onboarding step is done. Approve it or send it back in HQ.",
  path: `clients/${clientId}`,
});

export const onboardingApproved = (client: string, clientId: string): Alert => ({
  title: `${client} onboarding is signed off`,
  body: "The client is now active.",
  path: `clients/${clientId}`,
});

export const onboardingSentBack = (client: string, clientId: string, note: string): Alert => ({
  title: `${client} onboarding was sent back`,
  body: `The owner says: ${note}`,
  path: `clients/${clientId}`,
});

/* ── Team ────────────────────────────────────────────────────────────── */

export const accessGiven = (roles: string[]): Alert => ({
  title: "You have access to DSS HQ",
  body: `Your role${roles.length === 1 ? "" : "s"}: ${roles.join(", ")}. Sign in with the email this was sent to and the temporary password you were given, then open your Today page.`,
  path: "today",
});

/* ── KPI proposals ───────────────────────────────────────────────────── */

type KpiText = { title: string; unit: string; target: number; period: string };

/** A KPI's target in words, or none at all for a naira target, which stays out of email. */
export const kpiTarget = (k: KpiText, periodLabel: string, format: (unit: string, v: number) => string) =>
  k.unit === "naira" ? periodLabel : `${format(k.unit, k.target)} ${periodLabel}`;

export const kpiProposed = (by: string, k: KpiText, target: string, why: string): Alert => ({
  title: `${first(by)} proposed a KPI`,
  body: `${k.title}: ${target}. Why: ${why}`,
  path: "kpis",
});

export const kpiApproved = (title: string): Alert => ({ title: "Your KPI is approved", body: `${title} is now one of your KPIs.`, path: "kpis" });

export const kpiDeclined = (title: string, note: string): Alert => ({
  title: "Your KPI proposal was declined",
  body: `${title}. The owner says: ${note}`,
  path: "kpis",
});

export const kpiRevised = (title: string, target: string, note: string): Alert => ({
  title: "The owner set a different version of your KPI",
  body: `${title}: ${target}. The owner says: ${note}`,
  path: "kpis",
});
