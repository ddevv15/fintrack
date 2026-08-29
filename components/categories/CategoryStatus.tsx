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

import { takeCategoryConfirmation } from "@/components/categories/confirmation";

/**
 * The one place the categories screen speaks from.
 *
 * Every outcome this screen produces goes through it: the confirmation arriving
 * from an add, an edit, or a delete, and the result of hiding or unhiding a
 * category in place. Without it the only report of a hide is a row quietly
 * moving to another heading, which is nothing at all to a screen reader.
 *
 * One region rather than one per row, because several polite regions competing
 * to speak is how an announcement gets dropped, and because a row control that
 * moves its own row needs somewhere to put focus afterwards.
 *
 * "use client" for two reasons, both of which spec 0003 asks to be written
 * down. The message changes after a hide without a navigation, so it is state.
 * And focus has to move onto this element, which needs a ref.
 *
 * The structure here follows `components/transactions/MonthStatus.tsx`
 * deliberately, including the two effects, whose reasons were measured rather
 * than reasoned. That file carries the long version of why each exists.
 */

/** Say something in the region. Rows call this; nothing else does. */
type Announce = (message: string, options?: { focus?: boolean }) => void;

const CategoryStatusContext = createContext<Announce | undefined>(undefined);

/**
 * Read the announcer from inside a row.
 *
 * Throws rather than falling back to a no-op. A row rendered outside the
 * provider would hide a category and report it to nobody, and a silent failure
 * of an accessibility feature is one nobody ever notices.
 */
export function useCategoryStatus(): Announce {
  const announce = useContext(CategoryStatusContext);

  if (!announce) {
    throw new Error(
      "A category row was rendered outside CategoryStatusProvider, so its outcome would be announced to nobody.",
    );
  }

  return announce;
}

/** The region, plus the list it speaks for. */
export function CategoryStatusProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const regionRef = useRef<HTMLParagraphElement>(null);

  /*
   * What this mount took, so re-running the effect cannot lose it.
   *
   * Taking is destructive, which is what makes the confirmation single use.
   * React runs an effect, cleans it up, and runs it again in development, so
   * reading straight from `takeCategoryConfirmation()` each time would hand the
   * message to the first run, have the cleanup cancel it, and give the second
   * run nothing. Refs survive that.
   *
   * A real remount, which is what the back button causes, gets a fresh ref and
   * an empty hand, because the message was already taken. That is precisely the
   * replay AC-19 forbids, prevented by construction.
   */
  const taken = useRef<string | undefined>(undefined);

  /*
   * The confirmation is put into the region after mount, not rendered into it.
   *
   * A live region announces changes to its contents, and a region that arrives
   * already holding its text has not changed. Since a write returns here
   * through a client side navigation, this whole subtree is new, so rendering
   * the message directly would mean the confirmation is on screen and never
   * spoken. The timeout is what makes mounting empty real rather than merely
   * intended: setting the message in the effect body would be batched into the
   * same commit as the mount.
   */
  useEffect(() => {
    if (taken.current === undefined)
      taken.current = takeCategoryConfirmation() ?? "";

    const confirmation = taken.current;
    if (!confirmation) return;

    const announcement = setTimeout(() => setMessage(confirmation), 0);
    return () => clearTimeout(announcement);
  }, []);

  /*
   * Clear the sentence whenever the browser moves through its own history.
   *
   * Taking the confirmation once is not by itself enough: the router sometimes
   * keeps this component alive across a back and forward instead of remounting
   * it, so `message` would still hold a sentence about a write already
   * reported. `popstate` fires for a back or a forward and never for the
   * `router.push` that brings you here after a write, so this clears precisely
   * the case AC-19 names and nothing else.
   */
  useEffect(() => {
    const clear = () => setMessage("");

    window.addEventListener("popstate", clear);
    return () => window.removeEventListener("popstate", clear);
  }, []);

  const announce = useCallback<Announce>((next, options) => {
    setMessage(next);

    if (options?.focus) regionRef.current?.focus();
  }, []);

  return (
    <CategoryStatusContext.Provider value={announce}>
      {/*
        Always rendered, and deliberately without `empty:hidden`. That utility
        resolves to `display: none`, which takes the element out of the
        accessibility tree entirely, so the region would not exist during the
        very window it needs to be observed in.

        role="status" rather than "alert" because none of these outcomes should
        interrupt what a screen reader is already saying. tabIndex -1 makes it
        focusable programmatically without putting it in the tab order.
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
    </CategoryStatusContext.Provider>
  );
}
