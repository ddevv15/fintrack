"use client";

import { useActionState } from "react";

import { deleteAccount } from "@/actions/auth";
import { FormError } from "@/components/auth/FormError";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { idleFormState } from "@/lib/forms";

/**
 * Delete everything, after typing your own address.
 *
 * Typing the address rather than clicking a confirm dialog, because a dialog is
 * dismissed by reflex and typing is not. The address is checked on the server
 * against the signed in one, and the deletion itself takes the account from the
 * session rather than from anything typed here, so this field is friction by
 * design and not a security control.
 */
export function DeleteAccountForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(deleteAccount, idleFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <p className="text-fg-muted text-sm">
        This removes your profile, every category, and every entry, at once and
        for good. There is no undo and no grace period.
      </p>

      <Field
        label={`Type ${email} to confirm`}
        name="confirmEmail"
        error={fieldErrors?.confirmEmail}
      >
        {(control) => <Input {...control} type="email" autoComplete="off" />}
      </Field>

      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account and everything in it"}
      </Button>
    </form>
  );
}
