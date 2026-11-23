import { type Page, expect, test } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_DATABASE_URL, E2E_LINK_SECRET } from "../playwright.config";
import { connect, disconnect } from "../src/lib/driver";
import { signAction } from "../src/lib/hq/tokens";

// One story, in order, on an empty database: the first owner signs up, adds two people with
// different roles, and each person can only open the areas their roles allow, even by typing
// the address directly. Everyone here is made up.

test.describe.configure({ mode: "serial" });

const OWNER = { name: "Ada Owner", email: "ada@example.test", password: "owner-pass-123" };
const STAFF = { name: "Bo Staff", email: "bo@example.test", password: "staff-pass-123" };
const CONTRACTOR = { name: "Cy Contractor", email: "cy@example.test", password: "contr-pass-123" };

async function signIn(page: Page, who: { email: string; password: string }) {
  await page.goto("/savvy-hq/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until HQ has opened. */
async function signedIn(page: Page, who: { email: string; password: string }) {
  await signIn(page, who);
  await expect(page).not.toHaveURL(/\/savvy-hq\/login$/);
}

async function signOut(page: Page) {
  await page.getByRole("complementary", { name: "DSS HQ navigation" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/savvy-hq\/login$/);
}

const sidebar = (page: Page) => page.getByRole("complementary", { name: "DSS HQ navigation" });

async function addPerson(page: Page, who: typeof STAFF, roles: string[]) {
  const form = page.locator("form").filter({ hasText: "Add someone to HQ" });
  await form.getByLabel("Name").fill(who.name);
  await form.getByLabel("Email").fill(who.email);
  await form.getByLabel("Temporary password").fill(who.password);
  // Contributor is ticked by default
  if (!roles.includes("Contributor")) await form.getByRole("checkbox", { name: /^Contributor/ }).uncheck();
  for (const r of roles) await form.getByRole("checkbox", { name: new RegExp(`^${r.replace(/[()]/g, "\\$&")}`) }).check();
  await form.getByRole("button", { name: "Give access" }).click();
  await expect(form.getByText(`${who.name} can now sign in`)).toBeVisible();
}

test("someone signed out is sent to the login page", async ({ page }) => {
  await page.goto("/savvy-hq/team");
  await expect(page).toHaveURL(/\/savvy-hq\/login$/);
});

test("the first account becomes an Owner and lands in HQ", async ({ page }) => {
  await page.goto("/savvy-hq/login");
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create the owner account" }).click();

  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  await expect(page.getByRole("heading", { name: /Ada\.$/, level: 1 })).toBeVisible();
  await expect(sidebar(page).getByRole("link")).toHaveText([
    "DSS HQDigital Savvy Studios",
    "Today",
    "Command centre",
    "Tasks",
    "Messages",
    "Attendance",
    "CRM",
    "Visibility Sessions",
    "Clients",
    "Contracts",
    "Talent",
    "Marketing",
    "Finance",
    "Invoices",
    "12-week plan",
    "KPIs",
    "Reports",
    "Team",
    "Procedures",
    "Activity",
    "Settings",
  ]);
  // the links sit under group headings
  await expect(sidebar(page).getByRole("group", { name: "Money" }).getByRole("link")).toHaveText(["Finance", "Invoices"]);
  await expect(sidebar(page).getByRole("group")).toHaveCount(6);
  await expect(sidebar(page).getByText("Owner", { exact: true })).toBeVisible();
});

test("the owner adds a staff member and a contractor", async ({ page }) => {
  await signedIn(page, OWNER);
  await sidebar(page).getByRole("link", { name: "Team" }).click();
  await expect(page.getByRole("heading", { name: "Team", level: 1 })).toBeVisible();
  await addPerson(page, STAFF, ["Contributor"]);
  await addPerson(page, CONTRACTOR, ["Contractor"]);
  await expect(page.getByText(CONTRACTOR.email)).toBeVisible();
});

test("a contractor keeps to their own areas, even by address", async ({ page }) => {
  await signedIn(page, CONTRACTOR);
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  for (const path of ["/session-desk", "/savvy-hq/team", "/savvy-hq/activity", "/savvy-hq/overview"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  }
  await expect(sidebar(page).getByRole("link")).toHaveText(["DSS HQDigital Savvy Studios", "Today", "Tasks", "Messages", "12-week plan", "KPIs", "Procedures", "Settings"]);
  // groups with nothing they can open, such as Money, are left out
  await expect(sidebar(page).getByRole("group", { name: "Money" })).toHaveCount(0);
});

test("a contributor gets Visibility Sessions and Team, but not Activity or team management", async ({ page }) => {
  await signedIn(page, STAFF);
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  await expect(sidebar(page).getByRole("link", { name: "Activity" })).toHaveCount(0);

  await page.goto("/savvy-hq/activity");
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);

  await page.goto("/savvy-hq/team");
  await expect(page.getByText("Ask an owner to add people or change roles.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage" })).toHaveCount(0);
  await signOut(page);
});

test("the Session Desk has its own sign-in, with the same account as HQ", async ({ page }) => {
  await page.goto("/session-desk");
  await expect(page).toHaveURL(/\/session-desk\/login$/);
  await expect(page.getByRole("heading", { name: "Session Desk", level: 1 })).toBeVisible();
  await page.getByLabel("Email").fill(STAFF.email);
  await page.getByLabel("Password").fill(STAFF.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/session-desk$/);
  await expect(page.getByRole("heading", { name: "Visibility Sessions", level: 1 })).toBeVisible();
  // the same session opens HQ, and HQ's sidebar leads back to the desk
  await page.getByRole("link", { name: "DSS HQ" }).click();
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  await sidebar(page).getByRole("link", { name: "Visibility Sessions" }).click();
  await expect(page).toHaveURL(/\/session-desk$/);
  // signing out of the desk comes back to the desk's sign-in
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/session-desk\/login$/);
});

test("old /admin addresses move to HQ and the Session Desk", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/tasks");
  await expect(page).toHaveURL(/\/savvy-hq\/tasks$/);
  await page.goto("/admin/sessions");
  await expect(page).toHaveURL(/\/session-desk$/);
});

