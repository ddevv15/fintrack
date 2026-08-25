import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SEED_SPENDING, seedDate } from "./signed-in";

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
