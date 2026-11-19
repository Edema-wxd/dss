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
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in and waits until HQ has opened. */
async function signedIn(page: Page, who: { email: string; password: string }) {
  await signIn(page, who);
  await expect(page).not.toHaveURL(/\/admin\/login$/);
}

async function signOut(page: Page) {
  await page.getByRole("complementary", { name: "DSS HQ navigation" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
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
  await page.goto("/admin/team");
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test("the first account becomes an Owner and lands in HQ", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create the owner account" }).click();

  await expect(page).toHaveURL(/\/admin\/today$/);
  await expect(page.getByRole("heading", { name: /Ada\.$/, level: 1 })).toBeVisible();
  await expect(sidebar(page).getByRole("link")).toHaveText([
    "DSS HQDigital Savvy Studios",
    "Today",
    "Command centre",
    "Tasks",
    "Visibility Sessions",
    "Clients",
    "CRM",
    "Talent",
    "Marketing",
    "KPIs",
    "Contracts",
    "Procedures",
    "Team",
    "Activity",
    "Settings",
  ]);
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
  await expect(page).toHaveURL(/\/admin\/today$/);
  for (const area of ["sessions", "team", "activity", "overview"]) {
    await page.goto(`/admin/${area}`);
    await expect(page).toHaveURL(/\/admin\/today$/);
  }
  await expect(sidebar(page).getByRole("link")).toHaveText(["DSS HQDigital Savvy Studios", "Today", "Tasks", "KPIs", "Procedures", "Settings"]);
});

test("a contributor gets Visibility Sessions and Team, but not Activity or team management", async ({ page }) => {
  await signedIn(page, STAFF);
  await expect(page).toHaveURL(/\/admin\/today$/);
  await expect(sidebar(page).getByRole("link", { name: "Activity" })).toHaveCount(0);

  await page.goto("/admin/activity");
  await expect(page).toHaveURL(/\/admin\/today$/);

  await page.goto("/admin/team");
  await expect(page.getByText("Ask an owner to add people or change roles.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage" })).toHaveCount(0);
  await signOut(page);
});

test("the owner sees each change in Activity, and can switch someone off", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/activity");
  await expect(page.getByText(`Added ${CONTRACTOR.name} (${CONTRACTOR.email}) as Contractor`)).toBeVisible();
  await expect(page.getByText(`${OWNER.name} created the first HQ account`)).toBeVisible();

  await page.goto("/admin/team");
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
  await page.goto("/admin/team");
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
  await expect(page).toHaveURL(/\/admin\/activity$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

/* ── Phase 2: the working day ────────────────────────────────────────── */

test("the capture bar adds a dated, top-priority task", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.getByLabel("Capture a task").fill("Send the brief tomorrow!");
  await page.getByLabel("Capture a task").press("Enter");
  await expect(page.getByText("Captured, due tomorrow.")).toBeVisible();
  await page.goto("/admin/tasks");
  await page.getByRole("button", { name: "List" }).click();
  const row = page.locator("section").filter({ hasText: "This week" });
  await expect(row.getByText("Send the brief")).toBeVisible();
  await expect(row.getByText("Top", { exact: true })).toBeVisible();
});

test("the owner gives a task to a team member", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByLabel("What needs doing?").fill("Review the deck");
  await dialog.getByLabel("Who").selectOption({ label: STAFF.name });
  await dialog.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Task added. Bo will see it on their Today.")).toBeVisible();
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

  await page.goto("/admin/today/end");
  await expect(page.getByRole("heading", { name: "Done today" })).toBeVisible();
  await page.getByLabel("Anything blocking you?").fill("Waiting on copy");
  await page.getByRole("button", { name: "Close my day" }).click();
  await expect(page.getByText("Your day is closed.")).toBeVisible();
  await signOut(page);
});

test("the owner sees the blocker on the Command centre and marks it handled", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/overview");
  await expect(page.getByText("Bo is blocked")).toBeVisible();
  await expect(page.getByText("Waiting on copy")).toBeVisible();
  await page.getByRole("button", { name: "Handled" }).click();
  await expect(page.getByText("Bo is blocked")).toHaveCount(0);
});

test("KPIs: the owner sets a template, the team member logs a number", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/kpis");
  await page.getByRole("button", { name: "Use the Contributor template" }).click();
  await expect(page.getByText("Deliverables delivered on time")).toBeVisible();
  await signOut(page);

  await signedIn(page, STAFF);
  await page.goto("/admin/kpis");
  await page.getByRole("button", { name: "Update my numbers" }).click();
  await page.getByRole("dialog", { name: "Update my numbers" }).getByLabel(/Deliverables delivered on time/).fill("80");
  await page.getByRole("button", { name: "Save numbers" }).click();
  await expect(page.getByText("80%").first()).toBeVisible();
  await signOut(page);
});

