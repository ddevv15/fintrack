"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { FormState } from "@/lib/forms";
import { createInsforgeServer } from "@/lib/insforge-server";
import { currentSpendMonth } from "@/lib/month";
import { formatAmount, parseAmount } from "@/lib/money";
import {
  monthSpendRowSchema,
  monthTransactionRowSchema,
  parseRow,
  type MonthTransactionRow,
} from "@/lib/schema";
import { getSettings, type Settings } from "@/lib/settings";
import { formatMonth, formatPlainDate, today } from "@/lib/time";

/**
 * Writing, amending, and removing an entry.
 *
 * Built to spec 0006 and extended by spec 0007. Three things here are load
 * bearing and easy to undo by accident, so each is stated where it happens: an
 * amount is parsed by `parseAmount()` and never by arithmetic; every action
 * narrows the profile itself rather than trusting the completeness redirect in
 * the layout above it; and every confirmation names the row the database gave
 * back, never the text that was typed.
 *
 * None of these actions names a `user_id` and none writes a `direction` other
 * than `spend`. Ownership is decided by row level security and the `auth.uid()`
 * column default, and the three column foreign key is what refuses a category
 * belonging to another account or of the wrong kind (spec 0007, AC-20).
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
 * Narrow the profile, or hand back the refusal to show in place.
 *
 * Every action here needs a currency and a time zone, and neither may be
 * guessed, so each one starts with this. It is not redundant with the redirect
 * in `app/(app)/layout.tsx`, and that is worth knowing before anyone removes
 * it: a server action is its own entry point reached by a POST, so no layout
 * runs for it and no redirect in one can protect it (spec 0006 AC-14, spec 0007
 * AC-22).
 *
 * It uses `getSettings()` and narrows, rather than `requireCompleteSettings()`
 * which throws. The distinction is not style. A throw here escapes the action
 * and lands on the route error boundary, which replaces the whole page, loses
 * everything you typed, and shows a message written for whoever maintains this
 * code rather than for you. A page render can afford that, because the layout
 * has already guaranteed completeness before it runs and there is no form to
 * preserve; an action cannot. Feature 6 found this the hard way in
 * verification, which is why it is one helper now rather than three copies.
 */
async function completeProfileOrRefusal(
  doing: string,
): Promise<
  | { ok: true; settings: Extract<Settings, { isComplete: true }> }
  | { ok: false; state: FormState }
> {
  const settings = await getSettings();

  if (settings.isComplete) return { ok: true, settings };

  return {
    ok: false,
    state: {
      status: "error",
      message: `Choose your currency and time zone before ${doing}, on the account screen.`,
    },
  };
}

/**
 * A calendar day the browser sent, checked for being a real one.
 *
 * The shape test alone is not enough: JavaScript quietly rolls an overflow day
 * forward, so "2026-02-30" would sail through as the 2nd of March and only be
 * caught later by Postgres with a worse message. Rebuilding the date and
 * comparing every part is what actually rejects it.
 */
const submittedDaySchema = z
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
  }, "That day does not exist on the calendar.");

/**
 * What a spend form submits, before any of it is trusted.
 *
 * The amount stays raw text on purpose. Turning it into a number is
 * `parseAmount()`'s job, and it needs the currency's decimal count, which is
 * read from the profile below rather than carried in the form where a browser
 * could change it. A Zod coercion here would do the multiplication this whole
 * feature exists to avoid.
 *
 * Lives beside the actions rather than in `lib/schema.ts`, matching the setup
 * and profile forms: that file describes database rows, and this describes a
 * browser payload.
 */
const logSpendSchema = z.object({
  amount: z.string(),
  categoryId: z.uuid("Choose a category."),
  occurredOn: submittedDaySchema,
  note: z.string().max(500, "Keep the note under 500 characters.").optional(),
});

/** The same, plus which entry is being amended. */
const editSpendSchema = logSpendSchema.extend({
  id: z.uuid("That entry could not be identified."),
});

