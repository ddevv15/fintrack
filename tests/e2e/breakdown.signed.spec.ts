import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { SEED_SPENDING } from "./signed-in";

/**
 * The breakdown, driven signed in against a seeded month.
 *
 * This is the first suite that needs a session. Everything else can be proved
 * signed out, but there is no version of this screen a visitor can reach, so
 * the accessibility gate spec 0005 AC-12 asks for has to run behind the door.
 *
 * The seeded month totals $100.00 across three categories at 60, 30, and 10
 * percent, with names that sort in a different order from their amounts, so a
 * screen that ranked alphabetically would fail here rather than coincide.
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

test.describe("where your money went", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/breakdown");
  });

  test("shows the month total (AC-1)", async ({ page }) => {
    await expect(page.getByText("Total spent")).toBeVisible();
    await expect(page.getByText("$100.00")).toBeVisible();
  });

  test("names the month and the year in the heading (AC-11)", async ({
    page,
  }) => {
    // The exact month depends on when this runs, so the shape is what is
    // asserted rather than a fixed string: a full month name and four digits.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/,
    );
  });

  test("ranks the categories by amount, biggest first (AC-3)", async ({
    page,
  }) => {
    const names = SEED_SPENDING.map((seed) => seed.name);
    const items = page.getByRole("listitem").filter({ hasText: /zz-e2e-/ });

    await expect(items).toHaveCount(3);

    const rendered = await items.allInnerTexts();
    const order = rendered.map((text) =>
      names.find((name) => text.includes(name))!,
    );

    // Groceries 60, Transport 30, Health 10. Alphabetically this would be
    // Groceries, Health, Transport, so the two orders genuinely differ.
    expect(order).toEqual([
      "zz-e2e-Groceries",
      "zz-e2e-Transport",
      "zz-e2e-Health",
    ]);
  });

  test("shows each category's amount and share (AC-2)", async ({ page }) => {
    for (const { name, amountMinor, percent } of SEED_SPENDING) {
      const row = page.getByRole("listitem").filter({ hasText: name });

      await expect(row).toContainText(`$${(amountMinor / 100).toFixed(2)}`);
      await expect(row).toContainText(`${percent}%`);
    }
  });

  test("shows shares that add up to 100 (AC-4)", async ({ page }) => {
    const items = page.getByRole("listitem").filter({ hasText: /zz-e2e-/ });
    const texts = await items.allInnerTexts();

    const total = texts
      .map((text) => Number(text.match(/(\d+)%/)?.[1] ?? 0))
      .reduce((sum, share) => sum + share, 0);

    expect(total).toBe(100);
  });

  test("fills each bar with its own category's colour (AC-5)", async ({
    page,
  }) => {
    // The dot carries a data attribute naming the colour, so this checks the
    // colour actually reached the row rather than that something is coloured.
    for (const { name, color } of SEED_SPENDING) {
      const row = page.getByRole("listitem").filter({ hasText: name });
      await expect(
        row.locator(`[data-category-dot="${color}"]`),
      ).toBeAttached();
      await expect(row.locator(`.bg-category-${color}`)).toHaveCount(2);
    }
  });

  test("hides the bars from assistive technology (AC-5)", async ({ page }) => {
    // The row already states the share in words, so a bar that announced
    // itself would be repeating the only thing it depicts.
    const bars = page.locator('[aria-hidden="true"] > div[style*="width"]');
    await expect(bars).toHaveCount(3);

    // Nothing decorative may be reachable by keyboard either.
    await expect(page.locator("div[style*='width']:focus")).toHaveCount(0);
  });

  test("reads as a list of categories (AC-12)", async ({ page }) => {
    // Named, not just present. This page carries two lists, the nav and this
    // one, and an unnamed list is one a screen reader cannot tell apart from
    // the other.
    const breakdown = page.getByRole("list", {
      name: "Spending by category, largest first",
    });

    await expect(breakdown).toBeVisible();
    await expect(breakdown.getByRole("listitem")).toHaveCount(3);
    await expect(
      page.getByRole("heading", {
        name: "Spending by category, largest first",
      }),
    ).toBeAttached();
  });

  test("marks the Breakdown tab as the current page (AC-14)", async ({
    page,
  }) => {
    await expect(page.getByRole("link", { name: "Breakdown" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("opens Profile and identifies the signed-in account", async ({
    page,
  }) => {
    const email = process.env.INSFORGE_TEST_EMAIL_A;
    if (!email) {
      throw new Error(
        "INSFORGE_TEST_EMAIL_A is required by the signed-in browser project.",
      );
    }

    const profile = page.getByRole("link", { name: "Profile" });
    await expect(profile).toBeVisible();
    await profile.click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your account" }),
    ).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
    await expect(profile).toHaveAttribute("aria-current", "page");
  });

  test("passes axe at WCAG 2.2 AA in light (AC-12)", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    expect(await violationsOn(page)).toEqual([]);
  });

  test("passes axe at WCAG 2.2 AA in dark (AC-12)", async ({ page }) => {
    // Both themes, because contrast is the check most likely to pass in one and
    // fail in the other, and the bars carry the category colours into both.
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await violationsOn(page)).toEqual([]);
  });

  test("is reachable and readable by keyboard alone (AC-12)", async ({
    page,
  }) => {
    // The rows are deliberately not tappable, so the only things tab should
    // reach are the skip link and the four nav tabs. A decorative bar or a
    // category row picking up focus would be the failure.
    const reached: string[] = [];

    for (let step = 0; step < 6; step += 1) {
      await page.keyboard.press("Tab");
      reached.push(
        await page.evaluate(() => {
          const active = document.activeElement;
          if (!active || active === document.body) return "(none)";
          return `${active.tagName.toLowerCase()}:${(active.textContent ?? "").trim().slice(0, 20)}`;
        }),
      );
    }

    expect(reached[0]).toContain("Skip to content");
    // Five tabs since spec 0009 added History, which sits next to Month
    // because the two are the same list at two distances.
    expect(reached.slice(1, 6)).toEqual([
      "a:Log",
      "a:Month",
      "a:History",
      "a:Breakdown",
      "a:Profile",
    ]);

    // Everything the app puts in the tab order is a link. `nextjs-portal` is
    // the dev tools overlay, which exists only under `next dev` and not in the
    // production build CI runs, so it is allowed rather than asserted on.
    for (const item of reached) {
      const fromTheApp = !item.startsWith("nextjs-portal") && item !== "(none)";
      if (fromTheApp) expect(item.startsWith("a:")).toBe(true);
    }
  });

  test("keeps money off the wire as client data (AC-12)", async ({ page }) => {
    // Server rendered means the amounts arrive as text in the HTML and never as
    // a serialised payload the browser would have to be trusted with.
    const body = await page.content();
    expect(body).toContain("$100.00");
    expect(body).not.toContain('"amountMinor"');
    expect(body).not.toContain('"totalMinor"');
  });
});
