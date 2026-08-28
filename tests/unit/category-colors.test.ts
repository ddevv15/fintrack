import { describe, expect, it } from "vitest";

import { CATEGORY_COLORS, firstUnusedColor } from "@/lib/category-colors";
import { categoryColorSchema } from "@/lib/schema";

/**
 * Locks the colour a new category starts on.
 *
 * Spec 0008 AC-5 does not say "pick an unused colour", it says the first unused
 * colour in the order the `categories.color` check constraint declares. That
 * order is the part worth locking: it is invisible on screen, so a list quietly
 * retyped in a different order would preselect a different colour and nothing
 * would look wrong.
 *
 * covers: AC-5, AC-6
 */

describe("the colour list", () => {
  it("is the constraint's order, not an alphabetical or prettier one", () => {
    expect(CATEGORY_COLORS).toEqual([
      "green",
      "orange",
      "blue",
      "purple",
      "yellow",
      "red",
      "pink",
      "teal",
      "slate",
      "emerald",
    ]);
  });

  it("is the same list the database validates against", () => {
    // One source, not two. If these ever disagree, a picker would offer a
    // colour the check constraint refuses, and the refusal would arrive after
    // the name had been typed.
    expect(CATEGORY_COLORS).toEqual(categoryColorSchema.options);
  });
});

describe("firstUnusedColor", () => {
  it("starts on the first colour when nothing is used", () => {
    expect(firstUnusedColor([])).toBe("green");
  });

  it("skips the colours already taken, in the constraint's order", () => {
    // Not "any unused colour": the first one, which is `blue` here and not
    // `emerald` or whichever a set happened to iterate to.
    expect(firstUnusedColor(["green", "orange"])).toBe("blue");
  });

  it("ignores which order the used colours arrive in", () => {
    expect(firstUnusedColor(["orange", "green"])).toBe("blue");
  });

  it("finds a gap rather than only running off the end", () => {
    const allButBlue = CATEGORY_COLORS.filter((color) => color !== "blue");
    expect(firstUnusedColor(allButBlue)).toBe("blue");
  });

  it("falls back to the first colour once all ten are used", () => {
    // Past ten categories some colours have to repeat, and repeating is
    // allowed: AC-6 marks a used colour rather than blocking it, so this is a
    // sensible starting point and not a failure.
    expect(firstUnusedColor(CATEGORY_COLORS)).toBe("green");
  });
});
