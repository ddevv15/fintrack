import { expect, test } from "@playwright/test";

/**
 * The one flow that must never break: the app boots and serves a page.
 *
 * Until feature 5 this pointed at `/`, which served a placeholder. `/` now
 * needs a session and redirects to sign in, so the shell facts are asserted
 * against the first screen a visitor actually sees. Which page that is matters
 * less than that something renders, carries its metadata, and logs nothing.
 *
 * The signed in journeys (log a spend, see the month) arrive with features 6
 * and 7 and will bring their own tests.
 */
test.describe("app shell", () => {
  test("serves the first screen a visitor reaches", async ({ page }) => {
    await page.goto("/");

    // Landing on sign in from `/` is the feature working, not a failure: an
    // unauthenticated visitor has nowhere else to be.
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("carries the title and description a search engine reads", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    await expect(page).toHaveTitle(/FinTrack/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /money tracker/i,
    );
  });

  test("declares the page language, which screen readers need", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("reports no console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/");

    expect(errors).toEqual([]);
  });
});
