"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthActions } from "@insforge/sdk/ssr";
import { z } from "zod";

import {
  refuseIfTooManyAccountAttempts,
  refuseIfTooManyAttempts,
} from "@/lib/attempt-limit";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import type { FormState } from "@/lib/forms";
import { createInsforgeServer } from "@/lib/insforge-server";

/**
 * Everything that starts or ends a session.
 *
 * All of it runs on the server, which is the invariant spec 0004 rests on: the
 * refresh token is written as an httpOnly cookie by `createAuthActions` and no
 * script ever sees it. The browser client's auth surface is read only for the
 * same reason.
 *
 * Every action returns a `FormState`, so a screen renders a failure as text
 * beside the field that caused it rather than as an exception. The one thing
 * that never comes back is whether an email address already has an account:
 * that answer is the same either way, on purpose.
 */

async function authActions() {
  return createAuthActions({ cookies: await cookies() });
}

/**
 * Turn a Zod failure into the field keyed shape `Field` reads.
 *
 * The message stays generic because the per field messages are the useful ones;
 * repeating them in the summary makes a screen reader read each problem twice.
 */
function invalid(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "");
    if (name && !fieldErrors[name]) fieldErrors[name] = issue.message;
  }
  return {
    status: "error",
    message: "Check the fields below.",
    fieldErrors,
  };
}

/** A refusal from the platform, said in plain words. */
function failed(
  message: string,
  fieldErrors?: Record<string, string>,
): FormState {
  return { status: "error", message, fieldErrors };
}

/**
 * At least twelve characters, and no composition rule.
 *
 * Length is what actually resists guessing. Forcing a symbol and a digit
 * reliably produces `Password1!` and a sticky note, which is why OWASP stopped
 * recommending it.
 */
const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters. Length matters more than symbols.");

const emailSchema = z.email("That does not look like an email address.");

const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().max(100).optional(),
});

/**
 * Create the account.
 *
 * Currency and time zone are deliberately not asked here. The platform's signUp
 * carries an address, a password, and a name, and nothing else: there is no
 * arbitrary profile payload for a trigger to read. A password account also has
 * no session until its code is confirmed, so the app could not write those two
 * columns at this moment even if it wanted to.
 *
 * So every new account, however it was created, answers them once on `/setup`
 * after verifying. One path instead of two, and no window where the app has
 * half written a profile. Nothing can be logged in the meantime: the database
 * refuses a transaction while the profile is incomplete.
 *
 * Whether the address is already taken never reaches the caller. The platform
 * emails the existing account instead, and this returns the same "check your
 * email" state it returns for a new one (AC-2).
 */
export async function signUpWithPassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await refuseIfTooManyAttempts();
  if (refused) return refused;

  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: String(formData.get("displayName") ?? "").trim() || undefined,
  });
  if (!parsed.success) return invalid(parsed.error);

  const { email, password, displayName } = parsed.data;

  const auth = await authActions();
  const { data, error } = await auth.signUp({
    email,
    password,
    // The only profile value the platform carries. handle_new_user() reads it
    // as NEW.profile ->> 'name'.
    name: displayName,
  });

  if (error) {
    return failed(
      error.message ?? "Could not create the account. Try again in a moment.",
    );
  }

  // Verification is on for this project, so this is the normal path. The other
  // branch means somebody turned it off in the backend, and landing signed in
  // is then correct rather than a state to guard against.
  if (data?.requireEmailVerification) {
    redirect(`/verify?email=${encodeURIComponent(email)}`);
  }

  redirect("/");
}

const verifySchema = z.object({
  email: emailSchema,
  otp: z
    .string()
    .regex(/^\d{6}$/, "The code is six digits, exactly as it arrived."),
});

/**
 * Confirm the six digit code, which also signs you in.
 *
 * The code is what authenticates, not the address in the query string, so an
 * address someone tampered with on the way to this screen gains them nothing.
 */
export async function verifyEmailCode(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // A six digit code is a million possibilities, and this is the only thing
  // counting wrong guesses at one (AC-8).
  const refused = await refuseIfTooManyAttempts("code");
  if (refused) return refused;

  const parsed = verifySchema.safeParse({
    email: formData.get("email"),
    otp: String(formData.get("otp") ?? "").replace(/\s/g, ""),
  });
  if (!parsed.success) return invalid(parsed.error);

  const auth = await authActions();
  const { error } = await auth.verifyEmail(parsed.data);

  if (error) {
    return failed(
      "That code is wrong or has expired. Ask for a fresh one below.",
      { otp: "Wrong or expired." },
    );
  }

  redirect("/");
}

