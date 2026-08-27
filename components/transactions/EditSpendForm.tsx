"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { updateTransaction } from "@/actions/transactions";
import { holdConfirmation } from "@/components/transactions/confirmation";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { AmountInput } from "@/components/ui/AmountInput";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { idleFormState, type FormState } from "@/lib/forms";

import type { SpendCategoryOption } from "@/lib/categories";

/**
 * Correcting one entry you already logged.
 *
 * Deliberately the same four fields, in the same order, on the same primitives
 * as `LogSpendForm`. Correcting a mistake is not a different task from making
 * the entry, and a second layout for it would be a second thing to learn.
 *
 * "use client" for the two reasons that file gives, and they hold here as well.
 * `useActionState` provides the pending flag that disables the submit control
 * while a save is in flight, so one click cannot become two writes. And the
 * fields are controlled, so a refused save keeps what you typed rather than
 * throwing it away and making you retype a correction you already made once.
 *
 * Everything it needs is a prop computed on the server. It never formats money,
 * never reads a clock, and never learns which currency you use: it is handed a
 * glyph, a day, and an already formatted amount as strings.
 */
type EditSpendFormProps = {
  /** The entry being amended. The id travels in a hidden field, not the URL. */
  transactionId: string;
  /** From `formatAmountInput()`, so it reads straight back into minor units. */
  amount: string;
  categoryId: string;
  occurredOn: string;
  note: string;
  categories: readonly SpendCategoryOption[];
  /** The glyph alone, from `currencySymbol()`. Decoration beside the field. */
  currencySymbol: string;
  /** Today in your own zone. The newest day this entry may be moved to. */
  today: string;
};

export function EditSpendForm({
  transactionId,
  amount: initialAmount,
  categoryId: initialCategoryId,
  occurredOn: initialOccurredOn,
  note: initialNote,
  categories,
  currencySymbol,
  today,
}: EditSpendFormProps) {
  const categoryRef = useRef<HTMLSelectElement>(null);

  const [amount, setAmount] = useState(initialAmount);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [occurredOn, setOccurredOn] = useState(initialOccurredOn);
  const [note, setNote] = useState(initialNote);

  const router = useRouter();

  /*
   * The navigation happens here rather than in the action, and that is load
   * bearing rather than a preference.
   *
   * A `redirect()` inside a server action does not send the browser away and
   * wait: Next renders the destination inside the same POST and ships its
   * payload back, so the list would render before this action had returned the
   * sentence for it to show.
   *
   * The confirmation is handed over in the browser rather than sent back
   * through the server, and that is the fix for a measured bug rather than a
   * preference: a server carried message is consumed by whichever of the two
   * requests that follow a save happens to arrive first, and it arrived only
   * half the time. `confirmation.ts` records the whole of it.
   *
   * Nothing is cleared on success, unlike the log form, because this form is
   * about to be navigated away from. What matters is only that a refusal keeps
   * every typed value.
   */
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (previous, formData) => {
      const result = await updateTransaction(previous, formData);

      if (result.status === "ok") {
        // Left for the list, then navigate. This order matters: the list takes
        // it as it mounts, so it has to be waiting before the push starts.
        holdConfirmation(result.message ?? "");
        router.push("/transactions");
      }

      return result;
    },
    idleFormState,
  );

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  useEffect(() => {
    /*
     * On a refusal, put the chosen category back.
     *
     * React resets the form once the action returns, which changes the DOM
     * without going through React. On the next render it compares the `value`
     * prop against the previous `value` prop, sees no change, and leaves the
     * select alone, so the reset sticks and the choice is silently lost. Text
     * inputs escape this because React tracks their values specifically to
     * catch out of band changes; a select has no equivalent.
     *
     * The same note is on `LogSpendForm`, and it is not belt and braces in
     * either place: without it the amount survives a refused save while the
     * category quietly does not, which is worse than losing both because it is
     * much harder to notice.
     */
    if (categoryRef.current && categoryRef.current.value !== categoryId) {
      categoryRef.current.value = categoryId;
    }
  }, [state, categoryId]);

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* The entry this form is about. Hidden rather than in the URL of the
          action, and checked as a uuid on the server before it is used. */}
      <input type="hidden" name="id" value={transactionId} />

      <FormError state={state} />

      <Field
        label="Amount"
        name="amount"
        hint="Digits and at most one dot, like 12.50."
        error={fieldErrors?.amount}
      >
        {(control) => (
          <AmountInput
            {...control}
            currencySymbol={currencySymbol}
            placeholder="0.00"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        )}
      </Field>

      <Field label="Category" name="categoryId" error={fieldErrors?.categoryId}>
        {(control) => (
          <Select
            {...control}
            ref={categoryRef}
            options={categories.map((category) => ({
              value: category.id,
              // A hidden category can only be here because this entry is
              // already filed under it. Saying so stops it being mistaken for a
              // live category worth filing something new under (AC-12).
              label: category.isHidden
                ? `${category.name} (hidden)`
                : category.name,
            }))}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          />
        )}
      </Field>

      <Field label="Date" name="occurredOn" error={fieldErrors?.occurredOn}>
        {(control) => (
          <Input
            {...control}
            type="date"
            // Refuses a later day. The server checks this again against its own
            // idea of today, because a max attribute is a courtesy and not a
            // guarantee (AC-11).
            max={today}
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
          />
        )}
      </Field>

      <Field
        label="Note"
        name="note"
        hint="Optional. Clear it to remove the note."
        error={fieldErrors?.note}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={500}
            placeholder="What was it for?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </Field>

      {/*
        Only reached without JavaScript, where nothing navigates and the action
        result lands back on this same screen. With JavaScript the push above
        happens first, so this is replaced before it can be read. Rendering it
        anyway is what stops a save with no JavaScript looking like a form that
        did nothing at all.
      */}
      <p
        role="status"
        aria-live="polite"
        className="text-fg text-sm font-medium empty:hidden"
      >
        {state.status === "ok" ? (state.message ?? "") : ""}
      </p>

      <div className="flex flex-col gap-2">
        <SubmitButton pending={pending} pendingLabel="Saving...">
          Save changes
        </SubmitButton>

        {/* A link rather than a button, because leaving without saving is a
            navigation and nothing more. It stays reachable while a save is in
            flight on purpose: a slow network should not trap you here. */}
        <Link
          href="/transactions"
          className="focus-ring text-fg-muted hover:text-fg inline-flex min-h-11 items-center justify-center rounded-sm text-sm"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
