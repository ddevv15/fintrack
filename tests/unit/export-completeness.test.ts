import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What `loadAllTransactions()` says when the rows it built disagree with the
 * count the database reported.
 *
 * The comparison has always had two directions and the message had one, so a
 * set that came back long was announced as "missing entries", which sends
 * somebody hunting for a row that was never lost. Long is not a hypothetical:
 * the count is its own query taken before paging starts, so an entry saved
 * elsewhere mid export is absent from `matched`, and a backdated one sorts
 * below the keyset cursor and arrives on a later page.
 *
 * Both directions still refuse. What is asserted here is that each one refuses
 * in its own words, because rule 3 of `AGENTS.md` asks for an honest error and
 * an error naming the wrong failure is not one.
 *
 * covers: AC-11, AC-12 of spec 0010
 */

const h = vi.hoisted(() => ({ readTransactionRange: vi.fn() }));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/month", () => ({
  readTransactionRange: h.readTransactionRange,
}));

vi.mock("@/lib/insforge-server", () => ({
  createInsforgeServer: async () => ({}),
}));

/** One valid export row, distinct per call so nothing collides on id. */
const row = (n: number) => ({
  id: `id-${String(n).padStart(6, "0")}`,
  category_id: null,
  direction: "spend",
  amount_minor: 100,
  occurred_on: "2026-08-01",
  merchant: null,
  note: null,
  created_at: "2026-08-01T00:00:00.000Z",
  categories: null,
});

/**
 * Script the reads: the count first, in its own call, then one page per size.
 * `EXPORT_PAGE_SIZE` is 1000, so a first page of 1000 is a full one and the
 * loop asks again, which is where a concurrent write gets to land.
 */
const scriptReads = (matched: number, ...pageSizes: number[]) => {
  let call = 0;
  let made = 0;

  h.readTransactionRange.mockImplementation(async () => {
    call += 1;
    if (call === 1) return { rows: [], matched };

    const size = pageSizes[call - 2] ?? 0;
    return { rows: Array.from({ length: size }, () => row(made++)), matched };
  });
};

describe("loadAllTransactions completeness", () => {
  beforeEach(() => {
    h.readTransactionRange.mockReset();
  });

  it("names a long set as long, not as missing entries", async () => {
    const { loadAllTransactions } = await import("@/lib/export");

    // A backdated entry saved on another device between the two pages.
    scriptReads(1500, 1000, 501);

    const error = await loadAllTransactions().catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;

    expect(message).toMatch(
      /came back long: 1501 rows for a reported count of 1500/,
    );
    expect(message).not.toMatch(/missing entries|came back short/);
  });

  it("still names a short set as short", async () => {
    const { loadAllTransactions } = await import("@/lib/export");

    scriptReads(1500, 1000, 499, 0);

    await expect(loadAllTransactions()).rejects.toThrow(
      /came back short: 1499 rows for a reported count of 1500.*missing entries/,
    );
  });

  it("hands over a set that matches its count", async () => {
    const { loadAllTransactions } = await import("@/lib/export");

    scriptReads(1500, 1000, 500);

    const load = await loadAllTransactions();
    expect(load.ok).toBe(true);
    expect(load.ok && load.rows).toHaveLength(1500);
  });
});
