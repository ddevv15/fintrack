import { categorySchema, profileSchema } from "@/lib/schema";

import { describe, expect, one, test } from "./fixtures";

/**
 * The three guards spec 0004 put in the database, proved against the real one.
 *
 * All three exist because the app cannot be trusted to hold the line on its
 * own: a future write path, a script, a hand typed query. Reading the migration
 * tells you the triggers were written. Only this tells you they fire.
 */

describe("the currency lock", () => {
  test("refuses a change once the account has an entry", async ({
    accountA,
    scratch,
  }) => {
    // Account A already has a currency from the fixture, and this gives it
    // history, which is what arms the lock (AC-12).
    const category = await scratch.category();
    await scratch.log(category, { amount_minor: 1000 });

    const before = one(
      profileSchema,
      "profiles",
      await accountA.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountA.userId),
    );

    const { error } = await accountA.client.database
      .from("profiles")
      .update({ currency: before.currency === "USD" ? "EUR" : "USD" })
      .eq("user_id", accountA.userId);

    expect(
      error,
      "changing the currency of an account with history must be refused",
    ).toBeTruthy();
    expect(JSON.stringify(error)).toMatch(/currency cannot change/i);

    const after = one(
      profileSchema,
      "profiles",
      await accountA.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountA.userId),
    );
    expect(after.currency, "the currency must be untouched").toBe(
      before.currency,
    );
  });

  test("allows a change that is not a change", async ({ accountA }) => {
    // Writing the same value must not trip the lock. The fixtures rely on this:
    // they set the currency on every run, and the account has history by then.
    const before = one(
      profileSchema,
      "profiles",
      await accountA.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountA.userId),
    );

    const { error } = await accountA.client.database
      .from("profiles")
      .update({ currency: before.currency })
      .eq("user_id", accountA.userId);

    expect(error, "writing the same currency must be allowed").toBeFalsy();
  });
});

describe("the time zone check", () => {
  test("refuses a name that is not an IANA zone", async ({ accountA }) => {
    const { error } = await accountA.client.database
      .from("profiles")
      .update({ timezone: "Mars/Olympus_Mons" })
      .eq("user_id", accountA.userId);

    expect(error, "an invented time zone must be refused").toBeTruthy();
    expect(JSON.stringify(error)).toMatch(/time zone/i);
  });

  test("accepts a real one", async ({ accountA }) => {
    const before = one(
      profileSchema,
      "profiles",
      await accountA.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountA.userId),
    );

    const { error } = await accountA.client.database
      .from("profiles")
      .update({ timezone: "Europe/Lisbon" })
      .eq("user_id", accountA.userId);
    expect(error, "a real IANA name must be accepted").toBeFalsy();

    // Put it back, so the account keeps the zone the fixture expects.
    await accountA.client.database
      .from("profiles")
      .update({ timezone: before.timezone })
      .eq("user_id", accountA.userId);
  });
});

describe("the profile completeness guard on transactions", () => {
  test("refuses an entry while the account has no currency", async ({
    accountB,
  }) => {
    // Account B is complete, so this has to make it incomplete first, write,
    // and put it back. Its currency is never cleared for real anywhere else,
    // which is exactly why this path needs a test: nothing else exercises it.
    const before = one(
      profileSchema,
      "profiles",
      await accountB.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountB.userId),
    );

    const category = one(
      // Any category of theirs will do; this is about the profile, not the
      // category, and creating one is not what is under test.
      categorySchema,
      "categories",
      await accountB.client.database
        .from("categories")
        .select()
        .eq("kind", "spend")
        .limit(1),
    );

    const cleared = await accountB.client.database
      .from("profiles")
      .update({ currency: null })
      .eq("user_id", accountB.userId);
    expect(
      cleared.error,
      "clearing a currency on an account with no history must be allowed",
    ).toBeFalsy();

    try {
      const { error } = await accountB.client.database
        .from("transactions")
        .insert([
          {
            category_id: category.id,
            direction: "spend",
            amount_minor: 500,
            occurred_on: "2250-01-15",
          },
        ]);

      expect(
        error,
        "an entry against an incomplete profile must be refused",
      ).toBeTruthy();
      expect(JSON.stringify(error)).toMatch(/currency and a time zone/i);
    } finally {
      // Always put it back, even when the assertion above fails. Leaving a
      // shared test account without a currency would break every later run.
      await accountB.client.database
        .from("profiles")
        .update({ currency: before.currency })
        .eq("user_id", accountB.userId);
    }
  });
});

describe("one account cannot touch another's profile", () => {
  test("A cannot read B's profile row", async ({ accountA, accountB }) => {
    // Not an error, an empty result: row level security filters rather than
    // refuses, so B's row is simply not there to be seen (AC-19).
    const { data, error } = await accountA.client.database
      .from("profiles")
      .select()
      .eq("user_id", accountB.userId);

    expect(error, "the query itself should succeed").toBeFalsy();
    expect(data, "B's profile must not be readable by A").toHaveLength(0);
  });

  test("A cannot change B's currency or time zone", async ({
    accountA,
    accountB,
  }) => {
    const before = one(
      profileSchema,
      "profiles",
      await accountB.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountB.userId),
    );

    await accountA.client.database
      .from("profiles")
      .update({ currency: "KWD", timezone: "Pacific/Auckland" })
      .eq("user_id", accountB.userId);

    // The update matches no row for A, so it may report success having done
    // nothing. What matters is B's row, read as B.
    const after = one(
      profileSchema,
      "profiles",
      await accountB.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountB.userId),
    );

    expect(after.currency, "B's currency must be untouched").toBe(
      before.currency,
    );
    expect(after.timezone, "B's time zone must be untouched").toBe(
      before.timezone,
    );
  });
});

describe("deleting an account", () => {
  test("cannot be aimed at somebody else, because it takes no target", async ({
    accountA,
    accountB,
  }) => {
    // The real guarantee is structural: delete_own_account() has no parameters,
    // so the account it removes comes from auth.uid() and there is nowhere to
    // name another one. This proves that from the outside, by trying to name
    // one and being refused before anything runs.
    //
    // Safe to run against real accounts precisely because it fails: the call is
    // rejected for having an argument the function does not accept, so no
    // deletion is attempted for either account.
    const { error } = await accountA.client.database.rpc("delete_own_account", {
      user_id: accountB.userId,
    });

    expect(
      error,
      "naming an account to delete must be refused outright",
    ).toBeTruthy();

    // And B is still there.
    const survivor = one(
      profileSchema,
      "profiles",
      await accountB.client.database
        .from("profiles")
        .select()
        .eq("user_id", accountB.userId),
    );
    expect(survivor.user_id).toBe(accountB.userId);
  });
});
