import { defineConfig } from "vitest/config";

/**
 * Vitest covers the pure logic only: money maths and month boundaries.
 * Browser flows are Playwright's job, so there is no jsdom environment here and
 * Playwright's own directory is never picked up by this runner.
 *
 * The .mts extension keeps this file ESM; as plain .ts it loads as CommonJS and
 * Vite warns on every run.
 */
export default defineConfig({
  resolve: {
    // Resolves the "@/..." alias from tsconfig, so tests import exactly what the
    // app imports rather than a parallel set of relative paths. Native since
    // Vite 8, which replaced the vite-tsconfig-paths plugin.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "actions/**/*.ts"],
    },
  },
});