/** Pull the four shared fields off a form, normalising a blank note to absent. */
function spendFields(formData: FormData) {
  // A blank note becomes absent rather than an empty string, so a note is
  // either real text or nothing at all, and the column never holds "".
  const rawNote = String(formData.get("note") ?? "").trim();

  return {
    amount: String(formData.get("amount") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    occurredOn: String(formData.get("occurredOn") ?? ""),
    note: rawNote === "" ? undefined : rawNote,
  };
}

/**
 * Turn a refusal from Postgres into something a person can act on.
 *
 * Rule 3 of `AGENTS.md`: return the error and show it. The unmapped case is
 * deliberately still an error and deliberately still honest about nothing
 * having been written, because the alternative, reporting a write that did not
 * happen, is the one outcome this app must never produce.
 */
function describeDatabaseRefusal(
  error: { code?: string; message?: string },
  doing = "save that spend",
): {
  field?: string;
  message: string;
} {
  const code = error.code ?? "";
  const message = error.message ?? "";

  // The BEFORE INSERT trigger that refuses any spend while the profile is
  // incomplete. Matched on its message because it raises a plain exception
  // rather than a constraint violation with a code of its own.
  //
  // Every action now checks completeness itself before reaching this point, so
  // this is no longer the ordinary path to that message. It stays as the
  // backstop for the gap between that check and the write: the profile could in
  // principle be completed away in between. Rare enough to never see, cheap
  // enough to keep, and the database is the real guard either way.
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
    message: `Could not ${doing}. Nothing was changed, so it is safe to try again.${message ? ` (${message})` : ""}`,
  };
}

/** Name a stored row the way the person will read it back. */
function describeStored(row: MonthTransactionRow, currency: string): string {
  return `${formatAmount(row.amount_minor, currency)} for ${row.categories.name} on ${formatPlainDate(row.occurred_on)}`;
}

/**
 * Log one spend.
 *
 * The order of the guards is the design. The profile is narrowed first, because
 * everything after it needs a currency and a time zone. The shape is checked
 * next, then the amount, then the day, and only then does anything reach the
 * database, where the composite foreign key and the amount check have the final
 * say.
 */
export async function logSpend(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("logging a spend");
  if (!profile.ok) return profile.state;
  const { settings } = profile;

  const parsed = logSpendSchema.safeParse(spendFields(formData));
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

  // Both screens total this month from these rows, so a new spend has to
  // invalidate both or they disagree until something else reloads. The
  // transactions list was added by spec 0007, AC-21.
  revalidatePath("/transactions");
  revalidatePath("/breakdown");

  return {
    status: "ok",
    message: `Saved ${formatAmount(stored.amount_minor, settings.currency)} to ${stored.categories.name}`,
  };
}

/**
 * Amend one entry, then return to the list with a confirmation.
 *
 * The guards run in the same order as `logSpend()` above, and for the same
 * reasons. Four columns move: the amount, the category, the day, and the note.
 * `user_id`, `direction`, `merchant`, `created_at`, and `id` are never touched.
 *
 * On success it reports `ok` with the sentence naming what was stored, and does
 * nothing else. The form owns what happens next: it hands that sentence to the
 * list and navigates there, and the list announces it (AC-13). See
 * `components/transactions/confirmation.ts` for why the message stays in the
 * browser rather than travelling back through the server.
 *
 * It deliberately does not call `redirect()`, and the reason is measured rather
 * than stylistic: Next renders a redirect target inside the POST that ran the
 * action, so the list would render before this function had returned anything
 * for it to show.
 */
