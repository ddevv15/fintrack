import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/ui";

/**
 * The one button in the app.
 *
 * Renders a real <button>, so keyboard activation, the disabled state, and form
 * submission all arrive from the browser rather than being reimplemented.
 *
 * `primary` is monochrome on purpose. Spec 0003 saves colour for the things
 * that carry meaning, so the loudest control on a screen earns its weight from
 * contrast, not hue, and `destructive` stays the only coloured button.
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-fg text-bg hover:bg-fg-muted",
  secondary:
    "bg-surface text-fg border border-border-strong hover:border-fg-subtle",
  ghost: "text-fg-muted hover:bg-surface hover:text-fg",
  destructive: "bg-danger text-bg hover:opacity-90",
};

/**
 * Both sizes are 44px tall on a phone (AC-14) and only shrink once there is a
 * pointer, so a dense desktop toolbar never costs a thumb its target.
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-sm md:h-9",
  md: "h-11 px-4 text-sm",
};

/**
 * `ComponentPropsWithRef` rather than `WithoutRef`, so a caller can hold a ref
 * to the real element. React 19 passes `ref` as an ordinary prop, so this costs
 * nothing and changes nothing for callers that do not use it. It is here
 * because a control that manages focus needs one: a confirm step has to move
 * focus onto the button it just revealed, and back again if it is dismissed.
 */
type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-sm font-medium",
        "transition-colors duration-(--duration-fast) ease-(--ease-out-fast)",
        // Dims rather than vanishes: a disabled control still has to be
        // readable, or the person cannot tell what is unavailable.
        "disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
