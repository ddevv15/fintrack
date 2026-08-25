import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The single read path that turns "who is signed in" into "how their money
 * reads and where their month ends".
 *
 * Two behaviours here are load bearing and easy to erode. It throws rather than
 * defaulting, because rule 3 of `AGENTS.md` says a wrong money figure shown
 * confidently is worse than an honest error, and a profile that cannot be read
 * is exactly the moment somebody is tempted to fall back to USD. And it returns
 * a discriminated union rather than optional fields, so a caller cannot reach
 * `currency` without first admitting it might not be there.
 *
 * `react`'s cache() is replaced with a pass through: it is a request scoped
 * memo, and leaving it in would let one test's result answer the next test.
 *
 * covers: AC-11, AC-13, AC-15
 */

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T>(fn: T) => fn };
});

vi.mock("@/lib/insforge-server", () => ({
  createInsforgeServer: async () => ({
    auth: { getCurrentUser: h.getCurrentUser },
    database: {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: h.maybeSingle }),
        }),
      }),
    },
  }),
}));

const USER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

function profileRow(over: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    display_name: "Dev",
    currency: "INR",
    timezone: "Asia/Kolkata",
    created_at: "2026-08-19T10:00:00.000Z",
    ...over,
  };
}

async function load() {
  vi.resetModules();
  return import("@/lib/settings");
}

beforeEach(() => {
  h.getCurrentUser.mockReset();
  h.maybeSingle.mockReset();
  h.getCurrentUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
});

describe("getSettings refuses rather than guessing", () => {
  it("throws when nobody is signed in", async () => {
    h.getCurrentUser.mockResolvedValue({
      data: null,
      error: { message: "no" },
    });
    const { getSettings } = await load();

    await expect(getSettings()).rejects.toThrow(/nobody is signed in/i);
  });

  it("throws when the profile cannot be read", async () => {
    h.maybeSingle.mockResolvedValue({
      error: { message: "permission denied" },
    });
    const { getSettings } = await load();

    await expect(getSettings()).rejects.toThrow(/permission denied/);
  });

  it("throws when the profile row is missing, rather than defaulting", async () => {
    // The exact case /check verify exercised by hand: the row is gone, and the
    // screen must say so instead of rendering somebody's money in a guessed
    // currency.
    h.maybeSingle.mockResolvedValue({ data: null });
    const { getSettings } = await load();

    await expect(getSettings()).rejects.toThrow(/profile row is missing/i);
  });

  it("throws on a currency the code does not know, rather than assuming two decimals", async () => {
    // Guessing two here is how a yen amount becomes a hundred times too small.
    h.maybeSingle.mockResolvedValue({ data: profileRow({ currency: "ZZZ" }) });
    const { getSettings } = await load();

    await expect(getSettings()).rejects.toThrow();
  });
});

describe("getSettings reports an incomplete profile as an ordinary state", () => {
  it("is incomplete when the currency has not been chosen", async () => {
    h.maybeSingle.mockResolvedValue({ data: profileRow({ currency: null }) });
    const { getSettings } = await load();

    const settings = await getSettings();
    expect(settings.isComplete).toBe(false);
    expect(settings.displayName).toBe("Dev");
  });

  it("is incomplete when the time zone has not been chosen", async () => {
    h.maybeSingle.mockResolvedValue({ data: profileRow({ timezone: null }) });
    const { getSettings } = await load();

    expect((await getSettings()).isComplete).toBe(false);
  });

  it("does not throw for an incomplete profile, because a new account is not an error", async () => {
    h.maybeSingle.mockResolvedValue({ data: profileRow({ currency: null }) });
    const { getSettings } = await load();

    await expect(getSettings()).resolves.toBeDefined();
  });
});

describe("getSettings resolves a complete profile", () => {
  it("returns the currency, zone, name, and the decimal count for that currency", async () => {
    h.maybeSingle.mockResolvedValue({ data: profileRow() });
    const { getSettings } = await load();

    const settings = await getSettings();
    expect(settings).toMatchObject({
      isComplete: true,
      currency: "INR",
      decimals: 2,
      timezone: "Asia/Kolkata",
      displayName: "Dev",
    });
  });

  it("takes the decimal count from the currency, not from a hardcoded two", async () => {
    h.maybeSingle.mockResolvedValue({
      data: profileRow({ currency: "JPY", timezone: "Asia/Tokyo" }),
    });
    const { getSettings } = await load();

    const settings = await getSettings();
    expect(settings.isComplete && settings.decimals).toBe(0);
  });
});

describe("requireCompleteSettings", () => {
  it("returns the settings when the profile is complete", async () => {
    h.maybeSingle.mockResolvedValue({ data: profileRow() });
    const { requireCompleteSettings } = await load();

    await expect(requireCompleteSettings()).resolves.toMatchObject({
      currency: "INR",
    });
  });

  it("throws when the routing rule let an incomplete profile through", async () => {
    h.maybeSingle.mockResolvedValue({ data: profileRow({ timezone: null }) });
    const { requireCompleteSettings } = await load();

    await expect(requireCompleteSettings()).rejects.toThrow(/\/setup/);
  });
});
