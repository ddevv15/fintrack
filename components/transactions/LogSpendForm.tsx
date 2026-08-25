"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { logSpend } from "@/actions/transactions";
import { FormError } from "@/components/auth/FormError";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { AmountInput } from "@/components/ui/AmountInput";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { idleFormState, type FormState } from "@/lib/forms";

import type { SpendCategory } from "@/lib/categories";

/**
 * The form you use more than any screen in this app.
 *
 * "use client" for two reasons, both of which spec 0003 asks to be written
 * down. `useActionState` gives the pending flag that disables the submit
 * control while a save is in flight, which is the whole of AC-11: one click
 * cannot become two rows. And the fields are controlled, which is what makes
 * AC-9 true; see the note on that below, because it is not obvious and it is
 * easy to undo.
 *
 * Everything it needs to render is a prop computed on the server. It never
 * formats money, never reads a clock, and never learns which currency you use;
 * it is handed a glyph and a day as strings. That is the rule in
 * `components/ui/AGENTS.md`, and here it also keeps the decimal count out of
 * the browser, where a form field could otherwise have carried it.
 */
type LogSpendFormProps = {
  categories: readonly SpendCategory[];
  /** The glyph alone, from `currencySymbol()`. Decoration beside the field. */
  currencySymbol: string;
  /** Today in your own zone. Both the starting value and the newest allowed. */
  today: string;
};

export function LogSpendForm({
  categories,
  currencySymbol,
  today,
}: LogSpendFormProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);

  /*
   * Controlled rather than uncontrolled, and this is load bearing.
   *
   * React 19 resets an uncontrolled field once a form action returns. That is
   * the right default for a form you submit and leave, and the wrong one here:
   * a refused save would wipe the amount you just typed, so correcting a
   * mistyped entry would mean retyping the whole thing. AC-9 says every typed
   * value stays, and holding them in state is what delivers it, because the
   * reset only touches the DOM and React puts the state values straight back.
   *
   * The cost is that clearing after a success is now explicit, in the action
   * below, rather than something the framework does for us.
   */
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState("");

  /*
   * Clearing happens here, inside the action, rather than in an effect.
   *
   * An effect that calls setState runs after the render that produced the
   * result, so it renders once with the old values and again with the cleared
   * ones. The action is an event context: React batches these with the result
   * itself, so there is one render and no flash of the values you just saved.
   * That is also what `react-hooks/set-state-in-effect` is asking for.
   */
  const [state, action, pending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const result = await logSpend(previous, formData);

      if (result.status === "ok") {
        setAmount("");
        setCategoryId("");
        setOccurredOn(today);
        setNote("");
      }

      return result;
    },
    idleFormState,
  );

  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  useEffect(() => {
    // Focus only after the render that cleared the fields, so it lands on an
    // empty amount ready for the next spend (AC-8).
    if (state.status === "ok") {
      amountRef.current?.focus();
      return;
    }

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
     * Writing it back is therefore not belt and braces, it is the only thing
     * that makes AC-9 true for this field. Delete it and the amount survives a
     * refused save while the category quietly does not, which is worse than
     * losing both because it is much harder to notice.
     */
    if (categoryRef.current && categoryRef.current.value !== categoryId) {
      categoryRef.current.value = categoryId;
    }
  }, [state, categoryId]);

  return (
    <form action={action} className="flex flex-col gap-4">
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
            ref={amountRef}
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
            placeholder="Choose a category"
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
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
            // Starts at today in your own zone and refuses a later day. The
            // server checks this again against its own idea of today, because
            // a max attribute is a courtesy and not a guarantee (AC-6).
            max={today}
            value={occurredOn}
            onChange={(event) => setOccurredOn(event.target.value)}
          />
        )}
      </Field>

      <Field
        label="Note"
        name="note"
        hint="Optional."
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

      <SubmitButton pending={pending} pendingLabel="Saving...">
        Log spend
      </SubmitButton>

      {/*
        Names the amount that was actually stored, formatted from the saved
        integer, so the conversion this feature turns on is visible on every
        entry rather than invisible on all of them.

        Always rendered, and deliberately WITHOUT the `empty:hidden` that Field
        and FormError use. That utility resolves to `display: none`, which takes
        the element out of the accessibility tree entirely, so the region does
        not exist during the very window it needs to be observed in; it then
        appears and gains its text in the same tick, which is the case screen
        readers are least reliable about. Reserving the line instead keeps the
        region present, and has the side benefit that the message appearing
        moves nothing on screen.

        role="status" rather than "alert" because a success should not
        interrupt what a screen reader is already saying, and it never takes
        focus, which stays in the amount field ready for the next spend.

        `text-fg` rather than a success colour, because there is no success
        token: the design system defines focus, income, and danger, and income
        is spoken for by amounts carrying a plus sign. Inventing a fourth token
        belongs to spec 0003, not to this feature, and the sentence carries its
        own meaning anyway, which is the rule that meaning never rests on
        colour alone.
      */}
      <p
        role="status"
        aria-live="polite"
        className="text-fg min-h-5 text-sm font-medium"
      >
        {state.status === "ok" ? (state.message ?? "") : ""}
      </p>
    </form>
  );
}
