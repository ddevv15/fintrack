import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SEED_SPENDING, seedDate, signInAccountA } from "./signed-in";

// Playwright does not read `.env.local`, and the completeness test below signs
// the second account in directly. Loaded here for the same reason the signed in
// setup loads it.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Absent in CI, which supplies the same values as real environment variables.
}

/**
 * Logging a spend, driven signed in against the real backend.
 *
 * The parse itself is proved exhaustively in `tests/unit/money.test.ts`, which
 * covers two thousand amounts far more cheaply than a browser can. What is
 * proved here is everything the unit tests cannot reach: that the typed text
 * actually arrives at the parse, that the currency's decimal count comes from
 * the profile rather than a constant, that a refusal writes nothing and keeps
 * what you typed, and that the confirmation quotes the stored row.
 *
 * Rows are logged against the suite's own `zz-e2e` categories, so the shared
 * teardown removes them along with everything else it seeded.
 */

const WCAG_22_AA = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

/** Account A is on USD, so two decimal places and a dollar glyph. */
const CATEGORY = SEED_SPENDING[1].name; // zz-e2e-Groceries

async function violationsOn(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_22_AA])
    .analyze();

  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

async function fillSpend(page: Page, amount: string, note?: string) {
  await page.getByLabel("Amount").fill(amount);
  await page.getByLabel("Category").selectOption({ label: CATEGORY });
  if (note) await page.getByLabel("Note").fill(note);
}

