import { CURRENCIES } from "@/lib/currency";
import {
  categorySchema,
  currencyRowSchema,
  profileSchema,
  transactionSchema,
} from "@/lib/schema";

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
      amount_minor: 1234,
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
    const logged = await scratch.log(category, { amount_minor: 700 });

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

/**
 * Two copies of the currency list, and the one test that keeps them equal.
 *
 * `lib/currency.ts` exists so a picker renders without a query and so
 * TypeScript knows the codes; `public.currencies` exists so the database can
 * refuse a code the app made up. Neither can be dropped, so the only honest
 * arrangement is a check that fails the build the moment they disagree.
 *
 * The decimal count is the part that actually matters. A code missing from one
 * side is caught by the foreign key at write time; a decimal count that differs
 * is silent and renders an amount off by a factor of ten (AC-11).
 */
describe("lib/currency.ts and the currencies table agree", () => {
  test("on every code and every decimal count", async ({ accountA }) => {
    const live = rows(
      currencyRowSchema,
      "currencies",
      await accountA.client.database.from("currencies").select(),
    );

    const inCode = Object.fromEntries(
      CURRENCIES.map((currency) => [currency.code, currency.decimals]),
    );
    const inDatabase = Object.fromEntries(
      live.map((currency) => [currency.code, currency.decimals]),
    );

    expect(
      inDatabase,
      "the currencies table and lib/currency.ts have drifted. Add the code to both, or remove it from both.",
    ).toEqual(inCode);
  });

  test("and the table is readable but not writable", async ({ accountA }) => {
    // Reference data with no owner: every signed in account may read all of it
    // and nobody may change it, because the only intended way this list changes
    // is a migration (AC-19).
    const result = await accountA.client.database
      .from("currencies")
      .insert([{ code: "ZZZ", decimals: 2, name: "Not a currency" }]);

    expect(result.error, "inserting a currency must be refused").toBeTruthy();
  });
});
