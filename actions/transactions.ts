"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/lib/forms";
import { createInsforgeServer } from "@/lib/insforge-server";
import { formatAmount, parseAmount } from "@/lib/money";
import { monthSpendRowSchema, parseRow } from "@/lib/schema";
import { requireCompleteSettings } from "@/lib/settings";
import { today } from "@/lib/time";

/**
 * Writing an entry.
 *
 * Built to spec 0006. Two things here are load bearing and easy to undo by
 * accident, so both are stated where they happen: the amount is parsed by
 * `parseAmount()` and never by arithmetic, and this action narrows the profile
 * itself rather than trusting the completeness redirect in the layout above it.
 */

/** The one line summary plus the field that caused it. */
function fieldError(name: string, message: string): FormState {
  return {
    status: "error",
    message: "Check the fields below.",
    fieldErrors: { [name]: message },
  };
}

/**
 * What the form submits, before any of it is trusted.
 *
 * The amount stays raw text on purpose. Turning it into a number is
 * `parseAmount()`'s job, and it needs the currency's decimal count, which is
 * read from the profile below rather than carried in the form where a browser
 * could change it. A Zod coercion here would do the multiplication this whole
 * feature exists to avoid.
 *
 * Lives beside the action rather than in `lib/schema.ts`, matching the setup
 * and profile forms: that file describes database rows, and this describes a
 * browser payload.
 */
const logSpendSchema = z.object({
  amount: z.string(),
  categoryId: z.uuid("Choose a category."),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
    .refine((value) => {
      const [year, month, day] = value.split("-").map(Number);
      const rebuilt = new Date(Date.UTC(year, month - 1, day));
      return (
        rebuilt.getUTCFullYear() === year &&
        rebuilt.getUTCMonth() === month - 1 &&
        rebuilt.getUTCDate() === day
      );
    }, "That day does not exist on the calendar."),
  note: z.string().max(500, "Keep the note under 500 characters.").optional(),
});

/**
 * Turn a refusal from Postgres into something a person can act on.
 *
 * Rule 3 of `AGENTS.md`: return the error and show it. The unmapped case is
 * deliberately still an error and deliberately still honest about nothing
 * having been written, because the alternative, reporting a save that did not
 * happen, is the one outcome this app must never produce.
 */
function describeDatabaseRefusal(error: { code?: string; message?: string }): {
  field?: string;
  message: string;
} {
  const code = error.code ?? "";
  const message = error.message ?? "";

  // The BEFORE INSERT trigger that refuses any spend while the profile is
  // incomplete. Matched on its message because it raises a plain exception
  // rather than a constraint violation with a code of its own.
  if (/currency|timezone|incomplete|profile/i.test(message)) {
    return {
      message:
        "Choose your currency and time zone before logging a spend, on the account screen.",
    };
  }

  // The three column foreign key: the category is not yours, or its kind is
  // not spend. Both mean the same thing to the person looking at the picker.
  if (code === "23503") {
    return {
      field: "categoryId",
      message: "That category is not one of your spend categories.",
    };
  }

  // A CHECK constraint: the amount or the note is something the column
  // refuses. The parse should have caught the amount already, so reaching
  // here means the two disagree, which is worth saying plainly.
  if (code === "23514") {
    return {
      message:
        "That entry has a value this app cannot store. Check the amount and the note.",
    };
  }

  return {
    message: `Could not save that spend. Nothing was recorded, so it is safe to try again.${message ? ` (${message})` : ""}`,
  };
}

/**
 * Log one spend.
 *
 * The order of the guards is the design. The profile is narrowed first,
 * because everything after it needs a currency and a time zone and neither may
 * be guessed. The shape is checked next, then the amount, then the day, and
 * only then does anything reach the database, where the composite foreign key
 * and the amount check have the final say.
 *
 * `requireCompleteSettings()` is not redundant with the redirect in
 * `app/(app)/layout.tsx`, and that is worth knowing before anyone removes it: a
 * server action is its own entry point reached by a POST, so no layout runs for
 * it and no redirect in one can protect it (AC-14).
 */
export async function logSpend(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const settings = await requireCompleteSettings();

  const rawNote = String(formData.get("note") ?? "").trim();
  const parsed = logSpendSchema.safeParse({
    amount: String(formData.get("amount") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
    // A blank note becomes absent rather than an empty string, so a note is
    // either real text or nothing at all, and the column never holds "".
    note: rawNote === "" ? undefined : rawNote,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fieldError(String(issue.path[0] ?? "amount"), issue.message);
  }

  // The decimal count comes from the profile, on the server, at the moment of
  // the save. Never from the form, and never a hardcoded two.
  const amount = parseAmount(parsed.data.amount, settings.decimals);
  if (!amount.ok) {
    return fieldError("amount", amount.reason);
  }

  // Today in your own zone, computed here rather than accepted from the
  // browser, so a clock set wrong on a laptop cannot file a spend in next
  // month (AC-6).
  const currentDay = today(new Date(), settings.timezone);
  if (parsed.data.occurredOn > currentDay) {
    return fieldError(
      "occurredOn",
      "You cannot log a spend for a day that has not happened yet.",
    );
  }

  const insforge = await createInsforgeServer();

  // `user_id` is absent on purpose: the column defaults to auth.uid(), so the
  // database decides the owner and this action never gets to name one.
  // `direction` is the constant this feature writes; income is feature 14's.
  const result = await insforge.database
    .from("transactions")
    .insert([
      {
        category_id: parsed.data.categoryId,
        direction: "spend",
        amount_minor: amount.minor,
        occurred_on: parsed.data.occurredOn,
        ...(parsed.data.note ? { note: parsed.data.note } : {}),
      },
    ])
    // Returns what was actually stored, with its category, so the confirmation
    // below quotes the row rather than the typed text.
    .select("amount_minor,categories(id,name,color)");

  if (result.error) {
    const { field, message } = describeDatabaseRefusal(result.error);
    return field ? fieldError(field, message) : { status: "error", message };
  }

  const stored = parseRow(
    monthSpendRowSchema,
    "transactions",
    Array.isArray(result.data) ? result.data[0] : result.data,
  );

  // The breakdown totals this month from these rows, so a new spend has to
  // invalidate it or the two screens disagree until something else reloads.
  revalidatePath("/breakdown");

  return {
    status: "ok",
    message: `Saved ${formatAmount(stored.amount_minor, settings.currency)} to ${stored.categories.name}`,
  };
}