test("procedures: the owner writes one, a team member turns it into a task", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/procedures");
  await page.getByRole("button", { name: "Procedure" }).click();
  const form = page.getByRole("dialog", { name: "New procedure" });
  await form.getByLabel("Name").fill("Monthly invoice run");
  await form.getByLabel(/Steps, one per line/).fill("Check the retainers\nSend the invoices: by the 1st");
  await form.getByRole("button", { name: "Save procedure" }).click();
  await expect(page.getByRole("heading", { name: "Monthly invoice run" })).toBeVisible();
  await signOut(page);

  await signedIn(page, STAFF);
  await page.goto("/admin/procedures");
  await expect(page.getByRole("button", { name: "Procedure", exact: true })).toHaveCount(0);
  await page.getByRole("heading", { name: "Monthly invoice run" }).click();
  await page.getByRole("button", { name: "Make it a task" }).click();
  await expect(page.getByText("Task added to your list")).toBeVisible();
  await page.goto("/admin/tasks");
  await expect(page.getByRole("button", { name: /Monthly invoice run/ })).toContainText("0/2");
  await signOut(page);
});

test("settings: a profile saves, and the owner downloads a backup without passwords", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/settings");
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
  await page.goto("/admin/team");
  const row = page.getByRole("listitem").filter({ hasText: CONTRACTOR.email });
  await row.getByRole("button", { name: "Manage" }).click();
  await row.getByRole("button", { name: "Switch access back on" }).click();
  await expect(row.getByText("Switched off")).toHaveCount(0);
  await signOut(page);

  await signedIn(page, CONTRACTOR);
  await page.goto("/admin/tasks");
  await expect(page.getByLabel("Whose tasks")).toHaveCount(0);
  await expect(page.getByText("Review the deck")).toHaveCount(0);
  await expect(page.getByText("Send the brief")).toHaveCount(0);
});

test("one-tap links and cron jobs refuse anything unsigned", async ({ page, request }) => {
  await page.goto("/admin/act/not-a-real-link");
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
  await page.goto(`/admin/act/${encodeURIComponent(token)}`);
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

/* ── Phase 3: clients, CRM and contracts ─────────────────────────────── */

test("a new client gets an onboarding checklist with tasks", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/clients");
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
  await page.goto("/admin/crm");
  await expect(page.getByRole("region", { name: "New lead" }).getByText("Bright Co")).toBeVisible();
});

test("CRM: log a call, then turn the lead into a client", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/crm");
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
  await expect(page).toHaveURL(/\/admin\/clients\//);
  await expect(page.getByRole("heading", { name: "Bloom Studio", level: 1 })).toBeVisible();
});

test("contracts: add the missing client agreements from client dates", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/contracts");
  await expect(page.getByText(/clients have no contract on file/)).toBeVisible();
  await page.getByRole("button", { name: "Add them from client dates" }).click();
  await expect(page.getByText(/client contracts added/)).toBeVisible();
  await expect(page.getByText("every client is covered")).toBeVisible();
});

test("a contributor can't open Clients, CRM or Contracts", async ({ page }) => {
  await signedIn(page, STAFF);
  for (const area of ["clients", "crm", "contracts"]) {
    await page.goto(`/admin/${area}`);
    await expect(page).toHaveURL(/\/admin\/today$/);
  }
});

/* ── Phase 3b: talent and publicity ──────────────────────────────────── */

test("talent: add someone to the roster, track a brand and post an update", async ({ page }) => {
  await signedIn(page, OWNER);
  await page.goto("/admin/talent");
  await page.getByRole("button", { name: "Talent", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add talent" });
  await form.getByLabel("Name").fill("Test Talent");
  await form.getByRole("button", { name: "Add talent" }).click();
  await expect(page).toHaveURL(/\/admin\/talent\//);
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
  await page.goto("/admin/marketing");
  await expect(page).toHaveURL(/\/admin\/marketing\/publicity$/);
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
  await page.goto("/admin/team");
  await addPerson(page, { name: "Tia Talent", email: "tia@example.test", password: "tia-pass-1234" }, ["Talent Manager"]);
  await signOut(page);
  await signedIn(page, { email: "tia@example.test", password: "tia-pass-1234" });
  await expect(sidebar(page).getByRole("link", { name: "Publicity" })).toBeVisible();
  await expect(sidebar(page).getByRole("link", { name: "Marketing" })).toHaveCount(0);
  await page.goto("/admin/marketing/publicity");
  await expect(page.getByRole("heading", { name: "Publicity", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Marketing" })).toHaveCount(0);
});
