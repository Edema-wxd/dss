import { type Page, expect, test } from "@playwright/test";

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

  await expect(page).toHaveURL(/\/admin\/sessions$/);
  await expect(page.getByRole("heading", { name: "Visibility Sessions", level: 1 })).toBeVisible();
  await expect(sidebar(page).getByRole("link")).toHaveText(["DSS HQDigital Savvy Studios", "Visibility Sessions", "Team", "Activity"]);
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

test("a contractor can't open any built area, even by address", async ({ page }) => {
  await signedIn(page, CONTRACTOR);
  await expect(page.getByRole("heading", { name: "Welcome to DSS HQ" })).toBeVisible();
  for (const area of ["sessions", "team", "activity"]) {
    await page.goto(`/admin/${area}`);
    await expect(page.getByRole("heading", { name: "Welcome to DSS HQ" })).toBeVisible();
    await expect(page).toHaveURL(/\/admin$/);
  }
  await expect(sidebar(page).getByRole("link", { name: "Team" })).toHaveCount(0);
});

test("a contributor gets Visibility Sessions and Team, but not Activity or team management", async ({ page }) => {
  await signedIn(page, STAFF);
  await expect(page).toHaveURL(/\/admin\/sessions$/);
  await expect(sidebar(page).getByRole("link", { name: "Activity" })).toHaveCount(0);

  await page.goto("/admin/activity");
  await expect(page).toHaveURL(/\/admin\/sessions$/);

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
  await expect(quick.getByRole("link", { name: "Team" })).toBeVisible();
  await quick.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/admin\/activity$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
