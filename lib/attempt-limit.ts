import "server-only";

import arcjet, {
  type ArcjetDecision,
  detectBot,
  request,
  shield,
  slidingWindow,
} from "@arcjet/next";

import { env } from "@/lib/env";
import type { FormState } from "@/lib/forms";

/**
 * Attempt limiting on every auth action that sends an email or accepts a
 * guessable value (spec 0004, AC-8).
 *
 * Two surfaces, because they have different identities to key on:
 *
 * - The public forms, where nobody is signed in yet: sign in, sign up, password
 *   reset, resending a verification code, submitting a verification code, and
 *   submitting a reset code. Keyed on the request source alone, because that is
 *   the only identity there is. Keying on the submitted address instead would
 *   let somebody lock a known address out of its own sign in.
 * - The signed in actions: asking for a password change code, and submitting
 *   one. Keyed on the account as well, for the reason below.
 *
 * **This fails open, deliberately and always.** If Arcjet cannot be reached, if
 * the key is missing, if the call throws, the request proceeds and the failure
 * is logged. The reasoning is in the spec and worth repeating where somebody
 * might be tempted to "harden" it: locking the owner out of their own financial
 * history because a third party service is having a bad afternoon is a worse
 * outcome than a window with no attempt limiting. This app has one user and no
 * attacker gains anything from a few extra guesses; the owner losing access to
 * their own money history is the failure that actually costs something.
 */

/** How many attempts one key gets, and over how long. */
const INTERVAL = "60s";
const MAX = 10;

/**
 * The rules every surface carries, whoever is asking.
 *
 * Sliding rather than fixed, so somebody cannot spend the whole allowance in
 * the last second of one window and the first second of the next. Ten attempts
 * a minute is far above what a person typing a password or a code needs, and
 * far below what guessing one requires.
 */
function baseRules() {
  return [
    // Common attack patterns against the app itself, on top of the limits.
    shield({ mode: "LIVE" as const }),
    // A person signing in is not a crawler. Nothing here should be reachable by
    // an automated client at all, so none are allowed through.
    detectBot({ mode: "LIVE" as const, allow: [] }),
    // Per request source. Not a header: a header is whatever the caller says it
    // is.
    slidingWindow({
      mode: "LIVE" as const,
      interval: INTERVAL,
      max: MAX,
      characteristics: ["ip.src"],
    }),
  ];
}

/**
 * The clients, or undefined when no key is configured.
 *
 * An absent key is treated exactly like an unreachable service, because that is
 * what it is: no protection, said out loud in the log, and the app still works.
 * It means this module can ship before the Arcjet account exists and starts
 * working the moment ARCJET_KEY appears, with no code change.
 */
const anonymousClient = createAnonymousClient();
const accountClient = createAccountClient();

function createAnonymousClient() {
  const key = env().ARCJET_KEY;
  if (!key) return undefined;

  return arcjet({ key, rules: baseRules() });
}

function createAccountClient() {
  const key = env().ARCJET_KEY;
  if (!key) return undefined;

  return arcjet({
    key,
    rules: [
      ...baseRules(),
      // Keyed on the account and nothing else, deliberately. Adding the source
      // to this key rather than giving it its own rule would defeat the point:
      // the pair (source, account) hands a fresh allowance to every new source,
      // so somebody rotating addresses could still aim an unbounded run of
      // codes at one mailbox. Keyed on the account alone, the cap survives the
      // rotation, and the source keyed rule above still applies on top.
      slidingWindow({
        mode: "LIVE" as const,
        interval: INTERVAL,
        max: MAX,
        characteristics: ["accountId"],
      }),
    ],
  });
}

/**
 * What the form was asking for, which decides the words a refusal uses.
 *
 * A refusal has to say something the person on that screen can act on, and
 * "use the password reset link" is unhelpful advice on a screen that is already
 * part of resetting a password.
 */
export type AttemptKind = "password" | "code" | "email";

const RATE_LIMIT_MESSAGE: Record<AttemptKind, string> = {
  password:
    "Too many attempts from here. Wait a minute and try again, and use the password reset link if you are not sure of your password.",
  code: "Too many codes tried from here. Wait a minute, then ask for a fresh code and try that one.",
  email:
    "Too many codes asked for from here. Wait a minute before asking for another one.",
};

/**
 * Ask whether an attempt on a public form may proceed.
 *
 * Returns undefined to mean yes, or a `FormState` to hand straight back to the
 * form: a refusal is ordinary readable text beside the fields, never an error
 * page and never a stack trace (AC-8).
 */
export async function refuseIfTooManyAttempts(
  kind: AttemptKind = "password",
): Promise<FormState | undefined> {
  if (!anonymousClient) return unlimited();

  return decide(async () => anonymousClient.protect(await request()), kind);
}

/**
 * Ask whether an attempt by a signed in account may proceed.
 *
 * Same answer shape as the public form version, with the account carried into
 * the decision so the cap holds per account rather than only per source.
 */
export async function refuseIfTooManyAccountAttempts(
  accountId: string,
  kind: AttemptKind = "code",
): Promise<FormState | undefined> {
  if (!accountClient) return unlimited();

  return decide(
    async () => accountClient.protect(await request(), { accountId }),
    kind,
  );
}

/** Say out loud that there is no protection, and let the attempt through. */
function unlimited(): undefined {
  console.warn(
    "[attempt-limit] ARCJET_KEY is not set, so every sign in, sign up, password reset, and verification code action is unlimited. Set it in .env.local and in the hosting project.",
  );
  return undefined;
}

/**
 * Run one decision and turn it into either undefined or readable words.
 *
 * Every path that is not an outright denial returns undefined, which is the
 * fail open rule holding: an error deciding is not a reason to refuse.
 */
async function decide(
  ask: () => Promise<ArcjetDecision>,
  kind: AttemptKind,
): Promise<FormState | undefined> {
  let decision;
  try {
    decision = await ask();
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
  // typed their code wrong four times needs to know to wait; there is no useful
  // advice to give a bot.
  if (decision.reason.isRateLimit()) {
    return { status: "error", message: RATE_LIMIT_MESSAGE[kind] };
  }

  return {
    status: "error",
    message: "That request looked automated, so it was refused.",
  };
}