test("the owner sees each change in Activity, and can switch someone off", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/activity");
  await expect(page.getByText(`Added ${CONTRACTOR.name} (${CONTRACTOR.email}) as Contractor`)).toBeVisible();
  await expect(page.getByText(`${OWNER.name} created the first HQ account`)).toBeVisible();

  await page.goto("/savvy-hq/team");
  const row = page.getByRole("listitem").filter({ hasText: CONTRACTOR.email });
  await row.getByRole("button", { name: "Manage" }).click();
  await row.getByRole("button", { name: "Switch off access" }).click();
  await expect(row.getByText("Switched off")).toBeVisible();
  await signOut(page);

  await signIn(page, CONTRACTOR);
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toContainText("don't match an HQ account that can sign in");
});

test("the owner can't remove the last Owner role", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/team");
  const row = page.getByRole("listitem").filter({ hasText: OWNER.email });
  await row.getByRole("button", { name: "Manage" }).click();
  await row.getByRole("checkbox", { name: /^Owner/ }).uncheck();
  await row.getByRole("checkbox", { name: /^Admin/ }).check();
  await row.getByRole("button", { name: "Save roles" }).click();
  await expect(page.getByText("Someone else needs to be an Owner first")).toBeVisible();
});

test("on a phone, the areas sit in a bottom bar with a menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signedIn(page, OWNER);
  await expect(sidebar(page)).toBeHidden();
  const quick = page.getByRole("navigation", { name: "Quick navigation" });
  await expect(quick.getByRole("link", { name: "Today" })).toBeVisible();
  await quick.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/savvy-hq\/activity$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

/* ── Phase 2: the working day ────────────────────────────────────────── */

test("the capture bar adds a dated, top-priority task", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.getByLabel("Capture a task").fill("Send the brief tomorrow!");
  await page.getByLabel("Capture a task").press("Enter");
  await expect(page.getByText("Captured, due tomorrow.")).toBeVisible();
  await page.goto("/savvy-hq/tasks");
  await page.getByRole("button", { name: "List" }).click();
  const row = page.locator("section").filter({ hasText: "This week" });
  await expect(row.getByText("Send the brief")).toBeVisible();
  await expect(row.getByText("Top", { exact: true })).toBeVisible();
});

test("the week view opens with seven days and moves between weeks", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/tasks");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByText(/^\d{1,2} [A-Z][a-z]{2} to \d{1,2} [A-Z][a-z]{2}$/)).toBeVisible();
  await expect(page.locator("section[aria-label]").filter({ has: page.getByRole("heading", { level: 2 }) })).toHaveCount(7);
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("button", { name: "This week" })).toBeVisible();
});

test("the owner gives a task to a team member", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("What needs doing?").fill("Review the deck");
  await dialog.getByLabel("Who").selectOption({ label: STAFF.name });
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added. Bo will see it on their Today.")).toBeVisible();
});

test("giving someone access or a task queues an email alert for them", async () => {
  const sql = connect(E2E_DATABASE_URL);
  const rows = (await sql.query(
    `select u.email, n.title from hq_notify n join desk_users u on u.id = n.to_id where n.title in ('You have access to DSS HQ', 'New task: Review the deck') order by u.email, n.title`,
  )) as { email: string; title: string }[];
  await disconnect();
  expect(rows).toEqual([
    { email: STAFF.email, title: "New task: Review the deck" },
    { email: STAFF.email, title: "You have access to DSS HQ" },
    { email: CONTRACTOR.email, title: "You have access to DSS HQ" },
  ]);
});

test("a day: choose three, tick one off, close it with a blocker", async ({ page }) => {
  await signedIn(page, STAFF);
  await expect(page.getByRole("heading", { name: /Choose three/ })).toBeVisible();
  await page.getByLabel("New task for today").fill("Call the printer");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("1/3 chosen")).toBeVisible();
  await page.getByRole("checkbox", { name: "Review the deck" }).check();
  await page.getByRole("button", { name: "Start my day" }).click();
  await expect(page.getByText("Do this first")).toBeVisible();

  const first = page.locator("section").filter({ hasText: "Do this first" });
  const title = await first.getByRole("heading").textContent();
  await first.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Done. Nice.")).toBeVisible();
  await expect(first.getByRole("heading")).not.toHaveText(title ?? "");

  await page.goto("/savvy-hq/today/end");
  await expect(page.getByRole("heading", { name: "Done today" })).toBeVisible();
  await page.getByLabel("Anything blocking you?").fill("Waiting on copy");
  await page.getByRole("button", { name: "Close my day" }).click();
  await expect(page.getByText("Your day is closed.")).toBeVisible();
  await signOut(page);
});

