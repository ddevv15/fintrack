"use client";

import { useActionState } from "react";

import { setNewPassword } from "@/actions/auth";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

/**
 * The code from the email, and the new password.
 *
 * A code rather than a link, because that is how this project's backend is
 * configured, and it has the same virtue the sign up code has: you never leave
 * the tab. A code that was already used and one that expired both fail the same
 * exchange call, so the message covers both and offers a fresh one.
 */
export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(
    setNewPassword,
    idleFormState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <Field label="Email" name="email" error={fieldErrors?.email}>
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
        name="code"
        hint="From the email we just sent."
        error={fieldErrors?.code}
      >
        {(control) => (
          <Input
            {...control}
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            required
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
          <Input
            {...control}
            type="password"
            autoComplete="new-password"
            required
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Setting it…">
        Set my new password
      </SubmitButton>
    </form>
  );
}
