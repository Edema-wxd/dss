import { defineConfig, devices } from "@playwright/test";

// Browser tests for the admin. They need a production build (npm run build) and a local
// Postgres database whose name includes "e2e"; it is wiped before each run.
//   E2E_DATABASE_URL=postgres://localhost:5432/dss_e2e npm run test:e2e

const PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgres://localhost:5432/dss_e2e";
// test-only secrets, so the browser tests can sign one-tap links and call the cron jobs
export const E2E_CRON_SECRET = "e2e-cron-secret-0123456789";
export const E2E_LINK_SECRET = "e2e-link-secret-0123456789";
// a public push key so the Messages bell shows; the private half is a placeholder, since the browser
// tests deliver pushes straight to the service worker rather than through a push service
export const E2E_VAPID_PUBLIC_KEY = "BNCmedHEpRVyyv2trTRGsqtqHhMBJV4rdm_z-UAagNx2cQScPvqclFSnbgzl28T-g9KqUkmmUK0liDxRF13UqaQ";

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
        // full Chromium in headless mode, not the stripped-down headless shell: the shell drops
        // notifications, which the Messages push test needs
        channel: "chromium",
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
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      CRON_SECRET: E2E_CRON_SECRET,
      HQ_LINK_SECRET: E2E_LINK_SECRET,
      VAPID_PUBLIC_KEY: E2E_VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: "e2e-placeholder-not-a-key",
    },
    timeout: 60_000,
  },
});
