import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The accessibility gate for the design system (spec 0003).
 *
 * The gallery is the only route that renders every component in every state,
 * which is exactly what makes it worth pointing axe at: a state that is never
 * rendered is a state no automated check ever sees.
 *
 * Automated rules catch roughly a third of real barriers, so the manual
 * keyboard and screen reader pass in docs/design.md is part of the contract
 * too, not a nicety.
 */
const GALLERY = "/design";

/** The ten names the categories.color CHECK constraint allows. */
const CATEGORY_NAMES = [
  "green",
  "orange",
  "blue",
  "purple",
  "yellow",
  "red",
  "pink",
  "teal",
  "slate",
  "emerald",
] as const;
const AUTH = "/design/auth";

/** WCAG 2.2 AA, which is the level spec 0003 commits to. */
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

  // The raw objects are enormous, and a failure that cannot be read is a
  // failure nobody fixes.
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(" ")),
  }));
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test(`the gallery has no WCAG 2.2 AA violations (AC-7)`, async ({
      page,
    }) => {
      await page.goto(GALLERY);

      expect(await violationsOn(page)).toEqual([]);
    });

    test(`the auth layout has no WCAG 2.2 AA violations (AC-7)`, async ({
      page,
    }) => {
      await page.goto(AUTH);

      expect(await violationsOn(page)).toEqual([]);
    });
  });
}

test.describe("the flag that guards the gallery", () => {
  test("every component state is reachable on one page (AC-17)", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    // One of each family, so a component quietly dropped from the gallery
    // stops being silently exempt from the axe check above.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "FinTrack design system",
    );
    await expect(
      page.getByRole("button", { name: "Save spend" }).first(),
    ).toBeVisible();
    await expect(page.getByText("Could not load this month")).toBeVisible();
    await expect(page.getByText("Nothing logged in August yet")).toBeVisible();

    // Each skeleton names what it is loading, so two at once are told apart.
    for (const label of [
      "Loading this month's total",
      "Loading this month's transactions",
      "Loading the breakdown",
    ]) {
      // Matched by text, not by accessible name: a status region takes its
      // name from aria-label, and this one deliberately has none.
      await expect(page.getByText(label)).toBeAttached();
    }
  });
});

test.describe("money and dates", () => {
  test("income carries a sign, not only a colour (AC-11)", async ({ page }) => {
    await page.goto(GALLERY);

    // The gallery renders the same amount twice, once as a spend and once as
    // an income. Asserting the relationship between the two rather than a
    // literal "$42.50" keeps this honest whatever APP_CURRENCY happens to be:
    // the criterion is about the sign, not about dollars.
    const amounts = page.locator(
      "h3:text-is('Amount') + div span[data-tabular]",
    );
    const spend = (await amounts.nth(0).innerText()).trim();
    const income = (await amounts.nth(1).innerText()).trim();

    expect(spend).not.toBe("");
    expect(spend.startsWith("+")).toBe(false);
    expect(income).toBe(`+${spend}`);

    // Colour is the second, redundant signal. It must differ, but the test
    // above is the one that proves meaning survives without it.
    const [spendColour, incomeColour] = await Promise.all([
      amounts.nth(0).evaluate((n) => getComputedStyle(n).color),
      amounts.nth(1).evaluate((n) => getComputedStyle(n).color),
    ]);
    expect(incomeColour).not.toBe(spendColour);
  });

  test("a date exposes its machine readable value (AC-12)", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    await expect(page.locator("time").first()).toHaveAttribute(
      "datetime",
      "2026-08-19",
    );
  });

  test("all ten category colours survive a production build (AC-18)", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    // An interpolated Tailwind class compiles to nothing, so the dot would
    // render with no background at all. Reading the computed colour is the
    // only way to tell that apart from a class that simply looks wrong.
    const colours = new Set<string>();
    for (const name of CATEGORY_NAMES) {
      const dot = page.locator(`[data-category-dot="${name}"]`).first();
      await expect(dot, `no chip rendered for ${name}`).toBeAttached();

      const colour = await dot.evaluate(
        (node) => getComputedStyle(node).backgroundColor,
      );

      expect(colour, `${name} compiled to no background`).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      colours.add(colour);
    }

    // Ten distinct values, so no two names collapsed onto the same token.
    expect(colours.size).toBe(10);
  });
});

