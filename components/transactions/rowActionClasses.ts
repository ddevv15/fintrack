/**
 * The shared look for the two row controls on the transactions list.
 *
 * Kept in its own module because a Server Component (`TransactionRow`) and a
 * Client Component (`DeleteTransaction`) both need it, and importing it from
 * the server file would pull that whole file into the browser bundle.
 *
 * It matches the `sm` Button: 44px tall on a phone, tighter once there is a
 * pointer, so Edit and Delete are the same size and shape despite one being a
 * link and the other a button.
 */
export const rowActionClasses =
  "focus-ring border-border-strong bg-surface text-fg inline-flex h-11 items-center justify-center rounded-sm border px-3 text-sm font-medium hover:border-fg-subtle md:h-9";
