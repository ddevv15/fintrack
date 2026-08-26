import { createInsforgeServer } from "@/lib/insforge-server";
import { categorySchema, parseRows, type CategoryColor } from "@/lib/schema";

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
    throw new Error(
      `Could not read your categories: ${JSON.stringify(result.error)}`,
    );
  }

  // Parsed against the full row schema so a renamed column fails loudly here
  // rather than arriving in the picker as an option labelled `undefined`.
  const rows = parseRows(categorySchema, "categories", result.data);

  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
}
