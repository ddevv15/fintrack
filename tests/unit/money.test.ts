import { describe, expect, it } from "vitest";

import { currencySymbol, formatAmount } from "@/lib/money";

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
