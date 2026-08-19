import { categorySchema, transactionSchema } from "@/lib/schema";

import { assertOk, describe, expect, one, rows, test } from "./fixtures";

/**
 * Where two values actually come from.
 *
 * The spec's value sourcing table names a source for every value the app
 * produces. Most are settled by the schema itself and proved by the other
 * suites. These two are only true at runtime, so they need a real backend to
 * pin down: the timestamps are maintained by a database trigger, and the order
 * a category picker shows comes from the query rather than from a stored
 * column.
 */

describe("timestamps are the database's, not the app's", () => {
  test("editing moves updated_at and never touches created_at", async ({
    accountA,
    scratch,
  }) => {
    // covers: AC-1
    const category = await scratch.category();
    const logged = await scratch.log(category, { amount_cents: 500 });

    assertOk(
      "Editing the amount",
      await accountA.client.database
        .from("transactions")
        .update({ amount_cents: 600 })
        .eq("id", logged.id),
    );

    const edited = one(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("id", logged.id),
    );

    expect(edited.amount_cents).toBe(600);
    expect(edited.created_at, "created_at must never move").toBe(
      logged.created_at,
    );
    expect(
      new Date(edited.updated_at).getTime(),
      "updated_at must move on every edit",
    ).toBeGreaterThan(new Date(logged.updated_at).getTime());
  });
});

describe("the order a picker shows categories in", () => {
  test("comes from the query, by name, with hidden ones dropped", async ({
    accountA,
    scratch,
  }) => {
    // covers: AC-5
    // There is no stored sort column, so this order is the query's doing. A
    // caller that forgets to ask for it gets whatever the database returns.
    const visible = await scratch.category();
    const hidden = await scratch.category();

    assertOk(
      "Hiding a category",
      await accountA.client.database
        .from("categories")
        .update({ is_hidden: true })
        .eq("id", hidden.id),
    );

    const shown = rows(
      categorySchema,
      "categories",
      await accountA.client.database
        .from("categories")
        .select()
        .eq("is_hidden", false)
        .order("name", { ascending: true }),
    );
    const ids = shown.map((row) => row.id);

    expect(ids, "a hidden category must not be offered").not.toContain(
      hidden.id,
    );
    expect(ids, "a visible one must be").toContain(visible.id);

    const names = shown.map((row) => row.name);
    expect(names, "the query asked for name ascending").toEqual(
      [...names].sort((a, b) => a.localeCompare(b)),
    );
  });

  test("a hidden category keeps its transactions", async ({
    accountA,
    scratch,
  }) => {
    // covers: AC-5
    const category = await scratch.category();
    const logged = await scratch.log(category, { amount_cents: 250 });

    assertOk(
      "Hiding a category with history",
      await accountA.client.database
        .from("categories")
        .update({ is_hidden: true })
        .eq("id", category.id),
    );

    const history = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("id", logged.id),
    );
    expect(history, "hiding must never touch history").toHaveLength(1);
    expect(history[0].category_id).toBe(category.id);
  });
});
