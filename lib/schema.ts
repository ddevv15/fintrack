import { z } from "zod";

import type { PlainDate } from "@/lib/time";

/**
 * The shape of every row this app reads or writes, and the only description of
 * the database that TypeScript can see.
 *
 * There is no ORM here, so nothing links the SQL in migrations/ to this file at
 * compile time. Spec 0002 answers that with two things working together: types
 * are inferred from these schemas rather than written a second time, so the
 * shape exists once; and every row is parsed before it reaches a screen, so a
 * column that was renamed in a migration fails loudly here instead of arriving
 * as undefined and becoming NaN inside a total.
 *
 * Keep this file in step with migrations/. tests/integration/schema-drift
 * fails when it drifts.
 */

/** Spend or income. One shared enum, matching the entry_direction type in SQL. */
export const entryDirectionSchema = z.enum(["spend", "income"]);
export type EntryDirection = z.infer<typeof entryDirectionSchema>;

/**
 * The ten colour tokens a category may carry.
 *
 * These are names, not colour values. Feature 4's design system decides what
 * each one actually looks like in light and dark, so nothing about appearance
 * is stored in the database. Must match the CHECK constraint on categories.color.
 */
export const categoryColorSchema = z.enum([
  "green",
  "orange",
  "blue",
  "purple",
  "yellow",
  "red",
  "pink",
  "teal",
  "slate",
  "emerald",
]);
export type CategoryColor = z.infer<typeof categoryColorSchema>;

/**
 * A calendar day as Postgres returns a DATE column: YYYY-MM-DD, no zone.
 *
 * The shape check alone is not enough, and neither is `Date.parse`. JavaScript
 * quietly rolls an overflow day forward: `Date.parse("2026-02-30")` returns the
 * 2nd of March rather than failing, so a day that does not exist would sail
 * through and only be caught later by Postgres, with a worse message. Building
 * the date back up and comparing every part is what actually rejects it.
 */
const plainDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a YYYY-MM-DD calendar day")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const rebuilt = new Date(Date.UTC(year, month - 1, day));
    return (
      rebuilt.getUTCFullYear() === year &&
      rebuilt.getUTCMonth() === month - 1 &&
      rebuilt.getUTCDate() === day
    );
  }, "must be a day that exists on the calendar");

/** A timestamptz as it arrives over the wire. */
const timestampSchema = z.iso.datetime({ offset: true });

/**
 * A SQL NULL becomes undefined rather than null.
 *
 * AGENTS.md asks for explicit undefined unions over null, and this is the one
 * boundary where the difference is decided, so it is decided once here.
 */
function nullableToUndefined<T extends z.ZodType>(inner: T) {
  return inner
    .nullable()
    .optional()
    .transform((value) => value ?? undefined);
}

/**
 * Whole minor units, as a bigint column arrives.
 *
 * A minor unit is the smallest unit the currency has, so how many of them make
 * one of anything you would say out loud is a fact about the currency and lives
 * in lib/currency.ts, never here.
 *
 * PostgREST may render a bigint as a JSON number or as a string depending on
 * the driver, so both are accepted and normalised to one number. The safe
 * integer check is the guarantee that matters: past 2^53 a JavaScript number
 * silently stops being exact, and this is a money app.
 */
const minorUnitsSchema = z
  .union([z.number(), z.string().regex(/^-?\d+$/)])
  .transform((value) => (typeof value === "string" ? Number(value) : value))
  .refine(Number.isSafeInteger, "money must be a whole number of minor units")
  .refine((amount) => amount > 0, "amount must be above zero");

/**
 * One person's profile row. Created by the database, never by the app.
 *
 * `currency` and `timezone` are nullable because undefined means not chosen
 * yet, which is a real state a new Google account arrives in. Nothing reads
 * either one as a default; `getSettings()` in lib/settings.ts is what turns
 * this row into either a complete settings object or an explicit incomplete
 * one, so no screen has to remember the difference.
 */
