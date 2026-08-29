import { describe, expect, it } from "vitest";

import type { SpendCategoryOption } from "@/lib/categories";
import {
  formatMatchCount,
  parseHistoryFilters,
  resolveReturnPath,
  summariseHistory,
} from "@/lib/history";
import { escapeLikeTerm } from "@/lib/month";
import type { MonthTransactionRow } from "@/lib/schema";

/**
 * The parts of `/history` that decide what a filter means.
 *
 * All offline. Every function here is pure precisely so the rules worth proving
 * (which parameters survive, when a range is impossible, when a total may be
 * shown, and where an edit may return to) can be proved without a backend, a
 * browser, or a signed in account.
 *
 * covers: AC-2, AC-4, AC-8, AC-9, AC-11, AC-13, AC-18, AC-19 of spec 0009
 */

const MINE = "8f14e45f-ceea-467a-9e69-1f2b0e1a4c11";
const HIDDEN = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
/** A real uuid that is simply not in this account's list. */
const SOMEONE_ELSES = "11111111-2222-4333-8444-555555555555";

const categories: readonly SpendCategoryOption[] = [
  { id: MINE, name: "Groceries", color: "green", isHidden: false },
  { id: HIDDEN, name: "Coffee", color: "amber", isHidden: true },
];

function parse(params: Record<string, string | string[] | undefined>) {
  return parseHistoryFilters(params, categories);
}

describe("parsing the filters out of a query string", () => {
  it("takes all four when they are usable", () => {
    const { filters, dropped, rangeError } = parse({
      category: MINE,
      from: "2026-06-01",
      to: "2026-08-19",
      q: "coffee",
    });

    expect(filters).toEqual({
      categoryId: MINE,
      from: "2026-06-01",
      to: "2026-08-19",
      note: "coffee",
    });
    expect(dropped).toEqual([]);
    expect(rangeError).toBeUndefined();
  });

  it("treats no parameters at all as no filters, not as an error", () => {
    const { filters, dropped, rangeError } = parse({});

    expect(filters).toEqual({
      categoryId: undefined,
      from: undefined,
      to: undefined,
      note: undefined,
    });
    expect(dropped).toEqual([]);
    expect(rangeError).toBeUndefined();
  });

  it("accepts a hidden category, because its history is still yours", () => {
    expect(parse({ category: HIDDEN }).filters.categoryId).toBe(HIDDEN);
  });

  it("treats a blank or whitespace search as absent rather than dropped", () => {
    const { filters, dropped } = parse({ q: "   " });

    expect(filters.note).toBeUndefined();
    expect(dropped).toEqual([]);
  });

  it("drops a date that is not a real day, and says so", () => {
    const { filters, dropped } = parse({ from: "banana", to: "2026-08-19" });

    expect(filters.from).toBeUndefined();
    // The rest of the query still applies (AC-13).
    expect(filters.to).toBe("2026-08-19");
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.field).toBe("from");
  });

  it("drops a date that looks well formed but does not exist", () => {
    // The shape check alone would let this through, which is why the parse has
    // to agree that the day is real.
    expect(parse({ from: "2026-02-31" }).filters.from).toBeUndefined();
  });

  it("tells a stranger's category, an unknown one, and a malformed one apart from nothing", () => {
    const foreign = parse({ category: SOMEONE_ELSES });
    const malformed = parse({ category: "not-a-uuid" });

    expect(foreign.filters.categoryId).toBeUndefined();
    expect(malformed.filters.categoryId).toBeUndefined();
    // Identical wording, so the three cases stay indistinguishable (AC-19).
    expect(foreign.dropped[0]?.reason).toBe(malformed.dropped[0]?.reason);
  });

  it("keeps a search at the note column's limit and drops one past it", () => {
    expect(parse({ q: "x".repeat(500) }).filters.note).toHaveLength(500);

    const tooLong = parse({ q: "x".repeat(501) });
    expect(tooLong.filters.note).toBeUndefined();
    expect(tooLong.dropped[0]?.field).toBe("q");
  });

  it("refuses a range that runs backwards instead of matching nothing", () => {
    const { rangeError } = parse({ from: "2026-08-19", to: "2026-06-01" });

    // Without this the screen would say "nothing matched your filters", which
    // is true and useless: nothing could ever have matched (AC-9).
    expect(rangeError).toBeDefined();
  });

  it("allows a range of a single day", () => {
    expect(
      parse({ from: "2026-08-19", to: "2026-08-19" }).rangeError,
    ).toBeUndefined();
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parse({ q: ["coffee", "tea"] }).filters.note).toBe("coffee");
  });
});