test("the owner sees the blocker on the Command centre and marks it handled", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/overview");
  await expect(page.getByText("Bo is blocked")).toBeVisible();
  await expect(page.getByText("Waiting on copy")).toBeVisible();
  await page.getByRole("button", { name: "Handled" }).click();
  await expect(page.getByText("Bo is blocked")).toHaveCount(0);
});

test("KPIs: the owner sets a template, the team member logs a number", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/kpis");
  await page.getByRole("button", { name: "Use the Contributor template" }).click();
  await expect(page.getByText("Deliverables delivered on time")).toBeVisible();
  await signOut(page);

  await signedIn(page, STAFF);
  await page.goto("/savvy-hq/kpis");
  await page.getByRole("button", { name: "Update my numbers" }).click();
  await page.getByRole("dialog", { name: "Update my numbers" }).getByLabel(/Deliverables delivered on time/).fill("80");
  await page.getByRole("button", { name: "Save numbers" }).click();
  await expect(page.getByText("80%").first()).toBeVisible();
  await signOut(page);
});

test("procedures: the owner writes one, a team member turns it into a task", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/procedures");
  await page.getByRole("button", { name: "Procedure" }).click();
  const form = page.getByRole("dialog", { name: "New procedure" });
  await form.getByLabel("Name").fill("Monthly invoice run");
  await form.getByLabel(/Steps, one per line/).fill("Check the retainers\nSend the invoices: by the 1st");
  await form.getByRole("button", { name: "Save procedure" }).click();
  await expect(page.getByRole("heading", { name: "Monthly invoice run" })).toBeVisible();
  await signOut(page);

  await signedIn(page, STAFF);
  await page.goto("/savvy-hq/procedures");
  await expect(page.getByRole("button", { name: "Procedure", exact: true })).toHaveCount(0);
  await page.getByRole("heading", { name: "Monthly invoice run" }).click();
  await page.getByRole("button", { name: "Make it a task" }).click();
  await expect(page.getByText("Task added to your list")).toBeVisible();
  await page.goto("/savvy-hq/tasks");
  await expect(page.getByRole("button", { name: /Monthly invoice run/ })).toContainText("0/2");
  await signOut(page);
});

test("settings: a profile saves, and the owner downloads a backup without passwords", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/settings");
  await page.getByLabel("Title").fill("Founder");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download a backup" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^dss-hq-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const body = await (await file.createReadStream()).toArray();
  const json = JSON.parse(Buffer.concat(body).toString());
  expect(Object.keys(json.tables)).toEqual(expect.arrayContaining(["hq_tasks", "hq_sops", "people"]));
  expect(JSON.stringify(json)).not.toContain("scrypt$");
});

test("a contractor only ever sees their own tasks", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/team");
  const row = page.getByRole("listitem").filter({ hasText: CONTRACTOR.email });
  await row.getByRole("button", { name: "Manage" }).click();
  await row.getByRole("button", { name: "Switch access back on" }).click();
  await expect(row.getByText("Switched off")).toHaveCount(0);
  await signOut(page);

  await signedIn(page, CONTRACTOR);
  await page.goto("/savvy-hq/tasks");
  await expect(page.getByLabel("Whose tasks")).toHaveCount(0);
  await expect(page.getByText("Review the deck")).toHaveCount(0);
  await expect(page.getByText("Send the brief")).toHaveCount(0);
});

