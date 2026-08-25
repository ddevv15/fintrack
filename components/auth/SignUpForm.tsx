"use client";

import { useActionState, useState } from "react";

import { signUpWithPassword } from "@/actions/auth";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

/**
 * Create the account: an address, a password, and optionally a name.
 *
 * Currency and time zone are not here, and their absence is a decision rather
 * than an omission. The platform's signUp carries no arbitrary profile payload
 * for a database trigger to read, and a password account holds no session until
 * its code is confirmed, so there is no honest moment during sign up to write
 * either column. Both are asked once on `/setup` straight after verifying, by
 * every new account alike. Nothing can be logged in between: the database
 * refuses a transaction while the profile is incomplete.
 *
 * "use client" for `useActionState`, which puts a refusal back on the screen
 * without a full page load. The form still posts to the server action with no
 * JavaScript at all; only the inline error needs the client.
 */
export function SignUpForm() {
  const [state, action, pending] = useActionState(
    signUpWithPassword,
    idleFormState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  // React 19 resets an uncontrolled form once its action returns. Without this,
  // a password one character too short costs you the address and the name too.
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <Field label="Email" name="email" error={fieldErrors?.email}>
        {(control) => (
          <Input
            {...control}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoFocus
            required
          />
        )}
      </Field>

      <Field
        label="Password"
        name="password"
        hint="At least 12 characters. Length beats symbols."
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

      <Field
        label="Your name"
        name="displayName"
        hint="Optional, and only ever shown to you."
        error={fieldErrors?.displayName}
      >
        {(control) => (
          <Input
            {...control}
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Creating your account…">
        Create account
      </SubmitButton>
    </form>
  );
}
