import { initiateGoogleOAuth } from "@/actions/auth";
import { Button } from "@/components/ui/Button";

/**
 * Sign in with Google.
 *
 * A form posting a server action rather than a button with an onClick, which
 * keeps this a Server Component and keeps the whole OAuth exchange server side:
 * the code verifier is written as an httpOnly cookie and the browser never
 * holds anything worth stealing.
 */
export function GoogleButton({ label }: { label: string }) {
  return (
    <form action={initiateGoogleOAuth}>
      <Button type="submit" variant="secondary" className="w-full">
        {/* The G, drawn rather than fetched: an external image here would be a
            request to Google on a page nobody has signed in on yet. */}
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
          <path
            fill="currentColor"
            d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.51h3.232c1.891-1.742 2.982-4.305 2.982-7.35Z"
          />
          <path
            fill="currentColor"
            d="M12 22c2.7 0 4.964-.895 6.618-2.422l-3.232-2.509c-.895.6-2.04.955-3.386.955-2.605 0-4.81-1.76-5.596-4.123H3.064v2.59A9.996 9.996 0 0 0 12 22Z"
            opacity=".7"
          />
          <path
            fill="currentColor"
            d="M6.404 13.9a5.999 5.999 0 0 1 0-3.797V7.51H3.064a10.004 10.004 0 0 0 0 8.977l3.34-2.588Z"
            opacity=".5"
          />
          <path
            fill="currentColor"
            d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.99 14.696 2 12 2a9.996 9.996 0 0 0-8.936 5.51l3.34 2.593C7.19 7.740 9.395 5.977 12 5.977Z"
            opacity=".85"
          />
        </svg>
        {label}
      </Button>
    </form>
  );
}
