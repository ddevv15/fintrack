import { randomUUID } from "node:crypto";

import { createClient } from "@insforge/sdk";
import { test as base } from "vitest";
import { z } from "zod";

import {
  categorySchema,
  parseRows,
  profileSchema,
  transactionSchema,
  type Category,
  type EntryDirection,
  type Transaction,
} from "@/lib/schema";

/**
 * What every integration suite needs: two signed in accounts, somewhere safe to
 * write, and reads that fail loudly.
 */

/**
 * A tag unique to this run.
 *
 * The two accounts are fixed and reused, so two runs can be in flight at once:
 * you running the suite locally while CI runs it on a push. A run therefore
 * never writes against a starting category. It creates its own, named with this
 * tag, and every fixture row hangs off one.
 *
 * Cleanup deletes the exact ids it created rather than matching this tag, so it
 * cannot reach another run's rows or another suite's. The tag is in the name so
 * that anything a crashed run leaves behind is easy to find and remove by hand.
 * Category names are unique per account and kind, so two runs drawing the same
 * tag fail loudly on the unique index rather than quietly sharing a category.
 */
export const RUN_TAG = `zz-run-${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/** The day every fixture row is dated. Far future, so it is never real spending. */
export const FIXTURE_DATE = "2250-01-15";

type QueryResult = { data?: unknown; error?: unknown };

/**
 * Every row of a result, parsed against its schema.
 *
 * The reason this exists rather than reading `data` directly: the SDK reports a
 * failure by setting `error` and leaving `data` undefined. Code that reads only
 * `data` and falls back to an empty array cannot tell a query that returned
 * nothing from one that did not run, and these suites are full of assertions
 * that something is absent. A broken query would satisfy every one of them.
 * Here a failure throws, and a row that does not match its schema throws too.
 */
export function rows<T extends z.ZodType>(
  schema: T,
  table: string,
  result: QueryResult,
): z.infer<T>[] {
  if (result.error) {
    throw new Error(
      `Query on "${table}" failed: ${JSON.stringify(result.error)}`,
    );
  }
  return parseRows(schema, table, result.data ?? []);
}

/** Exactly one row, or an explicit failure saying how many came back. */
export function one<T extends z.ZodType>(
  schema: T,
  table: string,
  result: QueryResult,
): z.infer<T> {
  const all = rows(schema, table, result);
  if (all.length !== 1) {
    throw new Error(
      `Expected exactly one row from "${table}", got ${all.length}`,
    );
  }
  return all[0];
}

/**
 * Fail on a write that did not happen.
 *
 * The counterpart to `rows` and `one` for inserts, updates, and deletes. The
 * SDK reports a refused write the same way it reports a refused read, by
 * setting `error`, so a write whose result is never inspected is a silent no op.
 * In teardown that is worse than in a test: the suite goes green while its rows
 * stay behind in a backend two accounts share.
 */
export function assertOk(action: string, result: QueryResult): void {
  if (result.error) {
    throw new Error(`${action} failed: ${JSON.stringify(result.error)}`);
  }
}

export type TestAccount = {
  label: string;
  userId: string;
  client: ReturnType<typeof createClient>;
};

const ACCOUNT_EMAIL_VAR = {
  first: "INSFORGE_TEST_EMAIL_A",
  second: "INSFORGE_TEST_EMAIL_B",
} as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The integration tests need a backend and two ` +
        `verified accounts. See docs/migrations.md, "Running the integration tests".`,
    );
  }
  return value;
}

/**
 * Sign one account in.
 *
 * The accounts are not created here. This project requires email verification,
 * and a test cannot read an inbox, so they are signed up and verified once by a
 * person. Every run after that just signs in, and cleanup never deletes them.
 */
async function signIn(label: keyof typeof ACCOUNT_EMAIL_VAR) {
  const email = required(ACCOUNT_EMAIL_VAR[label]);
  const password = required("INSFORGE_TEST_PASSWORD");

  const client = createClient({
    baseUrl: required("NEXT_PUBLIC_INSFORGE_URL"),
    anonKey: required("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
  });

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data?.accessToken) {
    throw new Error(
      `Could not sign in the ${label} test account (${email}).\n` +
        `Reason: ${error ? JSON.stringify(error) : "no access token returned"}\n\n` +
        `One time setup, see docs/migrations.md: sign this address up, then ` +
        `mark it verified. Email verification is why this cannot be automated.`,
    );
  }

  const { data: user, error: whoError } = await client.auth.getCurrentUser();
  if (whoError || !user?.user?.id) {
    throw new Error(`Signed in as ${label} but could not read the user id.`);
  }

  await ensureLocale({ label, userId: user.user.id, client });

  return { label, userId: user.user.id, client } satisfies TestAccount;
}

/**
 * The currency and timezone each test account uses.
 *
 * They differ on purpose. Two accounts on the same backend with different
 * currencies and different zones is what proves those values are really per
 * person rather than per deployment, and account B's yen is a zero decimal
 * currency, so the exponent path is exercised by an ordinary fixture and not
 * only by a unit test.
 */
const ACCOUNT_LOCALE = {
  first: { currency: "USD", timezone: "America/New_York" },
  second: { currency: "JPY", timezone: "Asia/Tokyo" },
} as const;

