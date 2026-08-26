import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives the real app for flows; Vitest covers pure logic.
 *
 * Chromium only for now, per the skill's guidance to start single project while
 * the app is small. Add firefox and webkit when there are flows worth the CI
 * minutes.
 */

// Playwright does not read `.env.local`, and the decision below has to be made
// before any test file runs, so it cannot wait for the setup file to load it.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI and in a fresh clone, which is exactly the case handled below.
}

/**
 * Whether the signed in suites can run at all.
 *
 * They sign two real accounts in against the real backend, so without those
 * credentials there is nothing for them to do. Before this check they failed
 * instead: the setup project could not sign in, its teardown failed with it,
 * and every test depending on them was reported as "did not run". A fork, a
 * fresh clone, and this repository's own CI all landed in that state, which is
 * a red build that says nothing about the change that triggered it.
 */
const hasBackendCredentials = Boolean(
  process.env.INSFORGE_TEST_EMAIL_A &&
  process.env.INSFORGE_TEST_EMAIL_B &&
  process.env.INSFORGE_TEST_PASSWORD &&
  process.env.NEXT_PUBLIC_INSFORGE_URL &&
  // The CI placeholder is a real string, so a plain presence check passes on
  // it and the suite then tries to sign in against a host that does not
  // exist.
  !process.env.NEXT_PUBLIC_INSFORGE_URL.includes("ci-placeholder"),
);

// Deliberately loud, and deliberately not silent on a pass. A skipped suite
// that says nothing is how a green build comes to mean less than it looks:
// every signed in flow, which is most of what this app does, would be
// unproven while the run still reported success.
if (!hasBackendCredentials) {
  console.warn(
    [
      "",
      "⚠  The signed in end to end tests are NOT running.",
      "   INSFORGE_TEST_EMAIL_A, INSFORGE_TEST_EMAIL_B, INSFORGE_TEST_PASSWORD",
      "   and a real NEXT_PUBLIC_INSFORGE_URL are needed, and at least one is",
      "   missing. The public tests below still ran and still mean something;",
      "   everything behind sign in did not run and is unproven by this build.",
      "",
      "   Locally: put them in .env.local (see .env.example).",
      "   In CI: add them as repository secrets.",
      "",
    ].join("\n"),
  );
}

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
      // The signed in suites need a session and a seeded month, so they run in
      // their own project below rather than against a fresh browser.
      testIgnore: /.*\.signed\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["preflight"],
    },

    // Signs the first test account in, writes its cookies, and seeds a month of
    // spending. Its teardown takes that month back out, because the accounts
    // are fixed and reused and rows left in the current month would change what
    // the next run adds up to.
    //
    // Included only when the credentials exist. Listing them unconditionally is
    // what made a repository without secrets report two failures and thirteen
    // tests that "did not run", rather than a smaller suite that passed.
    ...(hasBackendCredentials
      ? [
          {
            name: "signed-in-setup",
            testMatch: /signed-in\.setup\.ts/,
            teardown: "signed-in-teardown",
          },
          { name: "signed-in-teardown", testMatch: /signed-in\.teardown\.ts/ },
          {
            name: "chromium-signed-in",
            testMatch: /.*\.signed\.spec\.ts/,
            use: {
              ...devices["Desktop Chrome"],
              // Kept as a literal rather than imported from
              // tests/e2e/signed-in.ts: this config is loaded before any path
              // alias or transform is set up, so importing that module here
              // fails before a test runs.
              storageState: "tests/e2e/.auth/account-a.json",
            },
            dependencies: ["preflight", "signed-in-setup"],
          },
        ]
      : []),
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
