import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load .env.local into process.env before the integration tests run.
 *
 * Next.js does this for the app but Vitest does not, and these tests talk to a
 * real backend, so they need the same values the app uses. Anything already set
 * in the environment wins, which is how CI supplies its own.
 */
const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
