"use client";

import { useActionState } from "react";

import { resendVerification, verifyEmailCode } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

/**
 * Type the six digit code, which both confirms the address and signs you in.
 *
 * A code rather than a link, so creating an account never leaves the tab it
 * started in. Verification succeeding returns a session, so there is no second
 * sign in step afterwards.
 *
 * The address is prefilled and editable. It arrives in the query string, and
 * the code is what actually authenticates, so an address somebody tampered with
 * on the way here buys them nothing: they would still need the code sent to the
 * real mailbox.
 */
export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(
    verifyEmailCode,
    idleFormState,
  );
  const [resendState, resendAction, resending] = useActionState(
    resendVerification,
    idleFormState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormError state={state} />

        <Field label="Email" name="email">
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              defaultValue={email}
              required
            />
          )}
        </Field>

        <Field
          label="Six digit code"
          name="otp"
          hint="Check your inbox. It expires shortly after it arrives."
          error={fieldErrors?.otp}
        >
          {(control) => (
            <Input
              {...control}
              // one-time-code is what lets a phone offer the code from the
              // notification instead of making somebody memorise six digits.
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              required
            />
          )}
        </Field>

        <SubmitButton pending={pending} pendingLabel="Checking…">
          Confirm and sign in
        </SubmitButton>
      </form>

      <form
        action={resendAction}
        className="border-border flex flex-col items-center gap-2 border-t pt-4"
      >
        {/* Its own copy of the address, because a form only submits its own
            fields and this one is separate so the code field is not cleared. */}
        <input type="hidden" name="email" defaultValue={email} />
        <p
          role="status"
          aria-live="polite"
          className="text-fg-muted text-sm empty:hidden"
        >
          {resendState.status === "ok"
            ? "A fresh code is on its way."
            : resendState.status === "error"
              ? resendState.message
              : ""}
        </p>
        <Button type="submit" variant="ghost" size="sm" disabled={resending}>
          {resending ? "Sending…" : "Send another code"}
        </Button>
      </form>
    </div>
  );
}
