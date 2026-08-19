import { randomUUID } from "node:crypto";

import { createClient } from "@insforge/sdk";

/**
 * Two signed in accounts to test row level security against.
 *
 * Why the accounts are not created here. This project requires email
 * verification, so a signup returns no session until a code sent by email is
 * entered. A test cannot read an inbox, so the two accounts are signed up and
 * verified once by a person, and every run after that just signs in. Deleting
 * them would mean doing that by hand again, so the suites clean up their rows
 * and leave the accounts alone.
 */
/**
 * A tag unique to this run, and the fixed date its fixtures carry.
 *
 * The two accounts are fixed and reused, so two runs can be in flight at once:
 * you running the suite locally while CI runs it on a push. Cleaning up by
 * account alone would have one run deleting rows the other just wrote, failing
 * tests that were perfectly correct.
 *
 * So a run never writes a transaction against a shared category. It creates its
 * own categories, named with this tag, and every fixture hangs off one of them.
 * Cleanup then deletes by category rather than by account, which is exact.
 *
 * The tag carries 64 bits of randomness, and it is the database that makes that
 * safe rather than the odds: category names are unique per account and kind, so
 * two runs drawing the same tag cannot quietly share a category. The second one
 * fails loudly on the unique index instead of deleting the first one's data.
 * A date cannot offer that, which is why it is no longer the key.
 */
export const RUN_TAG = `zz-run-${randomUUID().replace(/-/g, "").slice(0, 16)}`;

/**
 * The day every fixture is dated.
 *
 * Fixed, not random: it no longer has to be unique, because the category does
 * that job. Far in the future so a stray row can never be mistaken for real
 * spending.
 */
export const FIXTURE_DATE = "2250-01-15";

export type TestAccount = {
  label: string;
  userId: string;
  client: ReturnType<typeof createClient>;
};

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

/** Sign in one account, with an error that says what to do if it cannot. */
export async function signIn(
  label: string,
  emailVar: string,
  passwordVar: string,
): Promise<TestAccount> {
  const email = required(emailVar);
  const password = required(passwordVar);

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
        `One time setup: sign this address up in the app, open the ` +
        `verification email, and enter the code. After that these tests sign ` +
        `in on their own. Email verification is why this cannot be automated.`,
    );
  }

  const { data: user } = await client.auth.getCurrentUser();
  const userId = user?.user?.id;
  if (!userId) {
    throw new Error(`Signed in as ${label} but could not read the user id.`);
  }

  return { label, userId, client };
}

/** Both accounts, signed in. */
export async function signInBoth(): Promise<[TestAccount, TestAccount]> {
  return Promise.all([
    signIn("first", "INSFORGE_TEST_EMAIL_A", "INSFORGE_TEST_PASSWORD"),
    signIn("second", "INSFORGE_TEST_EMAIL_B", "INSFORGE_TEST_PASSWORD"),
  ]);
}

/**
 * Remove exactly what this run created, and nothing else.
 *
 * Every fixture hangs off a category named with this run's tag, so finding
 * those categories finds every row the run wrote. Another run's rows, and the
 * ten starting categories, are untouchable from here.
 *
 * Transactions go first. A category with history cannot be deleted, which is
 * the whole point of the restrict rule these suites prove, so the other order
 * would fail.
 */
export async function cleanUp(account: TestAccount): Promise<void> {
  const { data } = await account.client.database
    .from("categories")
    .select("id")
    .eq("user_id", account.userId)
    .like("name", `${RUN_TAG}%`);

  for (const own of (data ?? []) as { id: string }[]) {
    await account.client.database
      .from("transactions")
      .delete()
      .eq("category_id", own.id);

    await account.client.database.from("categories").delete().eq("id", own.id);
  }
}

/**
 * Create a category this run owns. Every fixture transaction hangs off one.
 *
 * Writing against a starting category such as Groceries would be shared state:
 * two runs would see each other's rows, and cleanup could not tell them apart.
 */
export async function createRunCategory(
  account: TestAccount,
  suffix: string,
  kind: "spend" | "income" = "spend",
): Promise<string> {
  const { data, error } = await account.client.database
    .from("categories")
    .insert([{ name: `${RUN_TAG}-${suffix}`, kind }])
    .select();

  if (error || !data) {
    throw new Error(
      `Could not create a run owned category: ${JSON.stringify(error)}`,
    );
  }
  return (data as { id: string }[])[0].id;
}

/** The ten a new account is given by the trigger in the seed migration. */
export const STARTING_CATEGORIES = [
  "Groceries",
  "Eating out",
  "Transport",
  "Housing",
  "Utilities",
  "Health",
  "Shopping",
  "Entertainment",
  "Other",
  "Salary",
];
