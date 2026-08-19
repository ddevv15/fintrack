import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { env } from "@/lib/env";

/**
 * The gate on the whole gallery.
 *
 * This is the single place in the codebase that reads UI_GALLERY (AC-17).
 * Sitting on the layout rather than each page means every route underneath is
 * covered by one check, including any added later, so the gate cannot be
 * forgotten on a new page.
 *
 * Unset means notFound(), which is a real 404 in every environment, production
 * included. The code still ships in the bundle; it is simply unreachable, and
 * it reads no user data and takes no input.
 *
 * force-dynamic is load bearing, not a tuning knob. Left static, this check
 * runs once at build time and bakes its answer into prerendered HTML, so a
 * build produced with the flag on (which CI has to do, to point axe at the
 * route) would keep serving the gallery after a deploy where the flag is off.
 * Dynamic means the flag is read on the request, which is what AC-17 asks for.
 */
export const dynamic = "force-dynamic";
export default function DesignLayout({ children }: { children: ReactNode }) {
  if (!env().UI_GALLERY) notFound();

  return children;
}
