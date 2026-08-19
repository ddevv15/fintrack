import { expect, test } from "@playwright/test";

/**
 * The one flow that must never break: the app boots and serves a page.
 *
 * Real journeys arrive with release 1 (sign in, log a spend, see the month).
 * This exists so the runner, the config, and the CI job are proven working
 * before there is anything interesting to test.
 */
test.describe("app shell", () => {
  test("serves the home page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "FinTrack" })).toBeVisible();
  });

  test("carries the title and description a search engine reads", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("FinTrack");
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
