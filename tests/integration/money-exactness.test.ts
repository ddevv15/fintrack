import { transactionSchema } from "@/lib/schema";

import { describe, expect, rows, test as base } from "./fixtures";

/**
 * Money adds up exactly, proved rather than declared.
 *
 * Integer cents in a bigint column cannot drift, but that is a claim until
 * something checks it against real rows. These amounts are chosen to expose a
 * decimal column: values whose sum is not representable in binary floating
 * point, and one large enough to catch a narrower integer type.
 */

const amounts = [10, 20, 1, 2, 999_999_999, 7, 33_333, 66_667];
const expectedTotal = amounts.reduce((sum, cents) => sum + cents, 0);

const test = base.extend<{ categoryId: string }>({
  categoryId: [
    async ({ scratch }, use) => {
      const category = await scratch.category();
      for (const amount_cents of amounts) {
        await scratch.log(category, { amount_cents });
      }
      await use(category.id);
    },
    { scope: "file" },
  ],
});

describe("amounts survive the round trip and the sum", () => {
  test("every amount reads back exactly as written", async ({
    accountA,
    categoryId,
  }) => {
    const logged = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("category_id", categoryId),
    );
    expect(logged.map((row) => row.amount_cents).sort((x, y) => x - y)).toEqual(
      [...amounts].sort((x, y) => x - y),
    );
  });

  test("they total to the exact cent", async ({ accountA, categoryId }) => {
    const logged = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("category_id", categoryId),
    );
    const total = logged.reduce((sum, row) => sum + row.amount_cents, 0);
    expect(total).toBe(expectedTotal);
  });

  test("every amount stays a whole, safe integer", async ({
    accountA,
    categoryId,
  }) => {
    // transactionSchema already refuses anything else, so reaching this point
    // is most of the assertion; this states the guarantee explicitly.
    const logged = rows(
      transactionSchema,
      "transactions",
      await accountA.client.database
        .from("transactions")
        .select()
        .eq("category_id", categoryId),
    );
    for (const row of logged) {
      expect(Number.isSafeInteger(row.amount_cents)).toBe(true);
    }
  });
});
