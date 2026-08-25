/**
 * The currencies FinTrack supports, and how many decimal places each one has.
 *
 * This list is the app's copy of `public.currencies`. Both exist on purpose:
 * the database holds it so it can refuse a code the app made up, and this file
 * holds it so the sign up form renders without a round trip and so TypeScript
 * knows the codes. `tests/integration/schema-drift` fails if the two ever
 * disagree on a code or a decimal count.
 *
 * The decimal count deliberately does not come from `Intl`. Intl answers from
 * whatever ICU version the runtime happens to ship, so a server and a browser
 * can disagree about the yen and render an amount a hundred times off. It is
 * also not stored on the profile: the exponent is a fact about the currency,
 * not about the person.
 */

export type Currency = {
  /** ISO 4217 alphabetic code, three uppercase letters. */
  readonly code: string;
  /** The minor unit exponent: 2 for a dollar, 0 for a yen, 3 for a dinar. */
  readonly decimals: number;
  /** The label shown in the picker. */
  readonly name: string;
};

/**
 * The twenty supported currencies, in the order the picker shows them.
 *
 * Two zero decimal currencies and one three decimal currency are in the list
 * deliberately, so the exponent path is reachable by a real choice rather than
 * only by a test.
 */
export const CURRENCIES = [
  { code: "USD", decimals: 2, name: "US dollar" },
  { code: "EUR", decimals: 2, name: "Euro" },
  { code: "GBP", decimals: 2, name: "British pound" },
  { code: "INR", decimals: 2, name: "Indian rupee" },
  { code: "JPY", decimals: 0, name: "Japanese yen" },
  { code: "CNY", decimals: 2, name: "Chinese yuan" },
  { code: "AUD", decimals: 2, name: "Australian dollar" },
  { code: "CAD", decimals: 2, name: "Canadian dollar" },
  { code: "CHF", decimals: 2, name: "Swiss franc" },
  { code: "SGD", decimals: 2, name: "Singapore dollar" },
  { code: "HKD", decimals: 2, name: "Hong Kong dollar" },
  { code: "NZD", decimals: 2, name: "New Zealand dollar" },
  { code: "SEK", decimals: 2, name: "Swedish krona" },
  { code: "NOK", decimals: 2, name: "Norwegian krone" },
  { code: "DKK", decimals: 2, name: "Danish krone" },
  { code: "ZAR", decimals: 2, name: "South African rand" },
  { code: "AED", decimals: 2, name: "UAE dirham" },
  { code: "SAR", decimals: 2, name: "Saudi riyal" },
  { code: "KRW", decimals: 0, name: "South Korean won" },
  { code: "KWD", decimals: 3, name: "Kuwaiti dinar" },
] as const satisfies readonly Currency[];

/** A supported currency code, narrowed to the twenty in the list above. */
export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const byCode = new Map<string, Currency>(
  CURRENCIES.map((currency) => [currency.code, currency]),
);

/**
 * The supported currencies, for a picker.
 *
 * Reads this file and never queries, so a form renders with no database round
 * trip. The database's copy is the guard, not the source for a screen.
 */
export function listCurrencies(): readonly Currency[] {
  return CURRENCIES;
}

/** Whether a string is one of the supported codes, as a type guard. */
export function isCurrencyCode(code: string): code is CurrencyCode {
  return byCode.has(code);
}

/**
 * How many decimal places this currency has.
 *
 * Throws on an unknown code rather than assuming two. Rule 3 of `AGENTS.md`:
 * an honest error beats a confidently wrong money figure, and guessing two here
 * is exactly how a yen amount ends up a hundred times too small.
 */
export function decimalsFor(code: string): number {
  const currency = byCode.get(code);
  if (!currency) {
    throw new Error(
      `${code} is not a supported currency. See lib/currency.ts and the currencies table.`,
    );
  }
  return currency.decimals;
}

/** The human readable name for a code, for a screen that shows the choice. */
export function currencyName(code: string): string {
  const currency = byCode.get(code);
  if (!currency) {
    throw new Error(`${code} is not a supported currency.`);
  }
  return currency.name;
}
