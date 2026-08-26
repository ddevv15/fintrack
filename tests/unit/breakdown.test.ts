import { describe, expect, it } from "vitest";

import { summariseMonth } from "@/lib/breakdown";
import type { CategoryColor, MonthSpendRow } from "@/lib/schema";

/**
 * Locks the summing and the ordering of spec 0005's breakdown.
 *
 * `summariseMonth` is pure, so the two things most likely to be subtly wrong
 * are provable without a backend, a browser, or a signed in account. The query
 * that feeds it is checked against the real database in the integration suite;
 * what is checked here is the arithmetic it wraps.
 */

const MONTH = "2026-08-01";

/** One row shaped exactly as the embedded query returns it. */
function row(
  id: string,
  name: string,
  amountMinor: number,
  color: CategoryColor = "slate",
): MonthSpendRow {
  return {
    amount_minor: amountMinor,
    categories: { id, name, color },
  };
}

describe("summariseMonth", () => {
  it("totals the month exactly", () => {
    const { totalMinor } = summariseMonth(MONTH, [
      row("a", "Groceries", 1250),
      row("b", "Transport", 375),
      row("a", "Groceries", 899),
    ]);

    expect(totalMinor).toBe(2524);
  });

  it("combines several entries in the same category into one row", () => {
    const { rows } = summariseMonth(MONTH, [
      row("a", "Groceries", 1000),
      row("a", "Groceries", 500),
      row("b", "Transport", 400),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Groceries", amountMinor: 1500 });
    expect(rows[1]).toMatchObject({ name: "Transport", amountMinor: 400 });
  });

  it("puts the biggest category first", () => {
    const { rows } = summariseMonth(MONTH, [
      row("a", "Small", 100),
      row("b", "Biggest", 900),
      row("c", "Middle", 500),
    ]);

    expect(rows.map((share) => share.name)).toEqual([
      "Biggest",
      "Middle",
      "Small",
    ]);
  });

  it("breaks a tie by name, so two loads of the same data agree", () => {
    // Identical amounts, inserted in reverse alphabetical order. Without the
    // name comparison the order would be whatever the Map happened to hold,
    // and the screen would reshuffle between loads.
    const { rows } = summariseMonth(MONTH, [
      row("c", "Zebra", 500),
      row("a", "Apples", 500),
      row("b", "Mangoes", 500),
    ]);

    expect(rows.map((share) => share.name)).toEqual([
      "Apples",
      "Mangoes",
      "Zebra",
    ]);
  });

  it("gives the same order however the rows arrive", () => {
    const first = summariseMonth(MONTH, [
      row("a", "Apples", 500),
      row("b", "Mangoes", 500),
    ]);
    const second = summariseMonth(MONTH, [
      row("b", "Mangoes", 500),
      row("a", "Apples", 500),
    ]);

    expect(first.rows.map((share) => share.categoryId)).toEqual(
      second.rows.map((share) => share.categoryId),
    );
  });

  it("splits the month into shares that add to exactly 100", () => {
    const { rows } = summariseMonth(MONTH, [
      row("a", "One", 1),
      row("b", "Two", 1),
      row("c", "Three", 1),
    ]);

    expect(rows.reduce((sum, share) => sum + share.percent, 0)).toBe(100);
  });

  it("gives the spare rounding point to the row it ranks first", () => {
    // The ranking and the rounding follow the same comparison, so a row can
    // never show a share that its own position contradicts.
    const { rows } = summariseMonth(MONTH, [
      row("a", "Apples", 1),
      row("b", "Mangoes", 1),
      row("c", "Zebra", 1),
    ]);

    expect(rows[0]).toMatchObject({ name: "Apples", percent: 34 });
    expect(rows[1].percent).toBe(33);
    expect(rows[2].percent).toBe(33);
  });

  it("keeps the total equal to the sum of the rows it shows", () => {
    const { totalMinor, rows } = summariseMonth(MONTH, [
      row("a", "Groceries", 1250),
      row("b", "Transport", 375),
      row("c", "Health", 4021),
      row("a", "Groceries", 899),
    ]);

    expect(rows.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(
      totalMinor,
    );
  });

  it("carries the category's colour through to the row", () => {
    const { rows } = summariseMonth(MONTH, [
      row("a", "Groceries", 1000, "green"),
    ]);

    expect(rows[0].color).toBe("green");
  });

  it("reports an empty month as empty rather than as a zero result", () => {
    const { totalMinor, rows } = summariseMonth(MONTH, []);

    expect(rows).toEqual([]);
    expect(totalMinor).toBe(0);
  });

  it("carries the month through, since it is what the heading reads", () => {
    expect(summariseMonth(MONTH, []).month).toBe(MONTH);
  });

  it("stays exact on amounts large enough to drift as decimals", () => {
    // Whole minor units are exact under addition; the same figures as major
    // unit decimals would not be.
    const { totalMinor } = summariseMonth(MONTH, [
      row("a", "One", 10),
      row("b", "Two", 20),
      row("c", "Three", 1_000_000_01),
    ]);

    expect(totalMinor).toBe(100_000_031);
  });
});
