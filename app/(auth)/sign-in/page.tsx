import Link from "next/link";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignInForm } from "@/components/auth/SignInForm";
import { AuthLayout } from "@/components/ui/AuthLayout";

export const metadata = { title: "Sign in · FinTrack" };

/**
 * Sign in.
 *
 * Reachable without a session, and one of only a handful of screens that is.
 * `proxy.ts` sends a signed in visitor away from here, so this never renders a
 * form somebody has no use for.
 */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const params = await searchParams;
  const justReset = params.reset === "done";
  const googleFailed = typeof params.error === "string";

  return (
    <AuthLayout title="Sign in">
      {justReset ? (
        <p
          role="status"
          className="text-fg-muted border-border mb-4 rounded-sm border p-3 text-sm"
        >
          Your password is changed. Sign in with the new one.
        </p>
      ) : null}

      {googleFailed ? (
        <p
          role="alert"
          className="text-danger border-danger/40 mb-4 rounded-sm border p-3 text-sm"
        >
          Signing in with Google did not finish. Try again, or use your email
          address and password.
        </p>
      ) : null}

      <SignInForm />

      <div className="border-border mt-6 flex flex-col gap-4 border-t pt-6">
        <GoogleButton label="Sign in with Google" />

        <p className="text-fg-muted text-center text-sm">
          No account yet?{" "}
          <Link
            href="/sign-up"
            className="focus-ring text-fg rounded-sm underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
