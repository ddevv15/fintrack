import { describe, expect, it } from "vitest";

import {
  CURRENCIES,
  currencyName,
  decimalsFor,
  isCurrencyCode,
  listCurrencies,
} from "@/lib/currency";

/**
 * The currency list every picker reads and every amount is measured against.
 *
 * The decimal count is the part worth guarding. It is the difference between
 * the stored integer 500 rendering as `¥500` and as `¥5`, and the failure is
 * silent: a wrong exponent produces a plausible looking number, not an error.
 * The integration suite proves this file agrees with the `currencies` table;
 * these tests prove the file is internally coherent and refuses what it does
 * not know.
 *
 * covers: AC-9, AC-10, AC-11
 */

describe("the list itself", () => {
  it("has no duplicate codes", async () => {
    const codes = CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("gives every currency a code, a name, and a decimal count", () => {
    for (const currency of CURRENCIES) {
      expect(currency.code, `${currency.code} code shape`).toMatch(
        /^[A-Z]{3}$/,
      );
      expect(currency.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(currency.decimals)).toBe(true);
    }
  });

  it("keeps every decimal count to one a real currency uses", () => {
    // ISO 4217 minor unit exponents in circulation are 0, 2, and 3. A 1 or a 4
    // here would be a typo that renders every amount in that currency wrongly.
    for (const currency of CURRENCIES) {
      expect([0, 2, 3], `${currency.code} exponent`).toContain(
        currency.decimals,
      );
    }
  });

  it("is what listCurrencies hands to a picker, with no query", () => {
    expect(listCurrencies()).toEqual(CURRENCIES);
  });
});

describe("decimalsFor", () => {
  it("gives a zero decimal currency none", () => {
    expect(decimalsFor("JPY")).toBe(0);
    expect(decimalsFor("KRW")).toBe(0);
  });

  it("gives an ordinary currency two", () => {
    expect(decimalsFor("USD")).toBe(2);
    expect(decimalsFor("INR")).toBe(2);
  });

  it("gives a three decimal currency three", () => {
    expect(decimalsFor("KWD")).toBe(3);
  });

  it("throws on an unknown code rather than assuming two", () => {
    // Assuming two is how a yen amount ends up a hundred times too small.
    expect(() => decimalsFor("ZZZ")).toThrow(/not a supported currency/i);
  });

  it("is case sensitive, so a lowercase code is refused rather than guessed", () => {
    expect(() => decimalsFor("usd")).toThrow();
  });
});

describe("isCurrencyCode", () => {
  it("accepts a supported code", () => {
    expect(isCurrencyCode("USD")).toBe(true);
  });

  it("rejects an unsupported one, an empty string, and the wrong case", () => {
    expect(isCurrencyCode("ZZZ")).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
    expect(isCurrencyCode("usd")).toBe(false);
  });
});

describe("currencyName", () => {
  it("names a supported code", () => {
    expect(currencyName("JPY").length).toBeGreaterThan(0);
  });

  it("throws on an unknown code", () => {
    expect(() => currencyName("ZZZ")).toThrow(/not a supported currency/i);
  });
});
