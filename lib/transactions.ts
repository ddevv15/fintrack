import { z } from "zod";

import { fault } from "@/lib/errors";
import { createInsforgeServer } from "@/lib/insforge-server";
import { currentSpendMonth, readSpendMonth } from "@/lib/month";
import type { MinorUnits } from "@/lib/money";
import {
  editTransactionRowSchema,
  monthTransactionRowSchema,
  parseRow,
  type CategoryColor,
  type EditTransactionRow,
  type MonthTransactionRow,
} from "@/lib/schema";
import { requireCompleteSettings } from "@/lib/settings";
import type { PlainDate } from "@/lib/time";

/**
 * This month's entries, as a plain list you can check line by line.
 *
 * The screen this feeds and the breakdown screen have to agree about a month or
 * they quietly report two different totals for it, so neither writes its own
 * window or its own spend filter: both go through `lib/month.ts` (spec 0007).
 *
 * The summing is split from the query for the same reason `summariseMonth()` is
 * in `lib/breakdown.ts`: the arithmetic is the part most worth proving, and
 * keeping it pure means it can be proved without a backend, a browser, or a
 * signed in account.
 */

/** One entry, as the list renders it. */
export type MonthTransaction = {
  readonly id: string;
  readonly amountMinor: MinorUnits;
  readonly occurredOn: PlainDate;
  readonly note: string | undefined;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly color: CategoryColor;
  };
};

/** A whole month, in the order it will be shown, with its running total. */
export type MonthTransactions = {
  /** The first day of the month, and the source of the heading. */
  readonly month: PlainDate;
  readonly totalMinor: MinorUnits;
  /** Newest first, already ordered by the database. */
  readonly rows: readonly MonthTransaction[];
};

/**
 * Turn a month of rows into a list and its total, with no side effects.
 *
 * The order is left exactly as it arrived. Ordering is the database's job here
 * (AC-1), through the `(user_id, occurred_on DESC, created_at DESC)` index spec
 * 0002 built, and re-sorting in TypeScript would both duplicate that rule and
 * hide it from the only place that can do it efficiently.
 *
 * The total is summed in one pass over exactly the rows being returned (AC-3),
 * so the figure above the list and the figures in it cannot disagree: they come
 * from the same array, not from a second query that could see a different one.
 */
export function summariseTransactions(
  month: PlainDate,
  rows: readonly MonthTransactionRow[],
): MonthTransactions {
  let totalMinor = 0;

  const listed = rows.map((row) => {
    totalMinor += row.amount_minor;
    return toListedTransaction(row);
  });

  return { month, totalMinor, rows: listed };
}

/**
 * One stored row as the list renders it.
 *
 * Pulled out so `/history` shapes a row identically (spec 0009). Two screens
 * showing the same entry from two mappings is a smaller version of the same
 * problem two month definitions cause: they can come to disagree about what an
 * entry says, and nothing complains.
 */
export function toListedTransaction(
  row: MonthTransactionRow,
): MonthTransaction {
  return {
    id: row.id,
    amountMinor: row.amount_minor,
    occurredOn: row.occurred_on,
    note: row.note,
    category: row.categories,
  };
}

/**
 * Read every spend logged this month for the signed in person, newest first.
 *
 * The month comes from that person's own timezone through `getSettings()`,
 * never the server clock and never the browser (AC-2), and it is the identical
 * window `loadMonthBreakdown()` uses because both ask `lib/month.ts` for it.
 *
 * Throws rather than returning anything partial: a read that cannot be proved
 * complete refuses to render a total that might be short (AC-7).
 */
export async function loadMonthTransactions(): Promise<MonthTransactions> {
  const settings = await requireCompleteSettings();
  const window = currentSpendMonth(new Date(), settings.timezone);

  // Two orderings, not one. Entries on the same day are common enough that
  // without the second the order among them is whatever Postgres happens to
  // return, which can differ between two reads of unchanged data (AC-1). The
  // pair matches `transactions_owner_occurred_idx` exactly, so the database
  // reads them in order rather than sorting them afterwards.
  const rows = await readSpendMonth<MonthTransactionRow>({
    what: "This month's entries",
    select: "id,amount_minor,occurred_on,note,categories(id,name,color)",
    schema: monthTransactionRowSchema,
    window,
    order: [
      { column: "occurred_on", ascending: false },
      { column: "created_at", ascending: false },
    ],
  });

  return summariseTransactions(window.month, rows);
}

/**
 * Read one entry to put in the edit form, or say there is no such entry.
 *
 * `undefined` covers three different situations on purpose, and keeping them
 * indistinguishable is the security requirement rather than a simplification
 * (AC-15). An id that never existed, an id belonging to somebody else, and an
 * id that is not even a uuid all come back the same way and all render the same
 * not found page. Row level security already makes the second one invisible to
 * the query; the job here is to not reintroduce the difference by handling the
 * three cases differently.
 *
 * A genuine read failure still throws, because that is a different thing again:
 * "this entry is not yours" and "the database did not answer" must not both
 * render as a missing entry.
 */
export async function loadTransactionForEdit(
  id: string,
): Promise<EditTransactionRow | undefined> {
  // Checked before the query rather than after. PostgREST answers a malformed
  // uuid with an error, not an empty result, so without this a typo in the URL
  // would render the error boundary while a stranger's id rendered not found,
  // and the difference between those two pages is itself a signal.
  if (!z.uuid().safeParse(id).success) return undefined;

  const insforge = await createInsforgeServer();

  // `direction` is filtered, not read: this screen edits spending, and an
  // income entry (feature 14) must not open in a form that would write it back
  // as one. `user_id` is absent, as everywhere: ownership is row level
  // security's answer.
  const result = await insforge.database
    .from("transactions")
    .select(
      "id,amount_minor,occurred_on,note,categories(id,name,color,is_hidden)",
    )
    .eq("id", id)
    .eq("direction", "spend")
    .maybeSingle();

  if (result.error) {
    // Logged, not carried. See `fault()` for why a driver payload must not
    // reach a message that spec 0011 copies verbatim into every report.
    console.error("[read] That entry failed", result.error);
    throw fault("That entry");
  }

  if (!result.data) return undefined;

  return parseRow(editTransactionRowSchema, "transactions", result.data);
}
