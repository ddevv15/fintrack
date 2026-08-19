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
 * Remove every transaction this account owns, and every category it added
 * beyond the ten it started with.
 *
 * Transactions go first: a category with history cannot be deleted, which is
 * the whole point of the restrict rule these suites are here to prove.
 */
export async function cleanUp(account: TestAccount): Promise<void> {
  await account.client.database
    .from("transactions")
    .delete()
    .eq("user_id", account.userId);

  const { data } = await account.client.database
    .from("categories")
    .select("id, name")
    .eq("user_id", account.userId);

  const extras = (data ?? []).filter(
    (row: { name: string }) => !STARTING_CATEGORIES.includes(row.name),
  );

  for (const extra of extras as { id: string }[]) {
    await account.client.database
      .from("categories")
      .delete()
      .eq("id", extra.id);
  }
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
