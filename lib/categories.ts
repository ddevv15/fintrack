import { z } from "zod";

import { fault } from "@/lib/errors";
import { createInsforgeServer } from "@/lib/insforge-server";
import {
  categorySchema,
  categoryUsageSchema,
  parseRow,
  parseRows,
  type CategoryColor,
} from "@/lib/schema";

/**
 * The categories you can file a spend under.
 *
 * Spec 0006 fixes what "can" means here, and each half of it matters. `kind`
 * must be `spend`, because the three column foreign key on `transactions`
 * refuses an income category anyway and offering one would produce a database
 * error where a person expects a saved entry. `is_hidden` must be false,
 * because hiding is what feature 9 gives you instead of deleting a category
 * that still has history, so a hidden one must not come back in a picker.
 *
 * Which rows you can see at all is row level security, keyed to `auth.uid()`,
 * not a filter written here. The two filters below are about what belongs in a
 * picker; ownership is not negotiable in application code.
 */

/** One option in the category picker. */
export type SpendCategory = {
  readonly id: string;
  readonly name: string;
  readonly color: CategoryColor;
};

/**
 * Read every spend category you could log against, ordered by name.
 *
 * Throws rather than returning an empty list, and the difference is the whole
 * point. An empty list is a real state that the screen answers with an
 * explanation (AC-12), and a failed query that returned `[]` would render that
 * same explanation while telling you something false about your own data. The
 * route has an error boundary; an honest error belongs there.
 *
 * The ordering is `name` ascending, done by the database rather than in
 * TypeScript, because it is the picker's only ordering and there is no tie to
 * break: a unique index on `(user_id, kind, lower(name))` means one account
 * cannot hold two spend categories whose names differ only in case.
 */
export async function listSpendCategories(): Promise<readonly SpendCategory[]> {
  const insforge = await createInsforgeServer();

  const result = await insforge.database
    .from("categories")
    .select("id,user_id,name,kind,color,is_hidden,created_at,updated_at")
    .eq("kind", "spend")
    .eq("is_hidden", false)
    .order("name", { ascending: true });

  // Rethrown, never swallowed: rule 3 of AGENTS.md, and see the note above on
  // why an empty list is not an acceptable stand in for a failure.
  if (result.error) {
    // Logged, not carried. See `fault()` for why a driver payload must not
    // reach a message that spec 0011 copies verbatim into every report.
    console.error("[read] Your categories failed", result.error);
    throw fault("Your categories");
  }

  // Parsed against the full row schema so a renamed column fails loudly here
  // rather than arriving in the picker as an option labelled `undefined`.
  const rows = parseRows(categorySchema, "categories", result.data);

  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

/**
 * One option in the edit screen's category picker.
 *
 * Carries `isHidden` because the edit picker can legitimately offer a hidden
 * category, and the label has to say so.
 */
export type SpendCategoryOption = SpendCategory & {
  readonly isHidden: boolean;
};

/**
 * The categories the edit screen may offer, given the entry's current one.
 *
 * Spec 0007 AC-12 is the rule this implements, and it is narrower than it
 * looks. A hidden category must not be offered as somewhere new to file a
 * spend, which is why `listSpendCategories()` above excludes it. But an entry
 * already filed under one has to keep it: if the picker dropped it, opening an
 * old entry and saving it unchanged would silently re file it under whatever
 * option happened to be first, which is a change nobody asked for to a figure
 * they were only checking.
 *
 * So exactly one hidden category is admitted, the entry's own, and only when it
 * really is hidden. The caller marks it in the label; this only decides what is
 * in the list.
 *
 * The ordering stays the database's, name ascending, so the hidden option keeps
 * its alphabetical place rather than being appended at the end where it would
 * read as a separate, odder kind of thing.
 */
export async function listSpendCategoryOptions(
  currentCategoryId: string,
): Promise<readonly SpendCategoryOption[]> {
  const insforge = await createInsforgeServer();

  const result = await insforge.database
    .from("categories")
    .select("id,user_id,name,kind,color,is_hidden,created_at,updated_at")
    .eq("kind", "spend")
    // Visible ones, plus this entry's own whatever its state. The id is a uuid
    // that came back parsed from a row this account can already read, so there
    // is nothing here a caller could bend into a different filter.
    .or(`is_hidden.eq.false,id.eq.${currentCategoryId}`)
    .order("name", { ascending: true });

  // Rethrown, never swallowed: rule 3 of AGENTS.md, and see the note on
  // listSpendCategories() for why an empty list is not an acceptable stand in
  // for a failure.
  if (result.error) {
    // Logged, not carried. See `fault()` for why a driver payload must not
    // reach a message that spec 0011 copies verbatim into every report.
    console.error("[read] Your categories failed", result.error);
    throw fault("Your categories");
  }

  const rows = parseRows(categorySchema, "categories", result.data);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isHidden: row.is_hidden,
  }));
}

