import { describe, expect, it } from "vitest";

import { currencySymbol, formatAmount, percentShares } from "@/lib/money";

/**
 * Locks rule 1 of spec 0001, as spec 0004 corrects it: amounts are whole minor
 * units, and this module is the only place an amount is ever divided. Currency
 * is passed explicitly here so the tests never depend on APP_CURRENCY.
 */
describe("formatAmount", () => {
  it("puts the decimal point in the right place", () => {
    expect(formatAmount(1250, "USD")).toBe("$12.50");
  });

  it("does not mistake a few minor units for whole ones", () => {
    expect(formatAmount(5, "USD")).toBe("$0.05");
    expect(formatAmount(50, "USD")).toBe("$0.50");
  });

  it("renders zero as money rather than as nothing", () => {
    expect(formatAmount(0, "USD")).toBe("$0.00");
  });

  it("keeps a negative amount negative", () => {
    expect(formatAmount(-1250, "USD")).toBe("-$12.50");
  });

  it("stays exact at an amount that binary floating point would drift on", () => {
    // 0.1 + 0.2 !== 0.3 as decimals; as 10 + 20 === 30 minor units it is exact.
    expect(formatAmount(10 + 20, "USD")).toBe("$0.30");
  });

  it("stays exact on a large balance", () => {
    expect(formatAmount(123456789, "USD")).toBe("$1,234,567.89");
  });

  it("honours the currency it is given", () => {
    expect(formatAmount(1250, "EUR", "en-US")).toBe("€12.50");
  });

  it("reads the decimal count from the currency, not from a hundred", () => {
    // The single stored integer 500, in three currencies with three different
    // minor unit exponents. This is AC-10, and it is the reason the whole
    // rename happened: dividing by a hundred makes the first of these ¥5.
    expect(formatAmount(500, "JPY", "en-US")).toBe("¥500");
    expect(formatAmount(500, "USD", "en-US")).toBe("$5.00");
    expect(formatAmount(500, "KWD", "en-US")).toBe("KWD\u00a00.500");
  });

  it("keeps a zero decimal currency free of a decimal point", () => {
    expect(formatAmount(1250, "JPY", "en-US")).toBe("¥1,250");
    expect(formatAmount(1250, "KRW", "en-US")).toBe("₩1,250");
  });

  it("refuses a currency it does not support rather than assuming two", () => {
    // Guessing two here is exactly how a yen amount ends up a hundred times
    // too small, so an unsupported code is an error and not a default.
    expect(() => formatAmount(500, "XYZ")).toThrow(/not a supported currency/);
  });

  it("refuses a fraction of a minor unit instead of quietly rounding it", () => {
    expect(() => formatAmount(12.5, "USD")).toThrow(/whole minor units/);
  });

  it("refuses a value too large to hold exactly", () => {
    expect(() => formatAmount(Number.MAX_SAFE_INTEGER + 2, "USD")).toThrow(
      /whole minor units/,
    );
  });

  it("refuses NaN rather than rendering it as an amount", () => {
    expect(() => formatAmount(Number.NaN, "USD")).toThrow(/whole minor units/);
  });
});

describe("currencySymbol", () => {
  it("returns the glyph rather than the three letter code", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("EUR")).toBe("€");
    expect(currencySymbol("GBP")).toBe("£");
  });

  it("follows the locale, since the same currency is written differently", () => {
    expect(currencySymbol("USD", "en-US")).toBe("$");
    expect(currencySymbol("USD", "en-CA")).toBe("US$");
  });

  it("never yields a digit or an empty string, whatever the currency", () => {
    // This is the real contract. The exact text for a currency with no common
    // glyph is ICU's call and changes between Node releases, so asserting it
    // would break on an upgrade without anything being wrong.
    for (const code of ["USD", "EUR", "JPY", "XPF", "KWD", "INR"]) {
      const symbol = currencySymbol(code, "en-US");

      expect(symbol).not.toBe("");
      expect(symbol).not.toMatch(/\d/);
    }
  });
});

/**
 * Locks AC-4 of spec 0005: the shares shown against a month add to exactly 100.
 *
 * The rounding is one of the two things in the breakdown most likely to be
 * subtly wrong (the ordering is the other), which is why it lives in a pure
 * function and is tested here rather than through a rendered screen.
 */
describe("percentShares", () => {
  it("gives a single category the whole month", () => {
    expect(percentShares([4200], 4200)).toEqual([100]);
  });

  it("adds to 100 where naive rounding would add to 99", () => {
    // Three equal thirds floor to 33 each, which is 99. The largest remainder
    // method hands the spare point out rather than losing it.
    expect(percentShares([1, 1, 1], 3)).toEqual([34, 33, 33]);
  });

  it("gives a tied spare point to the row that sorts first", () => {
    // All three remainders are identical, so the rule that decides is position,
    // not chance. The caller sorts before calling, so first here means the
    // biggest category, and the ranking and the rounding cannot disagree.
    const [first, ...rest] = percentShares([1, 1, 1], 3);
    expect(first).toBe(34);
    expect(rest).toEqual([33, 33]);
  });

  it("adds to 100 when every share needs rounding", () => {
    const shares = percentShares([1, 1, 1, 1, 1, 1, 1], 7);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
    // Two spare points, both landing on the earliest rows.
    expect(shares).toEqual([15, 15, 14, 14, 14, 14, 14]);
  });

  it("reports a share under half a percent as zero rather than rounding it up", () => {
    // 0.01% is real spending and still rounds to nothing. Zero is the honest
    // number; the row renders it as "<1%" so it never reads as a bug. Forcing
    // it to 1 would have to take that point from the 99.99% category.
    expect(percentShares([9999, 1], 10000)).toEqual([100, 0]);
  });

  it("still adds to 100 when a category rounds away entirely", () => {
    const shares = percentShares([9999, 1], 10000);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100);
  });

  it("has no shares to give for no categories", () => {
    expect(percentShares([], 0)).toEqual([]);
  });

  it("refuses a total that is not the sum of its own amounts", () => {
    // This means the caller totalled one set of rows and split another. A
    // column of shares against the wrong total is exactly the confidently wrong
    // figure rule 3 of AGENTS.md exists to prevent.
    expect(() => percentShares([100, 200], 400)).toThrow(/sum of their own/);
  });

  it("refuses an amount that is not whole minor units", () => {
    expect(() => percentShares([10.5, 89.5], 100)).toThrow(/whole/);
  });

  it("refuses to split a total of nothing", () => {
    expect(() => percentShares([0, 0], 0)).toThrow(/total of zero/);
  });
});