export async function updateTransaction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("changing an entry");
  if (!profile.ok) return profile.state;
  const { settings } = profile;

  const parsed = editSpendSchema.safeParse({
    ...spendFields(formData),
    id: String(formData.get("id") ?? ""),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fieldError(String(issue.path[0] ?? "amount"), issue.message);
  }

  const amount = parseAmount(parsed.data.amount, settings.decimals);
  if (!amount.ok) {
    return fieldError("amount", amount.reason);
  }

  // The same refusal, and the same wording, the Log screen uses (AC-11).
  const currentDay = today(new Date(), settings.timezone);
  if (parsed.data.occurredOn > currentDay) {
    return fieldError(
      "occurredOn",
      "You cannot log a spend for a day that has not happened yet.",
    );
  }

  const insforge = await createInsforgeServer();

  // No `user_id` filter: which rows this can reach at all is row level
  // security. `direction` is filtered rather than written, so this can never
  // turn an income entry into a spend one, and it is not in the update payload.
  //
  // A cleared note is written as null rather than omitted. Leaving it out would
  // mean a note could be added and never removed, which is a correction the
  // screen offers and the write would silently refuse to make.
  const result = await insforge.database
    .from("transactions")
    .update({
      category_id: parsed.data.categoryId,
      amount_minor: amount.minor,
      occurred_on: parsed.data.occurredOn,
      note: parsed.data.note ?? null,
    })
    .eq("id", parsed.data.id)
    .eq("direction", "spend")
    .select("id,amount_minor,occurred_on,note,categories(id,name,color)");

  if (result.error) {
    const { field, message } = describeDatabaseRefusal(
      result.error,
      "save that change",
    );
    return field ? fieldError(field, message) : { status: "error", message };
  }

  const changed = Array.isArray(result.data) ? result.data : [];

  // Zero rows matched. The entry was removed between opening this form and
  // saving it, in another tab or on another device. Saying so is the honest
  // answer; reporting a successful save would claim a row exists that does not
  // (AC-19).
  //
  // Revalidated for the same reason `deleteTransaction` revalidates its own
  // identical branch: the list behind this form is still showing a row that no
  // longer exists, and leaving it there is its own small lie.
  if (changed.length === 0) {
    revalidatePath("/transactions");
    revalidatePath("/breakdown");

    return {
      status: "error",
      message:
        "That entry is already gone, so there was nothing to change. Nothing was written.",
    };
  }

  const saved = parseRow(monthTransactionRowSchema, "transactions", changed[0]);

  // Quoted from the row the database returned, never from what was typed, so
  // the sentence reports what is actually stored (AC-13).
  const stored = describeStored(saved, settings.currency);

  // An entry whose date moved out of the month being listed will not be on the
  // list it is about to return to. Saying which month it went to explains that
  // rather than leaving it looking lost (AC-14).
  const window = currentSpendMonth(new Date(), settings.timezone);
  const movedAway =
    saved.occurred_on < window.start ||
    saved.occurred_on >= window.endExclusive;

  const message = movedAway
    ? `Saved ${stored}. That is in ${formatMonth(saved.occurred_on)}, so it is no longer on this month's list.`
    : `Saved ${stored}.`;

  revalidatePath("/transactions");
  revalidatePath("/breakdown");

  return { status: "ok", message };
}

/**
 * Remove one entry for good, and say what went.
 *
 * There is no soft delete and no archived state: spec 0007 chose a real delete
 * so every existing query stays correct as written, including
 * `loadMonthBreakdown()`, which needs no change at all as a result.
 *
 * This one returns a `FormState` rather than redirecting, because it is already
 * on the list it affects. The list's live region announces the message (AC-24),
 * and focus lands there once the row it was standing on is gone (AC-17).
 *
 * It needs the profile for the same reason the others do, and for one more
 * beside: the confirmation names an amount, and an amount cannot be rendered
 * without knowing the currency.
 */
export async function deleteTransaction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("removing an entry");
  if (!profile.ok) return profile.state;
  const { settings } = profile;

  const parsed = z
    .uuid("That entry could not be identified.")
    .safeParse(String(formData.get("id") ?? ""));
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const insforge = await createInsforgeServer();

  // The returned row is what makes the confirmation truthful: it names what was
  // actually removed rather than what the screen believed was there. `user_id`
  // is absent, as always; row level security is what decides this can only
  // reach your own rows.
  const result = await insforge.database
    .from("transactions")
    .delete()
    .eq("id", parsed.data)
    .eq("direction", "spend")
    .select("id,amount_minor,occurred_on,note,categories(id,name,color)");

  if (result.error) {
    const { message } = describeDatabaseRefusal(
      result.error,
      "delete that entry",
    );
    return { status: "error", message };
  }

  const removed = Array.isArray(result.data) ? result.data : [];

  // Zero rows matched, so the entry had already been deleted somewhere else.
  // Reporting a successful delete here would claim this action did something it
  // did not (AC-19). The list is still revalidated, because it is showing a row
  // that no longer exists and leaving it there is its own small lie.
  if (removed.length === 0) {
    revalidatePath("/transactions");
    revalidatePath("/breakdown");

    return {
      status: "error",
      message: "That entry was already gone, so nothing was deleted.",
    };
  }

  const gone = parseRow(monthTransactionRowSchema, "transactions", removed[0]);

  revalidatePath("/transactions");
  revalidatePath("/breakdown");

  return {
    status: "ok",
    message: `Deleted ${describeStored(gone, settings.currency)}.`,
  };
}
