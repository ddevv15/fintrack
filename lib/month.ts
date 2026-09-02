import type { z } from "zod";

import { fault, refusal } from "@/lib/errors";
import { createInsforgeServer } from "@/lib/insforge-server";
import { parseRows, type EntryDirection } from "@/lib/schema";
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
    throw refusal(
      "missing-count",
      `${what} came back without a row count, so there is no way to prove nothing was dropped. Refusing to show a total that might be short.`,
    );
  }

  if (received !== reported) {
    throw refusal(
      "count-mismatch",
      `${what} came back short: ${received} rows for a reported count of ${reported}. ` +
        `Refusing to show a total that is missing entries. If the count is above ${MAX_MONTH_ROWS}, that limit is what truncated it.`,
    );
  }
}

/**
 * Make a typed search term match itself, rather than acting as a pattern.
 *
 * LIKE reads `%` as "anything" and `_` as "any one character", so without this
 * a note search for `50%` matches every entry you have ever logged, and the
 * count beside it truthfully reports a meaningless result. Postgres escapes
 * both with a backslash by default, which is why the backslash itself has to be
 * escaped too.
 *
 * The order is load bearing and is fixed by spec 0009 AC-4 rather than left to
 * taste. The backslash goes first: doing it last would escape the backslashes
 * the other two substitutions had just introduced, turning `50%` into a pattern
 * looking for a literal backslash followed by anything at all. The surrounding
 * wildcards that make this a contains search are added by the caller after this
 * returns, never before, or they would be escaped here and the search would
 * quietly become an exact match.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Where a keyset page stopped, as the three values that order a transaction.
 *
 * All three, not just the day. Two entries can share `occurred_on` and even
 * `created_at`, and two rows with no order between them is exactly where a
 * cursor loses one.
 */
export type TransactionCursor = {
  readonly occurredOn: PlainDate;
  readonly createdAt: string;
  readonly id: string;
};

/**
 * Ask for the rows that come after a cursor, in `occurred_on, created_at, id`
 * descending order.
 *
 * Written as a widening chain of ties rather than a row comparison, because
 * PostgREST has no row value syntax: strictly earlier day, or same day and
 * strictly earlier instant, or both equal and a smaller id. Every value is
 * double quoted, since a timestamp carries dots and a plus that the filter
 * grammar would otherwise read as its own punctuation. The values come from
 * rows this same read returned, never from a person, so there is no quote to
 * escape.
 *
 * Exported for the test that proves the three branches, not for callers.
 */
export function keysetFilter(after: TransactionCursor): string {
  return [
    `occurred_on.lt."${after.occurredOn}"`,
    `and(occurred_on.eq."${after.occurredOn}",created_at.lt."${after.createdAt}")`,
    `and(occurred_on.eq."${after.occurredOn}",created_at.eq."${after.createdAt}",id.lt."${after.id}")`,
  ].join(",");
}

/**
 * Read transaction rows over any stretch of time, whichever columns a caller
 * needs, in whichever direction it asks for.
 *
 * This is the single definition the invariant rests on, and it is deliberately
 * more general than the month. Spec 0009 made the point that the invariant was
 * never really about months: it is that two screens must never compute the same
 * money figure from two definitions. Spec 0010 widened it once more, because
 * the export claims its file matches what the app shows, which is the same
 * agreement claim with a longer half life.
 *
 * Every filter is optional, including the direction, and each caller supplies
 * only what is genuinely its own: the columns it needs, the schema those
 * columns parse against, its bounds, its ordering, and its own row limit. A
 * caller that omits `direction` reads every row in the table, which is what a
 * backup has to do and what no screen does.
 *
 * Hidden categories are deliberately not filtered: money you spent still counts
 * whatever you later did with the label.
 *
 * It reports the exact count alongside the rows rather than judging
 * completeness itself, because its callers answer to different standards. A
 * month refuses to render when it cannot be proved whole; history states what
 * it is showing out of what matched; the export refuses to hand over a file.
 */
