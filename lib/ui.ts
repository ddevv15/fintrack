import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Join class names, letting a later Tailwind utility beat an earlier one.
 *
 * Without the merge, a caller passing `px-6` to a component whose base is
 * `px-4` ships both classes and the winner is whichever CSS rule the compiler
 * emitted last, which is not something the caller can see or control.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
