import {
  categorySchema,
  categoryUsageSchema,
  monthSpendRowSchema,
} from "@/lib/schema";

import { describe, expect, one, rows, test } from "./fixtures";

/**
 * The parts of feature 9 that only a real backend and two real accounts can
 * prove.
 *
 * Spec 0008 puts two rules in Postgres, and both of them fail silently rather
 * than loudly if they are written wrong, which is exactly why neither can be
 * checked by reading the migration.
 *
 * `category_usage` is a view over two tables that already carry row level
 * security. A view runs as its owner unless it is declared `security_invoker`,
 * and this project's migrations run as an account that owns both tables and is
 * therefore exempt from their policies. Leave the option out and you get a
 * working view that hands every account's counts to everybody. Nothing fails at
 * migration time; only a query from a second account can catch it.
 *
 * The last visible category rule has the same shape. An implementation that
 * reads a count and then writes passes every single threaded test there is, and
 * still lets two tabs each take away one of your last two categories.
 *
 * covers: AC-3, AC-13, AC-22
 */

describe("category_usage counts what it should", () => {
  test("a category nobody has used yet reports zero, not nothing", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();

    // The LEFT JOIN is the whole of this assertion. An inner join would return
    // no row at all here, and by the time that reaches TypeScript a missing row
    // is indistinguishable from a real zero, which is the difference the delete
    // control rests on (AC-15).
    const usage = one(
      categoryUsageSchema,
      "category_usage",
      await accountA.client.database
        .from("category_usage")
        .select("user_id,category_id,entry_count")
        .eq("category_id", category.id),
    );

    expect(usage.entry_count).toBe(0);
    expect(usage.user_id).toBe(accountA.userId);
  });

  test("the count follows the entries filed under it", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();

    await scratch.log(category, { amount_minor: 1200 });
    await scratch.log(category, { amount_minor: 350 });

    const usage = one(
      categoryUsageSchema,
      "category_usage",
      await accountA.client.database
        .from("category_usage")
        .select("user_id,category_id,entry_count")
        .eq("category_id", category.id),
    );

    expect(usage.entry_count).toBe(2);
  });
});

describe("category_usage is scoped to the account querying it", () => {
  test("the second account sees none of the first's counts", async ({
    accountB,
    scratch,
  }) => {
    // A category belonging to the first account, with an entry, so it is
    // certainly present in the view as the first account sees it.
    const category = await scratch.category();
    await scratch.log(category, { amount_minor: 999 });

    const mine = rows(
      categoryUsageSchema,
      "category_usage",
      await accountB.client.database
        .from("category_usage")
        .select("user_id,category_id,entry_count"),
    );

    // Both halves matter. The first is the leak this test exists for; the
    // second catches a view that returned nothing at all, which would satisfy
    // the first while proving nothing.
    expect(mine.map((row) => row.category_id)).not.toContain(category.id);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((row) => row.user_id === accountB.userId)).toBe(true);
  });
});

describe("hiding a category changes no total", () => {
  test("its entries still come back, with its name and colour", async ({
    accountA,
    scratch,
  }) => {
    const category = await scratch.category();
    await scratch.log(category, { amount_minor: 1200 });
    await scratch.log(category, { amount_minor: 350 });

    /** The month screens' shape: an amount, and the category embedded. */
    const spendRows = async () =>
      rows(
        monthSpendRowSchema,
        "transactions",
        await accountA.client.database
          .from("transactions")
          .select("amount_minor,categories(id,name,color)")
          .eq("category_id", category.id),
      );

    const before = await spendRows();
    const total = (entries: typeof before) =>
      entries.reduce((running, entry) => running + entry.amount_minor, 0);

    expect(total(before)).toBe(1550);

    await accountA.client.database
      .from("categories")
      .update({ is_hidden: true })
      .eq("id", category.id);

    const after = await spendRows();

    // AC-14, and the reason it is worth a test even though it is true by
    // construction today: nothing in the month or breakdown queries filters on
    // `is_hidden`, and this is what fails the day somebody adds a filter that
    // seems reasonable in isolation. A hidden category is out of your pickers,
    // not out of your history.
    expect(total(after)).toBe(total(before));
    expect(after).toHaveLength(before.length);
    expect(after[0].categories.name).toBe(category.name);
    expect(after[0].categories.color).toBe(category.color);
  });
});

describe("you always keep one visible spend category", () => {
  /**
   * Hide everything but two, race the last two, put it all back.
   *
   * This is the one test here that changes state the account already had, so it
   * is worth saying what that costs. It hides categories that were visible and
   * unhides exactly those again in a `finally`, and hiding is the one operation
   * in this feature that takes nothing away: no total on any screen in any
   * month moves, and every entry keeps its category (AC-14). So the blast
   * radius of an interrupted run is a handful of categories that need
   * unhiding, not lost data.
   *
   * It runs on the second account, which no other suite writes categories to.
   */
  test("two tabs cannot both hide one of your last two", async ({
    accountB,
  }) => {
    // `await` inside, not outside. Handing `rows()` an unawaited query builder
    // gives it an object with neither `data` nor `error`, which it reads as a
    // successful empty result: the exact silent-empty failure `fixtures.ts`
    // exists to prevent, and it makes every assertion below pass vacuously.
    const visible = async () =>
      rows(
        categorySchema,
        "categories",
        await accountB.client.database
          .from("categories")
          .select()
          .eq("kind", "spend")
          .eq("is_hidden", false),
      );

    const started = await visible();
    expect(started.length).toBeGreaterThanOrEqual(2);

    // Everything except the two the race is about.
    const [first, second, ...rest] = started;
    const parked: string[] = [];

    try {
      for (const category of rest) {
        const result = await accountB.client.database
          .from("categories")
          .update({ is_hidden: true })
          .eq("id", category.id)
          .select();

        expect(result.error).toBeFalsy();
        parked.push(category.id);
      }

      // Two tabs, at the same time, each hiding one of the last two. Fired
      // together rather than awaited in turn: awaiting the first would make the
      // second read a database that has already been changed, which is the
      // single threaded case that passes whatever the trigger does.
      const [one, two] = await Promise.all([
        accountB.client.database
          .from("categories")
          .update({ is_hidden: true })
          .eq("id", first.id)
          .select(),
        accountB.client.database
          .from("categories")
          .update({ is_hidden: true })
          .eq("id", second.id)
          .select(),
      ]);

      const succeeded = [one, two].filter((result) => !result.error);

      // Exactly one. Both succeeding leaves the Log screen with no category to
      // file a spend under, which is the state this rule exists to prevent, and
      // neither succeeding would mean the rule is refusing something legal.
      expect(succeeded).toHaveLength(1);

      // And the account is left in a state a person can still use.
      expect((await visible()).length).toBeGreaterThanOrEqual(1);
    } finally {
      // Exactly what this test hid, and nothing else.
      for (const id of [...parked, first.id, second.id]) {
        await accountB.client.database
          .from("categories")
          .update({ is_hidden: false })
          .eq("id", id);
      }
    }
  });
});
