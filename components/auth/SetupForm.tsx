"use client";

import { useActionState } from "react";

import { completeSetup } from "@/actions/settings";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import type { Currency } from "@/lib/currency";
import { idleFormState } from "@/lib/forms";

import { FormError } from "./FormError";
import { SubmitButton } from "./SubmitButton";
import { TimezoneSelect } from "./TimezoneSelect";

/**
 * The two questions a Google sign up never got asked.
 *
 * Google sends an address and a name and nothing else, so an account created
 * that way arrives with both columns null and lands here before it can reach
 * any other signed in screen. A password sign up collected both during sign up
 * and never sees this.
 */
export function SetupForm({
  currencies,
  zones,
  suggestedCurrency,
  suggestedZone,
}: {
  currencies: readonly Currency[];
  zones: readonly string[];
  suggestedCurrency: string;
  suggestedZone: string;
}) {
  const [state, action, pending] = useActionState(completeSetup, idleFormState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError state={state} />

      <Field
        label="Currency"
        name="currency"
        hint="This cannot change once you have logged anything."
        error={fieldErrors?.currency}
      >
        {(control) => (
          <Select
            {...control}
            defaultValue={suggestedCurrency}
            options={currencies.map((currency) => ({
              value: currency.code,
              label: `${currency.code} · ${currency.name}`,
            }))}
            required
          />
        )}
      </Field>

      <Field
        label="Time zone"
        name="timezone"
        hint="Decides what counts as today and where your month ends."
        error={fieldErrors?.timezone}
      >
        {(control) => (
          <TimezoneSelect
            control={control}
            zones={zones}
            fallback={suggestedZone}
          />
        )}
      </Field>

      <SubmitButton pending={pending} pendingLabel="Saving…">
        Finish setting up
      </SubmitButton>
    </form>
  );
}
