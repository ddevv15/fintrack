import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  cleanUp,
  createRunCategory,
  RUN_DATE,
  signInBoth,
  type TestAccount,
} from "./accounts";

/**
 * The proof that one account cannot reach another's money.
 *
 * Spec 0002 calls a mistaken policy a silent leak rather than a loud error,
 * which is exactly why this cannot be checked by reading the migration. It has
 * to be two real sessions against the real database.
 */

let a: TestAccount;
let b: TestAccount;
let aCategoryId: string;
let aTransactionId: string;
let aOwnCategoryId: string;

// Every row this run writes carries RUN_DATE, so a concurrent run never sees
// or deletes it. See RUN_DATE in ./accounts.
const today = RUN_DATE;

beforeAll(async () => {
  [a, b] = await signInBoth();
  await cleanUp(a);
  await cleanUp(b);

  const { data: categories } = await a.client.database
    .from("categories")
    .select("id, name, kind")
    .eq("name", "Groceries");
  aCategoryId = (categories as { id: string }[])[0].id;

  // A category only this run owns, for the tests that change one. Toggling a
  // starting category would be shared state across concurrent runs.
  aOwnCategoryId = await createRunCategory(a, "history");

  const { data: inserted, error } = await a.client.database
    .from("transactions")
    .insert([
      {
        category_id: aCategoryId,
        direction: "spend",
        amount_cents: 4599,
        occurred_on: today,
        merchant: "Test Mart",
      },
    ])
    .select();
  expect(
    error,
    "the first account should be able to log its own spend",
  ).toBeFalsy();
  aTransactionId = (inserted as { id: string }[])[0].id;
});

afterAll(async () => {
  if (a) await cleanUp(a);
  if (b) await cleanUp(b);
});

describe("the two accounts are actually different", () => {
  it("has two distinct user ids", () => {
    expect(a.userId).not.toBe(b.userId);
  });
});

describe("reading across accounts", () => {
  it("does not show the second account the first account's transactions", async () => {
    const { data } = await b.client.database.from("transactions").select("id");
    const ids = (data ?? []).map((row: { id: string }) => row.id);
    expect(ids).not.toContain(aTransactionId);
  });

  it("does not show the second account the first account's categories", async () => {
    const { data } = await b.client.database.from("categories").select("id");
    const ids = (data ?? []).map((row: { id: string }) => row.id);
    expect(ids).not.toContain(aCategoryId);
  });

  it("returns nothing rather than an error when asked directly", async () => {
    // An empty result, not a denial. The second account never learns the row exists.
    const { data } = await b.client.database
      .from("transactions")
      .select("id")
      .eq("id", aTransactionId);
    expect(data ?? []).toHaveLength(0);
  });

  it("does not show the second account the first account's profile", async () => {
    const { data } = await b.client.database.from("profiles").select("user_id");
    const ids = (data ?? []).map((row: { user_id: string }) => row.user_id);
    expect(ids).not.toContain(a.userId);
  });
});

describe("writing across accounts", () => {
  it("cannot edit the first account's transaction", async () => {
    await b.client.database
      .from("transactions")
      .update({ amount_cents: 1 })
      .eq("id", aTransactionId);

    const { data } = await a.client.database
      .from("transactions")
      .select("amount_cents")
      .eq("id", aTransactionId);
    expect((data as { amount_cents: number }[])[0].amount_cents).toBe(4599);
  });

  it("cannot delete the first account's transaction", async () => {
    await b.client.database
      .from("transactions")
      .delete()
      .eq("id", aTransactionId);

    const { data } = await a.client.database
      .from("transactions")
      .select("id")
      .eq("id", aTransactionId);
    expect(data ?? []).toHaveLength(1);
  });

  it("cannot log an entry against the first account's category", async () => {
    // The three column foreign key, not row level security, is what stops this.
    const { error } = await b.client.database.from("transactions").insert([
      {
        category_id: aCategoryId,
        direction: "spend",
        amount_cents: 100,
        occurred_on: today,
      },
    ]);
    expect(
      error,
      "referencing another account's category must fail",
    ).toBeTruthy();
  });

  it("cannot write a row owned by someone else", async () => {
    const { error } = await b.client.database.from("transactions").insert([
      {
        user_id: a.userId,
        category_id: aCategoryId,
        direction: "spend",
        amount_cents: 100,
        occurred_on: today,
      },
    ]);
    expect(error, "naming another owner must fail").toBeTruthy();
  });
});

