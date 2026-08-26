import { cookies, headers } from "next/headers";

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
 * cannot clear the cookie it just read, and "read and clear on first render"
 * has to be built from two halves that meet in `proxy.ts`.
 *
 * The proxy runs before any Server Component, on a request that can still be
 * changed and a response that can still carry headers. When a request to the
 * list arrives holding a flash, it lifts the message onto a request header the
 * page reads, and deletes the cookie on the way out. One request, read and
 * cleared, and a reload afterwards finds nothing.
 *
 * The message travels the last step as a header rather than as the cookie
 * itself, and that is not a detour. Next merges any cookie the proxy sets into
 * what the page sees, so deleting the cookie in the proxy would also blank it
 * for the very render that was meant to read it. A header is untouched by that
 * merge.
 *
 * One thing this rules out, and it is worth knowing before somebody puts it
 * back: the action cannot use `redirect()`. Next renders a redirect target
 * inside the POST that ran the action and ships its payload with the response,
 * so the list would render in a request that never carried the cookie and the
 * proxy would never see it. The message would be set, stored, and never shown.
 * The edit form navigates itself instead, which makes the arrival at the list a
 * real request that the proxy can act on. This was measured rather than
 * assumed: with `redirect()` the confirmation was silently always empty.
 */

/** The cookie the message travels in, from the action to the proxy. */
export const FLASH_COOKIE = "fintrack_flash";

/**
 * The request header the proxy hands the message on in, for the last step.
 *
 * The value is URL encoded, because a header must be latin-1 and a category
 * name may be anything at all.
 */
export const FLASH_HEADER = "x-fintrack-flash";

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
 * Call this from a server action just before it reports success. It is the only
 * writer.
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
 * Reads the header the proxy put there, not the cookie, for the reason set out
 * at the top of this file. Safe from a Server Component: it only reads, and the
 * clearing already happened on the response this render is part of.
 */
export async function readFlash(): Promise<string | undefined> {
  const value = (await headers()).get(FLASH_HEADER);
  if (!value) return undefined;

  return decodeURIComponent(value);
}
