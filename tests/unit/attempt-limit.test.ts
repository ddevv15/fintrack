import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FormState } from "@/lib/forms";

/**
 * The attempt limiting that AC-8 rests on, and the fail open rule underneath it.
 *
 * This module was proved by hand during `/check verify` and by nothing since,
 * which is what a fresh model review flagged as its second finding. The branch
 * that matters most is the one that is hardest to notice going wrong: when
 * Arcjet cannot be reached, this must let the attempt through. A change that
 * turned that into a refusal would lock the owner out of their own financial
 * history because a third party service was having a bad afternoon, and no
 * other test in this repository would say a word.
 *
 * Arcjet, the environment, and `server-only` are mocked because they are true
 * boundaries: a network service, process configuration, and a bundler marker.
 * Nothing else is faked, so the branching under test is the real branching.
 *
 * covers: AC-8
 */

const h = vi.hoisted(() => ({
  key: undefined as string | undefined,
  protect: vi.fn(),
  arcjet: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: () => ({ ARCJET_KEY: h.key }),
}));

vi.mock("@arcjet/next", () => ({
  default: h.arcjet,
  shield: (o: unknown) => o,
  detectBot: (o: unknown) => o,
  slidingWindow: (o: unknown) => o,
  request: async () => ({ ip: "203.0.113.7" }),
}));

/** Arcjet decision shapes, only the three methods this module actually calls. */
const allowed = { isErrored: () => false, isDenied: () => false };
const rateLimited = {
  isErrored: () => false,
  isDenied: () => true,
  reason: { isRateLimit: () => true },
};
const looksAutomated = {
  isErrored: () => false,
  isDenied: () => true,
  reason: { isRateLimit: () => false },
};
const arcjetErrored = {
  isErrored: () => true,
  isDenied: () => false,
  reason: "the service fell over",
};

/**
 * Narrow a result to the refusal shape, and hand back its words.
 *
 * `FormState` is a union, so the message only exists on the error arm. Asserting
 * the arm here means a test that expected a refusal and got silence fails
 * saying so, rather than quietly comparing against undefined.
 */
function refusalMessage(state: FormState | undefined): string {
  expect(state, "expected a refusal, got none").toBeDefined();
  expect(state?.status).toBe("error");
  return state && state.status === "error" ? state.message : "";
}

/**
 * Import fresh, because the client is memoised after its first use.
 *
 * It is built on demand rather than at module load, so that one instance is
 * reused for the life of the module; without resetting, the second test would
 * be asking the client the first test built, under the first test's key.
 */
async function loadWithKey(key: string | undefined) {
  h.key = key;
  vi.resetModules();
  return import("@/lib/attempt-limit");
}

