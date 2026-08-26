"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The one place this screen speaks from.
 *
 * Spec 0007 AC-24 asks for a single `role="status"` region above the list, and
 * for every outcome the screen produces to go through it: the confirmation
 * arriving from an edit, a successful delete, and an entry that turned out to
 * be already gone. Without it the only report of a delete is a row silently
 * vanishing, which is nothing at all to a screen reader.
 *
 * One region rather than one per row, because several polite regions competing
 * to speak is how an announcement gets dropped, and because AC-17 needs
 * somewhere to put focus once the row that held it no longer exists.
 *
 * "use client" for two reasons, both of which spec 0003 asks to be written
 * down. The message changes after a delete without a navigation, so it is
 * state. And focus has to move onto this element, which needs a ref.
 */

/** Say something in the region. Rows call this; nothing else does. */
type Announce = (message: string, options?: { focus?: boolean }) => void;

const MonthStatusContext = createContext<Announce | undefined>(undefined);

/**
 * Read the announcer from inside a row.
 *
 * Throws rather than falling back to a no-op. A row rendered outside the
 * provider would delete an entry and report it to nobody, which is exactly the
 * silence AC-24 exists to remove, and a silent failure of an accessibility
 * feature is one nobody ever notices.
 */
export function useMonthStatus(): Announce {
  const announce = useContext(MonthStatusContext);

  if (!announce) {
    throw new Error(
      "A transaction row was rendered outside MonthStatusProvider, so its outcome would be announced to nobody.",
    );
  }

  return announce;
}

/**
 * The region, plus the list it speaks for.
 *
 * `flash` is the confirmation an edit left behind, read on the server from the
 * single use cookie in `lib/flash.ts`.
 */
export function MonthStatusProvider({
  flash,
  children,
}: {
  flash?: string;
  children: ReactNode;
}) {
  const [message, setMessage] = useState("");
  const regionRef = useRef<HTMLParagraphElement>(null);

  /*
   * The flash is put into the region after mount, not rendered into it.
   *
   * That distinction is the whole reason this effect exists, so it is worth
   * stating plainly before somebody simplifies it away. A live region announces
   * changes to its contents, and a region that arrives already holding its text
   * has not changed: assistive technology reads it only if the reader happens
   * to travel there. Since the edit returns here through a client side
   * navigation, this whole subtree is new, so rendering the message directly
   * would mean the confirmation is on screen and never spoken.
   *
   * Mounting empty and filling it a tick later is a real content change, which
   * is what gets announced (AC-24). Focus deliberately stays where it is:
   * arriving on a screen is not the moment to move somebody's focus.
   *
   * The timeout is what makes that true rather than merely intended. Setting
   * the message straight away in the effect body would be batched into the same
   * commit as the mount, so the region would still arrive holding its text and
   * nothing would have changed. Yielding first lets the empty region be
   * committed and reach the accessibility tree, and the message then lands as a
   * second, separate change.
   */
  useEffect(() => {
    if (!flash) return;

    const announcement = setTimeout(() => setMessage(flash), 0);
    return () => clearTimeout(announcement);
  }, [flash]);

  const announce = useCallback<Announce>((next, options) => {
    setMessage(next);

    // Focus moves only when the caller says so, which in practice is after a
    // delete: the row that held focus has been removed, so leaving focus where
    // it was would drop it to the top of the document (AC-17).
    if (options?.focus) regionRef.current?.focus();
  }, []);

  return (
    <MonthStatusContext.Provider value={announce}>
      {/*
        Always rendered, and deliberately without the `empty:hidden` that Field
        and FormError use. That utility resolves to `display: none`, which takes
        the element out of the accessibility tree entirely, so the region would
        not exist during the very window it needs to be observed in.

        role="status" rather than "alert" because none of these outcomes should
        interrupt what a screen reader is already saying. tabIndex -1 makes it
        focusable programmatically without putting it in the tab order, which is
        exactly what AC-17 asks for: somewhere to land, not somewhere to visit.
      */}
      <p
        ref={regionRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="focus-ring text-fg min-h-5 rounded-sm text-sm font-medium"
      >
        {message}
      </p>

      {children}
    </MonthStatusContext.Provider>
  );
}
