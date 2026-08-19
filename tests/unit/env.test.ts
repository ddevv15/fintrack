import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locks the environment contract, and one bug in particular.
 *
 * `UI_GALLERY=` with nothing after it arrives as an empty string, not as
 * undefined. Because env() validates the whole schema in a single parse, an
 * empty value there once failed every other variable with it, so the app threw
 * on every route rather than merely hiding the gallery. The setup path in
 * .env.example is exactly what produced it, which is the worst way to find a
 * bug: by following the instructions.
 */

const REQUIRED = {
  NEXT_PUBLIC_INSFORGE_URL: "https://example.insforge.app",
  NEXT_PUBLIC_INSFORGE_ANON_KEY: "anon-key",
  APP_CURRENCY: "USD",
  APP_TIMEZONE: "America/New_York",
};

/**
 * env() caches after its first call, so each case needs a fresh module.
 * Resetting the registry is what makes these independent.
 */
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries({ ...REQUIRED, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const { env } = await import("@/lib/env");
  return env();
}

let original: NodeJS.ProcessEnv;

beforeEach(() => {
  original = { ...process.env };
});

afterEach(() => {
  process.env = original;
});

describe("UI_GALLERY", () => {
  it("treats an empty value as unset rather than failing the whole schema", async () => {
    // The regression: `UI_GALLERY=` as a bare line in a .env file, or an empty
    // value typed into a hosting dashboard.
    const env = await loadEnv({ UI_GALLERY: "" });

    expect(env.UI_GALLERY).toBe(false);
    // The point of the fix: the other variables survive too.
    expect(env.APP_CURRENCY).toBe("USD");
  });

  it("is false when the variable is absent", async () => {
    const env = await loadEnv({ UI_GALLERY: undefined });

    expect(env.UI_GALLERY).toBe(false);
  });

  it.each([
    ["1", true],
    ["true", true],
    ["0", false],
    ["false", false],
  ])("reads %s as %s", async (value, expected) => {
    const env = await loadEnv({ UI_GALLERY: value });

    expect(env.UI_GALLERY).toBe(expected);
  });

  it.each(["yes", "TRUE", "on", " 1"])(
    "still refuses %s, so a typo cannot quietly disable the route",
    async (value) => {
      await expect(loadEnv({ UI_GALLERY: value })).rejects.toThrow(
        /must be 1, 0, true, or false/,
      );
    },
  );
});

describe("the required variables", () => {
  it("names the one that is wrong instead of failing silently", async () => {
    await expect(
      loadEnv({ APP_TIMEZONE: "Mars/Olympus_Mons" }),
    ).rejects.toThrow(/APP_TIMEZONE/);
  });

  it("refuses a currency that is not a three letter code", async () => {
    await expect(loadEnv({ APP_CURRENCY: "dollars" })).rejects.toThrow(
      /APP_CURRENCY/,
    );
  });
});
