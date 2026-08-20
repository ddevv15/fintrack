"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { signInWithPassword } from "@/actions/auth";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";

/**
 * Email and password.
 *
 * "use client" for `useActionState`, which is what puts a refusal back on the
 * screen without a full page load and what gives the button its pending state.
 * The form still posts to the server action if JavaScript has not loaded, so
 * signing in works either way; only the inline error needs the client.
 *
 * The failure message is deliberately the same for an unknown address and a
 * wrong password. Telling them apart is a way to find out who has an account.
 */
export function SignInForm() {
  const [state, action, pending] = useActionState(
    signInWithPassword,
    idleFormState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  // React 19 resets an uncontrolled form once its action returns, so a refused
  // sign in would empty this field and make somebody retype their address to
  // find out they only mistyped the password. The password field is left to
  // clear, which is the behaviour you want there.
  const [email, setEmail] = useState("");

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

      <Field label="Password" name="password" error={fieldErrors?.password}>
        {(control) => (
          <Input
            {...control}
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      <Link
        href="/forgot-password"
        className="focus-ring text-fg-muted hover:text-fg self-center rounded-sm text-sm underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
