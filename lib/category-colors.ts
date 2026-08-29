import { categoryColorSchema, type CategoryColor } from "@/lib/schema";

/**
 * The ten category colours and the one rule about picking one.
 *
 * A module of its own, and the reason is a build hazard rather than tidiness.
 * `lib/categories.ts` reads the database, so it imports `createInsforgeServer`
 * and through it `next/headers`. The colour picker is a Client Component, and
 * importing this list from there would drag that whole chain into the browser
 * bundle. Nothing here touches a request, so both sides can import it safely.
 */

/**
 * The ten colours, in the order the `categories.color` check constraint
 * declares them.
 *
 * Read off the Zod enum that mirrors the constraint rather than retyped, so
 * this list and the one the database validates against cannot drift apart. The
 * order is not decoration: `firstUnusedColor()` below makes it the source of
 * which colour a new category starts on (spec 0008, AC-5), so a screen that
 * retyped it in a different order would quietly preselect a different colour
 * from the one the spec describes.
 */
export const CATEGORY_COLORS = categoryColorSchema.options;

/**
 * The colour a new category should start on.
 *
 * The first colour in the constraint's declared order that none of your spend
 * categories is already using, so two categories you compare often do not
 * arrive looking alike (AC-5).
 *
 * Falling back to the first colour once all ten are taken is not a failure:
 * past ten categories some colours have to repeat, and repeating the first is
 * as good an answer as any. AC-6 is what makes that liveable, because a colour
 * already in use says so on the picker.
 */
export function firstUnusedColor(
  used: readonly CategoryColor[],
): CategoryColor {
  return (
    CATEGORY_COLORS.find((color) => !used.includes(color)) ?? CATEGORY_COLORS[0]
  );
}