/** Send another code, for one that expired or never arrived. */
export async function resendVerification(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // Every call here puts another email in somebody's inbox (AC-8).
  const refused = await refuseIfTooManyAttempts("email");
  if (refused) return refused;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return failed("Enter the address you signed up with.");
  }

  const insforge = await createInsforgeServer();
  const { error } = await insforge.auth.resendVerificationEmail({
    email: parsed.data,
  });

  if (error) {
    return failed(
      error.message ?? "Could not send another code. Try again shortly.",
    );
  }

  return { status: "ok" };
}

const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

/**
 * Sign in with an email address and a password.
 *
 * An unverified address is told so plainly and sent back to the code screen,
 * because "wrong email or password" for an account that exists and is simply
 * unconfirmed is a dead end nobody can act on.
 */
export async function signInWithPassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await refuseIfTooManyAttempts();
  if (refused) return refused;

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const auth = await authActions();
  const { error } = await auth.signInWithPassword(parsed.data);

  if (error) {
    if (error.statusCode === 403) {
      redirect(`/verify?email=${encodeURIComponent(parsed.data.email)}`);
    }
    return failed("That email address and password do not match an account.");
  }

  redirect("/");
}

/**
 * End the session.
 *
 * Clears both cookies on the way out, so the next request has nothing to
 * refresh from and every protected page is closed again (AC-5).
 */
export async function signOut(): Promise<void> {
  const auth = await authActions();
  await auth.signOut();
  redirect("/sign-in");
}

/**
 * Start the Google flow.
 *
 * `skipBrowserRedirect` keeps the exchange on the server: the code verifier is
 * held in an httpOnly cookie here and read back in the callback, so the browser
 * never holds anything it could leak, and the session that comes out is written
 * as cookies the same way a password sign in is.
 */
export async function initiateGoogleOAuth(): Promise<void> {
  const cookieStore = await cookies();
  const auth = createAuthActions({ cookies: cookieStore });

  const { data, error } = await auth.signInWithOAuth("google", {
    redirectTo: new URL("/auth/callback", env().APP_URL).toString(),
    skipBrowserRedirect: true,
  });

  if (error || !data?.url || !data?.codeVerifier) {
    redirect("/sign-in?error=google-unavailable");
  }

  cookieStore.set("insforge_code_verifier", data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    // Ten minutes: long enough to pick an account and type a password, short
    // enough that an abandoned attempt does not leave a usable verifier behind.
    maxAge: 600,
  });

  redirect(data.url);
}

/**
 * Ask for a password reset code.
 *
 * The response is a constant, identical for an address with an account and one
 * without (AC-7). Anything else turns this form into a way to find out who has
 * an account here.
 */
export async function requestPasswordReset(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const refused = await refuseIfTooManyAttempts();
  if (refused) return refused;

  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success)
    return failed("That does not look like an email address.");

  const insforge = await createInsforgeServer();
  // The result is deliberately not inspected. Reporting a failure here would
  // report whether the address exists, which is the one thing this must not do.
  await insforge.auth.sendResetPasswordEmail({ email: parsed.data });

  redirect(`/reset-password?email=${encodeURIComponent(parsed.data)}`);
}

const setNewPasswordSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .regex(/^\d{6}$/, "The code is six digits, exactly as it arrived."),
  password: passwordSchema,
});

/**
 * Exchange the emailed code for a token, then set the new password.
 *
 * Two calls rather than one because the platform separates them: the code
 * proves you read the mailbox, the token it returns is what authorises the
 * change. A code that was already used or has expired fails the first call, and
 * that is the message worth showing, since the two need different answers.
 */
