"use client";

import { useActionState } from "react";

import { requestPasswordReset } from "@/actions/auth";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

/**
 * Ask for a reset code.
 *
 * There is no success state here, and that is deliberate. Whatever the address,
 * this goes to the same screen with the same words, so the form cannot be used
 * to find out who has an account (AC-7).
 */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    idleFormState,
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <Field
        label="Email"
        name="email"
        hint="If that address has an account, a code is on its way."
      >
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="email"
            autoFocus
            required
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send me a code
      </SubmitButton>
    </form>
  );
}
