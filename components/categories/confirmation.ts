"use client";

/**
 * The confirmation a category write hands the list on its way back to it.
 *
 * Spec 0008 AC-19 asks for three things at once: a write returns to the list
 * with a sentence naming what was actually stored, that sentence is never in
 * the URL, and it is shown exactly once, so no reload, bookmark, or back button
 * can bring it back.
 *
 * This is deliberately a second copy of `components/transactions/confirmation.ts`
 * rather than a shared helper, and spec 0008 records the cost of that in its
 * consequences: a fix to the subtle part of one can now miss the other. Spec
 * 0007's follow up asked for promotion on the third caller. This is the second,
 * so the next one triggers it.
 *
 * The reasoning that file records is worth reading before changing any of this,
 * because it was measured rather than reasoned. In short: routing a browser
 * only message through the server makes every server request a possible
 * consumer, and after a write there is more than one, so the message arrived
 * about half the time and replayed on the back button when it did. The message
 * never needed to travel, because the action already returns it to the browser
 * that asked.
 *
 * The lifetime of a module variable is exactly the lifetime this needs. It
 * survives the client side navigation from a form to the list, because that
 * never reloads the page. It does not survive a reload, which is precisely why
 * a reload shows nothing. And it is per tab for free.
 *
 * "use client" is load bearing rather than decorative. Imported into a Server
 * Component this would become one shared variable across every request the
 * server handles, which would hand one person's confirmation to somebody else.
 * The directive makes that a build error instead of a leak.
 */

let waiting: string | undefined;

/**
 * Leave the confirmation for the list to pick up.
 *
 * Call it immediately before navigating there. A second call before the first
 * is taken replaces it, which is correct: only the most recent write is worth
 * reporting.
 */
export function holdCategoryConfirmation(message: string): void {
  waiting = message;
}

/**
 * Take the confirmation, once.
 *
 * Clearing on read is what makes it single use, and it is the whole of AC-19's
 * "shown exactly once". Every later call gets nothing until another write
 * leaves one, so a remount from the back button finds an empty hand.
 */
export function takeCategoryConfirmation(): string | undefined {
  const held = waiting;
  waiting = undefined;
  return held;
}
