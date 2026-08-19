import { categorySchema, profileSchema, transactionSchema } from "@/lib/schema";

import { describe, expect, one, rows, test } from "./fixtures";

/**
 * Does lib/schema.ts still describe the real tables?
 *
 * There is no ORM, so nothing else notices when a migration renames a column.
 * Left alone that arrives as undefined and becomes NaN inside a total, which is
 * the failure spec 0001 rule 11 exists to prevent. `rows` throws when a row
 * does not match its schema, so every read in every suite is really a drift
 * check; these three just make it the point rather than a side effect.
 */

describe("the live tables still match lib/schema.ts", () => {
  test("profiles", async ({ accountA }) => {
    const mine = rows(
      profileSchema,
      "profiles",
      await accountA.client.database.from("profiles").select(),
    );
    expect(mine, "no profile row to check").not.toHaveLength(0);
  });

  test("categories", async ({ accountA }) => {
    const mine = rows(
      categorySchema,
      "categories",
      await accountA.client.database.from("categories").select(),
    );
    expect(mine, "no category row to check").not.toHaveLength(0);
  });

  test("transactions", async ({ accountA, scratch }) => {
    const category = await scratch.category();
    await scratch.log(category, {
      amount_cents: 1234,
      merchant: "Drift Check",
      note: "written so this table has a row to read",
    });

    const mine = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database.from("transactions").select(),
    );
    expect(mine, "no transaction row to check").not.toHaveLength(0);
  });

  test("a nullable column comes back as undefined, never null", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();
    const logged = await scratch.log(category, { amount_cents: 700 });

    const row = one(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("id", logged.id),
    );
    expect(row.merchant).toBeUndefined();
    expect(row.note).toBeUndefined();
  });
});