/**
 * Give the account a currency and a timezone if it has none yet.
 *
 * Spec 0004 added a BEFORE INSERT trigger refusing any transaction while the
 * account's profile is incomplete, so without this every fixture write fails
 * with a message about a currency nobody chose. Sign up normally supplies both;
 * these two accounts predate the columns.
 *
 * Idempotent, and it stays legal after the currency locks: the lock trigger
 * only fires when the value actually changes, and this writes the same value
 * every run.
 */
async function ensureLocale(account: TestAccount): Promise<void> {
  const wanted = ACCOUNT_LOCALE[account.label as keyof typeof ACCOUNT_LOCALE];

  const current = one(
    profileSchema,
    "profiles",
    await account.client.database
      .from("profiles")
      .select()
      .eq("user_id", account.userId),
  );

  if (current.currency && current.timezone) return;

  assertOk(
    `setting the ${account.label} account's currency and time zone`,
    await account.client.database
      .from("profiles")
      .update(wanted)
      .eq("user_id", account.userId),
  );
}

/**
 * Somewhere safe to write, owned by one account and one file.
 *
 * It hands out categories and logs rows against them, remembering every id it
 * created so it can remove exactly those and nothing else.
 */
export type Scratch = {
  category(kind?: EntryDirection): Promise<Category>;
  log(
    category: Category,
    fields: { amount_minor: number; merchant?: string; note?: string },
  ): Promise<Transaction>;
};

/** Just enough of a row to record it for cleanup. */
const idOnly = z.object({ id: z.uuid() });

function scratchFor(account: TestAccount) {
  /**
   * The ids this fixture created, recorded the moment the database confirms
   * them and before the row is parsed.
   *
   * The order matters. Parsing can fail when the schema and the database
   * disagree, which is exactly the drift case these suites are built to catch,
   * and a row recorded only after a successful parse would leak on the one run
   * where it matters most.
   */
  const categoryIds: string[] = [];

  const scratch: Scratch = {
    async category(kind: EntryDirection = "spend") {
      const result = await account.client.database
        .from("categories")
        .insert([{ name: `${RUN_TAG}-${categoryIds.length}`, kind }])
        .select();

      categoryIds.push(one(idOnly, "categories", result).id);
      return one(categorySchema, "categories", result);
    },

    async log(category, fields) {
      // No id tracking needed: every row a run writes hangs off one of the
      // categories above, and disposing a category removes its rows first.
      return one(
        transactionSchema,
        "transactions",
        await account.client.database
          .from("transactions")
          .insert([
            {
              category_id: category.id,
              direction: category.kind,
              occurred_on: FIXTURE_DATE,
              ...fields,
            },
          ])
          .select(),
      );
    },
  };

  // Transactions first: a category with history cannot be deleted, which is the
  // restrict rule these suites exist to prove. Every delete is checked, so a
  // teardown that fails fails the run instead of quietly leaving rows behind.
  //
  // One refused delete must not end the teardown, though. The two accounts are
  // fixed and reused, so whatever a run abandons is still there on the next
  // one, and stopping at the first failure would strand rows this run could
  // have removed. Every id gets its turn and the failures are reported once, at
  // the end, so the run still fails.
  const dispose = async () => {
    const failures: string[] = [];

    /** Run one delete, recording a refusal rather than throwing on it. */
    const attempt = async (
      action: string,
      query: PromiseLike<QueryResult>,
    ): Promise<boolean> => {
      try {
        assertOk(action, await query);
        return true;
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : String(cause));
        return false;
      }
    };

    for (const id of categoryIds) {
      const cleared = await attempt(
        `Cleaning up transactions for category ${id}`,
        account.client.database
          .from("transactions")
          .delete()
          .eq("category_id", id),
      );

      // Only worth asking once the rows are gone: with them still there the
      // restrict rule refuses the category, and that second failure would name
      // a cause the first one already recorded.
      if (!cleared) continue;

      await attempt(
        `Cleaning up category ${id}`,
        account.client.database.from("categories").delete().eq("id", id),
      );
    }

    if (failures.length > 0) {
      throw new Error(
        `Fixture cleanup left rows behind in a backend two accounts share:\n${failures
          .map((failure) => `  ${failure}`)
          .join("\n")}`,
      );
    }
  };

  return { scratch, dispose };
}

/**
 * The test function every integration suite imports.
 *
 * Signing in and cleaning up are the fixture's job, so no suite carries a
 * beforeAll, an afterAll, or module level mutable state for them.
 */
export const test = base.extend<{
  accountA: TestAccount;
  accountB: TestAccount;
  scratch: Scratch;
}>({
  accountA: [
    async ({}, use) => {
      await use(await signIn("first"));
    },
    { scope: "file" },
  ],

  accountB: [
    async ({}, use) => {
      await use(await signIn("second"));
    },
    { scope: "file" },
  ],

  scratch: [
    async ({ accountA }, use) => {
      const { scratch, dispose } = scratchFor(accountA);
      await use(scratch);
      await dispose();
    },
    { scope: "file" },
  ],
});

export { expect, describe } from "vitest";
