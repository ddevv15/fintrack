import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Rule 1 of `AGENTS.md`, enforced instead of asserted.
 *
 * `lib/money.ts` is the only module that converts an amount, and nothing else
 * multiplies or divides one. Spec 0006 turned that from a convention into
 * something checkable, because it now has two sides rather than one: display
 * was always here, and parsing what you type joined it. Both are exactly the
 * kind of thing that gets quietly reimplemented in a component under deadline,
 * and the reimplementation looks harmless.
 *
 * This is a source scan rather than a lint rule on purpose. A lint rule would
 * need a plugin and a config entry to say one sentence, and the sentence would
 * then live somewhere nobody reads. A failing test names the file and quotes
 * the line.
 *
 * covers: AC-13 of spec 0006
 */

const ROOT = join(import.meta.dirname, "..", "..");

/** Where the rule applies. `lib/money.ts` is the one file exempt from it. */
const SCANNED_DIRECTORIES = ["lib", "components", "app", "actions"];
const EXEMPT = [join("lib", "money.ts")];

/**
 * An amount being scaled by a power of ten, in any of the shapes it is written.
 *
 * Deliberately narrow. A broad "any multiplication" rule would flag ordinary
 * arithmetic that has nothing to do with money and would be silenced with an
 * ignore comment within a week, which is worse than no rule. These are the
 * specific shapes that turn an amount into minor units or back.
 */
const FORBIDDEN = [
  { pattern: /\*\s*10\s*\*\*/, what: "multiplying by a power of ten" },
  { pattern: /\/\s*10\s*\*\*/, what: "dividing by a power of ten" },
  { pattern: /\*\s*100\b/, what: "multiplying by 100" },
  { pattern: /\/\s*100\b/, what: "dividing by 100" },
  { pattern: /\btoFixed\s*\(/, what: "formatting money with toFixed" },
];

function sourceFilesIn(directory: string): string[] {
  const absolute = join(ROOT, directory);
  const found: string[] = [];

  for (const entry of readdirSync(absolute)) {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFilesIn(join(directory, entry)));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(join(directory, entry));
    }
  }

  return found;
}

describe("the money conversion boundary", () => {
  it("finds source files to scan, so a passing run means something", () => {
    // Without this, a broken path would make every assertion below pass by
    // scanning nothing at all, which is the failure mode of every scan test.
    const files = SCANNED_DIRECTORIES.flatMap(sourceFilesIn);
    expect(files.length).toBeGreaterThan(20);
  });

  it("keeps every amount conversion inside lib/money.ts", () => {
    const offences: string[] = [];

    for (const relative of SCANNED_DIRECTORIES.flatMap(sourceFilesIn)) {
      if (EXEMPT.includes(relative)) continue;

      const lines = readFileSync(join(ROOT, relative), "utf8").split("\n");

      lines.forEach((line, index) => {
        // Comments discuss the rule; they do not break it.
        const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");

        for (const { pattern, what } of FORBIDDEN) {
          if (pattern.test(code)) {
            offences.push(`${relative}:${index + 1} ${what} — ${line.trim()}`);
          }
        }
      });
    }

    expect(
      offences,
      `Money is converted outside lib/money.ts. Use formatAmount() or parseAmount() instead:\n${offences.join("\n")}`,
    ).toEqual([]);
  });
});
