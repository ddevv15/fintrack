import { describe, expect, it } from "vitest";

import {
  currencySymbol,
  formatAmount,
  parseAmount,
  percentShares,
} from "@/lib/money";

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

/**
 * Locks the decision in spec 0006: a typed amount becomes minor units by
 * string manipulation, and anything the currency cannot hold exactly is
 * refused rather than quietly rounded.
 *
 * The exhaustive test below is the one that matters. It is not thoroughness
 * for its own sake: the implementation this replaces would have passed a
 * handful of hand picked cases and failed on 271 of these 2000.
 */
describe("parseAmount", () => {
  it("reads an ordinary amount exactly", () => {
    expect(parseAmount("12.50", 2)).toEqual({ ok: true, minor: 1250 });
    expect(parseAmount("0.99", 2)).toEqual({ ok: true, minor: 99 });
    expect(parseAmount("12", 2)).toEqual({ ok: true, minor: 1200 });
  });

  it("is exact where multiplying is not", () => {
    // 8.29 * 100 is 828.9999999999999 in binary floating point. This is 829.
    expect(parseAmount("8.29", 2)).toEqual({ ok: true, minor: 829 });
    expect(parseAmount("0.29", 2)).toEqual({ ok: true, minor: 29 });
    expect(parseAmount("0.07", 2)).toEqual({ ok: true, minor: 7 });
  });

  it("round trips every cent from 0.01 to 20.00 without drifting once", () => {
    for (let expected = 1; expected <= 2000; expected++) {
      const typed = (expected / 100).toFixed(2);
      expect(parseAmount(typed, 2)).toEqual({ ok: true, minor: expected });
    }
  });

  it("survives the round trip back through formatAmount", () => {
    for (let expected = 1; expected <= 2000; expected++) {
      const typed = (expected / 100).toFixed(2);
      const parsed = parseAmount(typed, 2);
      if (!parsed.ok) throw new Error(`${typed} was refused`);
      expect(formatAmount(parsed.minor, "USD")).toBe(`$${typed}`);
    }
  });

  it("accepts a leading dot and leading zeros", () => {
    expect(parseAmount(".99", 2)).toEqual({ ok: true, minor: 99 });
    expect(parseAmount(".5", 2)).toEqual({ ok: true, minor: 50 });
    expect(parseAmount("007", 2)).toEqual({ ok: true, minor: 700 });
  });

  it("trims surrounding whitespace", () => {
    expect(parseAmount("  12.50  ", 2)).toEqual({ ok: true, minor: 1250 });
  });

  it("uses the currency's own decimal count, not a hardcoded two", () => {
    // Yen has no minor unit at all.
    expect(parseAmount("500", 0)).toEqual({ ok: true, minor: 500 });
    // The Kuwaiti dinar has three, and 1.005 is where rounding a float fails.
    expect(parseAmount("1.005", 3)).toEqual({ ok: true, minor: 1005 });
    expect(parseAmount("12.5", 3)).toEqual({ ok: true, minor: 12500 });
  });

  it("refuses more decimal places than the currency has, naming the limit", () => {
    const dollars = parseAmount("12.567", 2);
    expect(dollars.ok).toBe(false);
    if (!dollars.ok) expect(dollars.reason).toContain("2 decimal places");

    const yen = parseAmount("500.5", 0);
    expect(yen.ok).toBe(false);
    if (!yen.ok) expect(yen.reason).toContain("no decimal places");
  });

  it("counts digits typed rather than their value, so 500.00 is refused on yen", () => {
    expect(parseAmount("500.00", 0).ok).toBe(false);
  });

  it("refuses every shape that is not digits with at most one dot", () => {
    for (const typed of [
      "1,234.50",
      "$12",
      "12,50",
      "12.5.6",
      "12 50",
      "-5",
      "abc",
      "12.",
      ".",
      "",
      "   ",
      "1e3",
      "Infinity",
    ]) {
      expect(parseAmount(typed, 2).ok, `${typed} should be refused`).toBe(
        false,
      );
    }
  });

  it("refuses zero however it is typed", () => {
    expect(parseAmount("0", 2).ok).toBe(false);
    expect(parseAmount("0.00", 2).ok).toBe(false);
    expect(parseAmount("000", 2).ok).toBe(false);
    expect(parseAmount(".00", 2).ok).toBe(false);
  });

  it("refuses an amount past the exact integer range, before converting it", () => {
    // 16 significant digits: Number() would return this without complaint and
    // without being exact, which is why the check is on the digits.
    expect(parseAmount("99999999999999.99", 2).ok).toBe(false);
    // 15 is still fine, and is around 9 trillion dollars.
    expect(parseAmount("9999999999999.99", 2)).toEqual({
      ok: true,
      minor: 999999999999999,
    });
  });

  it("never returns a value formatAmount would refuse", () => {
    for (const typed of ["0.01", "9999999999999.99", ".5", "007"]) {
      const parsed = parseAmount(typed, 2);
      if (!parsed.ok) throw new Error(`${typed} was refused`);
      expect(() => formatAmount(parsed.minor, "USD")).not.toThrow();
    }
  });
});
