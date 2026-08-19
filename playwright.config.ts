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

  projects: [
    // Runs first and gates the rest. A server without UI_GALLERY serves a 404
    // for every gallery route, and without this the suite reports that as
    // seventeen missing elements rather than as one wrong server.
    { name: "preflight", testMatch: /preflight\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["preflight"],
    },
  ],

  webServer: {
    // CI tests the production build, since that is what actually ships. Locally
    // it reuses whatever dev server you already have running.
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Applies only to a server Playwright starts itself. A reused dev server
    // keeps its own environment, which is what the preflight project checks.
    //
    // UI_GALLERY: the gallery route is a 404 without it, and the accessibility
    // check has nowhere else to point. CI sets it in the workflow; locally it
    // defaults on so the same command just works.
    //
    // The currency and zone are pinned so a run is deterministic. The tests no
    // longer assert currency specific text, but the gallery still renders real
    // money and dates, and a fixed pair keeps a failure about the component
    // rather than about whoever's .env.local it happened to read.
    env: {
      UI_GALLERY: process.env.UI_GALLERY ?? "1",
      APP_CURRENCY: "USD",
      APP_TIMEZONE: "America/New_York",
    },
  },
});