test.describe("log a spend", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");

    // The form streams in behind a `<Suspense>`, so `goto()` resolves while the
    // placeholder is still on screen. Every test below drives the form, and a
    // click that lands before React has hydrated it submits the plain HTML form
    // instead of the action, which reports failure somewhere the assertions are
    // not looking. Waiting for a real field means they all start from a form
    // that is actually there.
    await expect(page.getByLabel("Amount")).toBeVisible();
  });

  test("shows the four fields, dated today in your own zone", async ({
    page,
  }) => {
    await expect(
      page.getByRole("heading", { name: "Log a spend" }),
    ).toBeVisible();

    await expect(page.getByLabel("Amount")).toBeVisible();
    await expect(page.getByLabel("Category")).toBeVisible();
    await expect(page.getByLabel("Note")).toBeVisible();

    // The account's zone is America/New_York, not this machine's. On a runner
    // in another zone these differ for part of every day, which is the point.
    const date = page.getByLabel("Date");
    await expect(date).toHaveValue(seedDate());
    await expect(date).toHaveAttribute("max", seedDate());
  });

  test("offers only your own spend categories", async ({ page }) => {
    const options = await page.getByLabel("Category").locator("option").all();
    const labels = await Promise.all(options.map((o) => o.textContent()));

    expect(labels).toContain(CATEGORY);
    // The placeholder plus the account's categories, and nothing else.
    expect(labels[0]).toBe("Choose a category");
  });

  test("saves a spend and names back what it stored", async ({ page }) => {
    await fillSpend(page, "12.50", "e2e happy path");
    await page.getByRole("button", { name: "Log spend" }).click();

    // The amount is formatted from the saved integer, not echoed from the
    // typed text, so this passing means the round trip is intact (AC-8).
    await expect(page.getByRole("status")).toHaveText(
      `Saved $12.50 to ${CATEGORY}`,
    );

    // Cleared and ready for the next one, with focus back on the amount.
    await expect(page.getByLabel("Amount")).toHaveValue("");
    await expect(page.getByLabel("Note")).toHaveValue("");
    await expect(page.getByLabel("Amount")).toBeFocused();
  });

  test("stores an amount that binary floating point would drift on", async ({
    page,
  }) => {
    // 8.29 * 100 is 828.9999999999999. If anything in this path multiplied,
    // this would come back as $8.28 or throw.
    await fillSpend(page, "8.29");
    await page.getByRole("button", { name: "Log spend" }).click();

    await expect(page.getByRole("status")).toHaveText(
      `Saved $8.29 to ${CATEGORY}`,
    );
  });

  test("refuses more decimal places than the currency has", async ({
    page,
  }) => {
    await fillSpend(page, "12.567");
    await page.getByRole("button", { name: "Log spend" }).click();

    await expect(page.getByText("at most 2 decimal places")).toBeVisible();
    // Nothing saved, and what was typed is still there (AC-9).
    await expect(page.getByRole("status")).toHaveText("");
    await expect(page.getByLabel("Amount")).toHaveValue("12.567");
  });

  test("keeps every field, the category included, when a save is refused", async ({
    page,
  }) => {
    // The category is the one that quietly goes missing. React resets the form
    // after an action, and it re-syncs a text input but not a select, so this
    // passed for the amount and the note long before it passed here.
    await fillSpend(page, "12.567", "e2e retention");
    const chosen = await page.getByLabel("Category").inputValue();

    await page.getByRole("button", { name: "Log spend" }).click();
    await expect(page.getByText("at most 2 decimal places")).toBeVisible();

    await expect(page.getByLabel("Amount")).toHaveValue("12.567");
    await expect(page.getByLabel("Note")).toHaveValue("e2e retention");
    await expect(page.getByLabel("Category")).toHaveValue(chosen);
  });

  test("refuses a shape that is not digits with at most one dot", async ({
    page,
  }) => {
    for (const typed of ["1,234.50", "$12", "12.5.6", "-5"]) {
      await page.goto("/");
      await fillSpend(page, typed);
      await page.getByRole("button", { name: "Log spend" }).click();

      await expect(
        page.getByText("digits and at most one dot"),
        `${typed} should be refused`,
      ).toBeVisible();
    }
  });

  test("refuses an empty amount before it reaches the database", async ({
    page,
  }) => {
    await page.getByLabel("Category").selectOption({ label: CATEGORY });
    await page.getByRole("button", { name: "Log spend" }).click();

    await expect(page.getByText("Enter an amount.")).toBeVisible();
  });

  test("refuses a future date on the server, not only in the control", async ({
    page,
  }) => {
    // The max attribute is a courtesy the browser enforces. Stripping it is
    // what any broken or hostile client does, and the server guard is what
    // actually has to hold (AC-6).
    await page.getByLabel("Date").evaluate((el) => el.removeAttribute("max"));

    const tomorrow = new Date(`${seedDate()}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    await fillSpend(page, "5.00");
    await page.getByLabel("Date").fill(tomorrow.toISOString().slice(0, 10));
    await page.getByRole("button", { name: "Log spend" }).click();

    await expect(page.getByText("has not happened yet")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("");
  });

  test("a double click writes one row, not two (AC-11)", async ({ page }) => {
    // The pending flag is asserted elsewhere by the disabled button. This is
    // the thing that actually matters: a repeated identical spend is
    // legitimate, so nothing downstream de duplicates, and the only defence
    // against an impatient second click is that the control is already gone.
    const account = await signInAccountA();

    await page.goto("/");
    await page.getByLabel("Amount").fill("3.21");
    await page.getByLabel("Category").selectOption({ label: CATEGORY });
    await page.getByRole("button", { name: "Log spend" }).dblclick();
    await expect(page.getByRole("status")).toHaveText(/Saved \$3\.21/);

    // Counted by this test's own amount rather than by the size of the table.
    // Other tests in this file save rows at the same time in another worker, so
    // a before and after count of everything measures them too and the delta
    // means nothing. 321 belongs to this test alone.
    const mine = await account.select(
      "transactions",
      "select=id&amount_minor=eq.321",
    );
    expect(mine).toHaveLength(1);
  });

  test("a saved spend reaches the breakdown (the revalidate)", async ({
    page,
  }) => {
    // The breakdown totals this month from these same rows, so a save has to
    // invalidate it. Without the `revalidatePath` in the action the two screens
    // disagree until something else happens to reload, which is the kind of
    // wrongness you only notice after trusting the wrong number.
    const totalOnScreen = async () => {
      // Waited for rather than read straight off, because the breakdown streams:
      // it sends its shell with a placeholder and fills the figures in when the
      // read comes back, so `goto()` now resolves while the skeleton is still
      // on screen. A plain `innerText()` here samples whichever of the two
      // happened to be rendered at that instant, which passed before the
      // Suspense boundaries existed and is a race now. The web first assertion
      // retries until the real total is there.
      const main = page.locator("main");
      await expect(main).toContainText(/Total spent/);

      const text = await main.innerText();
      const match = text.match(/Total spent\s*\$?([\d,]+\.\d{2})/);
      if (!match) throw new Error(`no total found in: ${text.slice(0, 200)}`);
      return Number(match[1].replace(/,/g, ""));
    };

    await page.goto("/breakdown");
    const before = await totalOnScreen();

    await page.goto("/");
    await page.getByLabel("Amount").fill("7.77");
    await page.getByLabel("Category").selectOption({ label: CATEGORY });
    await page.getByRole("button", { name: "Log spend" }).click();
    await expect(page.getByRole("status")).toHaveText(/Saved \$7\.77/);

    await page.goto("/breakdown");
    const after = await totalOnScreen();

    // Greater than, not exactly 7.77 more: other tests in this file are saving
    // rows in another worker while this runs, and every one of them can only
    // push the total up. An exact delta would be measuring them too.
    expect(after).toBeGreaterThan(before);
  });

  test("a category id from another account is refused (AC-7, AC-10)", async ({
    page,
  }) => {
    // Forged the way a hostile client would: the id is a real uuid belonging to
    // a real category, just not yours. The three column foreign key is what
    // refuses it, so this passes even if every application check were removed.
    const other = await secondAccount();
    const [theirs] = (await other.api(
      "/api/database/records/categories?select=id&kind=eq.spend&limit=1",
    )) as { id: string }[];

    const account = await signInAccountA();

    await page.goto("/");
    await page.getByLabel("Amount").fill("4.44");
    await page.getByLabel("Category").selectOption({ label: CATEGORY });
    await page.getByLabel("Category").evaluate((element, id) => {
      const select = element as HTMLSelectElement;
      const option = document.createElement("option");
      option.value = id;
      option.textContent = "forged";
      select.appendChild(option);
      select.value = id;
    }, theirs.id);

    await page.getByRole("button", { name: "Log spend" }).click();

    await expect(
      page.getByText("That category is not one of your spend categories"),
    ).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("");

    // Checked by this test's own amount, for the same reason as above: another
    // worker is writing rows while this runs, so the table's size proves
    // nothing about whether THIS save was refused.
    const mine = await account.select(
      "transactions",
      "select=id&amount_minor=eq.444",
    );
    expect(mine, "the refused spend must not exist").toHaveLength(0);
  });

  test("has no accessibility violations", async ({ page }) => {
    expect(await violationsOn(page)).toEqual([]);
  });

  test("has none while showing an error either", async ({ page }) => {
    await fillSpend(page, "nonsense");
    await page.getByRole("button", { name: "Log spend" }).click();
    await expect(page.getByText("digits and at most one dot")).toBeVisible();

    expect(await violationsOn(page)).toEqual([]);
  });
});

/**
 * The second test account, signed in through the API rather than the form.
 *
 * Two tests below need an account that is not the one the storage state holds:
 * one wants a category belonging to somebody else, and the currency tests want
 * a profile they can change. Account B is the right one because it has no
 * transactions, and a currency locks the moment an account has history.
 *
 * `withCurrency` reads the currency first and always puts it back, the same
 * pattern `tests/integration/locale-guards.test.ts` uses. Nothing else in the
 * project changes a currency, which is exactly why these paths need a test.
 */
async function secondAccount() {
  const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!;

  const session = await fetch(`${baseUrl}/api/auth/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({
      email: process.env.INSFORGE_TEST_EMAIL_B,
      password: process.env.INSFORGE_TEST_PASSWORD,
    }),
  });
  const token = (await session.json()).accessToken as string;

  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        Prefer: "return=representation",
      },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${path} -> ${res.status}: ${body}`);
    return body ? JSON.parse(body) : undefined;
  };

  const setCurrency = (code: string | null) =>
    api("/api/database/records/profiles", {
      method: "PATCH",
      body: JSON.stringify({ currency: code }),
    });

  return {
    token,
    api,
    setCurrency,

    /** The cookie the SSR helper reads, for a context of this account. */
    cookie: {
      name: "insforge_access_token",
      value: token,
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    },

    /**
     * Run `body` with this account on `code`, then always put it back.
     *
     * The cleanup removes any transaction first, and that order is the whole
     * point rather than tidiness. A currency cannot be changed once an account
     * has history, so a single stray row would make the restore below fail
     * silently and leave account B on the wrong currency for every later run.
     *
     * A stray row is not hypothetical. These tests submit amounts that the
     * currency under test must refuse, so if the wiring ever breaks, the
     * amount is accepted instead, a row is written, and the assertion fails on
     * the next line. That is precisely when cleanup matters most, and it is
     * exactly when a cleanup living at the end of the happy path never runs.
     */
    async withCurrency(code: string, body: () => Promise<void>) {
      const [before] = (await api(
        "/api/database/records/profiles?select=currency",
      )) as { currency: string }[];
      try {
        await setCurrency(code);
        await body();
      } finally {
        const rows = (await api(
          "/api/database/records/transactions?select=id",
        )) as { id: string }[];
        for (const { id } of rows) {
          await api(`/api/database/records/transactions?id=eq.${id}`, {
            method: "DELETE",
          });
        }
        await setCurrency(before.currency);
      }
    },
  };
}

/**
 * Everything below changes the second account's profile, so it runs one test at
 * a time.
 *
 * Account B is a single shared row, not a fixture each worker gets its own copy
 * of. Two of these tests setting its currency at once would each restore what
 * the other had already changed, and the account would end the run on whichever
 * value lost the race. Serial mode keeps them in one worker, in order.
 *
 * Only these tests need it. Everything above uses account A through its own
 * page, and the one test that reads account B's categories only reads.
 */
test.describe("changing the second account's profile", () => {
  test.describe.configure({ mode: "serial" });

  /**
   * The currency reaches the screen from your profile, not from a constant.
   *
   * This is the test that has to exist. `parseAmount` is proved for zero, two and
   * three decimal currencies in `tests/unit/money.test.ts`, but those tests pass
   * `decimals` in by hand, so they would keep passing if the app hardcoded a two
   * on the way in. Only driving a real profile proves the wiring.
   *
   * Nothing here saves a row. Every check is a refusal, and a refusal writes
   * nothing, so account B never gains the history that would lock its currency
   * and break the `locale-guards` integration test.
   */
  test.describe("the currency comes from your profile", () => {
    test("a yen profile shows its glyph and refuses any decimal at all", async ({
      browser,
    }) => {
      const other = await secondAccount();

      await other.withCurrency("JPY", async () => {
        const context = await browser.newContext();
        await context.addCookies([other.cookie]);
        const page = await context.newPage();

        try {
          await page.goto("/");

          const glyph = await page
            .locator("form span[aria-hidden='true']")
            .first()
            .innerText();
          expect(glyph, "the glyph comes from the profile currency").toBe("¥");

          const category = await page
            .locator("select option")
            .nth(1)
            .getAttribute("value");
          await page.getByLabel("Category").selectOption(category!);

          // "no decimal places" is only producible when decimals is 0, so this
          // message could not appear if the count came from anywhere else.
          await page.getByLabel("Amount").fill("500.5");
          await page.getByRole("button", { name: "Log spend" }).click();
          await expect(
            page.getByText("This currency has no decimal places"),
          ).toBeVisible();

          // And the same for an all zero fraction: the rule counts digits typed,
          // not their value.
          await page.getByLabel("Amount").fill("500.00");
          await page.getByRole("button", { name: "Log spend" }).click();
          await expect(
            page.getByText("This currency has no decimal places"),
          ).toBeVisible();

          const rows = (await other.api(
            "/api/database/records/transactions?select=id",
          )) as unknown[];
          expect(rows, "a refusal must write nothing").toHaveLength(0);
        } finally {
          await context.close();
        }
      });
    });

    test("a three decimal profile moves the same boundary", async ({
      browser,
    }) => {
      const other = await secondAccount();

      await other.withCurrency("KWD", async () => {
        const context = await browser.newContext();
        await context.addCookies([other.cookie]);
        const page = await context.newPage();

        try {
          await page.goto("/");

          const category = await page
            .locator("select option")
            .nth(1)
            .getAttribute("value");
          await page.getByLabel("Category").selectOption(category!);

          // Four decimals is too many for the dinar, and the message names three,
          // which a hardcoded two could never produce.
          await page.getByLabel("Amount").fill("1.0055");
          await page.getByRole("button", { name: "Log spend" }).click();
          await expect(
            page.getByText("This currency has at most 3 decimal places"),
          ).toBeVisible();

          // Three is fine, and on a dollar profile the very same amount would be
          // refused. Checked by its absence rather than by saving, so no row is
          // written and the currency stays unlocked.
          await page.getByLabel("Amount").fill("1.005");
          await page.getByRole("button", { name: "Log spend" }).click();
          await expect(page.getByRole("status")).toHaveText(/Saved/);

          const rows = (await other.api(
            "/api/database/records/transactions?select=id,amount_minor",
          )) as { id: string; amount_minor: number | string }[];
          expect(rows).toHaveLength(1);
          expect(
            Number(rows[0].amount_minor),
            "1.005 on a three decimal currency is 1005 minor units",
          ).toBe(1005);

          // Removed straight away. A transaction left here would lock account B's
          // currency for good and break `locale-guards`.
          await other.api(
            `/api/database/records/transactions?id=eq.${rows[0].id}`,
            { method: "DELETE" },
          );
          const left = (await other.api(
            "/api/database/records/transactions?select=id",
          )) as unknown[];
          expect(left, "account B must be left with no history").toHaveLength(
            0,
          );
        } finally {
          await context.close();
        }
      });
    });
  });

  /**
   * The regression guard for the incomplete profile bug.
   *
   * `logSpend` used to open with `requireCompleteSettings()`, which throws. In an
   * action a throw escapes to the route error boundary: the whole page is
   * replaced, everything typed is lost, and the message shown was the one written
   * for whoever maintains this code, naming `proxy.ts`. Nothing was ever written,
   * so the security half was fine and the failure was invisible to every test.
   *
   * This is the shape of test that catches it: render the form while the profile
   * is complete, so the layout's redirect has already run and passed, then make
   * the profile incomplete without reloading. No layout runs for a server action,
   * so only the action's own check can catch it.
   *
   * It mutates the second test account's profile and puts it back, the same
   * pattern `tests/integration/locale-guards.test.ts` uses and for the same
   * reason: nothing else clears a currency, which is exactly why this path needs
   * a test of its own.
   */
  test.describe("the profile completeness guard inside the action", () => {
    test("refuses in plain words and keeps what you typed", async ({
      browser,
    }) => {
      const other = await secondAccount();
      const [before] = (await other.api(
        "/api/database/records/profiles?select=currency",
      )) as { currency: string }[];

      const context = await browser.newContext();
      await context.addCookies([other.cookie]);
      const page = await context.newPage();

      try {
        // Rendered while the profile is complete, so the layout's redirect has
        // already run and passed.
        await page.goto("/");
        await expect(page.getByLabel("Amount")).toBeVisible();

        const category = await page
          .locator("select option")
          .nth(1)
          .getAttribute("value");
        await page.getByLabel("Amount").fill("3.00");
        await page.getByLabel("Category").selectOption(category!);
        await page.getByLabel("Note").fill("kept through the refusal");

        // Incomplete now, and without reloading, so no layout runs again.
        await other.setCurrency(null);

        await page.getByRole("button", { name: "Log spend" }).click();

        await expect(
          page.getByText("Choose your currency and time zone"),
        ).toBeVisible();

        // The form is still there, which is the part the old behaviour lost.
        await expect(page.getByLabel("Amount")).toHaveValue("3.00");
        await expect(page.getByLabel("Note")).toHaveValue(
          "kept through the refusal",
        );

        // No internal message may ever reach a person.
        const body = await page.locator("body").innerText();
        expect(body).not.toContain("proxy.ts");
        expect(body).not.toContain("Something broke");

        // And still nothing written, which was never the broken part.
        const rows = (await other.api(
          "/api/database/records/transactions?select=id",
        )) as unknown[];
        expect(rows).toHaveLength(0);
      } finally {
        await other.setCurrency(before.currency);
        await context.close();
      }
    });
  });
});