/**
 * Every spend category you have, for the history filter picker.
 *
 * Deliberately a fourth list helper rather than a reuse of one of the three
 * above, because none of them returns this set and the near misses are the
 * dangerous part. `listSpendCategories()` drops hidden ones, which would make
 * spending you have already logged unreachable the moment you tidy a label.
 * `listSpendCategoryOptions()` reads like the right one and is not: it needs an
 * entry's own category id and admits exactly that one hidden category, because
 * it answers a narrower question for the edit form (spec 0007 AC-12).
 * `listManagedCategories()` does return this set, but pays for a second read of
 * usage counts that a dropdown has no use for.
 *
 * Hidden categories are included and are not marked here. The caller labels
 * them, exactly as the edit form does, so the two pickers cannot describe the
 * same category differently (spec 0009 AC-6).
 *
 * Throws rather than returning an empty list, for the reason
 * `listSpendCategories()` gives: an empty list is a real state the screen
 * explains, and a failed read that returned one would explain something false.
 */
export async function listSpendCategoryFilterOptions(): Promise<
  readonly SpendCategoryOption[]
> {
  const insforge = await createInsforgeServer();

  const result = await insforge.database
    .from("categories")
    .select("id,user_id,name,kind,color,is_hidden,created_at,updated_at")
    .eq("kind", "spend")
    .order("name", { ascending: true });

  if (result.error) {
    // Logged, not carried. See `fault()` for why a driver payload must not
    // reach a message that spec 0011 copies verbatim into every report.
    console.error("[read] Your categories failed", result.error);
    throw fault("Your categories");
  }

  const rows = parseRows(categorySchema, "categories", result.data);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    isHidden: row.is_hidden,
  }));
}

/**
 * How many spend categories one account may hold.
 *
 * A rule nobody asked for, and deliberately so (spec 0008): it should never be
 * met in real use, and it is what makes the list safe to render without
 * pagination. Enforced in `createCategory` only. Two tabs can race past it to
 * 41, which is accepted, because an extra row is cosmetic and self correcting,
 * unlike the last visible category rule where the raced state breaks a screen.
 */
export const SPEND_CATEGORY_LIMIT = 40;

/** One row of the categories screen: the category, plus how much it is used. */
export type ManagedCategory = {
  readonly id: string;
  readonly name: string;
  readonly color: CategoryColor;
  readonly isHidden: boolean;
  /** Entries filed under it, `0` for one that has never been used. */
  readonly entryCount: number;
};

/** The columns every read in this file asks `categories` for. */
const CATEGORY_COLUMNS =
  "id,user_id,name,kind,color,is_hidden,created_at,updated_at";

/**
 * Every spend category you own, with its usage count, name ascending.
 *
 * Two reads rather than one, and they cannot be collapsed into a join here:
 * `category_usage` is a view over `categories`, not a table PostgREST knows how
 * to embed, so the counts arrive separately and are matched up by id below.
 * That is the cost spec 0008 accepted for the count, recorded in its
 * consequences: the list costs two reads where a picker costs one.
 *
 * The order of the two reads is deliberate. Categories first, counts second,
 * so a category created in another tab between them appears in the counts and
 * is simply ignored, rather than appearing in the list with no count.
 *
 * Both throw rather than returning what did arrive, for the reason
 * `listSpendCategories()` above gives: a partial list renders as a real answer
 * about your own data while being false. A category with no matching count is
 * the same failure in miniature, so it throws too rather than being rendered as
 * a zero. Rule 3 of `AGENTS.md` is explicit that a fabricated zero is the worse
 * outcome, and this one is self correcting: the race that causes it is another
 * tab writing, and a reload shows the truth.
 *
 * Hidden categories are included, because this is the one screen that exists to
 * bring them back (AC-2). Income categories are not, and there is no screen in
 * this feature that manages one (AC-1).
 */
export async function listManagedCategories(): Promise<
  readonly ManagedCategory[]
> {
  const insforge = await createInsforgeServer();

  const categories = await insforge.database
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("kind", "spend")
    .order("name", { ascending: true });

  if (categories.error) {
    throw new Error(
      `Could not read your categories: ${JSON.stringify(categories.error)}`,
    );
  }

  const usage = await insforge.database
    .from("category_usage")
    .select("user_id,category_id,entry_count");

  if (usage.error) {
    throw new Error(
      `Could not count what your categories are used for: ${JSON.stringify(usage.error)}`,
    );
  }

  const rows = parseRows(categorySchema, "categories", categories.data);
  const counts = new Map(
    parseRows(categoryUsageSchema, "category_usage", usage.data).map((row) => [
      row.category_id,
      row.entry_count,
    ]),
  );

  return rows.map((row) => {
    const entryCount = counts.get(row.id);

    // See the note above: a missing count means the two reads disagree, and a
    // zero invented here would be read by the delete control as "safe to
    // remove". The database would still refuse the delete, but the screen would
    // have offered something it should not have.
    if (entryCount === undefined) {
      throw new Error(
        `No usage count came back for the category "${row.name}". ` +
          `It was probably created or removed in another tab while this screen loaded; reloading should fix it.`,
      );
    }

    return {
      id: row.id,
      name: row.name,
      color: row.color,
      isHidden: row.is_hidden,
      entryCount,
    };
  });
}

