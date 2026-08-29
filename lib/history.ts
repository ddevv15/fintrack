import { parseISO, isValid } from "date-fns";

import type { SpendCategoryOption } from "@/lib/categories";
import { readSpendRange } from "@/lib/month";
import type { MinorUnits } from "@/lib/money";
import {
  monthTransactionRowSchema,
  type MonthTransactionRow,
} from "@/lib/schema";
import { dayAfter, type PlainDate } from "@/lib/time";
import { toListedTransaction, type MonthTransaction } from "@/lib/transactions";

/**
 * Searching and filtering everything you have ever logged (spec 0009).
 *
 * Almost all of this file is pure, and that is the design rather than a habit.
 * The parts most worth proving here are the ones that decide what a filter
 * means: which query parameters survive, how a date you typed becomes a bound
 * the database can compare, whether a result set is whole enough to total, and
 * whether a return path is safe to navigate to. None of those need a backend, a
 * browser, or a signed in account to prove, so none of them takes one.
 *
 * The one function that does reach the database, `loadHistory()`, writes no
 * filter of its own. It goes through `readSpendRange()` in `lib/month.ts`, the
 * single definition every spend read in the app shares, so filtering this
 * screen to the current month cannot produce a total that disagrees with the
 * one on `/transactions` (AC-21).
 */

/** How many rows the screen will render at once. */
export const MAX_HISTORY_ROWS = 200;

/**
 * A bound on rendering, and deliberately not `MAX_MONTH_ROWS`.
 *
 * That one bounds a month's rows in memory and sits at 5000. This one bounds
 * what a person is asked to scroll and what a phone is asked to lay out, over a
 * range with no natural end. Two numbers because they answer two questions;
 * collapsing them would make one of the answers wrong.
 */

/** The four filters, each optional, after parsing. */
export type HistoryFilters = {
  readonly categoryId: string | undefined;
  /** Included. */
  readonly from: PlainDate | undefined;
  /** Inclusive as typed. Converted to a half open bound before the query. */
  readonly to: PlainDate | undefined;
  readonly note: string | undefined;
};

/** Which filter was thrown away, and what to tell the person about it. */
export type DroppedFilter = {
  readonly field: "category" | "from" | "to" | "q";
  readonly reason: string;
};

export type ParsedHistoryFilters = {
  readonly filters: HistoryFilters;
  /** Never silently empty: every unusable parameter appears here. */
  readonly dropped: readonly DroppedFilter[];
  /** Set when the range itself is impossible. No query should run. */
  readonly rangeError: string | undefined;
};

/** What Next hands a page as its resolved search params. */
export type HistorySearchParams = Readonly<
  Record<string, string | string[] | undefined>
>;

/** The longest note the column can hold, so the longest term worth matching. */
const NOTE_MAX_LENGTH = 500;

/** One value, or nothing. A repeated parameter takes its first occurrence. */
function single(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim();
  return trimmed ? trimmed : undefined;
}

/** A real calendar day, not merely four digits, a dash, and some numbers. */
function isPlainDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value));
}

/**
 * Turn a query string into filters, saying out loud what it could not use.
 *
 * The category list is an argument rather than something read here, and that is
 * what keeps this function pure while still letting it answer a question only
 * your own data can settle: whether a category id is yours. The page loads that
 * list anyway to render the picker, so nothing is read twice (AC-13).
 *
 * A parameter it cannot use is dropped and reported, never dropped quietly. The
 * reason is specific to money rather than general tidiness: a `from` that
 * silently vanishes widens the range, and the total shown beside the results
 * would then answer a question nobody asked, confidently. That is the failure
 * rule 3 of `AGENTS.md` exists to prevent.
 *
 * A category that never existed, one belonging to somebody else, and one that
 * is not a uuid all come back with the same wording, so the three stay
 * indistinguishable (AC-19). Row level security already makes the second
 * invisible; the job here is not to put the difference back.
 */
export function parseHistoryFilters(
  searchParams: HistorySearchParams,
  categoryOptions: readonly SpendCategoryOption[],
): ParsedHistoryFilters {
  const dropped: DroppedFilter[] = [];

  const rawCategory = single(searchParams.category);
  let categoryId: string | undefined;
  if (rawCategory !== undefined) {
    if (categoryOptions.some((option) => option.id === rawCategory)) {
      categoryId = rawCategory;
    } else {
      dropped.push({
        field: "category",
        reason: "that category is not one of yours, so it was ignored",
      });
    }
  }

  const readDate = (
    field: "from" | "to",
    label: string,
  ): PlainDate | undefined => {
    const raw = single(searchParams[field]);
    if (raw === undefined) return undefined;
    if (isPlainDate(raw)) return raw;
    dropped.push({
      field,
      reason: `${label} was not a real date, so it was ignored`,
    });
    return undefined;
  };

  const from = readDate("from", "the start date");
  const to = readDate("to", "the end date");

  const rawNote = single(searchParams.q);
  let note: string | undefined;
  if (rawNote !== undefined) {
    if (rawNote.length <= NOTE_MAX_LENGTH) {
      note = rawNote;
    } else {
      dropped.push({
        field: "q",
        reason: `a note cannot be longer than ${NOTE_MAX_LENGTH} characters, so that search was ignored`,
      });
    }
  }

  // Refused rather than run. An impossible range always matches nothing, and
  // "nothing matched your filters" would then be a true sentence about a
  // question that could never have had an answer (AC-9, AC-14).
  const rangeError =
    from !== undefined && to !== undefined && from > to
      ? "The start date is after the end date, so nothing could fall between them. Swap them to see results."
      : undefined;

  return { filters: { categoryId, from, to, note }, dropped, rangeError };
}

