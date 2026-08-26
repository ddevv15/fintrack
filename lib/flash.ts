import { cookies } from "next/headers";

import { env } from "@/lib/env";

/**
 * A one line confirmation carried across a redirect, shown once, then gone.
 *
 * Spec 0007 AC-13 needs the edit screen to hand the list a sentence naming what
 * was actually saved, and fixes two things about how: the sentence never enters
 * the URL, because it names a money figure and a URL is bookmarked, shared, and
 * replayed by a reload; and it is shown exactly once, because a stale
 * confirmation naming an amount is a wrong figure shown confidently, which rule
 * 3 of `AGENTS.md` forbids.
 *
 * A cookie is the only channel that survives a redirect without being one of
 * those things. The single use part is where it gets interesting, and the
 * mechanism below is not the obvious one, so here is why.
 *
 * Next.js refuses to let a Server Component render mutate cookies: only a
 * server function or a route handler may set or delete one. So the list page
 * cannot clear the cookie it just read, and "read and clear on render" has to
 * be built from two halves.
 *
 * The first half is that a server action's `redirect()` does not send the
 * browser away and wait. Next renders the redirect target inside the same POST
 * and ships its payload with the response, so the list renders in the request
 * that ran the action and reads the cookie straight out of the request scoped
 * store `setFlash()` just wrote to. The message shows.
 *
 * The second half is the copy the browser kept. `proxy.ts` strips it off the
 * next request that arrives carrying it, from the forwarded request so the page
 * cannot see it and from the response so the browser drops it. By then it has
 * already been shown, so a reload, a bookmark, or the back button finds
 * nothing. The one time cost of this design is that with JavaScript turned off
 * the browser follows the redirect as a fresh request and the proxy consumes
 * the flash before the list renders: the edit still saves correctly, and only
 * the confirmation is missed.
 */

/** The cookie the message travels in. Read by `proxy.ts` as well. */
export const FLASH_COOKIE = "fintrack_flash";

/**
 * A backstop lifetime, in seconds, for a flash nothing ever consumed.
 *
 * Short because it should never be reached: the ordinary path clears it on the
 * very next request. This only stops a message surviving in a browser that was
 * closed mid navigation and reopened much later.
 */
const FLASH_MAX_AGE_SECONDS = 60;

/**
 * Set the confirmation the next render of `/transactions` will show.
 *
 * Call this from a server action, immediately before `redirect()`. It is the
 * only writer.
 *
 * `httpOnly` because nothing in the browser has any business reading it, and
 * `sameSite: "lax"` so it survives the app's own navigation and travels with
 * nothing else. `secure` follows APP_URL rather than a hardcoded true, so the
 * cookie is refused over plain http in production and still works on
 * http://localhost in development.
 */
export async function setFlash(message: string): Promise<void> {
  const store = await cookies();

  store.set(FLASH_COOKIE, message, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().APP_URL.startsWith("https:"),
    path: "/",
    maxAge: FLASH_MAX_AGE_SECONDS,
  });
}

/**
 * Read the confirmation waiting for this render, if there is one.
 *
 * Safe to call from a Server Component: it only reads. The clearing is
 * `proxy.ts`'s half, for the reason set out at the top of this file.
 */
export async function readFlash(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(FLASH_COOKIE)?.value;
  return value === "" ? undefined : value;
}
