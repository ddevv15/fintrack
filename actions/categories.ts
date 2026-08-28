"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  countSpendCategories,
  countVisibleSpendCategories,
  SPEND_CATEGORY_LIMIT,
} from "@/lib/categories";
import type { FormState } from "@/lib/forms";
import { createInsforgeServer } from "@/lib/insforge-server";
import {
  categoryColorSchema,
  categorySchema,
  parseRow,
  parseRows,
} from "@/lib/schema";
import { completeProfileOrRefusal } from "@/lib/settings";

/**
 * Adding, correcting, hiding, and removing a category.
 *
 * Built to spec 0008, and almost none of the rules here are written here. The
 * name length, the ten colours, and case insensitive uniqueness are constraints
 * spec 0002 put on the table; `ON DELETE RESTRICT` is the final word on whether
 * a category may go; and the `categories_keep_one_visible` trigger is what
 * makes the last visible category rule hold when two tabs race. What this file
 * does is ask the questions early enough to answer in a sentence rather than an
 * exception, and turn every refusal Postgres does raise into something a person
 * can act on.
 *
 * None of these actions names a `user_id`, and none writes a `kind` other than
 * `spend`. Ownership is decided by row level security and the `auth.uid()`
 * column default (AC-20); `kind` is fixed by this spec and never editable
 * (AC-11).
 *
 * Every confirmation quotes the row the database returned, never the text that
 * was submitted, so the sentence reports what is actually stored (AC-4).
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
 * What a category form submits, before any of it is trusted.
 *
 * The name is trimmed first, so a name of nothing but spaces is refused as
 * empty rather than stored as blank looking text the unique index would then
 * treat as a real name (AC-8). The bounds match the `char_length(name) BETWEEN
 * 1 AND 60` check on the column exactly; they are here to produce a message on
 * the field, not to be the rule.
 *
 * The colour is parsed against the same enum the check constraint mirrors, so a
 * value the database would refuse never reaches it.
 *
 * Lives beside the actions rather than in `lib/schema.ts`, matching the spend
 * forms: that file describes database rows, and this describes a browser
 * payload.
 */
const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the category a name.")
    .max(60, "Keep the name under 60 characters."),
  color: categoryColorSchema,
});

/** Parse the two shared fields, or the message to show on the field that failed. */
function parseCategoryFields(
  formData: FormData,
):
  | { ok: true; name: string; color: z.infer<typeof categoryColorSchema> }
  | { ok: false; state: FormState } {
  const parsed = categoryFormSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    color: String(formData.get("color") ?? ""),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = String(issue.path[0] ?? "name");

    return {
      ok: false,
      state: fieldError(
        field,
        field === "color" ? "Choose one of the ten colours." : issue.message,
      ),
    };
  }

  return { ok: true, name: parsed.data.name, color: parsed.data.color };
}

/** Postgres unique_violation: the case insensitive name index refused. */
const UNIQUE_VIOLATION = "23505";
/** Postgres foreign_key_violation: `ON DELETE RESTRICT` refused. */
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Whether this refusal is the last visible category trigger speaking.
 *
 * Matched on its message because it raises a plain exception rather than a
 * constraint violation with a code of its own, which is the same reason the
 * profile completeness trigger is matched this way in `actions/transactions.ts`.
 */
function isLastVisibleRefusal(error: { message?: string }): boolean {
  return /last visible spend category/i.test(error.message ?? "");
}

/** The sentence both actions use when the last visible category rule bites. */
const LAST_VISIBLE_MESSAGE =
  "That is your last visible category, and the Log screen needs at least one. Add another category first, then come back.";

