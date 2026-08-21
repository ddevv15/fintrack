"use client";

import { useActionState, useState } from "react";

import { updateProfile } from "@/actions/settings";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { Currency } from "@/lib/currency";
import { idleFormState } from "@/lib/forms";

/**
 * Your name, your time zone, and your currency while it is still yours to change.
 *
 * Whether the currency control renders at all is decided on the server, by
 * counting this account's entries. The database is what actually refuses a
 * locked currency; this only decides whether to offer a control that would be
 * refused, and explains why when it does not (AC-16).
 */
export function ProfileForm({
  displayName,
  timezone,
  currency,
  currencyLabel,
  currencies,
  zones,
  currencyIsLocked,
}: {
  displayName: string;
  timezone: string;
  currency: string;
  currencyLabel: string;
  currencies: readonly Currency[];
  zones: readonly string[];
  currencyIsLocked: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfile, idleFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  // React 19 resets an uncontrolled form after its action, which on a screen
  // like this would blank the name you just saved.
  const [name, setName] = useState(displayName);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <p
        role="status"
        aria-live="polite"
        className="text-fg-muted text-sm empty:hidden"
      >
        {state.status === "ok" ? "Saved." : ""}
      </p>

      <Field
        label="Your name"
        name="displayName"
        hint="Only ever shown to you."
        error={fieldErrors?.displayName}
      >
        {(control) => (
          <Input
            {...control}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <Field
        label="Time zone"
        name="timezone"
        hint="Decides what counts as today and where your month ends."
        error={fieldErrors?.timezone}
      >
        {/* A plain Select, not the browser detecting TimezoneSelect the sign
            up flow uses. Here you already chose a zone, and quietly moving it
            to wherever the device happens to be would overwrite that. */}
        {(control) => (
          <Select
            {...control}
            defaultValue={timezone}
            options={zones.map((zone) => ({ value: zone, label: zone }))}
            required
          />
        )}
      </Field>

      {currencyIsLocked ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-fg text-sm font-medium">Currency</p>
          <p className="text-fg text-base">{currencyLabel}</p>
          <p className="text-fg-subtle text-sm">
            Fixed, now that this account has entries. Changing it would not
            convert anything: it would quietly change what every amount you have
            already logged means.
          </p>
        </div>
      ) : (
        <Field
          label="Currency"
          name="currency"
          hint="You can still change this. It fixes itself the moment you log your first entry."
          error={fieldErrors?.currency}
        >
          {(control) => (
            <Select
              {...control}
              defaultValue={currency}
              options={currencies.map((option) => ({
                value: option.code,
                label: `${option.code} · ${option.name}`,
              }))}
              required
            />
          )}
        </Field>
      )}

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Save changes
      </SubmitButton>
    </form>
  );
}
