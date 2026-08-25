import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { test as setup } from "@playwright/test";

import {
  SEED_SPENDING,
  STORAGE_STATE,
  removeSeededRows,
  seedDate,
  signInAccountA,
} from "./signed-in";

/**
 * Build a signed in browser session, and give it a month worth looking at.
 *
 * Runs once before the signed in project and leaves two things behind: the
 * cookies a browser needs to be signed in, and a handful of spend rows dated
 * inside the current month. The teardown removes the rows again.
 *
 * Playwright does not read `.env.local`, and these credentials live there
 * beside the ones the integration suite uses, so it is loaded here explicitly.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI, which supplies the same values as real environment variables.
}

setup("sign in and seed a month of spending", async () => {
  const account = await signInAccountA();

  // Written straight into Playwright's storage state rather than driving the
  // sign in form. These are the cookie names the SDK's own SSR helper reads,
  // which is what `proxy.ts` calls before any Server Component renders.
  const cookies = [
    { name: "insforge_access_token", value: account.accessToken },
    ...(account.refreshToken
      ? [{ name: "insforge_refresh_token", value: account.refreshToken }]
      : []),
  ].map((cookie) => ({
    ...cookie,
    domain: "localhost",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  }));

  await mkdir(dirname(STORAGE_STATE), { recursive: true });
  await writeFile(
    STORAGE_STATE,
    JSON.stringify({ cookies, origins: [] }, null, 2),
  );

  // Anything an earlier run abandoned would be added to this run's total, so
  // the month is cleared before it is seeded rather than only after.
  await removeSeededRows(account);

  // Seeded through the API as the signed in account, so every row goes in under
  // the same row level security the app runs under. A seed that had to bypass
  // those policies would be proving something the app never does.
  const occurredOn = seedDate();

  for (const { name, amountMinor, color } of SEED_SPENDING) {
    const [category] = await account.insert("categories", [
      { name, kind: "spend", color },
    ]);

    await account.insert("transactions", [
      {
        category_id: category.id,
        direction: "spend",
        amount_minor: amountMinor,
        occurred_on: occurredOn,
      },
    ]);
  }
});
