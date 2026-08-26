import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SEED_PREFIX, SEED_SPENDING } from "./signed-in";

/**
 * This month's entries, driven signed in against the seeded month.
 *
 * What this suite deliberately does not do is delete anything. The seeded month
 * is shared with `breakdown.signed.spec.ts`, the two files run in parallel, and
 * a removed row would change the total that suite asserts, producing a failure
 * in a file whose code nobody touched. The one write here is an edit to a note,
 * which no other screen reads and no total depends on.
 *
 * The delete flow is therefore proved by hand in `/check verify` rather than
 * here. Making it automatable means giving this suite its own account, which is
 * a change to the harness rather than to this feature.
 *
 * covers: spec 0007 AC-1, AC-2, AC-3, AC-4, AC-8, AC-9, AC-13, AC-23
 */

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
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

/** The figure a money screen prints above its list. */
function total(page: Page, label: string) {
  return page.locator("dl").filter({ hasText: label }).locator("dd");
}

/** Money as this account renders it. Account A is on USD. */
function dollars(amountMinor: number) {
  return `$${(amountMinor / 100).toFixed(2)}`;
}

/**
 * One seeded row, picked out by its category and its amount together.
 *
 * The category alone is not enough, and that is not a nicety. `log-spend
 * .signed.spec.ts` runs in parallel against the same account and logs its own
 * rows under `zz-e2e-Groceries`, so a locator matching on the name alone
 * resolves to however many that suite happens to have written by then. None of
 * its amounts is one of the seeded ones, so the pair is unique.
 */
function seededRow(page: Page, seed: (typeof SEED_SPENDING)[number]) {
  return page
    .getByRole("listitem")
    .filter({ hasText: seed.name })
    .filter({ hasText: dollars(seed.amountMinor) });
}

