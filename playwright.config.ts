import { defineConfig, devices } from "@playwright/test";

// Browser tests for the admin. They need a production build (npm run build) and a local
// Postgres database whose name includes "e2e"; it is wiped before each run.
//   E2E_DATABASE_URL=postgres://localhost:5432/dss_e2e npm run test:e2e

const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/dss_e2e";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // PW_CHROMIUM_PATH runs an already-installed Chromium when Playwright's own download isn't available
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    // a fresh server each run, so it never holds on to a schema from before the wipe
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DATABASE_URL },
    timeout: 60_000,
  },
});
