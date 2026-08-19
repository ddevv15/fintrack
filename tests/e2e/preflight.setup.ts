import { expect, test as setup } from "@playwright/test";

/**
 * One clear failure instead of seventeen confusing ones.
 *
 * Every gallery test needs `/design`, and that route is a deliberate 404
 * unless UI_GALLERY is set. Playwright's `reuseExistingServer` means a dev
 * server you already had running gets used as is, so its environment wins over
 * the one this config sets. When that server has no UI_GALLERY, the whole
 * suite fails on missing elements, which reads like the components are broken
 * rather than like the server is the wrong one.
 *
 * Every other project depends on this one, so a failure here stops the run
 * with a message you can act on.
 */
setup("the design gallery is reachable", async ({ request, baseURL }) => {
  const response = await request.get("/design");

  expect(
    response.status(),
    [
      `The design gallery at ${baseURL}/design returned ${response.status()}, not 200.`,
      "",
      "Almost always this means Playwright reused a server you already had",
      "running, and that server has no UI_GALLERY set. Playwright only applies",
      "its own environment to a server it starts itself.",
      "",
      "Either stop that server and let Playwright start its own, or restart it",
      "as: UI_GALLERY=1 npm run dev",
    ].join("\n"),
  ).toBe(200);
});
