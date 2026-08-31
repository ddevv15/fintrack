import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The half of spec 0011 that decides whether anything happens at all.
 *
 * `lib/monitoring.ts` is pure and covered next door. This file covers the thin
 * orchestration around it, which is small but load bearing: it chooses whether
 * to start reporting, says out loud when reporting is off where it was wanted,
 * and, most importantly, refuses to let any failure of its own reach the server.
 *
 * That last one is the reason this file exists. Next requires `register()` to
 * finish before the server accepts a request, so a throw here is not a failed
 * report, it is a server that never comes up. Monitoring turning a misconfigured
 * variable into an outage is the exact trade spec 0011 forbids.
 *
 * covers: AC-9, AC-12, AC-13 of spec 0011
 */

const init = vi.fn();
const captureRequestError = vi.fn();
const flush = vi.fn(async () => true);

vi.mock("@sentry/nextjs", () => ({
  init,
  captureRequestError,
  flush,
}));

const env = vi.fn();
const publicEnv = vi.fn();

vi.mock("@/lib/env", () => ({
  env: () => env(),
  publicEnv: () => publicEnv(),
}));

/** A configured preview deployment, the state in which reporting should start. */
function deployed(overrides: Record<string, unknown> = {}) {
  publicEnv.mockReturnValue({
    NEXT_PUBLIC_SENTRY_DSN: "https://key@o0.ingest.sentry.io/0",
    NEXT_PUBLIC_VERCEL_ENV: "preview",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "deadbeef",
    ...overrides,
  });
  env.mockReturnValue({
    VERCEL_ENV: undefined,
    VERCEL_GIT_COMMIT_SHA: undefined,
  });
}

/** Load a fresh copy, because `register()` sets module level state. */
async function loadInstrumentation() {
  vi.resetModules();
  return import("@/instrumentation");
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("register", () => {
  it("starts reporting on a configured deployment", async () => {
    deployed();

    const { register } = await loadInstrumentation();
    register();

    expect(init).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("says once, out loud, when a deployment has no DSN", async () => {
    deployed({ NEXT_PUBLIC_SENTRY_DSN: undefined });

    const { register } = await loadInstrumentation();
    register();

    expect(init).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("stays quiet on a laptop, where reporting off is the normal state", async () => {
    // No VERCEL_ENV at all, which is what an unset variable looks like. A
    // warning on every local boot would be noise nobody reads.
    deployed({
      NEXT_PUBLIC_SENTRY_DSN: undefined,
      NEXT_PUBLIC_VERCEL_ENV: undefined,
    });

    const { register } = await loadInstrumentation();
    register();

    expect(init).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not throw when the environment itself is misconfigured", async () => {
    // `env()` and `publicEnv()` throw on a missing or malformed value, and that
    // has nothing to do with monitoring. Letting it out of `register()` would
    // stop the server becoming ready at all.
    publicEnv.mockImplementation(() => {
      throw new Error(
        "FinTrack is missing or has invalid environment configuration",
      );
    });
    env.mockImplementation(() => {
      throw new Error(
        "FinTrack is missing or has invalid environment configuration",
      );
    });

    const { register } = await loadInstrumentation();

    expect(() => register()).not.toThrow();
    expect(init).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not throw when the SDK itself fails to start", async () => {
    deployed();
    init.mockImplementationOnce(() => {
      throw new Error("bad dsn");
    });

    const { register } = await loadInstrumentation();

    expect(() => register()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("onRequestError", () => {
  const request = { path: "/history", method: "GET", headers: {} };
  const context = {
    routerKind: "App Router" as const,
    routePath: "/history",
    routeType: "render" as const,
    revalidateReason: undefined,
  };

  it("reports the error, then waits for it to actually leave", async () => {
    deployed();

    const { register, onRequestError } = await loadInstrumentation();
    register();
    await onRequestError(new Error("boom"), request, context);

    expect(captureRequestError).toHaveBeenCalledTimes(1);
    // Queued is not sent. A serverless function can freeze the moment it
    // responds, cutting an unflushed report off in transit.
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when reporting never started", async () => {
    deployed({ NEXT_PUBLIC_SENTRY_DSN: undefined });

    const { register, onRequestError } = await loadInstrumentation();
    register();
    await onRequestError(new Error("boom"), request, context);

    expect(captureRequestError).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it("swallows a failure inside reporting rather than making it a third error", async () => {
    deployed();
    captureRequestError.mockImplementationOnce(() => {
      throw new Error("sentry is unwell");
    });

    const { register, onRequestError } = await loadInstrumentation();
    register();

    await expect(
      onRequestError(new Error("boom"), request, context),
    ).resolves.toBeUndefined();
  });
});
