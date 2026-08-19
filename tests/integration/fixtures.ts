import { randomUUID } from "node:crypto";

import { createClient } from "@insforge/sdk";
import { test as base } from "vitest";
import type { z } from "zod";

import {
  categorySchema,
  parseRows,
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
  return { label, userId: user.user.id, client } satisfies TestAccount;
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
    fields: { amount_cents: number; merchant?: string; note?: string },
  ): Promise<Transaction>;
};

function scratchFor(account: TestAccount) {
  const categories: Category[] = [];

  const scratch: Scratch = {
    async category(kind: EntryDirection = "spend") {
      const created = one(
        categorySchema,
        "categories",
        await account.client.database
          .from("categories")
          .insert([{ name: `${RUN_TAG}-${categories.length}`, kind }])
          .select(),
      );
      categories.push(created);
      return created;
    },

    async log(category, fields) {
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
  // restrict rule these suites exist to prove.
  const dispose = async () => {
    for (const category of categories) {
      await account.client.database
        .from("transactions")
        .delete()
        .eq("category_id", category.id);
      await account.client.database
        .from("categories")
        .delete()
        .eq("id", category.id);
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
