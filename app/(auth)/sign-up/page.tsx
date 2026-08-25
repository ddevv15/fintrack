import Link from "next/link";

import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { AuthLayout } from "@/components/ui/AuthLayout";

export const metadata = { title: "Create your account · FinTrack" };

/**
 * Create an account.
 *
 * Three fields, then the code screen, then `/setup` for the currency and the
 * time zone. Those two are asked after verifying rather than here, because the
 * platform's signUp has nowhere to carry them and an unverified account has no
 * session to write them with.
 */
export default function SignUpPage() {
  return (
    <AuthLayout title="Create your account">
      <SignUpForm />

      <div className="border-border mt-6 flex flex-col gap-4 border-t pt-6">
        <GoogleButton label="Sign up with Google" />

        <p className="text-fg-muted text-center text-sm">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="focus-ring text-fg rounded-sm underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