test.describe("this month's transactions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
  });

  test("names the month and the year in the heading", async ({ page }) => {
    // The exact month depends on when this runs, so the shape is what is
    // asserted rather than a fixed string.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/,
    );
  });

  test("lists every seeded entry, once each (AC-1)", async ({ page }) => {
    // Counted per entry rather than as a total, because the parallel log spend
    // suite is adding rows of its own to this same month while this runs.
    for (const seed of SEED_SPENDING) {
      await expect(seededRow(page, seed)).toHaveCount(1);
    }
  });

  test("orders entries on the same day by when they were logged (AC-1)", async ({
    page,
  }) => {
    /*
     * All three seed rows carry the same date, so this is entirely a test of
     * the second ordering, created_at descending. The setup inserts Transport,
     * then Groceries, then Health, so newest first is the reverse of that.
     *
     * It is worth noting how thoroughly this order differs from the others: by
     * amount it would be Groceries, Transport, Health, and alphabetically it
     * would be Groceries, Health, Transport. A screen that sorted either way,
     * or did not sort at all, cannot coincide with this.
     */
    const rendered = await page.getByRole("listitem").allInnerTexts();

    // Where each seeded entry landed among everything on the list. Their
    // positions relative to each other are what is asserted, since rows the
    // parallel log spend suite wrote while this ran may sit between them.
    const positionOf = (seed: (typeof SEED_SPENDING)[number]) => {
      const at = rendered.findIndex(
        (text) =>
          text.includes(seed.name) && text.includes(dollars(seed.amountMinor)),
      );
      expect(at, `${seed.name} is not on the list`).toBeGreaterThan(-1);
      return at;
    };

    // SEED_SPENDING is declared, and inserted, in the order Transport,
    // Groceries, Health.
    const [transport, groceries, health] = SEED_SPENDING.map(positionOf);

    expect(health).toBeLessThan(groceries);
    expect(groceries).toBeLessThan(transport);
  });

  test("shows each entry's date, category, and amount (AC-4)", async ({
    page,
  }) => {
    for (const seed of SEED_SPENDING) {
      const { amountMinor, color } = seed;
      const row = seededRow(page, seed);

      await expect(row).toContainText(dollars(amountMinor));
      // The colour reached the row, rather than something merely being
      // coloured: the chip carries a data attribute naming it.
      await expect(
        row.locator(`[data-category-dot="${color}"]`),
      ).toBeAttached();
      await expect(row.locator("time")).toHaveAttribute(
        "datetime",
        /^\d{4}-\d{2}-\d{2}$/,
      );
    }
  });

  test("agrees with the breakdown about the month total (AC-2, AC-3)", async ({
    page,
  }) => {
    /*
     * The invariant the whole shared month window exists for, checked end to
     * end rather than by reading the source.
     *
     * These are two loaders, two queries, and two screens. If either one built
     * its own month window or its own spend filter, they could disagree about
     * which rows make up "this month" and neither would complain. This is the
     * assertion that would notice.
     */
    /*
     * Read as breakdown, list, breakdown, and only judged when the two
     * breakdown reads match. The log spend suite is writing to this same month
     * in another worker, so a plain read of one screen then the other would
     * sometimes be comparing two different sets of rows and failing for a
     * reason that has nothing to do with this code. Bracketing the list read
     * with two identical reads is what tells the two cases apart.
     */
    await expect
      .poll(
        async () => {
          await page.goto("/breakdown");
          const before = await total(page, "Total spent").innerText();

          await page.goto("/transactions");
          const listed = await total(page, "Total this month").innerText();

          await page.goto("/breakdown");
          const after = await total(page, "Total spent").innerText();

          if (before !== after) return "a row was written mid check";
          return listed === before ? "agree" : `${listed} against ${before}`;
        },
        { timeout: 30_000 },
      )
      .toBe("agree");
  });

  test("names the entry in each row control's accessible name (AC-8)", async ({
    page,
  }) => {
    // Short visible text, and a name that says which row it belongs to. On a
    // list of rows that look alike, nine identical "Edit" buttons is a list
    // nobody using a screen reader can navigate.
    const groceries = `${SEED_PREFIX}-Groceries`;

    const edit = page.getByRole("link", {
      name: new RegExp(`^Edit \\$60\\.00 ${groceries},`),
    });
    const remove = page.getByRole("button", {
      name: new RegExp(`^Delete \\$60\\.00 ${groceries},`),
    });

    await expect(edit).toBeVisible();
    await expect(edit).toHaveText("Edit");
    await expect(remove).toBeVisible();
    await expect(remove).toHaveText("Delete");
  });

  test("asks before deleting, and gives focus back on cancel (AC-16, AC-17)", async ({
    page,
  }) => {
    // Everything up to the confirm, and no further: this test must not remove
    // a row the breakdown suite is counting.
    const groceries = `${SEED_PREFIX}-Groceries`;
    const row = seededRow(page, SEED_SPENDING[1]);

    await row.getByRole("button", { name: /^Delete / }).click();

    const confirm = row.getByRole("button", { name: /^Confirm deleting / });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeFocused();
    await expect(row).toContainText(`Delete $60.00 ${groceries}`);

    // Escape dismisses it and hands focus back to the control it came from,
    // rather than dropping it to the top of the document.
    await page.keyboard.press("Escape");

    await expect(confirm).toHaveCount(0);
    await expect(row.getByRole("button", { name: /^Delete / })).toBeFocused();
  });

  test("reads as a named list of entries (AC-23)", async ({ page }) => {
    // Named, not just present. This page carries two lists, the nav and this
    // one, and an unnamed list is one a screen reader cannot tell from the
    // other.
    const entries = page.getByRole("list", {
      name: "This month's entries, newest first",
    });

    await expect(entries).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This month's entries, newest first" }),
    ).toBeAttached();
  });

  test("keeps money off the wire as client data", async ({ page }) => {
    // Server rendered means the amounts arrive as text in the HTML and never as
    // a serialised payload the browser would have to be trusted with.
    const body = await page.content();

    expect(body).toContain("$60.00");
    expect(body).not.toContain('"amountMinor"');
    expect(body).not.toContain('"totalMinor"');
  });

  test("passes axe at WCAG 2.2 AA in light (AC-23)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    expect(await violationsOn(page)).toEqual([]);
  });

  test("passes axe at WCAG 2.2 AA in dark (AC-23)", async ({ page }) => {
    // Both themes, because contrast is the check most likely to pass in one and
    // fail in the other, and the row controls carry the danger colour.
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await violationsOn(page)).toEqual([]);
  });

  test("shows the confirm step to axe as well (AC-23)", async ({ page }) => {
    // The confirm is a state the default scan never reaches, so it would go
    // unchecked while the page still reported clean. Cancelled again below so
    // nothing is left mid confirm.
    await seededRow(page, SEED_SPENDING[1])
      .getByRole("button", { name: /^Delete / })
      .click();

    expect(await violationsOn(page)).toEqual([]);

    await page.keyboard.press("Escape");
  });
});

