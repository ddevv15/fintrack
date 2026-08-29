import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The invariant spec 0007 calls a build requirement rather than a cleanup.
 *
 * `/transactions` and `/breakdown` total the same month from the same rows. If
 * each wrote its own month window and its own spend filter, a change to one
 * would leave the other reporting a different total for the same month, with no
 * error anywhere and nothing on either screen admitting it. Two money figures
 * that disagree and neither complains is the worst failure this app has,
 * because there is nothing to notice.
 *
 * The two loaders therefore share one definition, in `lib/month.ts`. This is a
 * source scan rather than a behavioural test for the same reason
 * `money-boundary.test.ts` is one: the failure mode is somebody reasonably
 * writing the three filter lines out again in one file, and no assertion about
 * output catches that until the two definitions have already drifted.
 *
 * covers: AC-2, AC-3, AC-7 of spec 0007
 */

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * Every loader that reads spend rows, and the file each lives in.
 *
 * Scoped to the one function rather than the whole file on purpose. The first
 * version of this scan read the file, and it failed on
 * `loadTransactionForEdit()`, which filters `direction` for an entirely
 * legitimate reason: it reads one entry by id and must not open an income row
 * in a form that would write it back as a spend. That is not the duplication
 * this guards against, and a check that flags honest code is a check somebody
 * eventually silences.
 */
const LOADERS = [
  {
    file: "lib/breakdown.ts",
    loader: "loadMonthBreakdown",
    requires: ["currentSpendMonth(", "readSpendMonth"],
  },
  {
    file: "lib/transactions.ts",
    loader: "loadMonthTransactions",
    requires: ["currentSpendMonth(", "readSpendMonth"],
  },
  // Spec 0009 added the third reader. It asks for a range rather than a month,
  // so it requires a different function, but the same rule: it may not write
  // the filter itself. The `requires` field exists for exactly this, because
  // the two checks below used to hardcode the month's two names for everyone.
  {
    file: "lib/history.ts",
    loader: "loadHistory",
    requires: ["readSpendRange"],
  },
] as const;

/**
 * Pieces of a month read, written by hand instead of imported.
 *
 * Narrow on purpose. Each one is a specific thing `lib/month.ts` already does,
 * so a match means that thing now exists in two places.
 */
const WRITTEN_BY_HAND = [
  { pattern: /currentMonthRange\s*\(/, what: "building its own month range" },
  {
    pattern: /\.eq\(\s*["']direction["']/,
    what: "writing its own spend filter",
  },
  {
    pattern: /\.(gte|lt)\(\s*["']occurred_on["']/,
    what: "writing its own month bounds",
  },
  {
    pattern: /count:\s*["']exact["']/,
    what: "writing its own completeness read",
  },
] as const;

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

/**
 * The body of one exported function, from its declaration to its closing brace.
 *
 * Brace counting rather than a regular expression, because a regular expression
 * cannot find a matching brace and one that pretends to would silently return a
 * fragment, which is how a scan comes to check nothing at all.
 */
function bodyOf(source: string, name: string): string {
  const declaration = source.indexOf(`export async function ${name}(`);
  expect(
    declaration,
    `${name} is not exported from this file any more`,
  ).toBeGreaterThan(-1);

  const opening = source.indexOf("{", declaration);
  let depth = 0;

  for (let at = opening; at < source.length; at += 1) {
    if (source[at] === "{") depth += 1;
    if (source[at] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(opening, at + 1);
    }
  }

  throw new Error(`Could not find the end of ${name}`);
}

describe("the shared month window", () => {
  it.each(LOADERS)(
    "$loader asks lib/month.ts for its rows",
    ({ file, loader, requires }) => {
      const body = bodyOf(read(file), loader);

      for (const required of requires) {
        expect(body).toContain(required);
      }
    },
  );

  it.each(LOADERS)(
    "$loader does not write the month read itself",
    ({ file, loader }) => {
      const body = bodyOf(read(file), loader);

      const rewritten = WRITTEN_BY_HAND.filter(({ pattern }) =>
        pattern.test(body),
      ).map(({ what }) => what);

      expect(
        rewritten,
        `${loader} in ${file} is ${rewritten.join(" and ")}. Both money screens have to read a month the same ` +
          `way, or they will report two different totals for it with nothing to say which is right. Use lib/month.ts.`,
      ).toEqual([]);
    },
  );

  it("keeps the definition itself in one file", () => {
    // If this ever fails it means lib/month.ts stopped being the place the
    // filter lives, which makes the two checks above meaningless.
    const source = read("lib/month.ts");

    expect(source).toMatch(/\.eq\(\s*["']direction["']\s*,\s*["']spend["']/);
    expect(source).toMatch(/\.gte\(\s*["']occurred_on["']/);
    expect(source).toMatch(/\.lt\(\s*["']occurred_on["']/);
  });
});