export async function readTransactionRange<Row>(options: {
  /** Names this read in an error message, for example "This month's spending". */
  readonly what: string;
  /** The PostgREST select string, including any embedded category columns. */
  readonly select: string;
  /** Parsed per row, so a renamed column fails here rather than inside a total. */
  readonly schema: z.ZodType<Row>;
  /** Omit to read every direction, which only a backup should do. */
  readonly direction?: EntryDirection;
  /** Included. Omit for no lower bound. */
  readonly start?: PlainDate;
  /** Not included. Omit for no upper bound. */
  readonly endExclusive?: PlainDate;
  readonly categoryId?: string;
  /** The raw term as typed. Escaped and wrapped here, never by the caller. */
  readonly noteContains?: string;
  /** Where the previous page stopped. Requires the matching descending order. */
  readonly after?: TransactionCursor;
  /** A bound on rows held in memory at once. Required, so nobody forgets one. */
  readonly limit: number;
  /** Applied in order. Ordering is the database's job, never TypeScript's. */
  readonly order?: readonly {
    readonly column: string;
    readonly ascending: boolean;
  }[];
}): Promise<{ rows: Row[]; matched: number | undefined }> {
  const {
    what,
    select,
    schema,
    direction,
    start,
    endExclusive,
    categoryId,
    noteContains,
    after,
    limit,
    order = [],
  } = options;

  const insforge = await createInsforgeServer();

  // `user_id` is never named. Which rows exist at all is row level security
  // keyed to `auth.uid()`, not a filter written here (spec 0007, AC-20).
  let query = insforge.database
    .from("transactions")
    .select(select, { count: "exact" });

  if (direction !== undefined) query = query.eq("direction", direction);
  if (start !== undefined) query = query.gte("occurred_on", start);
  if (endExclusive !== undefined) query = query.lt("occurred_on", endExclusive);
  if (categoryId !== undefined) query = query.eq("category_id", categoryId);

  // Escaped first, wrapped second. See `escapeLikeTerm()` for why that order is
  // the criterion rather than a preference.
  if (noteContains !== undefined) {
    query = query.ilike("note", `%${escapeLikeTerm(noteContains)}%`);
  }

  if (after !== undefined) query = query.or(keysetFilter(after));

  for (const { column, ascending } of order) {
    query = query.order(column, { ascending });
  }

  const result = await query.limit(limit);

  // Rethrown, never swallowed. Every caller has an error boundary and none of
  // them has an honest degraded form.
  if (result.error) {
    throw fault(what, result.error);
  }

  const rows = parseRows(schema, "transactions", result.data);

  return { rows, matched: result.count ?? undefined };
}

/**
 * Read spend rows over any stretch of time.
 *
 * A thin wrapper over `readTransactionRange()` since spec 0010, and the one
 * place in the app that says a spend read means `direction: "spend"`. Every
 * screen goes through here; only the export, which is a backup and must not
 * filter, goes to the general read directly.
 */
export async function readSpendRange<Row>(options: {
  readonly what: string;
  readonly select: string;
  readonly schema: z.ZodType<Row>;
  readonly start?: PlainDate;
  readonly endExclusive?: PlainDate;
  readonly categoryId?: string;
  readonly noteContains?: string;
  readonly limit: number;
  readonly order?: readonly {
    readonly column: string;
    readonly ascending: boolean;
  }[];
}): Promise<{ rows: Row[]; matched: number | undefined }> {
  return readTransactionRange<Row>({ ...options, direction: "spend" });
}

/**
 * Read this month's spend rows, and refuse to return a month you cannot prove.
 *
 * A thin wrapper over `readSpendRange()` since spec 0009, and thin on purpose:
 * the month is one case of a range, so sharing the read is what stops
 * `/transactions`, `/breakdown`, and `/history` drifting apart. What this adds
 * on top is the month's own stricter rule, that a read which cannot be proved
 * complete throws rather than rendering.
 *
 * Its behaviour is unchanged from before that extraction, which spec 0009 AC-20
 * makes a requirement rather than a hope.
 */
export async function readSpendMonth<Row>(options: {
  readonly what: string;
  readonly select: string;
  readonly schema: z.ZodType<Row>;
  readonly window: MonthWindow;
  readonly order?: readonly {
    readonly column: string;
    readonly ascending: boolean;
  }[];
}): Promise<Row[]> {
  const { what, select, schema, window, order } = options;

  const { rows, matched } = await readSpendRange<Row>({
    what,
    select,
    schema,
    start: window.start,
    endExclusive: window.endExclusive,
    limit: MAX_MONTH_ROWS,
    order,
  });

  assertCompleteMonthRead(what, rows.length, matched);

  return rows;
}