/** The only two screens an edit may return to. */
const RETURN_ROUTES: readonly string[] = ["/history", "/transactions"];

/**
 * Decide where an edit is allowed to send you back to.
 *
 * A navigation target taken from a query parameter is an open redirect unless
 * it is checked, and the two obvious checks are both wrong here, which is why
 * spec 0009 AC-18 fixes the algorithm rather than saying "an allow list". The
 * value carries a query string, so exact membership never matches
 * `/history?q=coffee`; and a `startsWith` test happily accepts `/historyXYZ`.
 *
 * So: refuse anything that is not a single leading slash, which rules out an
 * absolute URL and a protocol relative `//host` in one step, and refuse a
 * backslash, which some browsers treat as a slash. Then parse against a fixed
 * internal base and compare the pathname alone, exactly.
 *
 * What comes back is rebuilt from the parsed URL rather than passed through, so
 * the caller can only ever navigate to a normalised internal path.
 */
export function resolveReturnPath(value: string | undefined): string {
  const fallback = "/transactions";

  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;

  let url: URL;
  try {
    url = new URL(value, "http://internal");
  } catch {
    return fallback;
  }

  if (!RETURN_ROUTES.includes(url.pathname)) return fallback;

  return `${url.pathname}${url.search}`;
}

/** What the screen renders, and whether it may show a total. */
export type HistoryResults = {
  /** Newest first, already ordered by the database. */
  readonly rows: readonly MonthTransaction[];
  /** The exact count the database reported for the same filter. */
  readonly matched: number;
  /** True when every matching row is on screen. */
  readonly isComplete: boolean;
  /** Present only when the set is complete. Never a partial figure. */
  readonly totalMinor: MinorUnits | undefined;
};

/**
 * Shape the rows and decide whether a total may be shown, with no side effects.
 *
 * The completeness test compares what arrived against a number the database
 * produced independently, never against the length of the array being measured,
 * which would compare a number with itself. That is the same reasoning
 * `assertCompleteMonthRead()` rests on, applied to a screen that answers to a
 * gentler standard: a month refuses to render at all when it cannot be proved
 * whole, while history is a finder and stays useful, so it shows the rows and
 * withholds only the total (AC-11).
 *
 * The total is summed in one pass over exactly the rows being returned, so the
 * figure above the list and the figures in it come from the same array rather
 * than from a second query that could see a different one.
 */
export function summariseHistory(
  rows: readonly MonthTransactionRow[],
  matched: number,
): HistoryResults {
  const isComplete = rows.length === matched;

  let totalMinor = 0;
  const listed = rows.map((row) => {
    totalMinor += row.amount_minor;
    return toListedTransaction(row);
  });

  return {
    rows: listed,
    matched,
    isComplete,
    totalMinor: isComplete ? totalMinor : undefined,
  };
}

/**
 * Render a match count for reading, as `1,340`.
 *
 * The locale is `en-US` for everyone, matching `lib/time.ts`, because the
 * profile carries a currency and a timezone but no locale. Spec 0009 folds this
 * into the open question spec 0005 already recorded rather than inventing a
 * second answer to it here.
 */
export function formatMatchCount(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

/**
 * Read the matching spend entries, newest first, with the count that matched.
 *
 * Writes no filter of its own: the direction, the bounds, the category, the
 * note match, and the exact count all belong to `readSpendRange()`, so this
 * screen and the two month screens cannot drift apart (AC-20, AC-21). The one
 * conversion it does is the inclusive `to` you typed into the half open bound
 * the query wants, through `dayAfter()` (AC-8).
 *
 * Throws when the database reports no count. Unlike a month, this screen does
 * not need a complete set to be useful, but it does need to know how many
 * matched: without that number it can neither say what it is showing nor tell
 * whether a total would be whole, and guessing either is the confident wrong
 * figure rule 3 forbids.
 */
export async function loadHistory(
  filters: HistoryFilters,
): Promise<HistoryResults> {
  // Two orderings, not one, matching `transactions_owner_occurred_idx` so the
  // database reads them in order rather than sorting afterwards. Without the
  // second, entries on the same day come back in whatever order Postgres
  // happens to choose, which can differ between two reads of unchanged data.
  const { rows, matched } = await readSpendRange<MonthTransactionRow>({
    what: "Your history",
    select: "id,amount_minor,occurred_on,note,categories(id,name,color)",
    schema: monthTransactionRowSchema,
    start: filters.from,
    endExclusive: filters.to === undefined ? undefined : dayAfter(filters.to),
    categoryId: filters.categoryId,
    noteContains: filters.note,
    limit: MAX_HISTORY_ROWS,
    order: [
      { column: "occurred_on", ascending: false },
      { column: "created_at", ascending: false },
    ],
  });

  if (typeof matched !== "number") {
    throw new Error(
      "Your history came back without a row count, so there is no way to say how many entries matched or whether a total would be whole.",
    );
  }

  return summariseHistory(rows, matched);
}
