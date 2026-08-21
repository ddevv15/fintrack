import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A structural guard on the one line that leaked which addresses have accounts.
 *
 * This reads the source rather than running the action, and that is a
 * deliberate trade rather than laziness. `requestPasswordReset` is a Server
 * Action: it reads cookies, calls `redirect()`, and talks to the InsForge SDK,
 * so exercising it here would mean mocking four modules, and this runner is
 * scoped to pure logic on purpose (see vitest.config.mts). What the timing
 * actually did is proved by measurement, not by this file.
 *
 * What this catches is the regression that is genuinely likely: somebody tidies
 * `after(...)` back into a plain `await`, because that reads like a
 * simplification and nothing else in the suite would complain. Awaiting the
 * send put roughly three seconds on the response for an address that has an
 * account and about eighty milliseconds on one that does not, which sorted
 * every address into two piles no matter how careful the wording on screen was.
 *
 * covers: AC-7, the identical response for a known and an unknown address
 */

const source = readFileSync(join(process.cwd(), "actions", "auth.ts"), "utf8");

/** Just the body of `requestPasswordReset`, so the other actions are ignored. */
function requestPasswordResetBody(): string {
  const start = source.indexOf("export async function requestPasswordReset");
  expect(start, "requestPasswordReset has been renamed or removed").not.toBe(
    -1,
  );
  const rest = source.slice(start);
  const end = rest.indexOf("\n}");
  return rest.slice(0, end);
}

describe("requestPasswordReset keeps both answers the same length", () => {
  it("never sends before the response has gone out", () => {
    // Awaiting the send is fine, and necessary, but only inside the after()
    // callback. What must not come back is a send in the request body itself,
    // so the check is about order rather than about the word await.
    const body = requestPasswordResetBody();
    const deferPoint = body.indexOf("after(");
    const sends = [...body.matchAll(/sendResetPasswordEmail/g)].map(
      (m) => m.index ?? -1,
    );

    expect(
      deferPoint,
      "the send is no longer deferred with after()",
    ).toBeGreaterThan(-1);
    expect(sends, "the send has been removed entirely").not.toHaveLength(0);

    const early = sends.filter((at) => at < deferPoint);
    expect(
      early,
      "a send in the request body makes a known address take seconds and an unknown one milliseconds, which answers the question the screen refuses to answer",
    ).toEqual([]);
  });

  it("defers the send until after the response", () => {
    const body = requestPasswordResetBody();
    expect(body, "the send should run inside after()").toMatch(/after\(/);
    expect(body).toMatch(/sendResetPasswordEmail/);
  });

  it("writes a refused send to the log, since silence reached nobody", () => {
    // The screen must keep saying the same non committal thing, so the log is
    // the only place a refusal can surface. Without this the send can be turned
    // down and the person waits for a code that was never sent.
    const body = requestPasswordResetBody();
    expect(body, "a refused send must be logged").toMatch(/console\.error/);
  });
});