export const profileSchema = z.object({
  user_id: z.uuid(),
  display_name: nullableToUndefined(z.string().max(100)),
  currency: nullableToUndefined(z.string().regex(/^[A-Z]{3}$/)),
  timezone: nullableToUndefined(z.string().min(1)),
  created_at: timestampSchema,
});
export type Profile = z.infer<typeof profileSchema>;

/**
 * A row of the currencies reference table.
 *
 * The app reads this only to prove it agrees with lib/currency.ts. Screens read
 * the TypeScript list instead, so a picker never costs a query.
 */
export const currencyRowSchema = z.object({
  code: z.string().regex(/^[A-Z]{3}$/),
  decimals: z.number().int().min(0).max(3),
  name: z.string().min(1),
});
export type CurrencyRow = z.infer<typeof currencyRowSchema>;

/** What the app may change on its own profile. */
export const profileUpdateSchema = z.object({
  display_name: z.string().max(100).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  timezone: z.string().min(1).optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** A category you own. */
export const categorySchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string().min(1).max(60),
  kind: entryDirectionSchema,
  color: categoryColorSchema,
  is_hidden: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Category = z.infer<typeof categorySchema>;

/**
 * What the app sends when creating a category.
 *
 * user_id is absent on purpose: the column defaults to auth.uid(), so the
 * database decides the owner and the app never gets to name one.
 */
export const categoryInsertSchema = z.object({
  name: z.string().min(1).max(60),
  kind: entryDirectionSchema,
  color: categoryColorSchema.optional(),
});
export type CategoryInsert = z.infer<typeof categoryInsertSchema>;

/** What the app may change on a category. */
export const categoryUpdateSchema = categoryInsertSchema
  .partial()
  .extend({ is_hidden: z.boolean().optional() });
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

/** A spend or an income you logged. */
export const transactionSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  category_id: z.uuid(),
  direction: entryDirectionSchema,
  amount_minor: minorUnitsSchema,
  occurred_on: plainDateSchema,
  merchant: nullableToUndefined(z.string().max(200)),
  note: nullableToUndefined(z.string().max(500)),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Transaction = z.infer<typeof transactionSchema>;

/**
 * What the app sends when logging an entry.
 *
 * occurred_on is required because the column has no default. The calendar day
 * comes from today() in lib/time.ts, which reads APP_TIMEZONE, so a person in
 * one place is never given a server's idea of what day it is.
 */
export const transactionInsertSchema = z.object({
  category_id: z.uuid(),
  direction: entryDirectionSchema,
  amount_minor: minorUnitsSchema,
  occurred_on: plainDateSchema,
  merchant: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});
export type TransactionInsert = z.infer<typeof transactionInsertSchema>;

/** What the app may change on an entry. */
export const transactionUpdateSchema = transactionInsertSchema.partial();
export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;

/** The calendar day type, re-exported so callers need one import for a row. */
export type { PlainDate };

/**
 * Parse one row, or fail with an error that names the table and the field.
 *
 * Throwing is the point. Rule 11 of spec 0001 says a failing read shows an
 * honest error rather than a zero or a partial total, because a wrong money
 * figure shown confidently is worse than no figure at all.
 */
export function parseRow<T extends z.ZodType>(
  schema: T,
  table: string,
  row: unknown,
): z.infer<T> {
  const result = schema.safeParse(row);
  if (!result.success) {
    throw new Error(
      `Row from "${table}" did not match its schema:\n${formatIssues(result.error)}\n` +
        `The migration and lib/schema.ts have probably drifted apart.`,
    );
  }
  return result.data;
}

/** The same, for a result set. Fails on the first row that does not match. */
export function parseRows<T extends z.ZodType>(
  schema: T,
  table: string,
  rows: unknown,
): z.infer<T>[] {
  if (!Array.isArray(rows)) {
    throw new Error(
      `Expected an array of rows from "${table}", got ${typeof rows}`,
    );
  }
  return rows.map((row) => parseRow(schema, table, row));
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  ${issue.path.join(".") || "(row)"}: ${issue.message}`)
    .join("\n");
}
