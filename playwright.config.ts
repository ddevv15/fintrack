import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives the real app for flows; Vitest covers pure logic.
 *
 * Chromium only for now, per the skill's guidance to start single project while
 * the app is small. Add firefox and webkit when there are flows worth the CI
 * minutes.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A stray test.only would silently shrink the CI run to one test, so CI fails
  // on it instead.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? "50%" : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  webServer: {
    // CI tests the production build, since that is what actually ships. Locally
    // it reuses whatever dev server you already have running.
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
