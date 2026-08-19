import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  categorySchema,
  parseRows,
  profileSchema,
  transactionSchema,
} from "@/lib/schema";

import { cleanUp, signIn, type TestAccount } from "./accounts";

/**
 * Does lib/schema.ts still describe the real tables?
 *
 * There is no ORM, so nothing else notices when a migration renames a column.
 * Left alone that arrives as undefined and becomes NaN inside a total, which
 * is the failure spec 0001 rule 11 exists to prevent. This turns it into a red
 * test run instead.
 */

let account: TestAccount;

beforeAll(async () => {
  account = await signIn(
    "first",
    "INSFORGE_TEST_EMAIL_A",
    "INSFORGE_TEST_PASSWORD",
  );
  await cleanUp(account);

  const { data: categories } = await account.client.database
    .from("categories")
    .select("id")
    .eq("name", "Groceries");

  await account.client.database.from("transactions").insert([
    {
      category_id: (categories as { id: string }[])[0].id,
      direction: "spend",
      amount_cents: 1234,
      occurred_on: "2026-08-19",
      merchant: "Drift Check",
      note: "written so this table has a row to read",
    },
  ]);
});

afterAll(async () => {
  if (account) await cleanUp(account);
});

describe("the live tables still match lib/schema.ts", () => {
  it("profiles", async () => {
    const { data, error } = await account.client.database
      .from("profiles")
      .select();
    expect(error).toBeFalsy();
    expect(data ?? [], "no profile row to check").not.toHaveLength(0);
    expect(() => parseRows(profileSchema, "profiles", data)).not.toThrow();
  });

  it("categories", async () => {
    const { data, error } = await account.client.database
      .from("categories")
      .select();
    expect(error).toBeFalsy();
    expect(data ?? [], "no category row to check").not.toHaveLength(0);
    expect(() => parseRows(categorySchema, "categories", data)).not.toThrow();
  });

  it("transactions", async () => {
    const { data, error } = await account.client.database
      .from("transactions")
      .select();
    expect(error).toBeFalsy();
    expect(data ?? [], "no transaction row to check").not.toHaveLength(0);
    expect(() =>
      parseRows(transactionSchema, "transactions", data),
    ).not.toThrow();
  });

  it("keeps a nullable column as undefined rather than null", async () => {
    const { data: categories } = await account.client.database
      .from("categories")
      .select("id")
      .eq("name", "Transport");

    const { data } = await account.client.database
      .from("transactions")
      .insert([
        {
          category_id: (categories as { id: string }[])[0].id,
          direction: "spend",
          amount_cents: 700,
          occurred_on: "2026-08-19",
        },
      ])
      .select();

    const [row] = parseRows(transactionSchema, "transactions", data);
    expect(row.merchant).toBeUndefined();
    expect(row.note).toBeUndefined();
  });
});
