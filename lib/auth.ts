import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { cache } from "react";

import { createInsforgeServer } from "@/lib/insforge-server";

/**
 * Who is signed in, on the server.
 *
 * The session itself lives in two cookies the SDK owns: a short lived access
 * token the browser may read, and a refresh token it may not. `proxy.ts`
 * refreshes them before any Server Component renders, so everything here is
 * reading an already fresh cookie rather than racing to renew one.
 *
 * Nothing in this file starts or ends a session. That all happens in
 * `actions/auth.ts` through `createAuthActions`, which is what keeps the
 * refresh token httpOnly and out of reach of any script.
 */

/** Just the fields this app uses off the platform's user record. */
export type SignedInUser = {
  id: string;
  email: string;
};

/**
 * The signed in user, or undefined.
 *
 * This asks the backend rather than trusting the cookie, which matters: a
 * forged or tampered access token looks like a session to the proxy and is
 * rejected here, where it turns into "nobody is signed in" rather than into a
 * page that tries to load somebody's money.
 *
 * Wrapped in React `cache()` for the same reason `getSettings()` is, and it is
 * worth stating because the cost is not obvious: asking the backend who is
 * signed in is the single most expensive call this app makes, around 330ms
 * against a database read's 90ms, because it is an auth round trip rather than
 * a row lookup. A signed in page used to make it twice, once through
 * `requireUser()` in the layout and again inside `getSettings()`, which is one
 * whole extra third of a second on every navigation for an answer the request
 * already had. Memoised per request, so it is one call however many callers ask
 * and every one of them sees the same answer. It is not a cross request cache:
 * the entry dies with the render, so no session is ever visible to another.
 */
export const currentUser = cache(async function currentUser(): Promise<
  SignedInUser | undefined
> {
  const insforge = await createInsforgeServer();
  const { data, error } = await insforge.auth.getCurrentUser();

  if (error || !data?.user?.id) return undefined;

  identifyForMonitoring(data.user.id);

  return { id: data.user.id, email: data.user.email ?? "" };
});

/**
 * Tell error monitoring which account this request belongs to (spec 0011 AC-8).
 *
 * The id and nothing else. The email is right there on the same record and is
 * deliberately left behind: an app with one real user gains nothing from
 * sending an address to a third party, and the id already answers the only
 * question worth asking, which is whether a report came from your real account
 * or one of the test ones.
 *
 * Here rather than in the instrumentation files because this is the one place
 * that knows who is signed in. `onRequestError` runs after the fact and has a
 * request, not a session. Setting it during the request means the id is already
 * on the scope by the time anything throws.
 *
 * Wrapped and silent: identifying somebody for a report that may never be sent
 * is not a reason to fail a page. It does nothing at all when monitoring is off,
 * because `Sentry.init` was never called.
 */
function identifyForMonitoring(id: string): void {
  try {
    Sentry.setUser({ id });
  } catch {
    // Deliberately swallowed. See the note above.
  }
}

/**
 * The signed in user, or a redirect to sign in.
 *
 * The redirect target is the constant `/sign-in` with nothing appended. Where
 * you were headed is deliberately not carried: a sign in page that takes a
 * destination from the request is a sign in page that can be handed a link
 * bouncing you somewhere else after you authenticate.
 */
export async function requireUser(): Promise<SignedInUser> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}
