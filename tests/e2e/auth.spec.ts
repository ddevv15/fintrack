import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The auth screens: reachable, closed, and usable without a mouse.
 *
 * These are the real routes rather than the gallery, because this is the one
 * feature where the interesting behaviour is what happens *between* screens: a
 * request with no session being turned away, a redirect landing where it should.
 * A component rendered in isolation cannot show any of that (spec 0004).
 *
 * Nothing here signs in. Doing that needs the two test accounts and their
 * password, which live in the environment for the integration suite; the flows
 * that need a session are checked there and by `/check verify` against the real
 * app.
 */

/** WCAG 2.2 AA, the level this project commits to. */
const WCAG_22_AA = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

/** Every screen a visitor with no session can reach. */
const PUBLIC_SCREENS = [
  { path: "/sign-in", heading: "Sign in" },
  { path: "/sign-up", heading: "Create your account" },
  {
    path: "/verify?email=someone@example.invalid",
    heading: "Confirm your email",
  },
  { path: "/forgot-password", heading: "Forgot your password" },
  { path: "/reset-password", heading: "Set a new password" },
] as const;

/**
 * Screens that must not render for a visitor with no session (AC-6).
 *
 * `/breakdown` is here for spec 0005 AC-13 as well: it is the screen that shows
 * what you spent and on what, so it leaking any part of itself to a request
 * with no session is the worst version of this failure.
 */
const PROTECTED_PATHS = ["/", "/settings", "/setup", "/breakdown"] as const;

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

test.describe("the doors are shut", () => {
  for (const path of PROTECTED_PATHS) {
    test(`${path} redirects a visitor with no session to sign in (AC-6)`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(
        page.getByRole("heading", { name: "Sign in" }),
      ).toBeVisible();
    });
  }

  test("a corrupted session cookie is treated as no session at all (AC-6)", async ({
    page,
    context,
  }) => {
    // Not a made up scenario: a truncated or tampered cookie is what an expired
    // session looks like from the outside, and it must not become a half signed
    // in state.
    await context.addCookies([
      {
        name: "insforge_access_token",
        value: "not.a.real.jwt",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/");

    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("no account data appears on the way out (AC-6)", async ({ page }) => {
    const response = await page.goto("/settings");

    // The redirect chain must never have rendered the settings screen. Checking
    // the text rather than the status is the point: a redirect that still
    // streamed a page body would pass a status check and fail this one.
    expect(await page.content()).not.toContain("Delete your account");
    expect(response?.url()).toMatch(/\/sign-in$/);
  });

  test("no money figure appears on the way out of the breakdown (spec 0005 AC-13)", async ({
    page,
  }) => {
    const response = await page.goto("/breakdown");

    // Same reasoning as the settings check above, applied to the screen where
    // a leak would be worst. A body that streamed before redirecting would
    // still carry the heading and a currency glyph, so both are checked.
    const body = await page.content();
    expect(body).not.toContain("Where your money went");
    expect(body).not.toContain("Total spent");
    expect(response?.url()).toMatch(/\/sign-in$/);
  });
});

test.describe("the public screens", () => {
  for (const { path, heading } of PUBLIC_SCREENS) {
    test(`${path} renders without a session`, async ({ page }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    });
  }

  test("sign in reaches sign up and password recovery by keyboard alone", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    // Tabbing to a link and pressing Enter, rather than clicking it: this is
    // the journey somebody who cannot use a mouse actually takes, and a div
    // dressed as a link would pass a click test and fail this one.
    await page.getByRole("link", { name: "Forgot your password?" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/forgot-password$/);

    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Create one" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/sign-up$/);
  });

  test("a refused sign up keeps the address and says what is wrong", async ({
    page,
  }) => {
    await page.goto("/sign-up");

    await page.getByLabel("Email").fill("someone@example.invalid");
    await page.getByLabel("Password").fill("tooshort");
    await page.getByRole("button", { name: "Create account" }).click();

    // The message is beside the field it belongs to.
    await expect(
      page.getByText(/at least 12 characters/i).last(),
    ).toBeVisible();

    // And the address survives. React 19 resets an uncontrolled form after its
    // action, so without the fix in SignUpForm this field comes back empty and
    // everything has to be retyped.
    await expect(page.getByLabel("Email")).toHaveValue(
      "someone@example.invalid",
    );
  });
});

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const { path } of PUBLIC_SCREENS) {
      test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
        await page.goto(path);

        expect(await violationsOn(page)).toEqual([]);
      });
    }
  });
}
