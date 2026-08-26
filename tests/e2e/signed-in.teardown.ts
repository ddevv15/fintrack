import { test as teardown } from "@playwright/test";

import { removeSeededRows, signInAccountA } from "./signed-in";

/**
 * Take the seeded month back out again.
 *
 * The two test accounts are fixed and reused, so anything a run leaves behind
 * is still there on the next one, and spend rows left in the current month
 * would quietly change what the next run's breakdown adds up to.
 *
 * It runs the same removal the setup runs before seeding, so a crashed run is
 * cleaned up by the next one either way rather than only by this one.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI, which supplies the same values as real environment variables.
}

teardown("remove the seeded month", async () => {
  await removeSeededRows(await signInAccountA());
});
