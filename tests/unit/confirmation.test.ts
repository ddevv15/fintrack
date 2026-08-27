import { beforeEach, describe, expect, it } from "vitest";

import {
  holdConfirmation,
  takeConfirmation,
} from "@/components/transactions/confirmation";

/**
 * The single use rule behind spec 0007 AC-13, proved where it is cheap.
 *
 * The confirmation an edit hands the list has to arrive exactly once. The first
 * implementation carried it in a cookie the proxy consumed, and it was measured
 * arriving 5 times out of 10, because two requests raced for it and only one of
 * them was the one on screen. It is handed over in the browser now, so the
 * property is a property of this module rather than of request timing, and that
 * is what makes it testable at all.
 *
 * covers: AC-13 of spec 0007
 */

beforeEach(() => {
  // Nothing carries between tests: take whatever an earlier one left.
  takeConfirmation();
});

describe("the confirmation handoff", () => {
  it("hands over the message that was left", () => {
    holdConfirmation("Saved $12.50 for Groceries on Aug 19.");

    expect(takeConfirmation()).toBe("Saved $12.50 for Groceries on Aug 19.");
  });

  it("gives it up exactly once", () => {
    // The whole of "shown exactly once". A second reader is the list mounting
    // again, which is what the back button does, and it must find nothing.
    holdConfirmation("Saved $12.50 for Groceries on Aug 19.");

    expect(takeConfirmation()).toBe("Saved $12.50 for Groceries on Aug 19.");
    expect(takeConfirmation()).toBeUndefined();
    expect(takeConfirmation()).toBeUndefined();
  });

  it("has nothing to give when no edit left anything", () => {
    // The ordinary case: somebody opened the list directly. A stale sentence
    // naming a money figure here would be the failure rule 3 forbids.
    expect(takeConfirmation()).toBeUndefined();
  });

  it("keeps only the most recent save", () => {
    // Two saves before the list reads either can only mean the second is the
    // one just made, so reporting the first would name a superseded figure.
    holdConfirmation("Saved $10.00 for Transport on Aug 18.");
    holdConfirmation("Saved $12.50 for Groceries on Aug 19.");

    expect(takeConfirmation()).toBe("Saved $12.50 for Groceries on Aug 19.");
    expect(takeConfirmation()).toBeUndefined();
  });

  it("survives being emptied and filled again", () => {
    // One session, several edits. Each one has to arrive on its own.
    holdConfirmation("first");
    expect(takeConfirmation()).toBe("first");

    holdConfirmation("second");
    expect(takeConfirmation()).toBe("second");
    expect(takeConfirmation()).toBeUndefined();
  });
});
