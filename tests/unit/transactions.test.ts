import { describe, expect, it } from "vitest";

import { currentSpendMonth } from "@/lib/month";
import { formatAmountInput, parseAmount } from "@/lib/money";
import type { CategoryColor, MonthTransactionRow } from "@/lib/schema";
import { summariseTransactions } from "@/lib/transactions";

/**
 * Locks the summing, the ordering, and the amount round trip of spec 0007.
 *
 * `summariseTransactions` is pure, so the part most worth proving is provable
 * without a backend, a browser, or a signed in account. The query that feeds it
 * is checked against the real database in the browser suite; what is checked
 * here is what it does with what arrives.
 *
 * covers: AC-1, AC-3, AC-10, AC-12
 */

const MONTH = "2026-08-01";

/** One row shaped exactly as the list query returns it. */
function row(
  id: string,
  occurredOn: string,
  amountMinor: number,
  name = "Groceries",
  color: CategoryColor = "slate",
): MonthTransactionRow {
  return {
    id,
    amount_minor: amountMinor,
    occurred_on: occurredOn,
    note: undefined,
    categories: { id: `cat-${name}`, name, color },
  };
}

describe("summariseTransactions", () => {
  it("totals the month exactly", () => {
    const { totalMinor } = summariseTransactions(MONTH, [
      row("a", "2026-08-19", 1250),
      row("b", "2026-08-18", 375),
      row("c", "2026-08-02", 899),
    ]);

    expect(totalMinor).toBe(2524);
  });

  it("totals from exactly the rows it returns, and no others", () => {
    // The invariant behind AC-3: the figure above the list and the figures in
    // it come from one pass over one array, so they cannot disagree. Adding
    // the returned rows back up has to reproduce the total.
    const summary = summariseTransactions(MONTH, [
      row("a", "2026-08-19", 1250),
      row("b", "2026-08-18", 375),
    ]);

    const addedUp = summary.rows.reduce(
      (running, entry) => running + entry.amountMinor,
      0,
    );

    expect(addedUp).toBe(summary.totalMinor);
    expect(summary.rows).toHaveLength(2);
  });

  it("leaves the order exactly as the database gave it", () => {
    // AC-1 puts the ordering in the database, through the index spec 0002
    // built. Re-sorting here would duplicate that rule in a second place, and
    // this is what would fail if somebody did.
    const rows = [
      row("newest", "2026-08-19", 100),
      row("same-day-older", "2026-08-19", 200),
      row("oldest", "2026-08-01", 300),
    ];

    expect(summariseTransactions(MONTH, rows).rows.map((e) => e.id)).toEqual([
      "newest",
      "same-day-older",
      "oldest",
    ]);
  });

  it("shows no total for a month with nothing in it", () => {
    // Zero here is arithmetic, not a claim: the screen renders no total at all
    // for an empty month (AC-6), because "you spent nothing" and "you have
    // logged nothing" are different sentences.
    const summary = summariseTransactions(MONTH, []);

    expect(summary.rows).toEqual([]);
    expect(summary.totalMinor).toBe(0);
  });

  it("carries the note through, absent when there is none", () => {
    const withNote: MonthTransactionRow = {
      ...row("a", "2026-08-19", 100),
      note: "Weekly shop",
    };

    const summary = summariseTransactions(MONTH, [
      withNote,
      row("b", "2026-08-18", 100),
    ]);

    expect(summary.rows[0].note).toBe("Weekly shop");
    expect(summary.rows[1].note).toBeUndefined();
  });
});

describe("currentSpendMonth", () => {
  it("takes the month from the given zone, not the machine's", () => {
    // The last evening of a month is the case this exists for: 23:30 on the
    // 31st in New York is already the 1st in London, and the two must land in
    // different months.
    const instant = new Date("2026-08-01T03:30:00Z");

    expect(currentSpendMonth(instant, "America/New_York")).toEqual({
      month: "2026-07-01",
      start: "2026-07-01",
      endExclusive: "2026-08-01",
    });

    expect(currentSpendMonth(instant, "Europe/London")).toEqual({
      month: "2026-08-01",
      start: "2026-08-01",
      endExclusive: "2026-09-01",
    });
  });

  it("gives a half open range, so the last day is in and the next is out", () => {
    const window = currentSpendMonth(new Date("2026-02-15T12:00:00Z"), "UTC");

    expect(window.start).toBe("2026-02-01");
    // February 2026 has 28 days, so the 28th is inside and the 1st of March is
    // the first day that is not. An inclusive end is the classic off by one.
    expect("2026-02-28" >= window.start).toBe(true);
    expect("2026-02-28" < window.endExclusive).toBe(true);
    expect("2026-03-01" < window.endExclusive).toBe(false);
  });
});

describe("formatAmountInput", () => {
  it("renders the stored integer as plain text with no glyph", () => {
    expect(formatAmountInput(1250, "USD")).toBe("12.50");
    expect(formatAmountInput(5, "USD")).toBe("0.05");
    expect(formatAmountInput(100000, "USD")).toBe("1000.00");
  });

  it("follows the currency rather than assuming two decimal places", () => {
    // The yen has none and the Kuwaiti dinar has three, and both come from
    // lib/currency.ts rather than from Intl or a hardcoded hundred.
    expect(formatAmountInput(500, "JPY")).toBe("500");
    expect(formatAmountInput(500, "KWD")).toBe("0.500");
    expect(formatAmountInput(1234, "KWD")).toBe("1.234");
  });

  it("round trips through parseAmount on every currency shape", () => {
    /*
     * The guarantee behind AC-12, and the reason this function splits digits
     * rather than dividing. Opening an entry and saving it unchanged must store
     * the integer it started with. Anything that goes through a float can be
     * off by one minor unit on some values and right on all the ones you would
     * think to try by hand.
     */
    const currencies = [
      { code: "JPY", decimals: 0 },
      { code: "USD", decimals: 2 },
      { code: "KWD", decimals: 3 },
    ] as const;

    for (const { code, decimals } of currencies) {
      for (const minor of [1, 5, 7, 99, 100, 829, 1005, 123456, 999999999]) {
        const text = formatAmountInput(minor, code);
        const parsed = parseAmount(text, decimals);

        expect(parsed, `${code} ${minor} rendered as ${text}`).toEqual({
          ok: true,
          minor,
        });
      }
    }
  });

  it("refuses anything that is not whole, non negative minor units", () => {
    expect(() => formatAmountInput(12.5, "USD")).toThrow(/whole/);
    expect(() => formatAmountInput(-100, "USD")).toThrow(/non negative/);
  });
});
