import { currentSpendMonth, readSpendMonth } from "@/lib/month";
import { percentShares, type MinorUnits } from "@/lib/money";
import {
  monthSpendRowSchema,
  type CategoryColor,
  type MonthSpendRow,
} from "@/lib/schema";
import { requireCompleteSettings } from "@/lib/settings";
import { type PlainDate } from "@/lib/time";

/**
 * Where this month's money went, worked out from the rows themselves.
 *
 * Spec 0005 chose to total the month in TypeScript rather than in a SQL view or
 * a function. The reason that matters here: this reads the same month scoped,
 * spend filtered rows that feature 7's list reads, so the two screens cannot
 * disagree about a month, and the database gains no new object that would need
 * its own row level security policy.
 *
 * The maths and the query are deliberately separate. `summariseMonth()` is pure
 * and holds the two things most likely to be subtly wrong, the ordering and the
 * rounding, so both are testable without a backend. `loadMonthBreakdown()` is
 * the only part that talks to the network.
 */

/** One category's slice of the month. */
export type CategoryShare = {
  readonly categoryId: string;
  readonly name: string;
  readonly color: CategoryColor;
  readonly amountMinor: MinorUnits;
  /** Whole number, largest remainder. The row set adds to exactly 100. */
  readonly percent: number;
};

/** A whole month, totalled and split. */
export type MonthBreakdown = {
  /** The first day of the month, and the source of the heading. */
  readonly month: PlainDate;
  readonly totalMinor: MinorUnits;
  /** Biggest first, ties broken by name. */
  readonly rows: readonly CategoryShare[];
};

/**
 * Compare two names the same way on every machine.
 *
 * Pinned to `en-US` rather than left to the runtime default, because the
 * default varies by machine and a comparison that varies is exactly the
 * nondeterminism the tie rule exists to remove (AC-3). A tie broken one way
 * locally and the other way in CI is a test that flakes for a reason nobody
 * finds.
 */
const byName = new Intl.Collator("en-US");

/**
 * Turn a month of rows into a total and a ranked split, with no side effects.
 *
 * The total and the row amounts come from the same single pass over the same
 * rows, so the invariant that they agree holds by construction rather than by a
 * check that could be forgotten.
 *
 * Ordering is amount descending, then name ascending. The shares are attached
 * after the sort, and `percentShares()` awards its leftover points in the order
 * it receives them, so the ranking and the rounding follow the same comparison
 * and a row can never show a share its own position contradicts.
 */
export function summariseMonth(
  month: PlainDate,
  rows: readonly MonthSpendRow[],
): MonthBreakdown {
  const totals = new Map<
    string,
    { name: string; color: CategoryColor; amountMinor: MinorUnits }
  >();
  let totalMinor = 0;

  for (const row of rows) {
    const { id, name, color } = row.categories;
    const running = totals.get(id);

    if (running) {
      running.amountMinor += row.amount_minor;
    } else {
      totals.set(id, { name, color, amountMinor: row.amount_minor });
    }

    totalMinor += row.amount_minor;
  }

  const ordered = [...totals.entries()]
    .map(([categoryId, category]) => ({ categoryId, ...category }))
    .sort(
      (a, b) => b.amountMinor - a.amountMinor || byName.compare(a.name, b.name),
    );

  const shares = percentShares(
    ordered.map((category) => category.amountMinor),
    totalMinor,
  );

  return {
    month,
    totalMinor,
    rows: ordered.map((category, index) => ({
      ...category,
      percent: shares[index],
    })),
  };
}

/**
 * Read this month's spending for the signed in person and split it by category.
 *
 * The month comes from that person's own timezone through `getSettings()`,
 * never from the server clock and never from the browser, which is what keeps
 * the answer right late on the last evening of a month.
 *
 * Throws rather than returning anything partial. Every caller is a screen that
 * would otherwise render a total, and rule 3 of `AGENTS.md` is that a wrong
 * money figure shown confidently is worse than an honest error.
 */
export async function loadMonthBreakdown(): Promise<MonthBreakdown> {
  const settings = await requireCompleteSettings();
  const window = currentSpendMonth(new Date(), settings.timezone);

  // `categories` embeds as a single object across the three column composite
  // key, proved against the backend before this schema was written. The window,
  // the spend filter, the cap, and the completeness guard all come from
  // `lib/month.ts` rather than being written here, so this screen and the
  // transactions list cannot drift into reporting two totals for one month
  // (spec 0007).
  const rows = await readSpendMonth<MonthSpendRow>({
    what: "This month's spending",
    select: "amount_minor,categories(id,name,color)",
    schema: monthSpendRowSchema,
    window,
  });

  return summariseMonth(window.month, rows);
}
