import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signInAccountA } from "./signed-in";

/**
 * Managing categories, driven signed in against the real backend.
 *
 * This suite creates its own category and removes it again, which is safe in a
 * way the transactions suite's deletes were not: a category with no entries
 * changes no total on any screen, and the seeded month this account shares with
 * `breakdown.signed.spec.ts` is untouched. Nothing here reads or writes a
 * seeded row.
 *
 * The two rules that only a real database can prove, the view's scoping and the
 * last visible category race, are in `tests/integration/category-management`
 * rather than here, because both need a second account or two simultaneous
 * writes and neither needs a browser.
 *
 * covers: spec 0008 AC-1, AC-2, AC-3, AC-4, AC-7, AC-10, AC-12, AC-15, AC-16,
 * AC-19, AC-23
 */

/*
 * A chain, not seven independent tests: the same category is added, renamed,
 * hidden, and finally deleted. The config sets `fullyParallel`, which would
 * otherwise spread these across workers and have them race each other for one
 * row. Serial is the honest description of what they are.
 */
test.describe.configure({ mode: "serial" });

const WCAG_22_AA = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

async function violationsOn(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags([...WCAG_22_AA])
    .analyze();

  // The raw objects are enormous, and a failure nobody can read is a failure
  // nobody fixes.
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
  }));
}

/**
 * A name unique to this run.
 *
 * Unlike the seeded categories, nothing asserts on this name from another file,
 * so it can be unique, and it has to be: the run before this one may have been
 * interrupted before its cleanup, and a fixed name would then collide with the
 * leftover on the unique index and fail every test in the file.
 */
const NAME = `zz-e2e-cat-${Date.now().toString(36)}`;
const RENAMED = `${NAME}-renamed`;

/**
 * Remove whatever this run left, and whatever an earlier one abandoned.
 *
 * By prefix and case insensitively, not by this run's two exact names, which is
 * the same approach `removeSeededRows()` takes and for the same reason: a run
 * that fails partway never reaches its own cleanup, and the account is fixed
 * and reused, so the next run has to be the one that tidies up. Case
 * insensitively because the duplicate name test submits an upper cased name,
 * and a run where that test got as far as writing one would otherwise leave a
 * row no exact match could find.
 *
 * The delete is safe against a category that picked up an entry: the foreign
 * key refuses it, and nothing here asserts on the result, so a row that cannot
 * go simply stays for a person to look at.
 */
test.afterAll(async () => {
  const account = await signInAccountA();

  await account.remove(
    "categories",
    `kind=eq.spend&name=ilike.${encodeURIComponent("zz-e2e-cat-%")}`,
  );
});

test("adds a category, and it reaches the Log screen", async ({ page }) => {
  await page.goto("/categories");

  await expect(
    page.getByRole("heading", { name: "Your categories", level: 1 }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add a category" }).click();
  await page.getByLabel("Name").fill(NAME);

  /*
   * The colour control is a real radio group. Its inputs are `sr-only`, which
   * keeps them focusable and named for a screen reader while the swatch and the
   * word beside them are what you actually see, so the click goes to the label
   * the way a person's would. The assertion after it is the point: it proves
   * the label really is wired to the input rather than merely sitting near it
   * (AC-5, AC-23).
   */
  const purple = page.getByRole("radio", { name: /Purple/ });
  await page.getByText("Purple", { exact: true }).click();
  await expect(purple).toBeChecked();
  await page.getByRole("button", { name: "Add category" }).click();

  // Back on the list, with the confirmation spoken once through the status
  // region and quoting the row the database returned (AC-4, AC-19).
  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("status")).toHaveText(`Added ${NAME}.`);

  // A brand new category is used by nothing, and says so rather than showing a
  // bare zero (AC-3).
  const row = page.getByRole("listitem").filter({ hasText: NAME });
  await expect(row).toContainText("Not used yet");

  // The confirmation is never in the URL, and a reload does not bring it back
  // (AC-19).
  expect(page.url()).not.toContain(NAME);
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("");

  // And it is on the Log screen's picker without a manual reload (AC-18).
  await page.goto("/");
  await expect(page.getByLabel("Category")).toContainText(NAME);
});

test("refuses a duplicate name on the field, and writes nothing", async ({
  page,
}) => {
  await page.goto("/categories/new");

  // Different case on purpose: uniqueness ignores it, and the refusal has to
  // come from the database's index rather than from a comparison here (AC-7).
  await page.getByLabel("Name").fill(NAME.toUpperCase());
  await page.getByRole("button", { name: "Add category" }).click();

  await expect(
    page.getByText("You already have a category with that name."),
  ).toBeVisible();

  // Still on the form, with what was typed still in it: a refusal must not cost
  // you the name you entered.
  await expect(page).toHaveURL(/\/categories\/new$/);
  await expect(page.getByLabel("Name")).toHaveValue(NAME.toUpperCase());
});

test("renames a category, and every screen follows", async ({ page }) => {
  await page.goto("/categories");

  await page.getByRole("link", { name: `Edit ${NAME}` }).click();

  // Prefilled from the stored row, and no control anywhere offers the kind
  // (AC-10, AC-11).
  await expect(page.getByLabel("Name")).toHaveValue(NAME);
  await expect(page.getByLabel(/kind/i)).toHaveCount(0);

  await page.getByLabel("Name").fill(RENAMED);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("status")).toHaveText(`Saved ${RENAMED}.`);

  // The rename reaches the Log picker without a manual reload (AC-18).
  await page.goto("/");
  await expect(page.getByLabel("Category")).toContainText(RENAMED);
});

