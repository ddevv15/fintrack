import { describe, expect, it } from "vitest";

import { categorySchema } from "@/lib/schema";

import { assertOk, one, rows } from "../integration/fixtures";

/**
 * The guards every integration read and every teardown write goes through.
 *
 * These are worth testing on their own because of how they fail. The InsForge
 * SDK reports a refused query by setting `error` and leaving `data` undefined,
 * so code that reads only `data` cannot tell "returned nothing" from "did not
 * run". Most assertions in the row level security suite say something is
 * absent, which a query that never ran satisfies perfectly.
 *
 * Take the throw out of `rows` and all 24 integration tests still pass while
 * proving nothing. Nothing else in the suite would notice. That is what these
 * tests exist to stop.
 *
 * covers: the mechanism behind AC-7 and AC-10
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

describe("rows", () => {
  it("returns every row, parsed against its schema", () => {
    const parsed = rows(categorySchema, "categories", { data: [category] });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Groceries");
  });

  it("throws when the query failed, rather than reporting no rows", () => {
    // The whole point: a failed query must never look like an empty result.
    expect(() =>
      rows(categorySchema, "categories", {
        error: { code: "42703", message: "column does not exist" },
      }),
    ).toThrow(/Query on "categories" failed/);
  });

  it("names the failing table and includes the driver's own error", () => {
    expect(() =>
      rows(categorySchema, "categories", { error: { code: "42501" } }),
    ).toThrow(/42501/);
  });

  it("throws when a row no longer matches its schema", () => {
    const missingColour: Record<string, unknown> = { ...category };
    delete missingColour.color;
    expect(() =>
      rows(categorySchema, "categories", { data: [missingColour] }),
    ).toThrow(/drifted/);
  });

  it("treats an absent data field as no rows, not as a failure", () => {
    expect(rows(categorySchema, "categories", {})).toEqual([]);
  });

  it("prefers the query error over a parse error when both could apply", () => {
    // An error means the rows are meaningless; report why the query failed.
    expect(() =>
      rows(categorySchema, "categories", {
        error: { message: "denied" },
        data: [{ nonsense: true }],
      }),
    ).toThrow(/Query on "categories" failed/);
  });
});

describe("one", () => {
  it("returns the single row", () => {
    expect(one(categorySchema, "categories", { data: [category] }).id).toBe(
      category.id,
    );
  });

  it("throws when nothing came back, saying how many it saw", () => {
    expect(() => one(categorySchema, "categories", { data: [] })).toThrow(
      /Expected exactly one row from "categories", got 0/,
    );
  });

  it("throws when more than one came back", () => {
    expect(() =>
      one(categorySchema, "categories", { data: [category, category] }),
    ).toThrow(/got 2/);
  });

  it("propagates a query failure rather than reporting zero rows", () => {
    expect(() =>
      one(categorySchema, "categories", { error: { message: "denied" } }),
    ).toThrow(/Query on "categories" failed/);
  });
});

describe("assertOk", () => {
  it("is silent when the write succeeded", () => {
    expect(() => assertOk("Cleaning up", { data: [] })).not.toThrow();
  });

  it("throws when the write was refused, naming what was being done", () => {
    // Teardown is where this matters most: a swallowed delete leaves fixture
    // rows behind in a backend two accounts share, and the suite still passes.
    expect(() =>
      assertOk("Cleaning up category abc", {
        error: { code: "23503", message: "still referenced" },
      }),
    ).toThrow(/Cleaning up category abc failed/);
  });

  it("includes the driver's error so the cause is visible", () => {
    expect(() => assertOk("Cleaning up", { error: { code: "23503" } })).toThrow(
      /23503/,
    );
  });
});
