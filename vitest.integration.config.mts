import { defineConfig } from "vitest/config";

/**
 * The tests that need a real backend.
 *
 * Kept apart from vitest.config.mts on purpose. Those tests are pure and run in
 * under a second, which is what makes them safe in the pre commit hook; these
 * sign in over the network and write rows, so `npm test` must never pick them
 * up. Run them with `npm run test:integration`.
 *
 * Single file and no parallelism: the suites share two accounts and clean up
 * after themselves, so running them at the same time would have one suite
 * deleting another's rows.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/load-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
