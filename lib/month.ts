import type { z } from "zod";

import { createInsforgeServer } from "@/lib/insforge-server";
import { parseRows } from "@/lib/schema";
import { currentMonthRange, type PlainDate } from "@/lib/time";

/**
 * The one definition of "this month's spending" that both money screens read.
 *
 * Spec 0007 makes this a build requirement rather than a tidy up, and the
 * reasoning is worth keeping next to the code: `/transactions` and `/breakdown`
 * both total the same month from the same rows, and if each wrote its own
 * window and its own spend filter, a change to one would leave the other
 * reporting a different total for the same month with no error anywhere. Two
 * numbers that disagree and neither of them complains is the worst failure this
 * app has, because there is nothing to notice.
 *
 * So the window, the filter, the row cap, and the completeness check live here
 * once, and both loaders import them. They can only disagree now if somebody
 * deliberately stops calling this.
 */

/** A month, as both its heading date and the half open range to query with. */
export type MonthWindow = {
  /** The first day of the month, and the source of the heading. */
  readonly month: PlainDate;
  /** Included. */
  readonly start: PlainDate;
  /** Not included. */
  readonly endExclusive: PlainDate;
};

/**
 * The month the signed in person is currently in, in their own timezone.
 *
 * `now` and `timeZone` are both required arguments for the reason `lib/time.ts`
 * states: a default read from the environment is what makes "never the server
 * clock" unenforceable. The timezone comes from `getSettings()`, always.
 */
export function currentSpendMonth(now: Date, timeZone: string): MonthWindow {
  const { start, endExclusive } = currentMonthRange(now, timeZone);
  return { month: start, start, endExclusive };
}

/**
 * How many rows either screen will hold in memory at once.
 *
 * A bound on memory, and deliberately not the safety check. An earlier draft of
 * spec 0005 guarded completeness by asking for one row more than a cap and
 * throwing when that many arrived. A cross check showed that guard defeats
 * itself: PostgREST carries its own server side row limit, and if that limit
 * sits below this number the server truncates first, the extra row never
 * arrives, and the check stays silent while the total is short. A guard that
 * fails exactly when it is needed is worse than no guard, because it invites
 * trust.
 *
 * Correctness rests on the exact count comparison below instead, which holds
 * whatever the server's own limit turns out to be.
 */
export const MAX_MONTH_ROWS = 5000;

/**
 * Refuse to report a month that cannot be proved whole.
 *
 * It compares the rows received against the count Postgres reported for the
 * same filter, not against the length of the array it just measured, which
 * would compare a number with itself. That is the whole point: a server side
 * row limit can shorten the result without any error, and only a number the
 * database produced independently can catch it.
 *
 * Throws rather than returning a flag, because every caller is a screen that
 * would otherwise render a total, and rule 3 of `AGENTS.md` is that a wrong
 * money figure shown confidently is worse than an honest error.
 */
export function assertCompleteMonthRead(
  what: string,
  received: number,
  reported: number | null | undefined,
): void {
  if (typeof reported !== "number") {
    throw new Error(
      `${what} came back without a row count, so there is no way to prove nothing was dropped. Refusing to show a total that might be short.`,
    );
  }

  if (received !== reported) {
    throw new Error(
      `${what} came back short: ${received} rows for a reported count of ${reported}. ` +
        `Refusing to show a total that is missing entries. If the count is above ${MAX_MONTH_ROWS}, that limit is what truncated it.`,
    );
  }
}

/**
 * Read this month's spend rows, whichever columns the caller needs.
 *
 * This is the single definition the invariant rests on. The window, the spend
 * filter, the row cap, the exact count, the completeness check, and the schema
 * parse all happen here, once, so `/transactions` and `/breakdown` cannot
 * disagree about which rows make up a month. Each caller supplies only what is
 * genuinely its own: the columns it needs, the schema those columns parse
 * against, and its ordering.
 *
 * Income is excluded in the query rather than after the fact, so a row that
 * should not count never reaches a total (spec 0007, AC-5). Hidden categories
 * are deliberately not filtered: money you spent still counts whatever you
 * later did with the label.
 *
 * Throws on anything it cannot prove. There is no partial month worth showing.
 */
export async function readSpendMonth<Row>(options: {
  /** Names this read in an error message, for example "This month's spending". */
  readonly what: string;
  /** The PostgREST select string, including any embedded category columns. */
  readonly select: string;
  /** Parsed per row, so a renamed column fails here rather than inside a total. */
  readonly schema: z.ZodType<Row>;
  readonly window: MonthWindow;
  /** Applied in order. Ordering is the database's job, never TypeScript's. */
  readonly order?: readonly {
    readonly column: string;
    readonly ascending: boolean;
  }[];
}): Promise<Row[]> {
  const { what, select, schema, window, order = [] } = options;

  const insforge = await createInsforgeServer();

  // `user_id` is never named. Which rows exist at all is row level security
  // keyed to `auth.uid()`, not a filter written here (spec 0007, AC-20).
  let query = insforge.database
    .from("transactions")
    .select(select, { count: "exact" })
    .eq("direction", "spend")
    .gte("occurred_on", window.start)
    .lt("occurred_on", window.endExclusive);

  for (const { column, ascending } of order) {
    query = query.order(column, { ascending });
  }

  const result = await query.limit(MAX_MONTH_ROWS);

  // Rethrown, never swallowed. Both routes have an error boundary and neither
  // screen has an honest degraded form.
  if (result.error) {
    throw new Error(
      `Could not read ${what.toLowerCase()}: ${JSON.stringify(result.error)}`,
    );
  }

  const rows = parseRows(schema, "transactions", result.data);

  assertCompleteMonthRead(what, rows.length, result.count);

  return rows;
}