beforeEach(() => {
  h.protect.mockReset();
  h.arcjet.mockReset();
  // `withRule()` hands back the same client, which is what the real one does:
  // it shares the transport rather than dialling the API a second time. The
  // signed in path goes through it, so a mock without it fails on a shape
  // difference rather than on the branching under test.
  h.arcjet.mockImplementation(() => {
    const client = { protect: h.protect, withRule: () => client };
    return client;
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("with no ARCJET_KEY, the app still works", () => {
  it("lets a public attempt through rather than refusing it", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey(undefined);
    await expect(refuseIfTooManyAttempts()).resolves.toBeUndefined();
  });

  it("lets a signed in attempt through too", async () => {
    const { refuseIfTooManyAccountAttempts } = await loadWithKey(undefined);
    await expect(
      refuseIfTooManyAccountAttempts("account-1"),
    ).resolves.toBeUndefined();
  });

  it("says out loud that there is no protection", async () => {
    // Silently unprotected is the failure worth preventing: the app behaves
    // identically whether limiting is on or off, so the log is the only tell.
    const { refuseIfTooManyAttempts } = await loadWithKey(undefined);
    await refuseIfTooManyAttempts();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("ARCJET_KEY is not set"),
    );
  });

  it("never builds a client it has no key for", async () => {
    await loadWithKey(undefined);
    expect(h.arcjet).not.toHaveBeenCalled();
  });
});

describe("the client is built on demand, and only once", () => {
  /*
   * A regression test for a production crash, which is the only reason these
   * two assertions are worth their lines.
   *
   * `arcjet()` builds its transport synchronously, and that transport opens a
   * long lived HTTP/2 session to the Arcjet API straight away and holds it
   * through 340 seconds of idle. Built at module scope, as this module used to
   * do, every server instance opened one the moment the chunk loaded, on every
   * route, including the page renders that never reach an auth action. Those
   * idle sessions are what crashed: when the far end sends a GOAWAY the session
   * manager destroys the connection with an error, and landing in the window
   * where its own listener is detached makes that an unhandled `error` event,
   * which takes the process down. It arrives from a timer long after the
   * request is over, so no `try`/`catch` in this file can be near it.
   *
   * Neither assertion is about attempt limiting, and both would look like
   * pedantry to somebody tidying this file up. They are the two properties that
   * keep the exposure small, and nothing else in the repository states them.
   */
  it("does not touch Arcjet just because the module was imported", async () => {
    await loadWithKey("ajkey_test");

    expect(h.arcjet).not.toHaveBeenCalled();
  });

  it("builds one client for both surfaces, not one each", async () => {
    const { refuseIfTooManyAttempts, refuseIfTooManyAccountAttempts } =
      await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(allowed);

    await refuseIfTooManyAttempts();
    await refuseIfTooManyAccountAttempts("account-1");
    await refuseIfTooManyAttempts();

    // One client means one transport, and so one connection held open rather
    // than a fresh one per surface or per call. The signed in surface reaches
    // the same client through `withRule()`.
    expect(h.arcjet).toHaveBeenCalledTimes(1);
  });
});

describe("fail open: a decision that cannot be made allows the attempt", () => {
  it("allows through when the call throws, and logs it", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(refuseIfTooManyAttempts()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("could not be reached"),
      expect.any(Error),
    );
  });

  it("allows through when Arcjet reports its own error, and logs it", async () => {
    // Arcjet signals an internal failure as a decision rather than a throw, so
    // this is a second, separate path to the same answer.
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(arcjetErrored);

    await expect(refuseIfTooManyAttempts()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("returned an error"),
      "the service fell over",
    );
  });

  it("fails open on the signed in path as well", async () => {
    const { refuseIfTooManyAccountAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockRejectedValue(new Error("connect ETIMEDOUT"));

    await expect(
      refuseIfTooManyAccountAttempts("account-1"),
    ).resolves.toBeUndefined();
  });
});

describe("an allowed decision is not a refusal", () => {
  it("returns undefined when nothing was denied", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(allowed);

    await expect(refuseIfTooManyAttempts()).resolves.toBeUndefined();
  });
});

describe("a refusal is readable text, matched to the screen", () => {
  it("tells someone who is signing in to wait, and mentions the reset link", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(rateLimited);

    const refused = await refuseIfTooManyAttempts("password");
    expect(refusalMessage(refused)).toMatch(/password reset link/i);
  });

  it("does not offer the reset link on a screen that is already a reset", async () => {
    // The bug this guards: one message for every form, so a code screen tells
    // you to go and reset the password you are already resetting.
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(rateLimited);

    const refused = await refuseIfTooManyAttempts("code");
    expect(refusalMessage(refused)).toMatch(/codes tried/i);
    expect(refusalMessage(refused)).not.toMatch(/password reset link/i);
  });

  it("says codes were asked for too often when the action sends mail", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(rateLimited);

    const refused = await refuseIfTooManyAttempts("email");
    expect(refusalMessage(refused)).toMatch(/asked for/i);
  });

  it("gives a bot no advice, because there is none worth giving", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(looksAutomated);

    const refused = await refuseIfTooManyAttempts("password");
    expect(refusalMessage(refused)).toMatch(/looked automated/i);
  });

  it("defaults to the sign in wording on the public path", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(rateLimited);

    const refused = await refuseIfTooManyAttempts();
    expect(refusalMessage(refused)).toMatch(/password reset link/i);
  });

  it("defaults to the code wording on the signed in path", async () => {
    const { refuseIfTooManyAccountAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(rateLimited);

    const refused = await refuseIfTooManyAccountAttempts("account-1");
    expect(refusalMessage(refused)).toMatch(/codes tried/i);
  });
});

describe("a refusal never leaks what went wrong", () => {
  it("carries no key, no stack, and no service detail", async () => {
    // A refusal is rendered straight into the page, so anything it carries is
    // public. AC-8 asks for a plain message rather than a stack trace.
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_supersecret");
    h.protect.mockResolvedValue(rateLimited);

    const refused = await refuseIfTooManyAttempts("password");
    expect(refusalMessage(refused)).not.toMatch(/ajkey|arcjet|at .*\.ts:\d+/i);
  });
});

describe("the signed in path is keyed on the account", () => {
  it("carries the account id into the decision", async () => {
    // Without this the cap holds per source only, and somebody rotating source
    // addresses can still aim an unbounded run of codes at one mailbox.
    const { refuseIfTooManyAccountAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(allowed);

    await refuseIfTooManyAccountAttempts("account-42");

    expect(h.protect).toHaveBeenCalledWith(expect.anything(), {
      accountId: "account-42",
    });
  });

  it("does not send an account id on the public path, where there is none", async () => {
    const { refuseIfTooManyAttempts } = await loadWithKey("ajkey_test");
    h.protect.mockResolvedValue(allowed);

    await refuseIfTooManyAttempts();

    expect(h.protect).toHaveBeenCalledTimes(1);
    expect(h.protect.mock.calls[0]).toHaveLength(1);
  });
});