describe("the database refuses bad money and bad references", () => {
  it("refuses an amount of zero or below", async () => {
    for (const amount of [0, -1]) {
      const { error } = await a.client.database.from("transactions").insert([
        {
          category_id: aCategoryId,
          direction: "spend",
          amount_cents: amount,
          occurred_on: today,
        },
      ]);
      expect(error, `an amount of ${amount} must be refused`).toBeTruthy();
    }
  });

  it("refuses a spend filed under an income category", async () => {
    const { data } = await a.client.database
      .from("categories")
      .select("id")
      .eq("name", "Salary");
    const salaryId = (data as { id: string }[])[0].id;

    const { error } = await a.client.database.from("transactions").insert([
      {
        category_id: salaryId,
        direction: "spend",
        amount_cents: 500,
        occurred_on: today,
      },
    ]);
    expect(error, "a spend under Salary must be refused").toBeTruthy();
  });

  it("refuses a second category whose name differs only in case", async () => {
    const { error } = await a.client.database
      .from("categories")
      .insert([{ name: "groceries", kind: "spend" }]);
    expect(error, "groceries next to Groceries must be refused").toBeTruthy();
  });

  it("refuses a colour outside the ten tokens", async () => {
    const { error } = await a.client.database
      .from("categories")
      .insert([{ name: "Gadgets", kind: "spend", color: "#22c55e" }]);
    expect(error, "a hex colour must be refused").toBeTruthy();
  });

  it("refuses a note longer than the column allows", async () => {
    const { error } = await a.client.database.from("transactions").insert([
      {
        category_id: aCategoryId,
        direction: "spend",
        amount_cents: 500,
        occurred_on: today,
        note: "x".repeat(501),
      },
    ]);
    expect(error, "a 501 character note must be refused").toBeTruthy();
  });
});

describe("a category with history", () => {
  let ownTransactionId: string;

  beforeAll(async () => {
    const { data } = await a.client.database
      .from("transactions")
      .insert([
        {
          category_id: aOwnCategoryId,
          direction: "spend",
          amount_cents: 1500,
          occurred_on: today,
        },
      ])
      .select();
    ownTransactionId = (data as { id: string }[])[0].id;
  });

  it("cannot be deleted", async () => {
    await a.client.database
      .from("categories")
      .delete()
      .eq("id", aOwnCategoryId);

    const { data } = await a.client.database
      .from("categories")
      .select("id")
      .eq("id", aOwnCategoryId);
    expect(
      data ?? [],
      "it still has a transaction, so it must survive",
    ).toHaveLength(1);
  });

  it("can be hidden instead, without touching its transactions", async () => {
    await a.client.database
      .from("categories")
      .update({ is_hidden: true })
      .eq("id", aOwnCategoryId);

    const { data: hidden } = await a.client.database
      .from("categories")
      .select("is_hidden")
      .eq("id", aOwnCategoryId);
    expect((hidden as { is_hidden: boolean }[])[0].is_hidden).toBe(true);

    const { data: still } = await a.client.database
      .from("transactions")
      .select("id")
      .eq("id", ownTransactionId);
    expect(still ?? [], "hiding must never touch history").toHaveLength(1);
  });
});

describe("the starting categories", () => {
  it("gave each account its own ten", async () => {
    for (const account of [a, b]) {
      const { data } = await account.client.database
        .from("categories")
        .select("name, kind, color");
      const rows = data as { name: string; kind: string }[];
      expect(rows.length, `${account.label} account`).toBeGreaterThanOrEqual(
        10,
      );
      expect(
        rows.filter((r) => r.kind === "income").map((r) => r.name),
      ).toContain("Salary");
      expect(
        rows.filter((r) => r.kind === "spend").map((r) => r.name),
      ).toContain("Groceries");
    }
  });
});
