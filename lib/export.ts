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
