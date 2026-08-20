import "server-only";

import arcjet, {
  detectBot,
  request,
  shield,
  slidingWindow,
} from "@arcjet/next";

import { env } from "@/lib/env";
import type { FormState } from "@/lib/forms";

/**
 * Attempt limiting on the three unauthenticated forms: sign in, sign up, and
 * password reset (spec 0004, AC-8).
 *
 * **This fails open, deliberately and always.** If Arcjet cannot be reached, if
 * the key is missing, if the call throws, the request proceeds and the failure
 * is logged. The reasoning is in the spec and worth repeating where somebody
 * might be tempted to "harden" it: locking the owner out of their own financial
 * history because a third party service is having a bad afternoon is a worse
 * outcome than a window with no attempt limiting. This app has one user and no
 * attacker gains anything from a few extra guesses; the owner losing access to
 * their own money history is the failure that actually costs something.
 *
 * Limiting is per client rather than per account on purpose. A sign in attempt
 * is unauthenticated by definition, so there is no account identity to key on
 * yet, and keying on the submitted address would let somebody lock a known
 * address out of its own sign in.
 */

/**
 * The client, or undefined when no key is configured.
 *
 * An absent key is treated exactly like an unreachable service, because that is
 * what it is: no protection, said out loud in the log, and the app still works.
 * It means this module can ship before the Arcjet account exists and starts
 * working the moment ARCJET_KEY appears, with no code change.
 */
const client = createClient();

function createClient() {
  const key = env().ARCJET_KEY;
  if (!key) return undefined;

  return arcjet({
    key,
    // Every rule keys off the client's own fingerprint. Not a header: a header
    // is whatever the caller says it is.
    characteristics: ["ip.src"],
    rules: [
      // Common attack patterns against the app itself, on top of the limits.
      shield({ mode: "LIVE" }),
      // A person signing in is not a crawler. Nothing here should be reachable
      // by an automated client at all, so none are allowed through.
      detectBot({ mode: "LIVE", allow: [] }),
      // Sliding rather than fixed, so somebody cannot spend the whole allowance
      // in the last second of one window and the first second of the next.
      // Ten attempts a minute is far above what a person typing a password
      // needs and far below what guessing one requires.
      slidingWindow({ mode: "LIVE", interval: "60s", max: 10 }),
    ],
  });
}

/**
 * Ask whether this attempt may proceed.
 *
 * Returns undefined to mean yes, or a `FormState` to hand straight back to the
 * form: a refusal is ordinary readable text beside the fields, never an error
 * page and never a stack trace (AC-8).
 */
export async function refuseIfTooManyAttempts(): Promise<
  FormState | undefined
> {
  if (!client) {
    console.warn(
      "[attempt-limit] ARCJET_KEY is not set, so sign in, sign up, and password reset are unlimited. Set it in .env.local and in the hosting project.",
    );
    return undefined;
  }

  let decision;
  try {
    decision = await client.protect(await request());
  } catch (error) {
    // The fail open path. Logged rather than swallowed, so an outage is visible
    // in the logs instead of silently removing the protection.
    console.error(
      "[attempt-limit] Arcjet could not be reached, so this attempt was allowed through unchecked.",
      error,
    );
    return undefined;
  }

  // Arcjet reports its own internal failures as a decision rather than a throw.
  // Same answer: let it through, say so.
  if (decision.isErrored()) {
    console.error(
      "[attempt-limit] Arcjet returned an error, so this attempt was allowed through unchecked.",
      decision.reason,
    );
    return undefined;
  }

  if (!decision.isDenied()) return undefined;

  // Branch on why, because the two refusals need different words. A person who
  // typed their password wrong four times needs to know to wait; there is no
  // useful advice to give a bot.
  if (decision.reason.isRateLimit()) {
    return {
      status: "error",
      message:
        "Too many attempts from here. Wait a minute and try again, and use the password reset link if you are not sure of your password.",
    };
  }

  return {
    status: "error",
    message: "That request looked automated, so it was refused.",
  };
}