test.describe("on a small phone", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("an amount never truncates, the name gives way instead (AC-13)", async ({
    page,
  }) => {
    await page.goto(GALLERY);

    const row = page
      .getByRole("listitem")
      .filter({ hasText: "A merchant name far longer" });

    // Located by the tabular-numerals marker rather than by its text, so the
    // test does not quietly depend on the currency the server is running.
    const amount = row.locator("[data-tabular]");
    await expect(amount).toBeVisible();

    // scrollWidth beyond clientWidth is what truncation looks like in the DOM.
    const amountClipped = await amount.evaluate(
      (node) => node.scrollWidth > node.clientWidth + 1,
    );
    expect(amountClipped, "the amount was clipped").toBe(false);

    const title = row.locator(".truncate").first();
    const titleClipped = await title.evaluate(
      (node) => node.scrollWidth > node.clientWidth + 1,
    );
    expect(titleClipped, "the long title should have truncated").toBe(true);

    // Truncation is CSS only, so the whole name is still there to be read.
    await expect(title).toContainText("which truncates while the amount stays");
  });

  test("every interactive target clears 44 by 44 (AC-14)", async ({ page }) => {
    await page.goto(GALLERY);

    const targets = page.locator(
      "a:visible, button:visible, select:visible, input:visible",
    );
    const count = await targets.count();
    expect(count).toBeGreaterThan(10);

    const tooSmall: string[] = [];
    for (let index = 0; index < count; index++) {
      const target = targets.nth(index);
      const box = await target.boundingBox();
      if (!box) continue;

      const skip = await target.evaluate((node) => ({
        // Tailwind v4's sr-only clips an element to 1x1 with clip-path, so
        // measuring a visually hidden helper says nothing; the skip link is
        // checked at its focused size in the keyboard tests below.
        clipped: getComputedStyle(node).clipPath !== "none",
        // Next's dev mode injects its own toolbar button, which is 32x32 and
        // never ships. Counting it would fail this test on every local run
        // while passing in CI, which tests the production build.
        frameworkChrome:
          node.closest("nextjs-portal") !== null ||
          node.hasAttribute("data-nextjs-dev-tools-button"),
      }));
      if (skip.clipped || skip.frameworkChrome) continue;

      if (box.height < 44 || box.width < 44) {
        const label =
          (await target.getAttribute("aria-label")) ??
          (await target.textContent()) ??
          (await target.evaluate((node) => node.outerHTML.slice(0, 80)));
        tooSmall.push(
          `${label?.trim().slice(0, 40)} (${box.width}x${box.height})`,
        );
      }
    }

    expect(tooSmall).toEqual([]);
  });
});

test.describe("keyboard", () => {
  test("the skip link comes first and reaches the content (AC-5)", async ({
    page,
  }) => {
    await page.goto(GALLERY);
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();

    // Visible once focused: a skip link nobody can see is a skip link nobody
    // uses, and at that point it is a real target like any other.
    await expect(skip).toBeInViewport();

    const box = await skip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(36);
  });

  test("focus is always visibly ringed (AC-5)", async ({ page }) => {
    await page.goto(GALLERY);

    const button = page.getByRole("button", { name: "Save spend" }).first();
    await button.focus();

    const outline = await button.evaluate((node) => {
      const style = getComputedStyle(node);
      return { color: style.outlineColor, width: style.outlineWidth };
    });

    expect(outline.width).not.toBe("0px");
    expect(outline.color).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("reduced motion", () => {
  test("no animation runs at all (AC-15)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(GALLERY);

    const durations = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".animate-pulse")].map(
        (node) => getComputedStyle(node).animationDuration,
      ),
    );

    expect(durations.length).toBeGreaterThan(0);
    for (const duration of durations) {
      // 0.01ms is the standard "effectively off" value; anything longer is a
      // running animation.
      expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.0001);
    }
  });
});
