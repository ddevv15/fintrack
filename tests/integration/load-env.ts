/**
 * Load .env.local before the integration tests run.
 *
 * Next.js does this for the app but Vitest does not, and these tests talk to a
 * real backend, so they need the same values the app uses.
 *
 * Node does the parsing. `process.loadEnvFile` leaves anything already set in
 * the environment alone, which is exactly how CI supplies its own values, and
 * it throws when the file is missing, which is the normal case in CI.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local, so the environment is expected to carry the values already.
  // A missing one is reported by the first fixture that needs it, by name.
}