/**
 * One spend category of yours, with its usage count, or nothing.
 *
 * `undefined` is what the edit route turns into the standard not found page, so
 * an unknown id, another account's id, and an id that is not a uuid all end the
 * same way (AC-20). Row level security is what makes the second invisible;
 * answering differently for any of them would put the difference back.
 *
 * `.maybeSingle()` is not used, because a row that is not there is an ordinary
 * outcome here rather than an error, and the two reads have to agree about
 * which category they are describing before anything is returned.
 */
export async function getManagedCategory(
  id: string,
): Promise<ManagedCategory | undefined> {
  // Checked before the query rather than after, the same way
  // `loadTransactionForEdit` does it and for the same reason. PostgREST answers
  // a malformed uuid with an error, not an empty result, so without this a typo
  // in the URL throws and renders the error boundary while a stranger's id
  // renders not found, and the difference between those two pages is itself the
  // signal AC-20 exists to remove.
  if (!z.uuid().safeParse(id).success) return undefined;

  const insforge = await createInsforgeServer();

  const categories = await insforge.database
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("kind", "spend")
    .eq("id", id);

  if (categories.error) {
    throw new Error(
      `Could not read that category: ${JSON.stringify(categories.error)}`,
    );
  }

  const found = Array.isArray(categories.data) ? categories.data : [];
  if (found.length === 0) return undefined;

  const row = parseRow(categorySchema, "categories", found[0]);

  const usage = await insforge.database
    .from("category_usage")
    .select("user_id,category_id,entry_count")
    .eq("category_id", row.id);

  if (usage.error) {
    throw new Error(
      `Could not count what that category is used for: ${JSON.stringify(usage.error)}`,
    );
  }

  const counted = Array.isArray(usage.data) ? usage.data : [];

  // Gone between the two reads. Treated as not found rather than as an error,
  // because that is exactly what it is: the row this screen was about no longer
  // exists, and the not found page says so better than a thrown message would.
  if (counted.length === 0) return undefined;

  const count = parseRow(categoryUsageSchema, "category_usage", counted[0]);

  return {
    id: row.id,
    name: row.name,
    color: row.color,
    isHidden: row.is_hidden,
    entryCount: count.entry_count,
  };
}

/**
 * How many visible spend categories you hold right now.
 *
 * One helper, called by both `setCategoryHidden` and `deleteCategory`, so the
 * last visible category rule has one implementation in application code rather
 * than two that can drift (AC-13).
 *
 * This read is what produces the clean refusal message. It is not what makes
 * the rule true: it and the write that follows are two statements, so two tabs
 * can both read two and both proceed. The `categories_keep_one_visible`
 * trigger is the guarantee; this is the good manners in front of it.
 *
 * `exceptId` is what makes the question the same one the trigger asks. Both
 * actions are about one particular category, and the rule is not "do you have
 * a visible category" but "would you still have one afterwards", so the row
 * being hidden or deleted has to be left out of its own count. Without it,
 * unhiding is refused whenever you happen to hold exactly one visible
 * category, which is a refusal about nothing.
 *
 * `head: true` asks for the count without the rows.
 */
export async function countVisibleSpendCategories(
  exceptId?: string,
): Promise<number> {
  const insforge = await createInsforgeServer();

  let query = insforge.database
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("kind", "spend")
    .eq("is_hidden", false);

  if (exceptId !== undefined) query = query.neq("id", exceptId);

  const { count, error } = await query;

  if (error) {
    throw new Error(
      `Could not check how many categories you have left: ${JSON.stringify(error)}`,
    );
  }

  return count ?? 0;
}

/**
 * How many spend categories you hold, hidden ones included.
 *
 * Read inside `createCategory` rather than passed from the form, because a form
 * value is a claim and not a fact (AC-9). Hidden ones count: the cap is about
 * how many rows you own, and a hidden category is still a row.
 */
export async function countSpendCategories(): Promise<number> {
  const insforge = await createInsforgeServer();

  const { count, error } = await insforge.database
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("kind", "spend");

  if (error) {
    throw new Error(
      `Could not check how many categories you have: ${JSON.stringify(error)}`,
    );
  }

  return count ?? 0;
}
