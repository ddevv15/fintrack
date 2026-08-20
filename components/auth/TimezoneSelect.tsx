"use client";

import { useEffect, useRef } from "react";

import { Select } from "@/components/ui/Select";
import type { FieldControlProps } from "@/components/ui/Field";

/**
 * Pick a time zone, starting from the one your device is already in.
 *
 * "use client" for one effect, and the effect is the whole point. The zone list
 * is rendered on the server so the control exists and works with no JavaScript
 * at all; the browser then quietly moves the selection to
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`, which is right far more
 * often than any server side guess. It is a suggestion, not a decision: the
 * control is an ordinary select and you can change it.
 *
 * Setting the value in an effect rather than during render is deliberate.
 * Rendering the browser's zone as the selected option would make the server's
 * HTML and the browser's first render disagree, which React reports as a
 * hydration error.
 */
export function TimezoneSelect({
  control,
  zones,
  fallback,
}: {
  control: FieldControlProps;
  /** Every zone name the server's runtime knows, rendered as options. */
  zones: readonly string[];
  /** What is selected before the browser gets a say, and without JavaScript. */
  fallback: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const select = ref.current;
    if (!select) return;

    // Only move a selection nobody has touched yet. Re-running this after
    // somebody picked a zone by hand would undo their choice.
    if (select.value !== fallback) return;

    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && zones.includes(detected)) {
      select.value = detected;
    }
  }, [fallback, zones]);

  return (
    <Select
      {...control}
      ref={ref}
      defaultValue={fallback}
      options={zones.map((zone) => ({ value: zone, label: zone }))}
      required
    />
  );
}
