import {
  categorySchema,
  profileSchema,
  transactionSchema,
  type Transaction,
} from "@/lib/schema";

import { describe, expect, one, rows, test as base } from "./fixtures";

/**
 * The proof that one account cannot reach another's money.
 *
 * Spec 0002 calls a mistaken policy a silent leak rather than a loud error,
 * which is why this cannot be checked by reading the migration. It has to be
 * two real sessions against the real database.
 *
 * Every read here goes through `rows` or `one`, which throw when a query fails.
 * That matters more here than anywhere else: most of these assertions say
 * something is absent, so a query that silently returned nothing would satisfy
 * all of them while proving nothing.
 */

const test = base.extend<{ aSpend: Transaction }>({
  aSpend: [
    async ({ scratch }, use) => {
      const category = await scratch.category();
      await use(
        await scratch.log(category, {
          amount_cents: 4599,
          merchant: "Test Mart",
        }),
      );
    },
    { scope: "file" },
  ],
});

describe("the two accounts are actually different", () => {
  test("have distinct user ids", ({ accountA, accountB }) => {
    expect(accountA.userId).not.toBe(accountB.userId);
  });
});

describe("reading across accounts", () => {
  test("the second account cannot see the first's transactions", async ({
    accountB,
    aSpend,
  }) => {
    const mine = rows(
      transactionSchema,
      "transactions",
      await accountB.client.database.from("transactions").select(),
    );
    expect(mine.map((row) => row.id)).not.toContain(aSpend.id);
  });

  test("the second account cannot see the first's categories", async ({
    accountB,
    aSpend,
  }) => {
    const mine = rows(
      categorySchema,
      "categories",
      await accountB.client.database.from("categories").select(),
    );
    expect(mine.map((row) => row.id)).not.toContain(aSpend.category_id);
  });

  test("asking directly returns nothing rather than an error", async ({
    accountB,
    aSpend,
  }) => {
    // Empty, not denied. The second account never learns the row exists.
    const found = rows(
      transactionSchema,
      "transactions",
      await accountB.client.database
        .from("transactions")
        .select()
        .eq("id", aSpend.id),
    );
    expect(found).toHaveLength(0);
  });

  test("the second account cannot see the first's profile", async ({
    accountA,
    accountB,
  }) => {
    const mine = rows(
      profileSchema,
      "profiles",
      await accountB.client.database.from("profiles").select(),
    );
    expect(mine.map((row) => row.user_id)).not.toContain(accountA.userId);
  });
});

describe("writing across accounts", () => {
  test("the second account cannot edit the first's transaction", async ({
    accountA,
    accountB,
    aSpend,
  }) => {
    await accountB.client.database
      .from("transactions")
      .update({ amount_cents: 1 })
      .eq("id", aSpend.id);

    const after = one(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("id", aSpend.id),
    );
    expect(after.amount_cents).toBe(4599);
  });

  test("the second account cannot delete the first's transaction", async ({
    accountA,
    accountB,
    aSpend,
  }) => {
    await accountB.client.database
      .from("transactions")
      .delete()
      .eq("id", aSpend.id);

    const after = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("id", aSpend.id),
    );
    expect(after).toHaveLength(1);
  });

  test("the second account cannot log against the first's category", async ({
    accountB,
    aSpend,
  }) => {
    // The three column foreign key stops this, not row level security.
    const { error } = await accountB.client.database
      .from("transactions")
      .insert([
        {
          category_id: aSpend.category_id,
          direction: "spend",
          amount_cents: 100,
          occurred_on: aSpend.occurred_on,
        },
      ]);
    expect(
      error,
      "referencing another account's category must fail",
    ).toBeTruthy();
  });

  test("the second account cannot write a row owned by someone else", async ({
    accountA,
    accountB,
    aSpend,
  }) => {
    const { error } = await accountB.client.database
      .from("transactions")
      .insert([
        {
          user_id: accountA.userId,
          category_id: aSpend.category_id,
          direction: "spend",
          amount_cents: 100,
          occurred_on: aSpend.occurred_on,
        },
      ]);
    expect(error, "naming another owner must fail").toBeTruthy();
  });
});