/**
 * Explain a duplicate name, saying so when the clash is with a hidden category.
 *
 * The violation itself names the constraint and not the row, so AC-7's message
 * cannot be written without a second read: being told a name is taken by
 * something you cannot see anywhere on the screen is otherwise baffling.
 *
 * The lookup is a small read matched in TypeScript rather than an `ilike`
 * filter, and that is deliberate. `ilike` treats `%` and `_` in the submitted
 * name as wildcards, so a category called "50% off" would match rows it has
 * nothing to do with. The list is capped at 40 rows, so comparing lowercased
 * names here is both exact and cheap.
 *
 * Nothing thrown, on any path. The clashing row can legitimately be gone by the
 * time this runs, because it was deleted in another tab in between, and a read
 * that fails or finds nothing falls back to the plain message rather than
 * turning a refusal a person can fix into a page replacing error (AC-7).
 */
async function describeNameClash(name: string): Promise<string> {
  const plain = "You already have a category with that name.";

  try {
    const insforge = await createInsforgeServer();

    const result = await insforge.database
      .from("categories")
      .select("id,user_id,name,kind,color,is_hidden,created_at,updated_at")
      .eq("kind", "spend");

    if (result.error) return plain;

    const rows = parseRows(categorySchema, "categories", result.data);
    const clash = rows.find(
      (row) => row.name.toLowerCase() === name.toLowerCase(),
    );

    if (!clash) return plain;

    return clash.is_hidden
      ? `You already have a hidden category called "${clash.name}". Unhide it instead of adding a second one.`
      : plain;
  } catch {
    return plain;
  }
}

/** Turn any other refusal from Postgres into something a person can act on. */
function describeDatabaseRefusal(
  error: { code?: string; message?: string },
  doing: string,
): string {
  const message = error.message ?? "";

  // Rule 3 of `AGENTS.md`: return the error and show it. The unmapped case is
  // deliberately still an error and deliberately still honest about nothing
  // having been written, because reporting a write that did not happen is the
  // one outcome this app must never produce.
  return `Could not ${doing}. Nothing was changed, so it is safe to try again.${message ? ` (${message})` : ""}`;
}

/**
 * Every screen reads category names and colours, so every write clears them all.
 *
 * `revalidatePath("/", "layout")` clears the whole router cache rather than
 * naming the three screens that show a category. That is heavier than naming
 * paths and correct here: a rename genuinely changes what the Log picker, the
 * month list, and the breakdown all display, and category writes are rare
 * enough that the cost never lands anywhere that matters (AC-18).
 */
function revalidateEverythingShowingACategory(): void {
  revalidatePath("/", "layout");
}

/** The columns every write in this file reads back. */
const CATEGORY_COLUMNS =
  "id,user_id,name,kind,color,is_hidden,created_at,updated_at";

/**
 * Add one spend category.
 *
 * The order of the guards is the design. The profile is narrowed first, the
 * shape next, then the cap, and only then does anything reach the database,
 * where the unique index has the final say on the name.
 *
 * The cap is read here rather than taken from the form, because a form value is
 * a claim and not a fact (AC-9). This read and the insert are two statements, so
 * two tabs can race past it to 41 rows. Accepted deliberately: an extra row is
 * cosmetic and self correcting, unlike the last visible category rule, where
 * the raced state leaves the Log screen with nothing to file a spend under.
 */
export async function createCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("adding a category");
  if (!profile.ok) return profile.state;

  const fields = parseCategoryFields(formData);
  if (!fields.ok) return fields.state;

  const held = await countSpendCategories();
  if (held >= SPEND_CATEGORY_LIMIT) {
    return {
      status: "error",
      message: `You already have ${SPEND_CATEGORY_LIMIT} categories, which is the most this app keeps. Delete or reuse one instead.`,
    };
  }

  const insforge = await createInsforgeServer();

  // `user_id` is absent on purpose: the column defaults to auth.uid(), so the
  // database decides the owner and this action never gets to name one.
  // `kind` is the constant this feature writes; income is feature 14's.
  const result = await insforge.database
    .from("categories")
    .insert([{ name: fields.name, kind: "spend", color: fields.color }])
    .select(CATEGORY_COLUMNS);

  if (result.error) {
    if (result.error.code === UNIQUE_VIOLATION) {
      return fieldError("name", await describeNameClash(fields.name));
    }

    return {
      status: "error",
      message: describeDatabaseRefusal(result.error, "add that category"),
    };
  }

  const stored = parseRow(
    categorySchema,
    "categories",
    Array.isArray(result.data) ? result.data[0] : result.data,
  );

  revalidateEverythingShowingACategory();

  // Quoted from the row the database returned, never from what was typed.
  return { status: "ok", message: `Added ${stored.name}.` };
}

