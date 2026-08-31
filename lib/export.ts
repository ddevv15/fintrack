import { readTransactionRange, type TransactionCursor } from "@/lib/month";
import {
  parseRows,
  exportCategoryRowSchema,
  exportTransactionRowSchema,
  type ExportCategoryRow,
  type ExportTransactionRow,
} from "@/lib/schema";
import { createInsforgeServer } from "@/lib/insforge-server";
import { formatAmountInput } from "@/lib/money";
import { toUtcInstant } from "@/lib/time";

/**
 * Taking everything you logged out of the app as a file (spec 0010).
 *
 * The half of this module that decides what the bytes look like is pure, and
 * that is the design rather than a habit. Every rule that makes a CSV open
 * correctly rather than merely parse, the quoting, the order the quoting is
 * applied in, the byte order mark, the line endings, is provable with no
 * backend, no request, and no clock. The other half reads, and it reads through
 * `lib/month.ts` so the file's claim to match what the app shows is structural
 * rather than hopeful (AC-17, AC-19).
 */

/**
 * The characters that force a field to be quoted, per RFC 4180.
 *
 * A comma would otherwise start a new field, a line ending would start a new
 * record, and a double quote is the escape character itself.
 */
const MUST_QUOTE = /["\r\n,]/;

/** The UTF-8 byte order mark. */
const BYTE_ORDER_MARK = "﻿";

/**
 * The record separator RFC 4180 specifies.
 *
 * A bare line feed is what most tools emit and every parser accepts, and it is
 * still not what the standard says. The cost of following the standard here is
 * one extra byte per row; the cost of not following it is an argument with
 * whichever parser turns out to be strict.
 */
const RECORD_SEPARATOR = "\r\n";

/**
 * Write one field so it survives being read back.
 *
 * Quoting is decided by the field's own characters rather than applied to
 * everything, so a file stays readable to a human opening it in a text editor.
 *
 * The order is fixed by spec 0010 AC-4 rather than left to taste, and the shape
 * of this function is what enforces it: the doubling runs on `value`, which is
 * the unwrapped field, and the wrapping quotes are added by the template after
 * that. Doing it the other way round would double the wrapping quotes the first
 * step had just added, and every quoted field in the file would be corrupt in a
 * way that still parses.
 */
export function escapeCsvField(value: string): string {
  if (!MUST_QUOTE.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Assemble a whole CSV document, header row first.
 *
 * The byte order mark leads, because without it Excel on Windows reads a UTF-8
 * file as its local codepage and an accented note comes out as nonsense. It is
 * three bytes, and it is the difference between a file that opens by double
 * click and one that needs an import dialogue nobody wants to be shown.
 *
 * Every record ends with the separator, the last one included, so the file ends
 * with a newline the way a text file is expected to. A document with no rows is
 * a header and a newline, which is a valid CSV and an honest answer for an
 * account with nothing in it (AC-14).
 */
export function toCsvDocument(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const records = [header, ...rows];

  const body = records
    .map((record) => record.map(escapeCsvField).join(","))
    .join(RECORD_SEPARATOR);

  return `${BYTE_ORDER_MARK}${body}${RECORD_SEPARATOR}`;
}

/**
 * How many rows either export will build in memory at once.
 *
 * A bound on one response, and deliberately neither `MAX_MONTH_ROWS` (5000,
 * which bounds a month) nor `MAX_HISTORY_ROWS` (200, which bounds what a person
 * is asked to scroll). Three numbers because they answer three questions.
 *
 * A row costs roughly a kilobyte held as an object, so this ceiling is about a
 * hundred megabytes. Twenty entries a day for ten years is 73,000 rows, so it
 * clears a decade of heavy use with room over. It is reasoned rather than
 * measured, which spec 0010 records as a follow up: profile the hosting plan
 * and set this from the measurement.
 *
 * Meeting it is a refusal you can read, never a truncated file (AC-13).
 */
export const MAX_EXPORT_ROWS = 100_000;

/**
 * How many rows one read asks for while paging.
 *
 * Matched to PostgREST's usual server side maximum, so a page is never silently
 * shortened underneath the reader. A page that came back short for that reason
 * would still advance the cursor correctly, but it would cost extra round trips
 * for no gain.
 */
export const EXPORT_PAGE_SIZE = 1_000;

/**
 * The order every export page is read in.
 *
 * Three keys, not two. The first two match `transactions_owner_occurred_idx`,
 * so the database reads them in order rather than sorting afterwards. The third
 * is the tie break that makes the order total: two rows sharing a day and an
 * instant have no order between them without it, and two rows with no order
 * between them is exactly where a keyset cursor loses one.
 */
const EXPORT_ORDER = [
  { column: "occurred_on", ascending: false },
  { column: "created_at", ascending: false },
  { column: "id", ascending: false },
] as const;

/** Every column the transactions file carries, and nothing else. */
const TRANSACTION_SELECT =
  "id,category_id,direction,amount_minor,occurred_on,merchant,note,created_at,categories(name)";

/**
 * What a loader hands back: the whole set, or a refusal naming why not.
 *
 * A returned refusal rather than a thrown one, matching
 * `completeProfileOrRefusal()`, because being above the ceiling is an expected
 * outcome with something to say to the person, not a failure. A read that
 * actually fails still throws, and still reaches the route as an error (AC-12).
 */
export type ExportLoad<Row> =
  | { readonly ok: true; readonly rows: readonly Row[] }
  | {
      readonly ok: false;
      readonly matched: number;
      readonly limit: number;
    };

/**
 * Refuse a set whose size disagrees with the count the database reported.
 *
 * Two directions, because the comparison has always had two and the message
 * used to have one. Short is a row that never arrived. Long is the opposite
 * failure and it is reachable: the count is its own query taken before paging
 * begins, so an entry saved on another device while the export is reading is
 * not in `matched`, and if it is backdated it sorts below the cursor and a
 * later page hands it over. Calling that "missing entries" sends somebody
 * looking for a row that is not lost, and hides the race that actually
 * happened.
 *
 * Both refuse, and that is not symmetry for its own sake. A long set is not
 * proof of a whole one, it is proof the table moved mid read, so the rows in
 * memory are a mix of two moments rather than a snapshot of either.
 */
function assertExportCountMatches(
  what: string,
  received: number,
  reported: number,
): void {
  if (received === reported) return;

  if (received < reported) {
    throw new Error(
      `${what} came back short: ${received} rows for a reported count of ${reported}. Refusing to hand over a backup that is missing entries.`,
    );
  }

  throw new Error(
    `${what} came back long: ${received} rows for a reported count of ${reported}. Something was written while the export was reading, so these rows are not one moment in time. Refusing to hand over a backup that cannot be proved to be a snapshot. Try again.`,
  );
}

/**
 * Read every transaction on the account, proved complete or not handed over.
 *
 * Three things happen in order, and the order is the guarantee.
 *
 * First the count, in its own one row read, so an account above the ceiling is
 * refused for the cost of a single query rather than most of a file (AC-13).
 *
 * Then the paging, by keyset rather than by offset. Each page asks for the rows
 * ordered after the last `(occurred_on, created_at, id)` tuple it saw. An
 * offset would be a position, and a row inserted or edited between two pages
 * shifts every later position by one, which duplicates or drops a row. The
 * cruel part of that failure is that the count check below cannot see it: an
 * edit leaves the total unchanged, so the file would pass its own test while
 * being wrong. A cursor is a value, so a concurrent write cannot move it.
 *
 * Then the comparison, against the number the database reported rather than
 * against the length of the array just built, which would compare a number with
 * itself. Short by one row and nothing is returned at all (AC-11, AC-12).
 *
 * It writes no filter of its own: the direction, the ordering, the cursor, and
 * the exact count all belong to `readTransactionRange()`, so this file and
 * every screen cannot drift apart (AC-17). It passes no direction at all, which
 * is what makes this a backup rather than a report: it reads income too, so the
 * file is already right on the day feature 14 lands.
 */
export async function loadAllTransactions(): Promise<
  ExportLoad<ExportTransactionRow>
> {
  const what = "Your transactions";

  // The count, before any paging begins. `limit: 1` because PostgREST reports
  // the exact count for the whole filter whatever the limit, so this costs one
  // row rather than a page.
  const counted = await readTransactionRange<ExportTransactionRow>({
    what,
    select: TRANSACTION_SELECT,
    schema: exportTransactionRowSchema,
    limit: 1,
    order: EXPORT_ORDER,
  });

  const matched = counted.matched;
  if (typeof matched !== "number") {
    throw new Error(
      `${what} came back without a row count, so there is no way to prove the file would hold everything. Refusing to hand over a backup that might be short.`,
    );
  }

  if (matched > MAX_EXPORT_ROWS) {
    return { ok: false, matched, limit: MAX_EXPORT_ROWS };
  }

  const rows: ExportTransactionRow[] = [];
  let after: TransactionCursor | undefined;

  while (rows.length < matched) {
    const page = await readTransactionRange<ExportTransactionRow>({
      what,
      select: TRANSACTION_SELECT,
      schema: exportTransactionRowSchema,
      after,
      limit: EXPORT_PAGE_SIZE,
      order: EXPORT_ORDER,
    });

    // A page with nothing in it means the table ran out before the count said
    // it would, which is a row deleted mid export. Break rather than loop for
    // ever; the comparison below is what turns it into an honest failure.
    if (page.rows.length === 0) break;

    rows.push(...page.rows);

    const last = page.rows[page.rows.length - 1];
    after = {
      occurredOn: last.occurred_on,
      createdAt: last.created_at,
      id: last.id,
    };
  }

  assertExportCountMatches(what, rows.length, matched);

  return { ok: true, rows };
}

/**
 * Read every category on the account, proved complete or not handed over.
 *
 * It does not go through `readTransactionRange()`, and that is not an escape
 * from the invariant: this reads a different table, and the invariant is about
 * two things computing the same money figure from two definitions. There is no
 * money here. It does keep the same completeness rule, because a backup missing
 * a category is missing the thing that explains every `category_id` in the
 * other file.
 *
 * `user_id` is not in the select, so the file cannot carry it and no filter here
 * could name it. Which categories exist at all is row level security (AC-16).
 */
export async function loadAllCategories(): Promise<
  ExportLoad<ExportCategoryRow>
> {
  const what = "Your categories";

  const insforge = await createInsforgeServer();

  const result = await insforge.database
    .from("categories")
    .select("id,name,kind,color,is_hidden,created_at", { count: "exact" })
    .order("name", { ascending: true })
    .limit(MAX_EXPORT_ROWS);

  if (result.error) {
    throw new Error(
      `Could not read ${what.toLowerCase()}: ${JSON.stringify(result.error)}`,
    );
  }

  const matched = result.count ?? undefined;
  if (typeof matched !== "number") {
    throw new Error(
      `${what} came back without a row count, so there is no way to prove the file would hold everything. Refusing to hand over a backup that might be short.`,
    );
  }

  if (matched > MAX_EXPORT_ROWS) {
    return { ok: false, matched, limit: MAX_EXPORT_ROWS };
  }

  const rows = parseRows(exportCategoryRowSchema, "categories", result.data);

  assertExportCountMatches(what, rows.length, matched);

  return { ok: true, rows };
}

/**
 * The transactions file's columns, in the order AC-4 fixes.
 *
 * What a person reads is on the left and what a restore needs is on the right,
 * so the file opens usefully and still holds enough to be read back one day.
 * `user_id` is not here, and is not in the select either.
 */
export const TRANSACTION_HEADER = [
  "date",
  "category",
  "amount",
  "currency",
  "note",
  "merchant",
  "direction",
  "id",
  "category_id",
  "created_at",
] as const;

/** The categories file's columns, in the order AC-5 fixes. */
export const CATEGORY_HEADER = [
  "name",
  "kind",
  "color",
  "hidden",
  "id",
  "created_at",
] as const;

/**
 * One stored entry as the ten fields the file carries.
 *
 * Three of these are decisions rather than copies, and each is an acceptance
 * criterion. The amount goes through `formatAmountInput()`, the only module
 * allowed to convert money, which splits the digit string rather than dividing:
 * exact every time, `12.50` on a two decimal currency and `1250` on yen (AC-6).
 * `occurred_on` is written through untouched, because it is already the plain
 * day you chose and carries no timezone question, while `created_at` becomes a
 * UTC instant (AC-7). And a note or a merchant you never filled in becomes an
 * empty field here, not the word `null` and not anywhere near the writer as
 * `undefined` (AC-4).
 */
export function toTransactionCsvRow(
  row: ExportTransactionRow,
  currency: string,
): readonly string[] {
  return [
    row.occurred_on,
    row.categories.name,
    formatAmountInput(row.amount_minor, currency),
    currency,
    row.note ?? "",
    row.merchant ?? "",
    row.direction,
    row.id,
    row.category_id,
    toUtcInstant(row.created_at),
  ];
}

/**
 * One stored category as the six fields the file carries.
 *
 * `hidden` is written as `true` or `false` rather than as the database's own
 * spelling, and `color` is the stored token passed through, which is what the
 * app holds and what a reimport would need (AC-5).
 */
export function toCategoryCsvRow(row: ExportCategoryRow): readonly string[] {
  return [
    row.name,
    row.kind,
    row.color,
    row.is_hidden ? "true" : "false",
    row.id,
    toUtcInstant(row.created_at),
  ];
}

/**
 * Name the file after the app, its contents, and the day you took it.
 *
 * The day comes from the profile's own timezone rather than the server clock,
 * so two backups taken either side of your midnight are named the way you would
 * name them. Several of them sort in order in a folder and none overwrites
 * another (AC-15).
 */
export function exportFilename(what: string, day: string): string {
  return `fintrack-${what}-${day}.csv`;
}

/** The one content type both files answer with. */
const TEXT = "text/plain; charset=utf-8";

/**
 * Hand a finished document over as a download.
 *
 * `attachment` is what makes the browser save it rather than render it, and it
 * is what carries the filename, since the URL itself has no extension.
 */
export function csvAttachment(document: string, filename: string): Response {
  return new Response(document, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // A backup is a point in time. Serving a stale one from a cache would be
      // the quietest possible way to hand somebody the wrong file.
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Answer an account too large to build in one response.
 *
 * 413 rather than 500, because nothing failed: the request is understood and
 * refused. Plain text rather than JSON, because you reach this by clicking a
 * link, so whatever it says lands in front of a person in a browser tab
 * (AC-13).
 */
export function tooLargeResponse(matched: number, limit: number): Response {
  const format = (count: number) =>
    new Intl.NumberFormat("en-US").format(count);

  return new Response(
    `This export would be ${format(matched)} rows, and ${format(limit)} is the most it can build at once. ` +
      `Nothing was written, because half a backup is worse than none. Ask for this to be raised, or export from a smaller account.`,
    { status: 413, headers: { "Content-Type": TEXT } },
  );
}

/**
 * Answer a read that failed or came back short.
 *
 * The message is the thrown one, because these are written to be read: "came
 * back short: 12 rows for a reported count of 13" tells you what happened, and
 * a generic apology does not. Rule 3 of `AGENTS.md` is that an honest error
 * beats a confident wrong figure, and here the wrong figure would be a file
 * (AC-12).
 */
export function failedResponse(error: unknown): Response {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong building your export.";

  return new Response(`${message}\n\nNothing was downloaded.`, {
    status: 500,
    headers: { "Content-Type": TEXT },
  });
}