test.describe("editing one entry", () => {
  /**
   * The one write this suite makes, and it is chosen to be harmless.
   *
   * Only the note moves. The amount, the category, and the date all stay
   * exactly as seeded, so the month total and the category split are untouched
   * and the breakdown suite running alongside sees the month it expects.
   */
  const NOTE = "edited by the browser suite";

  test("opens prefilled, saves, and confirms exactly once (AC-9, AC-13)", async ({
    page,
  }) => {
    await page.goto("/transactions");

    const groceries = `${SEED_PREFIX}-Groceries`;
    await seededRow(page, SEED_SPENDING[1])
      .getByRole("link", { name: /^Edit / })
      .click();

    await expect(page).toHaveURL(/\/transactions\/[0-9a-f-]{36}\/edit$/);

    // Prefilled from the stored row, and the amount is plain text a person can
    // edit rather than a formatted "$60.00" the parser would refuse (AC-9).
    await expect(page.getByLabel("Amount")).toHaveValue("60.00");
    await expect(page.getByLabel("Category")).toHaveValue(/^[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Date")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);

    await page.getByLabel("Note").fill(NOTE);
    await page.getByRole("button", { name: "Save changes" }).click();

    // Back on the list, with a confirmation naming what was actually stored.
    await expect(page).toHaveURL(/\/transactions$/);

    const status = page.getByRole("status");
    await expect(status).toContainText("Saved $60.00");
    await expect(status).toContainText(groceries);

    // The note is on the row, which is the other half of the save landing.
    await expect(seededRow(page, SEED_SPENDING[1])).toContainText(NOTE);

    /*
     * The single use half of AC-13, and the reason the flash is a cookie the
     * proxy strips rather than a query parameter.
     *
     * A confirmation naming a money figure that survives a reload is a stale
     * figure shown confidently, which is the failure rule 3 of AGENTS.md
     * forbids. It also must not be in the URL, where a bookmark or a shared
     * link would carry it forever.
     */
    expect(page.url()).not.toContain("Saved");
    expect(page.url()).not.toContain("60");

    await page.reload();

    await expect(page.getByRole("status")).toHaveText("");
    await expect(seededRow(page, SEED_SPENDING[1])).toContainText(NOTE);
  });

  test("renders the standard not found page for an id that is not yours (AC-15)", async ({
    page,
  }) => {
    // A well formed uuid that belongs to nobody. It must be indistinguishable
    // from another account's id, which row level security already makes
    // invisible: the handling must not put the difference back.
    const response = await page.goto(
      "/transactions/3fa85f64-5717-4562-b3fc-2c963f66afa6/edit",
    );

    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).not.toContainText("$");
  });

  test("renders the same page for an id that is not even a uuid (AC-15)", async ({
    page,
  }) => {
    // Without the uuid check in the loader this would reach PostgREST, fail,
    // and render the error boundary, and the difference between that page and
    // the one above is itself an answer.
    const response = await page.goto("/transactions/not-a-uuid/edit");

    expect(response?.status()).toBe(404);
  });

  test("passes axe at WCAG 2.2 AA (AC-23)", async ({ page }) => {
    await page.goto("/transactions");
    await seededRow(page, SEED_SPENDING[1])
      .getByRole("link", { name: /^Edit / })
      .click();

    await expect(page.getByLabel("Amount")).toBeVisible();
    expect(await violationsOn(page)).toEqual([]);
  });
});