/**
 * Change one category's name and colour, and nothing else.
 *
 * `kind` is not in the payload and `is_hidden` is not either: renaming is not
 * how you hide something, and `ON UPDATE RESTRICT` on the three column foreign
 * key would refuse a kind change on any category that has ever been used
 * anyway (AC-11).
 *
 * On success it returns `ok` with the sentence naming what was stored and does
 * nothing else. The form owns what happens next: it hands that sentence to the
 * list and navigates there, and the list announces it (AC-19). See
 * `components/categories/confirmation.ts` for why the message stays in the
 * browser rather than travelling back through the server.
 */
export async function updateCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("changing a category");
  if (!profile.ok) return profile.state;

  const id = z
    .uuid("That category could not be identified.")
    .safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return { status: "error", message: id.error.issues[0].message };
  }

  const fields = parseCategoryFields(formData);
  if (!fields.ok) return fields.state;

  const insforge = await createInsforgeServer();

  // No `user_id` filter: which rows this can reach at all is row level
  // security. `kind` is filtered rather than written, so this can never turn an
  // income category into a spend one.
  const result = await insforge.database
    .from("categories")
    .update({ name: fields.name, color: fields.color })
    .eq("id", id.data)
    .eq("kind", "spend")
    .select(CATEGORY_COLUMNS);

  if (result.error) {
    if (result.error.code === UNIQUE_VIOLATION) {
      return fieldError("name", await describeNameClash(fields.name));
    }

    return {
      status: "error",
      message: describeDatabaseRefusal(result.error, "save that change"),
    };
  }

  const changed = Array.isArray(result.data) ? result.data : [];

  // Zero rows matched, so the category was removed between opening this form
  // and saving it. Saying so is the honest answer; reporting a successful save
  // would claim a row exists that does not.
  //
  // Deliberately does not revalidate, for the reason `updateTransaction` gives
  // at length: this runs on the category's own edit screen, whose loader calls
  // `notFound()` the moment the row is gone, so revalidating would replace the
  // form with a 404 and take this message and everything typed with it.
  if (changed.length === 0) {
    return {
      status: "error",
      message:
        "That category is already gone, so there was nothing to change. Nothing was written.",
    };
  }

  const saved = parseRow(categorySchema, "categories", changed[0]);

  revalidateEverythingShowingACategory();

  return { status: "ok", message: `Saved ${saved.name}.` };
}

/**
 * Hide a category, or bring it back.
 *
 * Hiding takes a category out of the Log screen's picker and changes nothing
 * else: no total on any screen in any month moves, and a hidden category with
 * spend this month keeps its name and colour everywhere it already appears
 * (AC-14). That is not enforced here; it is true because nothing on the
 * breakdown or the month list filters on `is_hidden` at all.
 *
 * The count below is what produces the clean refusal. It is not what makes the
 * rule true: it and the update are two statements, so two tabs each hiding one
 * of your last two visible categories can both read one remaining and both
 * proceed. The `categories_keep_one_visible` trigger is the guarantee, and its
 * refusal is caught below so the tab that loses the race is told why rather
 * than shown an exception (AC-13).
 */
