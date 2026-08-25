"use client";

import { Button } from "@/components/ui/Button";

/**
 * The submit button on every auth form.
 *
 * "use client" because it takes `pending` from `useActionState` in its parent
 * form and disables itself while the action runs. Spec 0003 asks for a written
 * reason on any client component; this is it, and it is the same reason for
 * every form in `components/auth/`: a server action's pending state has to be
 * read on the client, or a slow network gets three sign in attempts instead of
 * one.
 *
 * The label changes rather than the button becoming a spinner, so the state is
 * announced to a screen reader as text and not carried by motion alone.
 */
export function SubmitButton({
  pending,
  children,
  pendingLabel,
}: {
  pending: boolean;
  children: string;
  pendingLabel: string;
}) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? pendingLabel : children}
    </Button>
  );
}
