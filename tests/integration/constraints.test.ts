import { categorySchema, transactionSchema } from "@/lib/schema";

import {
  assertOk,
  describe,
  expect,
  rows,
  test,
  FIXTURE_DATE,
  RUN_TAG,
} from "./fixtures";

/**
 * What the database refuses.
 *
 * These are schema guarantees rather than row level security, which is why they
 * live apart from that suite: the constraints in the migration are what stop a
 * wrong money figure, and each one is worth failing on its own.
 */

describe("money", () => {
  test("an amount of zero or below is refused", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();
    for (const amount_minor of [0, -1]) {
      const { error } = await accountA.client.database
        .from("transactions")
        .insert([
          {
            category_id: category.id,
            direction: "spend",
            amount_minor,
            occurred_on: FIXTURE_DATE,
          },
        ]);
      expect(
        error,
        `an amount of ${amount_minor} must be refused`,
      ).toBeTruthy();
    }
  });
});

describe("a transaction and its category must agree", () => {
  test("a spend cannot be filed under an income category", async ({
    accountA,
    scratch,
  }) => {
    const income = await scratch.category("income");
    const { error } = await accountA.client.database
      .from("transactions")
      .insert([
        {
          category_id: income.id,
          direction: "spend",
          amount_minor: 500,
          occurred_on: FIXTURE_DATE,
        },
      ]);
    expect(
      error,
      "a spend under an income category must be refused",
    ).toBeTruthy();
  });
});

describe("category names and colours", () => {
  test("a name differing only in case is refused", async ({
    accountA,
    scratch,
  }) => {
    const existing = await scratch.category();
    const { error } = await accountA.client.database
      .from("categories")
      .insert([{ name: existing.name.toUpperCase(), kind: existing.kind }]);
    expect(error, "the same name in another case must be refused").toBeTruthy();
  });

  test("the same name under a different kind is allowed", async ({
    accountA,
    scratch,
  }) => {
    const spend = await scratch.category("spend");
    const { error } = await accountA.client.database
      .from("categories")
      .insert([{ name: spend.name, kind: "income" }]);
    expect(error, "uniqueness is per kind, not per account").toBeFalsy();

    // Not created through the scratch fixture, so remove it here, checked.
    assertOk(
      "Removing the income twin",
      await accountA.client.database
        .from("categories")
        .delete()
        .eq("name", spend.name)
        .eq("kind", "income"),
    );
  });

  test("a colour outside the ten tokens is refused", async ({ accountA }) => {
    const { error } = await accountA.client.database
      .from("categories")
      .insert([{ name: `${RUN_TAG}-hex`, kind: "spend", color: "#22c55e" }]);
    expect(error, "a hex colour must be refused").toBeTruthy();
  });
});

describe("text length", () => {
  test("an over long note or merchant is refused", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();
    for (const field of [
      { note: "x".repeat(501) },
      { merchant: "x".repeat(201) },
    ]) {
      const { error } = await accountA.client.database
        .from("transactions")
        .insert([
          {
            category_id: category.id,
            direction: "spend",
            amount_minor: 500,
            occurred_on: FIXTURE_DATE,
            ...field,
          },
        ]);
      expect(
        error,
        `${Object.keys(field)[0]} over its cap must be refused`,
      ).toBeTruthy();
    }
  });
});

describe("a category with history", () => {
  test("cannot be deleted, but can be hidden", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();
    const logged = await scratch.log(category, { amount_minor: 1500 });

    await accountA.client.database
      .from("categories")
      .delete()
      .eq("id", category.id);
    const survived = rows(
      categorySchema,
      "categories",
      await accountA.client.database
        .from("categories")
        .select()
        .eq("id", category.id),
    );
    expect(
      survived,
      "it still has a transaction, so it must survive",
    ).toHaveLength(1);

    await accountA.client.database
      .from("categories")
      .update({ is_hidden: true })
      .eq("id", category.id);
    const hidden = rows(
      categorySchema,
      "categories",
      await accountA.client.database
        .from("categories")
        .select()
        .eq("id", category.id),
    );
    expect(hidden[0].is_hidden).toBe(true);

    const history = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("id", logged.id),
    );
    expect(history, "hiding must never touch history").toHaveLength(1);
  });
});

describe("the starting categories", () => {
  test("each account was given its own ten", async ({ accountA, accountB }) => {
    for (const account of [accountA, accountB]) {
      const mine = rows(
        categorySchema,
        "categories",
        await account.client.database.from("categories").select(),
      );
      const seeded = mine.filter((row) => !row.name.startsWith("zz-run-"));
      expect(seeded, `${account.label} account`).toHaveLength(10);
      expect(
        seeded.filter((r) => r.kind === "income").map((r) => r.name),
      ).toEqual(["Salary"]);
      expect(
        seeded.filter((r) => r.kind === "spend").map((r) => r.name),
      ).toContain("Groceries");
    }
  });
});
