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
    // The design gallery is the only route the accessibility check can point
    // at, and it 404s without this. Set here rather than in the CI workflow so
    // the same command works locally. If you already have a dev server up
    // without it, stop that server or the gallery tests will 404.
    // CI sets this explicitly in the workflow; locally it defaults on so the
    // same command just works.
    env: { UI_GALLERY: process.env.UI_GALLERY ?? "1" },
  },
});
