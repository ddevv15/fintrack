import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";

import { FLASH_COOKIE } from "@/lib/flash";

/**
 * Next.js 16 renamed middleware to proxy. This runs before Server Components
 * render, so they never read a stale cookie, and it is where the door is shut
 * on a request with no session (spec 0004, AC-6).
 *
 * Two rules live in two places, on purpose:
 *
 * 1. **Is there a session?** Here. It is a cookie check with no database read,
 *    so it costs nothing to run on every request, which is what a rule that
 *    guards everything has to be.
 * 2. **Is the profile complete?** In `app/(app)/layout.tsx`, which calls
 *    `getSettings()`. That answer needs a query, and running one in the proxy
 *    would mean a database round trip on every request in the app, including
 *    ones that then redirect anyway. The source of the answer is the same
 *    function either way, which is what spec 0004's cross child contract fixes.
 */

/**
 * The only paths reachable without a session.
 *
 * Everything not on this list requires one, which is the right way round: a new
 * screen is closed until somebody opens it, rather than open until somebody
 * remembers to close it.
 *
 * `/setup` is deliberately absent. It needs a session like any other screen and
 * is exempt only from the completeness redirect, which is the other rule.
 */
const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/verify",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
] as const;

/** Paths the app's own machinery needs open, whatever the session state. */
const INFRASTRUCTURE_PREFIXES = [
  // The browser client calls this to renew an expired access token. Requiring
  // a session to refresh a session cannot work.
  "/api/auth/refresh",
  // The component gallery, which renders no account data and is off in
  // production anyway (spec 0003, UI_GALLERY).
  "/design",
] as const;

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    ) || INFRASTRUCTURE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * Consume a confirmation the browser is still carrying.
 *
 * The other half of the single use flash in `lib/flash.ts`, and worth reading
 * with that file open. A flash arriving on an incoming request has already been
 * shown: the action that set it rendered `/transactions` inside the same POST
 * and read the message out of the request scoped cookie store. What is left is
 * the browser's copy, which a reload would otherwise show a second time.
 *
 * It is stripped in both directions on purpose. Removing it from the request
 * stops this render showing it again; deleting it on the response stops the
 * next one. Doing only one of the two leaves the message live for exactly one
 * more page view (spec 0007, AC-13).
 *
 * The order below is not cosmetic. `NextResponse.next({ request })` copies the
 * request headers into the forwarded request the moment it is called, so a
 * cookie deleted afterwards would still reach the page. The request side has to
 * be cleared first, and the response is built from the already stripped
 * request.
 */
function consumeFlash(request: NextRequest): NextResponse {
  const carried = request.cookies.has(FLASH_COOKIE);

  if (carried) request.cookies.delete(FLASH_COOKIE);

  const response = NextResponse.next({ request });

  if (carried) response.cookies.delete(FLASH_COOKIE);

  return response;
}

export async function proxy(request: NextRequest) {
  const response = consumeFlash(request);

  // Returns an access token when there is a usable session, having refreshed it
  // if it was expiring. It returns null both for no session at all and for one
  // it could not refresh, and clears the cookies in the second case, so a
  // corrupted cookie ends up in exactly the same place as no cookie.
  const { accessToken } = await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { pathname } = request.nextUrl;

  if (!accessToken && !isPublic(pathname)) {
    // A constant target, with nothing carried from this request. A sign in page
    // that accepts a destination is a sign in page that can be handed a link
    // bouncing somebody elsewhere once they authenticate.
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  // Already signed in and looking at a sign in or sign up screen: send them
  // home rather than showing a form that cannot do anything useful.
  if (accessToken && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