test("hides a category, which leaves the picker and keeps its history", async ({
  page,
}) => {
  await page.goto("/categories");

  await page.getByRole("button", { name: `Hide ${RENAMED}` }).click();

  await expect(page.getByRole("status")).toContainText(`Hid ${RENAMED}`);

  // Under the Hidden heading now, offering the way back (AC-2).
  await expect(
    page.getByRole("heading", { name: "Hidden", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Unhide ${RENAMED}` }),
  ).toBeVisible();

  // And gone from the Log screen's picker (AC-12).
  await page.goto("/");
  await expect(page.getByLabel("Category")).not.toContainText(RENAMED);

  // Back again, with no manual reload.
  await page.goto("/categories");
  await page.getByRole("button", { name: `Unhide ${RENAMED}` }).click();
  await expect(page.getByRole("status")).toContainText(RENAMED);

  await page.goto("/");
  await expect(page.getByLabel("Category")).toContainText(RENAMED);
});

test("deletes an unused category behind a confirm step", async ({ page }) => {
  await page.goto("/categories");
  await page.getByRole("link", { name: `Edit ${RENAMED}` }).click();

  // Offered, because nothing is filed under it (AC-15).
  await page.getByRole("button", { name: `Delete ${RENAMED}` }).click();

  // Named in the confirm step, so it is never "are you sure?" about nothing
  // (AC-16).
  await page
    .getByRole("button", { name: `Confirm deleting ${RENAMED}` })
    .click();

  await expect(page).toHaveURL(/\/categories$/);
  await expect(page.getByRole("status")).toHaveText(`Deleted ${RENAMED}.`);
  await expect(page.getByText(RENAMED, { exact: true })).toHaveCount(0);
});

test("a category with entries offers no delete control at all", async ({
  page,
}) => {
  await page.goto("/categories");

  // One of the seeded categories, which has spending against it. Read from the
  // list rather than hardcoded, so this test does not repeat the seed's names.
  const used = page
    .getByRole("listitem")
    // Not anchored to the end of the row: a row's text runs on into its Edit
    // and Hide controls, so `$` here matched nothing at all.
    .filter({ hasText: /\d+ entr(y|ies)/ })
    .first();

  await used.getByRole("link", { name: /^Edit / }).click();

  // No control, rather than a disabled one, and a line saying what to do
  // instead (AC-15).
  await expect(page.getByRole("button", { name: /^Delete / })).toHaveCount(0);
  await expect(page.getByText(/cannot be deleted/)).toBeVisible();
});

test("every categories screen is free of WCAG 2.2 AA violations", async ({
  page,
}) => {
  await page.goto("/categories");
  expect(await violationsOn(page)).toEqual([]);

  await page.goto("/categories/new");
  expect(await violationsOn(page)).toEqual([]);
});
