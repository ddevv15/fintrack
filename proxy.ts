import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@insforge/sdk/ssr/middleware";

/**
 * Next.js 16 renamed middleware to proxy. This runs before Server Components
 * render, so they never read a stale cookie.
 *
 * Route protection is not here yet. Feature 5, sign in and your account, owns
 * which paths require a session and where an unsigned visitor is sent.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
