"use client";

import { useActionState } from "react";

import { changePassword, requestPasswordChange } from "@/actions/auth";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

/**
 * Change your password, in two steps, using a code sent to your own address.
 *
 * Not the "type your current password" form spec 0004 drew, because the
 * platform has no call that does that. What exists is the reset flow, so this
 * runs it against the address you are already signed in as. The guarantee is
 * different and worth being plain about: it proves you can read the mailbox,
 * not that you remember the old password.
 */
export function ChangePasswordForm({ email }: { email: string }) {
  // requestPasswordChange takes nothing: there is one address it could send to,
  // the one you are signed in as, so a form state argument would be theatre.
  const [sendState, sendAction, sending] = useActionState(
    () => requestPasswordChange(),
    idleFormState,
  );
  const [state, action, pending] = useActionState(
    changePassword,
    idleFormState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-4">
      <form action={sendAction} className="flex flex-col items-start gap-2">
        <FormError state={sendState} />
        <p
          role="status"
          aria-live="polite"
          className="text-fg-muted text-sm empty:hidden"
        >
          {sendState.status === "ok"
            ? `A six digit code is on its way to ${email}.`
            : ""}
        </p>
        <Button type="submit" variant="secondary" size="sm" disabled={sending}>
          {sending ? "Sending…" : "Email me a code"}
        </Button>
      </form>

      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormError state={state} />
        <p
          role="status"
          aria-live="polite"
          className="text-fg-muted text-sm empty:hidden"
        >
          {state.status === "ok"
            ? "Your password is changed. Every other browser you were signed in on has been signed out."
            : ""}
        </p>

        <Field
          label="Six digit code"
          name="code"
          error={fieldErrors?.code}
          hint="From the email above."
        >
          {(control) => (
            <Input
              {...control}
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
            />
          )}
        </Field>

        <Field
          label="New password"
          name="password"
          hint="At least 12 characters."
          error={fieldErrors?.password}
        >
          {(control) => (
            <Input {...control} type="password" autoComplete="new-password" />
          )}
        </Field>

        <SubmitButton pending={pending} pendingLabel="Changing…">
          Change my password
        </SubmitButton>
      </form>
    </div>
  );
}
