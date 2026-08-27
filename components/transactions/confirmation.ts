"use client";

/**
 * The confirmation an edit hands the list on its way back to it.
 *
 * Spec 0007 AC-13 asks for three things at once: a saved edit returns to the
 * list with a sentence naming what was actually stored, that sentence is never
 * in the URL, and it is shown exactly once, so no reload, bookmark, or back
 * button can bring it back. A stale confirmation naming a money figure is a
 * wrong figure shown confidently, which rule 3 of `AGENTS.md` forbids.
 *
 * The first attempt at this carried the sentence in a cookie the action set and
 * `proxy.ts` consumed. It was measured and it does not work: the confirmation
 * arrived 5 times out of 10. After the action returns, two requests for
 * `/transactions` race, one from the action's own `revalidatePath` and one from
 * the form navigating, and the proxy handed the message to whichever arrived
 * first and deleted the cookie. Whenever that was not the response the router
 * committed, the sentence was gone for good. Worse, when it did arrive, going
 * back and then forward replayed it out of the router cache, which is exactly
 * what AC-13 forbids.
 *
 * The mistake was the channel, not the guard. Routing a browser only message
 * through the server makes every server request a possible consumer, and there
 * is more than one. The message never needed to travel: `updateTransaction`
 * already returns it to the browser that asked. So it is handed over in memory,
 * here, and the race cannot exist because nothing on the server ever sees it.
 *
 * The lifetime of a module variable is exactly the lifetime this needs. It
 * survives the client side navigation from the form to the list, because that
 * never reloads the page. It does not survive a reload, which is precisely why
 * a reload shows nothing. And it is per tab for free, where a cookie was shared
 * across every tab of the app.
 *
 * Deliberately not in `lib/`. Spec 0007's follow up asks for this to stay
 * beside the one feature that uses it until a third caller appears, rather than
 * being promoted to a general helper on the strength of two.
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
 * is taken replaces it, which is correct: only the most recent save is worth
 * reporting, and two saves cannot both be the one you just made.
 */
export function holdConfirmation(message: string): void {
  waiting = message;
}

/**
 * Take the confirmation, once.
 *
 * Clearing on read is what makes it single use, and it is the whole of AC-13's
 * "shown exactly once". Every later call gets nothing until another edit leaves
 * one, so a remount from the back button finds an empty hand.
 */
export function takeConfirmation(): string | undefined {
  const held = waiting;
  waiting = undefined;
  return held;
}