describe("escaping a typed search term", () => {
  it("leaves an ordinary term alone", () => {
    expect(escapeLikeTerm("coffee")).toBe("coffee");
  });

  it("makes a typed percent match a percent rather than everything", () => {
    expect(escapeLikeTerm("50%")).toBe("50\\%");
  });

  it("makes a typed underscore match an underscore rather than any character", () => {
    expect(escapeLikeTerm("a_b")).toBe("a\\_b");
  });

  it("escapes the backslash first, not last", () => {
    // Done in the other order this would read `a\\\\%b`: the backslash added by
    // the percent substitution would itself get escaped, and the pattern would
    // look for a literal backslash followed by anything at all.
    expect(escapeLikeTerm("a\\%b")).toBe("a\\\\\\%b");
  });
});

describe("deciding where an edit may return to", () => {
  it("falls back when there is nothing to go on", () => {
    expect(resolveReturnPath(undefined)).toBe("/transactions");
    expect(resolveReturnPath("")).toBe("/transactions");
  });

  it("allows the two list routes", () => {
    expect(resolveReturnPath("/history")).toBe("/history");
    expect(resolveReturnPath("/transactions")).toBe("/transactions");
  });

  it("keeps the filters that were on the route", () => {
    expect(resolveReturnPath("/history?category=abc&q=coffee")).toBe(
      "/history?category=abc&q=coffee",
    );
  });

  it("refuses a route that merely starts the same way", () => {
    // The reason this check cannot be a startsWith test.
    expect(resolveReturnPath("/historyXYZ")).toBe("/transactions");
  });

  it("refuses somewhere else in the app", () => {
    expect(resolveReturnPath("/settings")).toBe("/transactions");
  });

  it("refuses an address that leaves the app", () => {
    expect(resolveReturnPath("https://evil.example.com")).toBe("/transactions");
    // Protocol relative: a browser reads this as another host, not a path.
    expect(resolveReturnPath("//evil.example.com")).toBe("/transactions");
    // Some browsers read a backslash as a slash, so it never gets parsed here.
    expect(resolveReturnPath("/\\evil.example.com")).toBe("/transactions");
  });

  it("normalises rather than passing the raw value through", () => {
    expect(resolveReturnPath("/history/../transactions")).toBe("/transactions");
  });
});

const row = (id: string, amountMinor: number): MonthTransactionRow => ({
  id,
  amount_minor: amountMinor,
  occurred_on: "2026-08-19",
  note: undefined,
  categories: { id: MINE, name: "Groceries", color: "green" },
});

describe("summarising what came back", () => {
  it("totals a complete set from exactly the rows it returns", () => {
    const result = summariseHistory([row("a", 1250), row("b", 375)], 2);

    expect(result.isComplete).toBe(true);
    expect(result.totalMinor).toBe(1625);
    expect(result.rows).toHaveLength(2);
  });

  it("shows the rows but no total when the set was capped", () => {
    // The rows are still worth showing; the total is not, because it would be
    // the sum of a slice presented as the sum of the whole (AC-11).
    const result = summariseHistory([row("a", 1250)], 340);

    expect(result.rows).toHaveLength(1);
    expect(result.matched).toBe(340);
    expect(result.isComplete).toBe(false);
    expect(result.totalMinor).toBeUndefined();
  });

  it("reports a genuinely empty result as complete, totalling zero", () => {
    const result = summariseHistory([], 0);

    expect(result.isComplete).toBe(true);
    expect(result.totalMinor).toBe(0);
  });
});

describe("reading a match count", () => {
  it("separates thousands so a large count can be read at a glance", () => {
    expect(formatMatchCount(1340)).toBe("1,340");
    expect(formatMatchCount(42)).toBe("42");
  });
});
