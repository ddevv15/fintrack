import { beforeEach, describe, expect, it, vi } from "vitest";

import { fault, refusal, refusalKindOf } from "@/lib/errors";

/**
 * The two kinds of thing this app throws, and the rule about what goes in a message.
 *
 * Spec 0011 copies an error's message into every report verbatim, on the
 * reasoning that this app writes its errors as readable sentences carrying row
 * counts and read names rather than values. The allow list never inspects prose,
 * so that reasoning is the only thing protecting a message, which makes it a
 * property worth a test rather than a habit worth trusting.
 *
 * covers: AC-2, AC-4 of spec 0011
 */

describe("refusal", () => {
  it("carries its kind without letting it show up anywhere a reader would see it", () => {
    const error = refusal(
      "count-mismatch",
      "12 rows arrived for a count of 13.",
    );

    expect(refusalKindOf(error)).toBe("count-mismatch");
    // Non enumerable, so a label meant for monitoring cannot start appearing in
    // logs, spreads, or anything that serialises the error.
    expect(JSON.stringify(error)).not.toContain("count-mismatch");
    expect(Object.keys(error)).not.toContain("fintrackRefusalKind");
    expect({ ...error }).toEqual({});
  });

  it("is an ordinary Error to every reader that is not asking for the label", () => {
    const error = refusal("missing-count", "No row count came back.");

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("No row count came back.");
  });
});

describe("refusalKindOf", () => {
  it("says nothing about a plain error, or about a thrown non error", () => {
    expect(refusalKindOf(new Error("ordinary"))).toBeUndefined();
    expect(refusalKindOf("a string")).toBeUndefined();
    expect(refusalKindOf(undefined)).toBeUndefined();
    expect(refusalKindOf(null)).toBeUndefined();
    // A forged label is not a refusal either: only the two known kinds pass.
    expect(
      refusalKindOf({ fintrackRefusalKind: "something-else" }),
    ).toBeUndefined();
  });
});

describe("fault", () => {
  // `fault()` writes the driver's payload to the server log itself. Spied so the
  // suite stays quiet and so the write can actually be asserted below.
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    logged.mockClear();
  });

  /**
   * The one that matters. A driver payload can quote the offending literal back,
   * so interpolating one into a message routes typed text straight past the
   * allow list. This asserts the message is fixed prose about the named read
   * and nothing else.
   */
  it("names the read and carries nothing from the driver", () => {
    const driverSaid = {
      code: "22P02",
      message: 'invalid input syntax for type numeric: "dentist copay"',
      details: "SELECT * FROM transactions WHERE note ILIKE '%dentist copay%'",
    };

    const error = fault("Your transactions", driverSaid);

    expect(error.message).toContain("your transactions");
    expect(error.message).not.toContain(driverSaid.code);
    expect(error.message).not.toContain("dentist copay");
    expect(error.message).not.toContain("SELECT");
    expect(error.message).not.toContain("{");
  });

  it("is a fault rather than a refusal, so it reports as a crash", () => {
    // A refusal means the guards worked. A failed read means something broke.
    // They are opposite events and AC-2 turns on telling them apart.
    expect(
      refusalKindOf(fault("Your categories", new Error("boom"))),
    ).toBeUndefined();
  });

  /**
   * The payload has to survive somewhere, and the log is the only place it may
   * go. This used to be the caller's job, stated in a docstring and enforced by
   * nothing, so a call site that forgot it destroyed the only copy of the
   * diagnosis in silence. Now it is impossible to build a fault without this
   * happening, and this is the test that says so.
   */
  it("writes the driver's payload to the server log, where a report cannot reach", () => {
    const driverSaid = { code: "22P02", detail: "dentist copay" };

    fault("Your transactions", driverSaid);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(
      "[read] Your transactions failed",
      driverSaid,
    );
  });
});
