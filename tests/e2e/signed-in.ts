import { today } from "@/lib/time";

/**
 * A real signed in session for the browser tests, and a month of spending to
 * look at.
 *
 * Everything before spec 0005 could be tested signed out: the public screens,
 * the closed doors, and a component gallery that renders no account data. The
 * breakdown is the first screen whose accessibility can only be checked while
 * signed in, because there is no version of it a visitor can reach.
 *
 * The session is built by calling the auth API and writing the cookies the SDK
 * reads, rather than by driving the sign in form. Filling a form would test
 * feature 5 again on every run, and would fail this suite for a reason that has
 * nothing to do with the screen under test.
 *
 * The backend is reached with plain `fetch` rather than through `@insforge/sdk`.
 * Playwright transpiles these files to CommonJS and requires them, and the SDK
 * pulls in a package that publishes no CommonJS entry point, so importing it
 * here fails before a single test runs. The app itself is unaffected: it uses
 * the SDK, under a bundler that resolves it correctly. Only this process needs
 * the plainer route.
 *
 * It uses the same account and the same environment variables as the
 * integration suite, so there is one set of test credentials rather than two.
 */

/** Where the signed in browser state is saved. Gitignored. */
export const STORAGE_STATE = "tests/e2e/.auth/account-a.json";

/**
 * The tag every row this suite creates carries.
 *
 * Named rather than random, unlike the integration fixture's per run tag,
 * because the browser tests assert against these exact categories and a name
 * that changed every run could not be asserted on.
 */
export const SEED_PREFIX = "zz-e2e";

/**
 * The month of spending the breakdown tests read.
 *
 * The amounts total 10000 minor units, so the shares are exactly 60, 30, and 10
 * with no rounding involved. The rounding itself is proved in the unit tests,
 * which cover the awkward cases far more cheaply than a browser can.
 *
 * The names sort in an order that is not the amount order, so a screen that
 * ranked alphabetically instead of by amount would fail rather than coincide.
 *
 * The colours are set rather than left to default. Every category would
 * otherwise fall back to `slate`, and a screen that ignored the colour
 * altogether would look identical to one that used it, so the bar and the dot
 * would go unchecked (AC-5).
 */
export const SEED_SPENDING = [
  {
    name: `${SEED_PREFIX}-Transport`,
    amountMinor: 3000,
    percent: 30,
    color: "blue",
  },
  {
    name: `${SEED_PREFIX}-Groceries`,
    amountMinor: 6000,
    percent: 60,
    color: "green",
  },
  {
    name: `${SEED_PREFIX}-Health`,
    amountMinor: 1000,
    percent: 10,
    color: "red",
  },
] as const;

/** The total of the above, in minor units. Account A is on USD. */
export const SEED_TOTAL_MINOR = 10_000;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The signed in browser tests need the same backend ` +
        `and verified account as the integration suite. See docs/migrations.md.`,
    );
  }
  return value;
}

/** One authenticated call to the backend, failing loudly on anything but 2xx. */
async function api(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(
    `${required("NEXT_PUBLIC_INSFORGE_URL")}${path}`,
    {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: required("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
        Authorization: `Bearer ${accessToken}`,
        ...init.headers,
      },
    },
  );

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed with ${response.status}: ${body}`,
    );
  }

  return body ? JSON.parse(body) : undefined;
}

export type SignedInAccount = {
  accessToken: string;
  refreshToken?: string;
  /** Insert rows and get them back. */
  insert(table: string, rows: unknown[]): Promise<Record<string, unknown>[]>;
  /** Read rows with a PostgREST query string. */
  select(table: string, query: string): Promise<Record<string, unknown>[]>;
  /** Delete rows matching a PostgREST query string. */
  remove(table: string, query: string): Promise<void>;
};

/**
 * Sign the first test account in and hand back a small client for its data.
 *
 * The account is not created here. This project requires email verification and
 * a test cannot read an inbox, so it is signed up and verified once by a person
 * and only signed in from then on.
 */
export async function signInAccountA(): Promise<SignedInAccount> {
  const baseUrl = required("NEXT_PUBLIC_INSFORGE_URL");

  const response = await fetch(`${baseUrl}/api/auth/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: required("NEXT_PUBLIC_INSFORGE_ANON_KEY"),
    },
    body: JSON.stringify({
      email: required("INSFORGE_TEST_EMAIL_A"),
      password: required("INSFORGE_TEST_PASSWORD"),
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Could not sign the first test account in (${response.status}): ${body}\n\n` +
        `One time setup, see docs/migrations.md: sign this address up, then ` +
        `mark it verified. Email verification is why this cannot be automated.`,
    );
  }

  const session = JSON.parse(body) as {
    accessToken?: string;
    refreshToken?: string;
  };

  if (!session.accessToken) {
    throw new Error(`Signed in but no access token came back: ${body}`);
  }

  const accessToken = session.accessToken;

  return {
    accessToken,
    refreshToken: session.refreshToken,

    async insert(table, rows) {
      return (await api(accessToken, `/api/database/records/${table}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(rows),
      })) as Record<string, unknown>[];
    },

    async select(table, query) {
      return (await api(
        accessToken,
        `/api/database/records/${table}?${query}`,
      )) as Record<string, unknown>[];
    },

    async remove(table, query) {
      await api(accessToken, `/api/database/records/${table}?${query}`, {
        method: "DELETE",
      });
    },
  };
}

/**
 * A day inside the month the breakdown will show.
 *
 * Worked out in the account's own zone, because that is what decides which
 * month the screen is showing. Using the machine's zone instead would seed into
 * the wrong month for a few hours around every month boundary, and the suite
 * would fail overnight for a reason nobody could reproduce by day.
 */
export function seedDate(): string {
  return today(new Date(), "America/New_York");
}

/**
 * Remove every category this suite has ever created, and its rows.
 *
 * Shared by the setup and the teardown, so a crashed run is cleaned up by the
 * next run's setup rather than only by its own teardown. Transactions go first:
 * a category with history cannot be deleted, which is the restrict rule spec
 * 0002 built on purpose, so the other order fails on every row.
 */
export async function removeSeededRows(
  account: SignedInAccount,
): Promise<void> {
  const seeded = (await account.select(
    "categories",
    `select=id&name=like.${encodeURIComponent(`${SEED_PREFIX}-%`)}`,
  )) as { id: string }[];

  for (const { id } of seeded) {
    await account.remove("transactions", `category_id=eq.${id}`);
    await account.remove("categories", `id=eq.${id}`);
  }
}
