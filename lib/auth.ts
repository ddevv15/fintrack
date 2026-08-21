import { redirect } from "next/navigation";

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
 */
export async function currentUser(): Promise<SignedInUser | undefined> {
  const insforge = await createInsforgeServer();
  const { data, error } = await insforge.auth.getCurrentUser();

  if (error || !data?.user?.id) return undefined;

  return { id: data.user.id, email: data.user.email ?? "" };
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
