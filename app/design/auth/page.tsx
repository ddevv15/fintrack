import { AuthLayout } from "@/components/ui/AuthLayout";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export const metadata = { title: "AuthLayout · FinTrack design" };

/**
 * AuthLayout on its own route.
 *
 * It renders its own <main>, and a document may only have one, so it cannot be
 * shown inside the main gallery page without producing a landmark violation the
 * axe check would rightly fail on.
 */
export default function AuthLayoutPreview() {
  return (
    <AuthLayout title="Sign in">
      <form className="flex flex-col gap-4">
        <Field label="Email" name="email">
          {(control) => (
            <Input {...control} type="email" autoComplete="email" />
          )}
        </Field>

        <Field label="Password" name="password">
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
            />
          )}
        </Field>

        <Button type="submit" className="mt-1 w-full">
          Sign in
        </Button>

        <p className="text-fg-muted text-center text-sm">
          Feature 5 owns what this form actually does.
        </p>
      </form>
    </AuthLayout>
  );
}
