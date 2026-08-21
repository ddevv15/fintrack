import { describe, expect, it } from "vitest";

import {
  categorySchema,
  parseRow,
  parseRows,
  profileSchema,
  transactionInsertSchema,
  transactionSchema,
} from "@/lib/schema";

/**
 * Offline checks on the schemas in lib/schema.ts. No network and no database:
 * whether the live tables still match these shapes is a different question,
 * answered by tests/integration/schema-drift.
 */

const category = {
  id: "8f14e45f-ceea-467a-9e69-1f2b0e1a4c11",
  user_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  name: "Groceries",
  kind: "spend",
  color: "green",
  is_hidden: false,
  created_at: "2026-08-19T10:00:00.000Z",
  updated_at: "2026-08-19T10:00:00.000Z",
};

const transaction = {
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  user_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  category_id: category.id,
  direction: "spend",
  amount_minor: 1299,
  occurred_on: "2026-08-19",
  merchant: "Test Mart",
  note: "weekly shop",
  created_at: "2026-08-19T10:00:00.000Z",
  updated_at: "2026-08-19T10:00:00.000Z",
};

describe("categories", () => {
  it("accepts a well formed row", () => {
    expect(categorySchema.parse(category).name).toBe("Groceries");
  });

  it("rejects a colour outside the ten tokens", () => {
    // The CHECK constraint in the migration allows exactly ten names. A
    // hex value is the mistake to catch: appearance is feature 4's, not data.
    expect(() =>
      categorySchema.parse({ ...category, color: "#22c55e" }),
    ).toThrow();
  });

  it("rejects a name longer than the column allows", () => {
    expect(() =>
      categorySchema.parse({ ...category, name: "x".repeat(61) }),
    ).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => categorySchema.parse({ ...category, name: "" })).toThrow();
  });
});

describe("transactions", () => {
  it("accepts a well formed row", () => {
    expect(transactionSchema.parse(transaction).amount_minor).toBe(1299);
  });

  it("rejects zero and negative amounts", () => {
    // Direction carries the sign, so a non positive amount is always a bug.
    expect(() =>
      transactionSchema.parse({ ...transaction, amount_minor: 0 }),
    ).toThrow();
    expect(() =>
      transactionSchema.parse({ ...transaction, amount_minor: -500 }),
    ).toThrow();
  });

  it("rejects a fractional amount, because minor units are whole", () => {
    expect(() =>
      transactionSchema.parse({ ...transaction, amount_minor: 12.99 }),
    ).toThrow();
  });

  it("rejects an amount past the safe integer limit", () => {
    // Beyond 2^53 a JavaScript number stops being exact without saying so.
    expect(() =>
      transactionSchema.parse({
        ...transaction,
        amount_minor: Number.MAX_SAFE_INTEGER + 2,
      }),
    ).toThrow();
  });

  it("normalises a bigint sent as a string", () => {
    const parsed = transactionSchema.parse({
      ...transaction,
      amount_minor: "1299",
    });
    expect(parsed.amount_minor).toBe(1299);
  });

  it("rejects a note longer than the column allows", () => {
    expect(() =>
      transactionSchema.parse({ ...transaction, note: "x".repeat(501) }),
    ).toThrow();
  });

  it("rejects a merchant longer than the column allows", () => {
    expect(() =>
      transactionSchema.parse({ ...transaction, merchant: "x".repeat(201) }),
    ).toThrow();
  });

  it("turns a SQL NULL into undefined, never null", () => {
    const parsed = transactionSchema.parse({
      ...transaction,
      merchant: null,
      note: null,
    });
    expect(parsed.merchant).toBeUndefined();
    expect(parsed.note).toBeUndefined();
    expect("merchant" in parsed && parsed.merchant === null).toBe(false);
  });

  it("rejects a day that does not exist on the calendar", () => {
    // Date.parse rolls these forward instead of failing: "2026-02-30" becomes
    // the 2nd of March. Without a component check they reach Postgres, and the
    // field level error this schema exists to give never fires.
    for (const day of [
      "2026-02-30",
      "2026-04-31",
      "2026-02-29",
      "2026-06-31",
    ]) {
      expect(() =>
        transactionSchema.parse({ ...transaction, occurred_on: day }),
      ).toThrow();
    }
  });

  it("rejects an impossible month or day number", () => {
    for (const day of [
      "2026-13-01",
      "2026-00-10",
      "2026-08-00",
      "2026-08-32",
    ]) {
      expect(() =>
        transactionSchema.parse({ ...transaction, occurred_on: day }),
      ).toThrow();
    }
  });

  it("accepts a real leap day", () => {
    // 2024 is a leap year, so this one must survive the stricter check.
    expect(
      transactionSchema.parse({ ...transaction, occurred_on: "2024-02-29" })
        .occurred_on,
    ).toBe("2024-02-29");
  });

  it("accepts the ordinary boundaries of a month", () => {
    for (const day of [
      "2026-01-01",
      "2026-12-31",
      "2026-02-28",
      "2026-04-30",
    ]) {
      expect(
        transactionSchema.parse({ ...transaction, occurred_on: day })
          .occurred_on,
      ).toBe(day);
    }
  });

  it("rejects a date that is not a plain calendar day", () => {
    expect(() =>
      transactionSchema.parse({
        ...transaction,
        occurred_on: "2026-08-19T00:00:00Z",
      }),
    ).toThrow();
    expect(() =>
      transactionSchema.parse({ ...transaction, occurred_on: "19-08-2026" }),
    ).toThrow();
  });

  it("requires occurred_on when logging, since the column has no default", () => {
    const withoutDay: Record<string, unknown> = { ...transaction };
    delete withoutDay.occurred_on;
    expect(() => transactionInsertSchema.parse(withoutDay)).toThrow();
  });

  it("does not let the app name an owner when logging", () => {
    // user_id is filled by the database from auth.uid(), so it is not an input.
    const parsed = transactionInsertSchema.parse({
      category_id: category.id,
      direction: "spend",
      amount_minor: 500,
      occurred_on: "2026-08-19",
      user_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    });
    expect("user_id" in parsed).toBe(false);
  });
});

describe("parseRow", () => {
  it("names the table and the offending field when a row does not match", () => {
    expect(() =>
      parseRow(transactionSchema, "transactions", {
        ...transaction,
        amount_minor: -1,
      }),
    ).toThrow(/transactions[\s\S]*amount_minor/);
  });

  it("says the schema and the migration have drifted", () => {
    const missingColumn: Record<string, unknown> = { ...category };
    delete missingColumn.color;
    expect(() => parseRow(categorySchema, "categories", missingColumn)).toThrow(
      /drifted/,
    );
  });

  it("refuses a result set that is not an array", () => {
    expect(() =>
      parseRows(profileSchema, "profiles", { user_id: "x" }),
    ).toThrow(/Expected an array/);
  });
});