export async function setCategoryHidden(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("hiding a category");
  if (!profile.ok) return profile.state;

  const parsed = z
    .object({
      id: z.uuid("That category could not be identified."),
      hidden: z.enum(["true", "false"]).transform((value) => value === "true"),
    })
    .safeParse({
      id: String(formData.get("id") ?? ""),
      hidden: String(formData.get("hidden") ?? ""),
    });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const { id, hidden } = parsed.data;

  // Only hiding can take your last visible category away. Unhiding never can,
  // which is why this is not asked on that path.
  if (hidden && (await countVisibleSpendCategories(id)) === 0) {
    return { status: "error", message: LAST_VISIBLE_MESSAGE };
  }

  const insforge = await createInsforgeServer();

  const result = await insforge.database
    .from("categories")
    .update({ is_hidden: hidden })
    .eq("id", id)
    .eq("kind", "spend")
    .select(CATEGORY_COLUMNS);

  if (result.error) {
    if (isLastVisibleRefusal(result.error)) {
      return { status: "error", message: LAST_VISIBLE_MESSAGE };
    }

    return {
      status: "error",
      message: describeDatabaseRefusal(
        result.error,
        hidden ? "hide that category" : "unhide that category",
      ),
    };
  }

  const changed = Array.isArray(result.data) ? result.data : [];

  // Already gone. The list is still revalidated, because it is showing a row
  // that no longer exists and leaving it there is its own small lie.
  if (changed.length === 0) {
    revalidateEverythingShowingACategory();

    return {
      status: "error",
      message: "That category was already gone, so nothing was changed.",
    };
  }

  const saved = parseRow(categorySchema, "categories", changed[0]);

  revalidateEverythingShowingACategory();

  return {
    status: "ok",
    message: saved.is_hidden
      ? `Hid ${saved.name}. Its past entries are untouched.`
      : `${saved.name} is back in your categories.`,
  };
}

/**
 * Remove one category for good.
 *
 * Two rules decide whether this is allowed, and neither of them lives here. The
 * three column foreign key's `ON DELETE RESTRICT` refuses a category that still
 * holds entries, which is what keeps every past month's breakdown honest; and
 * the trigger refuses your last visible one. The edit screen only offers this
 * control when the count is zero, but that count is what the screen renders and
 * not what decides: an entry logged in another tab while the screen was open
 * makes it stale, and the database's refusal is the final word (AC-17).
 */
export async function deleteCategory(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const profile = await completeProfileOrRefusal("deleting a category");
  if (!profile.ok) return profile.state;

  const id = z
    .uuid("That category could not be identified.")
    .safeParse(String(formData.get("id") ?? ""));
  if (!id.success) {
    return { status: "error", message: id.error.issues[0].message };
  }

  // The same question `setCategoryHidden` asks, through the same helper, so the
  // rule has one implementation in application code (AC-13). A category that is
  // already hidden could in principle be deleted while this returns zero, but
  // that state cannot be reached: you can never get down to one category that
  // is itself hidden, because hiding the last visible one is what is refused.
  if ((await countVisibleSpendCategories(id.data)) === 0) {
    return { status: "error", message: LAST_VISIBLE_MESSAGE };
  }

  const insforge = await createInsforgeServer();

  // The returned row is what makes the confirmation truthful: it names what was
  // actually removed rather than what the screen believed was there.
  const result = await insforge.database
    .from("categories")
    .delete()
    .eq("id", id.data)
    .eq("kind", "spend")
    .select(CATEGORY_COLUMNS);

  if (result.error) {
    if (isLastVisibleRefusal(result.error)) {
      return { status: "error", message: LAST_VISIBLE_MESSAGE };
    }

    // The category picked up an entry while this screen was open, so the
    // control that was offered is no longer one the database will honour.
    // Nothing was deleted, and the message says what to do instead (AC-17).
    if (result.error.code === FOREIGN_KEY_VIOLATION) {
      return {
        status: "error",
        message:
          "Something was logged against that category while this screen was open, so it was not deleted. Hide it instead, and its history stays.",
      };
    }

    return {
      status: "error",
      message: describeDatabaseRefusal(result.error, "delete that category"),
    };
  }

  const removed = Array.isArray(result.data) ? result.data : [];

  if (removed.length === 0) {
    revalidateEverythingShowingACategory();

    return {
      status: "error",
      message: "That category was already gone, so nothing was deleted.",
    };
  }

  const gone = parseRow(categorySchema, "categories", removed[0]);

  revalidateEverythingShowingACategory();

  return { status: "ok", message: `Deleted ${gone.name}.` };
}
