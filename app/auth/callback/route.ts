import { NextResponse, type NextRequest } from "next/server";
import { createAuthActions } from "@insforge/sdk/ssr";

/**
 * Where Google sends you back to.
 *
 * A Route Handler rather than a server action, because a redirect from a
 * provider is an ordinary GET and an action cannot answer one.
 *
 * The exchange happens here rather than in the browser so the refresh token is
 * written as an httpOnly cookie, exactly as it is for a password sign in. The
 * code verifier that proves this is the same browser that started the flow was
 * put in an httpOnly cookie by `initiateGoogleOAuth` and never reached any
 * script.
 *
 * Every failure lands on sign in with a plain message. There is no branch that
 * renders account data, because at this point there is not yet an account
 * session to render any with.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code");
  const providerError = request.nextUrl.searchParams.get("error");

  if (providerError || !code) {
    // The commonest cause is somebody choosing "cancel" on Google's screen,
    // which is not an error worth alarming them about, so it reads the same as
    // any other unfinished attempt.
    if (providerError) {
      console.warn("Google sign in did not complete", {
        error: providerError,
      });
    }
    return NextResponse.redirect(new URL("/sign-in?error=oauth", request.url));
  }

  const codeVerifier = request.cookies.get("insforge_code_verifier")?.value;
  if (!codeVerifier) {
    // The verifier expires after ten minutes. A flow left open longer than that
    // has to start again; there is nothing to recover.
    return NextResponse.redirect(
      new URL("/sign-in?error=expired", request.url),
    );
  }

  // Redirect to the constant `/`. Not a query parameter and not a stored
  // intent: a callback that takes its destination from the request is an open
  // redirect wearing a sign in page's clothes.
  const response = NextResponse.redirect(new URL("/", request.url));

  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  });

  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier);
  if (error || !data?.user) {
    console.error("Google code exchange failed", error);
    return NextResponse.redirect(
      new URL("/sign-in?error=exchange", request.url),
    );
  }

  response.cookies.delete("insforge_code_verifier");

  // A brand new Google account has no currency and no time zone, so the app
  // layout's completeness rule sends it to /setup from here. An existing one
  // goes straight home. Neither case is decided here, which is the point:
  // one rule, in one place.
  return response;
}