test("one-tap links and cron jobs refuse anything unsigned", async ({ page, request }) => {
  await page.goto("/savvy-hq/act/not-a-real-link");
  await expect(page.getByText("This link has expired or isn't valid.")).toBeVisible();
  expect((await request.get("/api/cron/evening-checkin")).status()).toBe(401);
  expect((await request.get("/api/cron/backup-reminder", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("a signed one-tap link from the check-in email marks a task done", async ({ page }) => {
  const sql = connect(E2E_DATABASE_URL);
  const [task] = await sql.query(
    `select t.id, t.assignee_id::int as uid from hq_tasks t join desk_users u on u.id = t.assignee_id where t.title = 'Review the deck'`,
  );
  await disconnect();
  const token = signAction({ task: task.id, action: "done", user: task.uid, exp: Math.floor(Date.now() / 1000) + 3600 }, E2E_LINK_SECRET);
  await page.goto(`/savvy-hq/act/${encodeURIComponent(token)}`);
  await expect(page.getByText("Review the deck")).toBeVisible();
  await page.getByRole("button", { name: "Yes, it's done" }).click();
  await expect(page.getByRole("status")).toHaveText("Done: Review the deck.");
});

test("the 7pm check-in job runs with the cron secret", async ({ request }) => {
  const res = await request.get("/api/cron/evening-checkin", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  // email isn't set up in the tests, so nothing is sent, but the owner is found and the run completes
  expect(await res.json()).toEqual({ ok: true, sent: 0, owners: 1 });
});

test("the notifications job needs the cron secret and leaves the queue alone without email", async ({ request }) => {
  expect((await request.get("/api/cron/notifications")).status()).toBe(401);
  const res = await request.get("/api/cron/notifications?morning=1", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  // email isn't set up in the tests: nothing is claimed or marked, so it all goes out once it is
  expect(res.status()).toBe(503);
  expect(await res.json()).toEqual({ ok: false, error: "Email isn't set up on this server." });
});

/* ── Phase 3: clients, CRM and contracts ─────────────────────────────── */

test("a new client gets an onboarding checklist with tasks", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/clients");
  await page.getByRole("button", { name: "New client" }).click();
  const form = page.getByRole("dialog", { name: "New client" });
  await form.getByLabel("Client or company name").fill("Acme Test Co");
  await form.getByLabel("Fee", { exact: true }).fill("500000");
  await form.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByText("Client added.")).toBeVisible();
  await page.getByRole("link", { name: /Acme Test Co/ }).click();
  await expect(page.getByRole("heading", { name: "Acme Test Co", level: 1 })).toBeVisible();
  await expect(page.getByText("0 of 10 done")).toBeVisible();
  await page.getByRole("tab", { name: "Work" }).click();
  await expect(page.getByText("Signed agreement and NDA received: Acme Test Co")).toBeVisible();
});

test("a website application arrives in the CRM as a new lead", async ({ page, request }) => {
  const res = await request.post("/api/visibility", {
    data: { name: "Tolu Founder", email: "tolu@bright.test", company: "Bright Co", budget: "1.5m-3m", when: "This month", consent: true },
  });
  expect(res.ok()).toBe(true);
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/crm");
  await expect(page.getByRole("region", { name: "New lead" }).getByText("Bright Co")).toBeVisible();
});

test("CRM: log a call, then turn the lead into a client", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/crm");
  await page.getByRole("button", { name: "Add lead" }).click();
  const form = page.getByRole("dialog", { name: "New sales lead" });
  await form.getByLabel("Company or brand").fill("Bloom Studio");
  await form.getByLabel("Contact name").fill("Kemi Bloom");
  await form.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Contact added.")).toBeVisible();

  await page.getByRole("region", { name: "New lead" }).getByRole("button", { name: /Bloom Studio/ }).click();
  const panel = page.getByRole("dialog", { name: "Bloom Studio" });
  await panel.getByLabel("What happened, in a line or two").fill("Spoke about a 90 day sprint");
  await panel.getByRole("button", { name: "Log it" }).click();
  await expect(panel.getByText("Spoke about a 90 day sprint")).toBeVisible();
  await expect(panel.getByText("Moved to Contacted")).toBeVisible();

  await panel.getByRole("button", { name: "Won: make them a client" }).click();
  await panel.getByRole("button", { name: "Add client" }).click();
  await expect(page).toHaveURL(/\/savvy-hq\/clients\//);
  await expect(page.getByRole("heading", { name: "Bloom Studio", level: 1 })).toBeVisible();
});

test("contracts: add the missing client agreements from client dates", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/contracts");
  await expect(page.getByText(/clients have no contract on file/)).toBeVisible();
  await page.getByRole("button", { name: "Add them from client dates" }).click();
  await expect(page.getByText(/client contracts added/)).toBeVisible();
  await expect(page.getByText("every client is covered")).toBeVisible();
});

test("a contributor can't open Clients, CRM or Contracts", async ({ page }) => {
  await signedIn(page, STAFF);
  for (const area of ["clients", "crm", "contracts"]) {
    await page.goto(`/savvy-hq/${area}`);
    await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  }
});

/* ── Phase 3b: talent and publicity ──────────────────────────────────── */

test("talent: add someone to the roster, track a brand and post an update", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/talent");
  await page.getByRole("button", { name: "Talent", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add talent" });
  await form.getByLabel("Name").fill("Test Talent");
  await form.getByRole("button", { name: "Add talent" }).click();
  await expect(page).toHaveURL(/\/savvy-hq\/talent\//);
  await expect(page.getByRole("heading", { name: "Test Talent", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Add a brand" }).click();
  const deal = page.getByRole("dialog", { name: "Add a brand for Test" });
  await deal.getByLabel("Brand", { exact: true }).fill("Rival Cola");
  await deal.getByRole("button", { name: "Add deal" }).click();
  await expect(page.getByText("Brand added to the tracker.")).toBeVisible();

  await page.getByRole("row", { name: /Rival Cola/ }).click();
  const panel = page.getByRole("dialog", { name: "Rival Cola" });
  await panel.getByLabel("Status update").fill("Sent the deck to their brand manager");
  await panel.getByRole("button", { name: "Post update" }).click();
  await expect(page.getByText("Status update posted.")).toBeVisible();
  await expect(panel.getByText("Sent the deck to their brand manager").first()).toBeVisible();
});

test("publicity: a pitch warms the outlet up", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/marketing/publicity");
  await page.getByRole("button", { name: "Media contact" }).click();
  const m = page.getByRole("dialog", { name: "Add a media contact" });
  await m.getByLabel("Outlet or agency name").fill("Test FM");
  await m.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Media contact added.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Test FM/ }).getByText("Not contacted")).toBeVisible();

  await page.getByRole("row", { name: /Test FM/ }).getByRole("button", { name: "Pitch" }).click();
  const p = page.getByRole("dialog", { name: "Log a pitch" });
  await p.getByLabel("Story or angle").fill("A founder story");
  await p.getByRole("button", { name: "Log pitch" }).click();
  await expect(page.getByText("Pitch logged.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Test FM/ }).getByText("Contacted")).toBeVisible();
});

test("a Talent Manager sees Publicity, not the rest of Marketing", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/team");
  await addPerson(page, { name: "Tia Talent", email: "tia@example.test", password: "tia-pass-1234" }, ["Talent Manager"]);
  await signOut(page);
  await signedIn(page, { email: "tia@example.test", password: "tia-pass-1234" });
  await expect(sidebar(page).getByRole("link", { name: "Publicity" })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Marketing" })).toHaveCount(0);
  await page.goto("/savvy-hq/marketing/publicity");
  await expect(page.getByRole("heading", { name: "Publicity", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Marketing" })).toHaveCount(0);
  for (const tab of ["", "/accounts", "/planner", "/ads"]) {
    await page.goto(`/savvy-hq/marketing${tab}`);
    await expect(page).toHaveURL(/\/savvy-hq\/marketing\/publicity$/);
  }
});

/* ── Phase 3c: the Marketing dashboard ───────────────────────────────── */

test("marketing: add an account, log a month, and see it on the overview", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/marketing");
  await expect(page.getByText("Add DSS's social accounts to start.")).toBeVisible();

  await page.goto("/savvy-hq/marketing/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  const acc = page.getByRole("dialog", { name: "Add an account" });
  await acc.getByLabel("Handle or name").fill("@dss");
  await acc.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText("Account saved.")).toBeVisible();

  const lastMonth = await page.evaluate(() => {
    const d = new Date();
    d.setUTCDate(15);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  });
  await page.getByRole("button", { name: lastMonth, exact: true }).click();
  const stats = page.getByRole("dialog", { name: /Instagram @dss/ });
  await stats.getByLabel("Followers at month end").fill("1500");
  await stats.getByLabel("Accounts reached").fill("4000");
  await stats.getByLabel("Engagements").fill("200");
  await stats.getByRole("button", { name: "Save numbers" }).click();
  await expect(page.getByText("Numbers saved.")).toBeVisible();

  await page.goto("/savvy-hq/marketing");
  await page.getByRole("button", { name: "90 days" }).click();
  await expect(page.getByText("Total followers")).toBeVisible();
  await expect(page.getByRole("row", { name: /Instagram @dss/ })).toContainText("1,500");
});

test("marketing: plan a post and add a news story", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/marketing/planner");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const post = page.getByRole("dialog", { name: "Plan a post" });
  await post.getByLabel("Post idea or hook").fill("Three launch mistakes");
  await post.getByRole("button", { name: "Add post" }).click();
  await expect(page.getByText("Post added to the planner.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Three launch mistakes" })).toBeVisible();

  await page.goto("/savvy-hq/marketing/news");
  await page.getByRole("button", { name: "Add a story" }).click();
  const story = page.getByRole("dialog", { name: "Add a story" });
  await story.getByLabel("Headline").fill("A platform changed its algorithm");
  await story.getByRole("button", { name: "Add story" }).click();
  await expect(page.getByRole("heading", { name: "A platform changed its algorithm" })).toBeVisible();
});

test("the data feed job refuses without the secret, and explains a missing service account", async ({ request }) => {
  expect((await request.get("/api/cron/data-feed")).status()).toBe(401);
  const res = await request.get("/api/cron/data-feed", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(await res.json()).toEqual({ ok: false, reason: "The Google service account isn't set up." });
});

/* ── Phase 4: Finance and Invoices ───────────────────────────────────── */

test("finance: log an expense and see it in spend and profit and loss", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/finance");
  await expect(page.getByRole("heading", { name: "Money, clearly." })).toBeVisible();
  await page.getByRole("button", { name: "Expense", exact: true }).first().click();
  const form = page.getByRole("dialog", { name: "Add an expense" });
  await form.getByLabel("What was it for?").fill("Design software");
  await form.getByLabel("Amount").fill("25000");
  await form.getByLabel("Category").selectOption("subs");
  await form.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("Expense added.")).toBeVisible();

  await page.getByRole("navigation", { name: "Finance" }).getByRole("button", { name: "Spend" }).click();
  await expect(page.getByRole("row", { name: /Design software/ })).toContainText("Software and subscriptions");
  await page.getByRole("navigation", { name: "Finance" }).getByRole("button", { name: "Profit and loss" }).click();
  await expect(page.getByRole("row", { name: /^Software and subscriptions/ })).toContainText("₦25K");
});

test("invoices: add a bank account, raise an invoice, send it and record a part payment", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/settings");
  const details = page.locator("#invoice-details");
  await details.getByRole("button", { name: "Add account" }).click();
  const bank = page.getByRole("dialog", { name: "Add account" });
  await bank.getByLabel("Bank", { exact: true }).fill("Test Bank");
  await bank.getByLabel("Account number").fill("0123456789");
  await bank.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByText("Bank account saved.")).toBeVisible();

  await page.goto("/savvy-hq/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();
  const ed = page.getByRole("dialog", { name: "New invoice" });
  await expect(ed.getByLabel("Invoice number")).toHaveValue(/^DSS-INV-\d{4}-001$/);
  await ed.getByLabel("Name or company").fill("Brandco Test");
  await ed.getByLabel("Line 1 description").fill("Brand Strategy Consulting");
  await ed.getByLabel("Line 1 price").fill("200000");
  await ed.getByLabel("Line 1 percent off").fill("10");
  // the live preview prints the bank account and the discounted total
  await expect(ed.getByRole("article")).toContainText("0123456789");
  await expect(ed.getByRole("article")).toContainText("₦180,000");
  await ed.getByRole("button", { name: "Mark as sent" }).click();
  await expect(page.getByText(/marked as sent/)).toBeVisible();

  const card = page.getByRole("button", { name: /Brandco Test/ });
  await expect(card).toContainText("Sent");
  await card.click();
  await page.getByRole("dialog").getByRole("button", { name: "Record payment" }).click();
  const pay = page.getByRole("dialog", { name: /Record payment/ });
  await pay.getByLabel(/Amount received/).fill("80000");
  await pay.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded. ₦100,000 left.")).toBeVisible();
  await expect(card).toContainText("Part paid");

  // the PDF is made on the server
  await card.click();
  const href = await page.getByRole("dialog").getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("an Admin gets Invoices but not Finance", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/team");
  await addPerson(page, { name: "Dee Admin", email: "dee@example.test", password: "dee-pass-1234" }, ["Admin"]);
  await signOut(page);
  await signedIn(page, { email: "dee@example.test", password: "dee-pass-1234" });
  await expect(sidebar(page).getByRole("link", { name: "Invoices" })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Finance" })).toHaveCount(0);
  await page.goto("/savvy-hq/finance");
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  await page.goto("/savvy-hq/invoices");
  await expect(page.getByRole("button", { name: /Brandco Test/ })).toBeVisible();
});

test("the nightly records job refuses without the secret, and still files retainers without a sheet", async ({ request }) => {
  expect((await request.get("/api/cron/records-sheet")).status()).toBe(401);
  const res = await request.get("/api/cron/records-sheet", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(await res.json()).toMatchObject({ ok: false, booked: expect.any(Array), reason: "The Records sheet or the Google service account isn't set up." });
});

/* ── Phase 4b: Reports ───────────────────────────────────────────────── */

test("reports: last month is filed on its own, and any report downloads as slides", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/reports");
  await expect(page.getByRole("heading", { name: "Report archive" })).toBeVisible();
  // opening the archive files last month's seven reports
  await expect(page.getByText("filed automatically")).toHaveCount(7);
  const href = await page.getByRole("link", { name: "Slides PDF" }).first().getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.goto("/savvy-hq/crm");
  await page.getByRole("button", { name: "Monthly report" }).click();
  const form = page.getByRole("dialog", { name: "Monthly report" });
  await expect(form.getByLabel("Report")).toHaveValue("sales");
  const download = page.waitForEvent("download");
  await form.getByRole("button", { name: "Save and download slides" }).click();
  expect((await download).suggestedFilename()).toMatch(/^DSS-sales-report-\d{4}-\d{2}\.pdf$/);
  await page.goto("/savvy-hq/reports");
  await expect(page.getByText(/by Ada/)).toBeVisible();
});

test("a contributor can't open Reports or a Finance report", async ({ page }) => {
  await signedIn(page, STAFF);
  await page.goto("/savvy-hq/reports");
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  const month = await page.evaluate(() => new Date().toISOString().slice(0, 7));
  expect((await page.request.get(`/savvy-hq/reports/finance_${month}/pdf`)).status()).toBe(403);
});

test("the monthly reports job refuses without the secret", async ({ request }) => {
  expect((await request.get("/api/cron/monthly-reports")).status()).toBe(401);
  const res = await request.get("/api/cron/monthly-reports", { headers: { authorization: `Bearer ${E2E_CRON_SECRET}` } });
  expect(await res.json()).toMatchObject({ ok: true, filed: [] });
});

/* ── Phase 5a: Attendance and Leave ──────────────────────────────────── */

const TIA = { email: "tia@example.test", password: "tia-pass-1234" };

test("attendance: clock in, take a break, and clock out with a report", async ({ page }) => {
  await signedIn(page, STAFF);
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Clock in" }).click();
  await header.getByRole("button", { name: /^Working/ }).click();
  await page.getByRole("menuitem", { name: "Take a break" }).click();
  await header.getByRole("button", { name: /^Break/ }).click();
  await page.getByRole("menuitem", { name: "I'm back, start the clock" }).click();
  await header.getByRole("button", { name: /^Working/ }).click();
  await page.getByRole("menuitem", { name: "Clock out and send my report" }).click();
  const eod = page.getByRole("dialog", { name: "End my day" });
  await eod.getByLabel("What did you get done today?").fill("Drafted the launch post");
  await eod.getByLabel("Anything blocking you, or help you need?").fill("Waiting on photos");
  await eod.getByRole("button", { name: "Clock out" }).click();
  await expect(page.getByText(/Clocked out after/)).toBeVisible();
  await expect(header.getByRole("button", { name: /^✓ Done/ })).toBeVisible();
  await page.goto("/savvy-hq/time");
  await expect(page.getByText(/report sent/)).toBeVisible();
  await signOut(page);

  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/time");
  await page.getByRole("button", { name: "End-of-day reports" }).click();
  await expect(page.getByText("Drafted the launch post")).toBeVisible();
  await expect(page.getByText("Waiting on photos")).toBeVisible();
  const csv = await page.request.get("/savvy-hq/time/sheet");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain('"Bo Staff","Contributor"');
});

test("a contractor has no Attendance or timesheet", async ({ page }) => {
  await signedIn(page, CONTRACTOR);
  await expect(page.getByRole("banner").getByRole("button", { name: "Clock in" })).toHaveCount(0);
  await page.goto("/savvy-hq/time");
  await expect(page).toHaveURL(/\/savvy-hq\/today$/);
  expect((await page.request.get("/savvy-hq/time/sheet")).status()).toBe(403);
});

test("leave: the relief agrees, the owner approves, and the relief covers the pages while they're away", async ({ page }) => {
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date()));
  await signedIn(page, TIA);
  await page.goto("/savvy-hq/team/leave");
  await page.getByRole("button", { name: "Request time off" }).click();
  const form = page.getByRole("dialog", { name: "Request time off" });
  await form.getByLabel("Relief officer").selectOption({ label: STAFF.name });
  await form.getByLabel("From").fill(today);
  await form.getByLabel("Tasks done").fill("Sent the rate cards");
  await form.getByLabel("Pending to-do").fill("Chase the brand reply");
  await form.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Sent to Bo to agree to cover/)).toBeVisible();
  await expect(page.getByText("Waiting for Bo")).toBeVisible();
  await signOut(page);

  // a contributor has no Talent area of their own
  await signedIn(page, STAFF);
  await expect(sidebar(page).getByRole("link", { name: "Talent" })).toHaveCount(0);
  await expect(page.getByText(/1 request needs your answer/)).toBeVisible();
  await page.goto("/savvy-hq/team/leave");
  await page.getByRole("button", { name: "I'll cover" }).click();
  await expect(page.getByText(/request now goes to the owner/)).toBeVisible();
  await signOut(page);

  await signedIn(page, OWNER);
  await expect(page.getByText(/1 time-off request ready for your decision/)).toBeVisible();
  await page.goto("/savvy-hq/team/leave");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Approved.")).toBeVisible();
  await signOut(page);

  // while Tia is away, Bo borrows a Talent Manager's pages, checked on the server too
  await signedIn(page, STAFF);
  await expect(page.getByText(/You're covering for Tia/)).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Talent" })).toBeVisible();
  await page.goto("/savvy-hq/talent");
  await expect(page).toHaveURL(/\/savvy-hq\/talent$/);
});

/* ── Phase 5b: the 12-week plan ──────────────────────────────────────── */

test("plan: the owner sets a goal and a tactic, and finishing its task ticks the week", async ({ page }) => {
  // week 1 starts this Monday, so today is in week 1
  const monday = await page.evaluate(() => {
    const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());
    const d = new Date(`${t}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  });
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/plan");
  await page.getByRole("button", { name: "Start the first 12 weeks" }).click();
  await expect(page.getByText(/Add your goals/)).toBeVisible();
  await page.goto("/savvy-hq/plan?tab=setup");
  await page.getByLabel("Week 1 starts (a Monday)").fill(monday);
  await page.getByLabel("Why these 12 weeks matter").fill("Fill the pipeline before the new year");
  await page.getByRole("button", { name: "Save the cycle" }).click();
  await expect(page.getByText("Cycle saved.")).toBeVisible();
  await page.getByRole("button", { name: "Goal", exact: true }).click();
  const goal = page.getByRole("dialog", { name: "New goal" });
  await goal.getByLabel("Goal", { exact: true }).fill("Book 10 discovery calls");
  await goal.getByLabel("Owner").selectOption({ label: STAFF.name });
  await goal.getByLabel("Where you're starting").fill("0");
  await goal.getByLabel("Target by week 12").fill("10");
  await goal.getByRole("button", { name: "Add goal" }).click();
  await expect(page.getByText("Goal added.")).toBeVisible();
  await page.getByRole("button", { name: "Make it active" }).click();
  await expect(page.getByText("The cycle is live. The team has been told.")).toBeVisible();

  await page.getByRole("button", { name: "Tactic", exact: true }).click();
  const tac = page.getByRole("dialog", { name: "New tactic" });
  await tac.getByLabel("The weekly action").fill("Send 5 pitches");
  await tac.getByLabel("Moves which goal?").selectOption({ label: "Book 10 discovery calls" });
  await tac.getByLabel("Whose tactic").selectOption({ label: STAFF.name });
  await tac.getByRole("button", { name: "Add tactic" }).click();
  await expect(page.getByText("Tactic added.")).toBeVisible();
  await signOut(page);

  await signedIn(page, STAFF);
  await expect(page.getByText("12-week plan · week 1", { exact: true })).toBeVisible();
  await page.goto("/savvy-hq/plan");
  await expect(page.getByText("Fill the pipeline before the new year")).toBeVisible();
  const mine = page.locator("section").filter({ has: page.getByRole("heading", { name: "My tactics · week 1" }) });
  await expect(mine.getByText("set by Ada")).toBeVisible();
  await mine.getByRole("button", { name: "Task" }).click();
  await expect(page.getByText(/On your task list for this week/)).toBeVisible();
  await page.goto("/savvy-hq/tasks");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("checkbox", { name: "Mark Send 5 pitches done" }).click();
  await expect(page.getByRole("checkbox", { name: "Mark Send 5 pitches done" })).toHaveCount(0);
  await page.goto("/savvy-hq/plan");
  await expect(mine.getByRole("button", { name: "Mark not done: Send 5 pitches, week 1" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Weekly review" }).click();
  const review = page.getByRole("dialog", { name: "Week 1 review" });
  await expect(review.getByText("A winning week. What made it work?")).toBeVisible();
  await review.getByLabel("A win from this week").fill("Two calls booked from the pitches");
  await review.getByRole("button", { name: "Save review" }).click();
  await expect(page.getByText("✓ Week 1 reviewed.")).toBeVisible();
  await signOut(page);

  // the owner reads everyone's reviews; a contractor sees only their own row on the scoreboard
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/plan?tab=reviews");
  await expect(page.getByText("Two calls booked from the pitches")).toBeVisible();
  await signOut(page);
  await signedIn(page, CONTRACTOR);
  await page.goto("/savvy-hq/plan?tab=board");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("table").getByText("Bo", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Plan setup" })).toHaveCount(0);
});

/* ── Phase 5c: Messages ──────────────────────────────────────────────── */

test("messages: mention someone, react, reply, make a task, and Got it on an announcement", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/chat");
  const channels = page.getByRole("complementary", { name: "Channels" });
  await expect(channels.getByRole("button", { name: /General/ })).toHaveAttribute("aria-current", "true");
  const log = page.getByRole("log", { name: "Messages in General" });
  await expect(log.getByText(/Welcome to Messages in DSS HQ/)).toBeVisible();
  const box = page.getByRole("textbox", { name: "Write a message" });
  await box.fill("Morning team. @Bo");
  await page.getByRole("option", { name: /Bo Staff/ }).click();
  await box.pressSequentially("can you send the deck?");
  await box.press("Enter");
  await expect(log.getByText("can you send the deck?")).toBeVisible();
  await channels.getByRole("button", { name: /Announcements/ }).click();
  await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible();
  await page.getByRole("textbox", { name: "Write a message" }).fill("Office closed on Friday");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log", { name: "Messages in Announcements" }).getByText("Office closed on Friday")).toBeVisible();
  await signOut(page);

  await signedIn(page, STAFF);
  await expect(sidebar(page).getByRole("link", { name: /Messages.*unread/ })).toBeVisible();
  await page.goto("/savvy-hq/chat");
  await expect(channels.getByRole("button", { name: /General/ }).getByLabel("You were mentioned")).toBeVisible();
  const msg = log.locator("[id^=m-]").filter({ hasText: "can you send the deck?" });
  await expect(msg.getByText("@Bo Staff")).toBeVisible();
  await msg.hover();
  await msg.getByRole("button", { name: "React 👍" }).click();
  await expect(msg.getByRole("button", { name: /👍 1/ })).toHaveAttribute("aria-pressed", "true");
  await msg.hover();
  await msg.getByRole("button", { name: "Make it a task" }).click();
  await expect(page.getByText("Added to your tasks for today.")).toBeVisible();
  await msg.hover();
  await msg.getByRole("button", { name: "Reply" }).click();
  await expect(page.getByText(/Replying to Ada/)).toBeVisible();
  await box.fill("Sending it now");
  await box.press("Enter");
  const answer = log.locator("[id^=m-]").filter({ hasText: "Sending it now" });
  await expect(answer.getByRole("button", { name: /Ada.*can you send the deck/ })).toBeVisible();
  // announcements: no composer for a Contributor, just Got it
  await channels.getByRole("button", { name: /Announcements/ }).click();
  await expect(page.getByText(/Only the owner and admins post in Announcements/)).toBeVisible();
  await page.getByRole("button", { name: "✓ Got it" }).click();
  await expect(page.getByText("✓ Got it")).toBeVisible();
  await signOut(page);

  await signedIn(page, OWNER);
  await page.goto("/savvy-hq/chat?c=announcements");
  await expect(page.getByText(/Seen by 1 of/)).toBeVisible();
});

test("focus mode: time a task, ignore Escape, and finish it with Done with it", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.getByLabel("Capture a task").fill("Outline the focus test today");
  await page.getByLabel("Capture a task").press("Enter");
  await expect(page.getByText("Captured, due today.")).toBeVisible();
  await page.goto("/savvy-hq/tasks");
  await page.getByRole("button", { name: "List" }).click();
  await page.getByText("Outline the focus test").click();
  await page.getByRole("dialog", { name: "Task" }).getByRole("button", { name: "Focus on this" }).click();
  const focus = page.getByRole("dialog", { name: "Focus mode" });
  await expect(focus.getByRole("heading", { name: "Outline the focus test" })).toBeVisible();
  await expect(focus.getByRole("timer")).toHaveText("25:00");
  await focus.getByRole("button", { name: "15 min" }).click();
  await expect(focus.getByRole("timer")).toHaveText("15:00");
  await focus.getByRole("button", { name: "Start" }).click();
  await expect(focus.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(focus.getByRole("timer")).not.toHaveText("15:00");
  await page.keyboard.press("Escape");
  await expect(focus).toBeVisible();
  await focus.getByRole("button", { name: "Done with it" }).click();
  await expect(focus).toBeHidden();
  await expect(page.getByText("Done. Nice.")).toBeVisible();
});
