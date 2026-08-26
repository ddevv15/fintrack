import { createInsforgeServer } from "@/lib/insforge-server";
import { percentShares, type MinorUnits } from "@/lib/money";
import {
  monthSpendRowSchema,
  parseRows,
  type CategoryColor,
  type MonthSpendRow,
} from "@/lib/schema";
import { requireCompleteSettings } from "@/lib/settings";
import { currentMonthRange, type PlainDate } from "@/lib/time";

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
 * How many rows this screen will hold in memory at once.
 *
 * A bound on memory, and deliberately no longer the safety check. An earlier
 * draft of spec 0005 guarded completeness by asking for one row more than a cap
 * and throwing when that many arrived. A cross check showed that guard defeats
 * itself: PostgREST carries its own server side row limit, and if that limit
 * sits below this number the server truncates first, the extra row never
 * arrives, and the check stays silent while the total is short. A guard that
 * fails exactly when it is needed is worse than no guard, because it invites
 * trust.
 *
 * Correctness therefore rests on the exact count comparison below, which holds
 * whatever the server's own limit turns out to be. This number only stops one
 * absurd month from being read into memory in full.
 */
const MAX_MONTH_ROWS = 5000;

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
  const { start, endExclusive } = currentMonthRange(
    new Date(),
    settings.timezone,
  );

  const insforge = await createInsforgeServer();

  // `categories` embeds as a single object across the three column composite
  // key, proved against the backend before the schema was written. Income is
  // excluded here rather than after the fact, so a row that should not count
  // never reaches the sum (AC-6). Hidden categories are deliberately not
  // filtered: money you spent still counts, whatever you did with the label
  // afterwards (AC-7).
  const result = await insforge.database
    .from("transactions")
    .select("amount_minor,categories(id,name,color)", { count: "exact" })
    .eq("direction", "spend")
    .gte("occurred_on", start)
    .lt("occurred_on", endExclusive)
    .limit(MAX_MONTH_ROWS);

  // Rethrown, never swallowed. The route has an error boundary and this screen
  // has no honest degraded form: there is no partial total worth showing.
  if (result.error) {
    throw new Error(
      `Could not read this month's spending: ${JSON.stringify(result.error)}`,
    );
  }

  const rows = parseRows(monthSpendRowSchema, "transactions", result.data);

  // The completeness check (AC-9). It compares the rows received against the
  // count Postgres reports for this same filter, not against the length of the
  // array it just measured, which would compare a number with itself. That is
  // the whole point: a server side row limit can shorten `data` without any
  // error, and only a number the database produced independently can catch it.
  const reported = result.count;
  if (typeof reported !== "number") {
    throw new Error(
      "This month's spending came back without a row count, so there is no way to prove nothing was dropped. Refusing to show a total that might be short.",
    );
  }
  if (rows.length !== reported) {
    throw new Error(
      `This month's spending came back short: ${rows.length} rows for a reported count of ${reported}. ` +
        `Refusing to show a total that is missing entries. If the count is above ${MAX_MONTH_ROWS}, that limit is what truncated it.`,
    );
  }

  return summariseMonth(start, rows);
}