export async function setNewPassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // The whole trust model of recovery rests on this code being hard to guess
  // inside its window, so guesses are counted as strictly as requests (AC-8).
  const refused = await refuseIfTooManyAttempts("code");
  if (refused) return refused;

  const parsed = setNewPasswordSchema.safeParse({
    email: formData.get("email"),
    code: String(formData.get("code") ?? "").replace(/\s/g, ""),
    password: formData.get("password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const insforge = await createInsforgeServer();

  const exchange = await insforge.auth.exchangeResetPasswordToken({
    email: parsed.data.email,
    code: parsed.data.code,
  });

  if (exchange.error || !exchange.data?.token) {
    return failed(
      "That code has already been used or has expired. Ask for a fresh one.",
      { code: "Used or expired." },
    );
  }

  const { error } = await insforge.auth.resetPassword({
    newPassword: parsed.data.password,
    otp: exchange.data.token,
  });

  if (error) {
    return failed(error.message ?? "Could not set that password. Try again.");
  }

  // Deliberately not signed in here. The reset ran against a server client with
  // no cookie writer, so there is no session to carry; signing in with the new
  // password is one step and proves it took.
  redirect("/sign-in?reset=done");
}

const changePasswordSchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "The code is six digits, exactly as it arrived."),
  password: passwordSchema,
});

/**
 * Ask for the code that authorises a password change.
 *
 * The platform exposes no "change password" call: there is sign up, sign in,
 * verify, and reset by emailed code, and nothing else. So changing a password
 * while signed in runs the reset flow against your own address. What it proves
 * is control of the mailbox rather than knowledge of the old password, which is
 * a different guarantee from the one spec 0004 described, and the honest one to
 * offer given what exists.
 */
export async function requestPasswordChange(): Promise<FormState> {
  const user = await requireUser();

  // Keyed on the account as well as the source, so rotating source addresses
  // cannot aim an unbounded run of emails at one mailbox (AC-8).
  const refused = await refuseIfTooManyAccountAttempts(user.id, "email");
  if (refused) return refused;

  const insforge = await createInsforgeServer();
  const { error } = await insforge.auth.sendResetPasswordEmail({
    email: user.email,
  });

  if (error) {
    return failed(
      error.message ?? "Could not send the code. Try again in a moment.",
    );
  }

  return { status: "ok" };
}

/**
 * Set the new password, using the code that was just emailed.
 *
 * Every other session for this account ends here, which is the point of doing
 * it at all: a cookie somebody copied should not outlive the password it was
 * taken under (AC-17).
 */
export async function changePassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  // Same code, same million possibilities, and this one changes the password on
  // a signed in account, so it is counted per account too (AC-8).
  const refused = await refuseIfTooManyAccountAttempts(user.id, "code");
  if (refused) return refused;

  const parsed = changePasswordSchema.safeParse({
    code: String(formData.get("code") ?? "").replace(/\s/g, ""),
    password: formData.get("password"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const insforge = await createInsforgeServer();

  const exchange = await insforge.auth.exchangeResetPasswordToken({
    email: user.email,
    code: parsed.data.code,
  });

  if (exchange.error || !exchange.data?.token) {
    return failed("That code is wrong or has expired. Ask for a fresh one.", {
      code: "Wrong or expired.",
    });
  }

  const { error } = await insforge.auth.resetPassword({
    newPassword: parsed.data.password,
    otp: exchange.data.token,
  });

  if (error) {
    return failed(error.message ?? "Could not set that password. Try again.");
  }

  return { status: "ok" };
}

/**
 * Delete the account, and everything in it.
 *
 * You type your own address first, checked here against the signed in one, so
 * this cannot happen on a misclick. That check is a courtesy: the real work is
 * `public.delete_own_account()`, which takes the account to remove from
 * `auth.uid()` and never from anything the caller sent, so it has no way to
 * name somebody else's account even if this check were bypassed entirely.
 *
 * The cascade from spec 0002 takes the profile, every category, and every
 * transaction with it. There is no soft delete and no grace period: data
 * somebody asked to be gone is gone (AC-18).
 */
export async function deleteAccount(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const typed = String(formData.get("confirmEmail") ?? "").trim();
  if (typed.toLowerCase() !== user.email.toLowerCase()) {
    return failed("That is not the address this account signs in with.", {
      confirmEmail: "Does not match.",
    });
  }

  const insforge = await createInsforgeServer();
  const { error } = await insforge.database.rpc("delete_own_account");

  if (error) {
    return failed(
      `Could not delete the account: ${error.message}. Nothing was removed.`,
    );
  }

  // The session now points at a user that no longer exists, so clear it rather
  // than leaving a cookie that produces confusing errors on the next request.
  const auth = await authActions();
  await auth.signOut();

  redirect("/sign-in?deleted=1");
}
