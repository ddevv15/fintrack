import { describe, expect, it } from "vitest";

import { currencySymbol, formatCents } from "@/lib/money";

/**
 * Locks rule 1 of spec 0001: amounts are whole cents, and this module is the
 * only place a cents value is ever divided. Currency is passed explicitly here
 * so the tests never depend on APP_CURRENCY being set.
 */
describe("formatCents", () => {
  it("puts the decimal point in the right place", () => {
    expect(formatCents(1250, "USD")).toBe("$12.50");
  });

  it("does not mistake a few cents for whole units", () => {
    expect(formatCents(5, "USD")).toBe("$0.05");
    expect(formatCents(50, "USD")).toBe("$0.50");
  });

  it("renders zero as money rather than as nothing", () => {
    expect(formatCents(0, "USD")).toBe("$0.00");
  });

  it("keeps a negative amount negative", () => {
    expect(formatCents(-1250, "USD")).toBe("-$12.50");
  });

  it("stays exact at an amount that binary floating point would drift on", () => {
    // 0.1 + 0.2 !== 0.3 as decimals; as 10 + 20 === 30 cents it is exact.
    expect(formatCents(10 + 20, "USD")).toBe("$0.30");
  });

  it("stays exact on a large balance", () => {
    expect(formatCents(123456789, "USD")).toBe("$1,234,567.89");
  });

  it("honours the currency it is given", () => {
    expect(formatCents(1250, "EUR", "en-US")).toBe("€12.50");
    expect(formatCents(1250, "JPY", "en-US")).toBe("¥13");
  });

  it("refuses a fractional cent instead of quietly rounding it", () => {
    expect(() => formatCents(12.5, "USD")).toThrow(/whole cents/);
  });

  it("refuses a value too large to hold exactly", () => {
    expect(() => formatCents(Number.MAX_SAFE_INTEGER + 2, "USD")).toThrow(
      /whole cents/,
    );
  });

  it("refuses NaN rather than rendering it as an amount", () => {
    expect(() => formatCents(Number.NaN, "USD")).toThrow(/whole cents/);
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
