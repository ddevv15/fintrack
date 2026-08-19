import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { transactionSchema, parseRows } from "@/lib/schema";

import { cleanUp, RUN_DATE, signIn, type TestAccount } from "./accounts";

/**
 * Money adds up exactly, proved rather than declared.
 *
 * Integer cents in a bigint column cannot drift, but that is a claim until
 * something checks it against real rows. These amounts are the ones that would
 * expose a decimal column: values whose sum is not representable in binary
 * floating point.
 */

let account: TestAccount;
let categoryId: string;

// 0.1 + 0.2 is the classic. In cents these are exact by construction, which is
// the entire argument for storing cents rather than a decimal number.
const amounts = [10, 20, 1, 2, 999_999_999, 7, 33_333, 66_667];
const expectedTotal = amounts.reduce((sum, cents) => sum + cents, 0);

beforeAll(async () => {
  account = await signIn(
    "first",
    "INSFORGE_TEST_EMAIL_A",
    "INSFORGE_TEST_PASSWORD",
  );
  await cleanUp(account);

  const { data } = await account.client.database
    .from("categories")
    .select("id")
    .eq("name", "Groceries");
  categoryId = (data as { id: string }[])[0].id;

  const { error } = await account.client.database.from("transactions").insert(
    amounts.map((cents) => ({
      category_id: categoryId,
      direction: "spend" as const,
      amount_cents: cents,
      occurred_on: RUN_DATE,
    })),
  );
  expect(error).toBeFalsy();
});

afterAll(async () => {
  if (account) await cleanUp(account);
});

describe("amounts survive the round trip and the sum", () => {
  it("reads back every amount exactly as written", async () => {
    const { data } = await account.client.database
      .from("transactions")
      .select()
      .eq("occurred_on", RUN_DATE);

    const rows = parseRows(transactionSchema, "transactions", data);
    expect(rows.map((row) => row.amount_cents).sort((x, y) => x - y)).toEqual(
      [...amounts].sort((x, y) => x - y),
    );
  });

  it("totals to the exact cent", async () => {
    const { data } = await account.client.database
      .from("transactions")
      .select("amount_cents")
      .eq("occurred_on", RUN_DATE);

    const rows = data as { amount_cents: number | string }[];
    const total = rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
    expect(total).toBe(expectedTotal);
  });

  it("keeps every amount a whole, safe integer", async () => {
    const { data } = await account.client.database
      .from("transactions")
      .select("amount_cents")
      .eq("occurred_on", RUN_DATE);

    for (const row of data as { amount_cents: number | string }[]) {
      expect(Number.isSafeInteger(Number(row.amount_cents))).toBe(true);
    }
  });
});
