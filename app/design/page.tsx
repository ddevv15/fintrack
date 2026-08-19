import { AppShell } from "@/components/ui/AppShell";
import { Amount } from "@/components/ui/Amount";
import { AmountInput } from "@/components/ui/AmountInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  CategoryChip,
  categorySwatchClasses,
} from "@/components/ui/CategoryChip";
import { DateDisplay } from "@/components/ui/DateDisplay";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { ListRow } from "@/components/ui/ListRow";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { currencySymbol } from "@/lib/money";
import { categoryColorSchema, type CategoryColor } from "@/lib/schema";

export const metadata = { title: "Design system · FinTrack" };

/**
 * Every component, in every state, on one page.
 *
 * This exists so the states that normally never get looked at (empty, loading,
 * failed, a name too long for its row) are reachable on purpose rather than
 * only when something has already gone wrong in production. The axe check runs
 * against this route, so a component added without its states is a component
 * the accessibility gate never sees.
 */
async function retryExample() {
  "use server";
  // Nothing to retry here. Feature 6 supplies the first real one.
}

const categories = categoryColorSchema.options;

const surfaceTokens = [
  { name: "--color-bg", className: "bg-bg", note: "The page" },
  { name: "--color-surface", className: "bg-surface", note: "A raised panel" },
  { name: "--color-border", className: "bg-border", note: "Card edges" },
  {
    name: "--color-border-strong",
    className: "bg-border-strong",
    note: "Form controls",
  },
] as const;

const textTokens = [
  { name: "--color-fg", className: "text-fg", note: "Body and headings" },
  {
    name: "--color-fg-muted",
    className: "text-fg-muted",
    note: "Secondary text",
  },
  {
    name: "--color-fg-subtle",
    className: "text-fg-subtle",
    note: "Hints, never below 14px",
  },
] as const;

const typeSteps = [
  { name: "--text-2xl", className: "text-2xl" },
  { name: "--text-xl", className: "text-xl" },
  { name: "--text-lg", className: "text-lg" },
  { name: "--text-base", className: "text-base" },
  { name: "--text-sm", className: "text-sm" },
  { name: "--text-xs", className: "text-xs" },
] as const;

const spacingSteps = [
  { step: "1", className: "w-1" },
  { step: "2", className: "w-2" },
  { step: "3", className: "w-3" },
  { step: "4", className: "w-4" },
  { step: "6", className: "w-6" },
  { step: "8", className: "w-8" },
  { step: "12", className: "w-12" },
] as const;

function Section({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border border-t pt-8">
      <h2 className="text-fg text-lg font-semibold">{title}</h2>
      <p className="text-fg-muted mt-1 mb-5 max-w-prose text-sm">{summary}</p>
      {children}
    </section>
  );
}

function Example({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-fg-subtle text-sm font-medium">{label}</h3>
      {children}
    </div>
  );
}

export default function DesignGallery() {
  const symbol = currencySymbol();

  return (
    <AppShell
      items={[
        { href: "/design", label: "Log", icon: "log" },
        { href: "/transactions", label: "Month", icon: "transactions" },
        { href: "/breakdown", label: "Breakdown", icon: "breakdown" },
      ]}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header>
          <h1 className="text-fg text-2xl font-semibold">
            FinTrack design system
          </h1>
          <p className="text-fg-muted mt-2 max-w-prose text-sm">
            Every token and every component, in every state. The theme follows
            your system setting, so switch light and dark at the operating
            system to see both. The shell around this page is the real{" "}
            <code className="text-fg">AppShell</code>: the tabs move to a rail
            at 768 pixels wide.
          </p>
        </header>

        <Section
          title="Colour"
          summary="Defined once in app/globals.css and nowhere else. Surfaces stay near monochrome; colour is spent on the ten category names the database fixes, plus focus, income, and danger."
        >
          <div className="flex flex-col gap-6">
            <Example label="Surface">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {surfaceTokens.map((token) => (
                  <li key={token.name} className="flex flex-col gap-1.5">
                    <div
                      className={`border-border h-12 rounded-sm border ${token.className}`}
                    />
                    <code className="text-fg text-xs">{token.name}</code>
                    <span className="text-fg-muted text-xs">{token.note}</span>
                  </li>
                ))}
              </ul>
            </Example>

            <Example label="Text">
              <ul className="flex flex-col gap-2">
                {textTokens.map((token) => (
                  <li
                    key={token.name}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  >
                    <span className={`${token.className} text-base`}>
                      Spent 42 dollars on groceries
                    </span>
                    <code className="text-fg-muted text-xs">{token.name}</code>
                    <span className="text-fg-muted text-xs">{token.note}</span>
                  </li>
                ))}
              </ul>
            </Example>

            <Example label="Category (all ten, each clears 3:1 on bg and surface)">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {categories.map((color: CategoryColor) => (
                  <li key={color} className="flex flex-col gap-1.5">
                    <div
                      className={`h-12 rounded-sm ${categorySwatchClasses[color]}`}
                    />
                    <code className="text-fg text-xs">{color}</code>
                  </li>
                ))}
              </ul>
            </Example>

            <Example label="Semantic">
              <ul className="flex flex-wrap gap-3">
                <li className="flex items-center gap-2">
                  <span className="bg-focus size-6 rounded-sm" />
                  <code className="text-fg text-xs">--color-focus</code>
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-income size-6 rounded-sm" />
                  <code className="text-fg text-xs">--color-income</code>
                </li>
                <li className="flex items-center gap-2">
                  <span className="bg-danger size-6 rounded-sm" />
                  <code className="text-fg text-xs">--color-danger</code>
                </li>
              </ul>
            </Example>
          </div>
        </Section>

        <Section
          title="Type, spacing, shape, motion"
          summary="Geist Sans throughout. Six type steps, one spacing base, two radii, one duration. There is deliberately no larger radius and no slower duration to reach for."
        >
          <div className="flex flex-col gap-6">
            <Example label="Type scale">
              <ul className="flex flex-col gap-2">
                {typeSteps.map((step) => (
                  <li
                    key={step.name}
                    className="flex flex-wrap items-baseline gap-3"
                  >
                    <span className={`${step.className} text-fg`}>
                      Where your money went
                    </span>
                    <code className="text-fg-muted text-xs">{step.name}</code>
                  </li>
                ))}
              </ul>
            </Example>

            <Example label="Spacing (multiples of --spacing, 0.25rem)">
              <ul className="flex flex-col gap-1.5">
                {spacingSteps.map((step) => (
                  <li key={step.step} className="flex items-center gap-3">
                    <span
                      className={`bg-border-strong h-3 rounded-sm ${step.className}`}
                    />
                    <code className="text-fg-muted text-xs">{step.step}</code>
                  </li>
                ))}
              </ul>
            </Example>

            <Example label="Radius and motion">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="bg-surface border-border size-16 rounded-sm border" />
                  <code className="text-fg-muted text-xs">--radius-sm</code>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="bg-surface border-border size-16 rounded-md border" />
                  <code className="text-fg-muted text-xs">--radius-md</code>
                </div>
                <p className="text-fg-muted max-w-xs text-sm">
                  One duration, <code className="text-fg">--duration-fast</code>{" "}
                  at 120ms, and every animation is removed under reduced motion.
                </p>
              </div>
            </Example>
          </div>
        </Section>

        <Section
          title="Button"
          summary="Four variants, two sizes. Primary earns its weight from contrast rather than hue, so destructive stays the only coloured button. Both sizes are 44px tall on a phone and only shrink once there is a pointer."
        >
          <div className="flex flex-col gap-5">
            <Example label="Variants">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Save spend</Button>
                <Button variant="secondary">Cancel</Button>
                <Button variant="ghost">Edit</Button>
                <Button variant="destructive">Delete</Button>
              </div>
            </Example>

            <Example label="Small">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Save</Button>
                <Button size="sm" variant="secondary">
                  Cancel
                </Button>
                <Button size="sm" variant="ghost">
                  Edit
                </Button>
                <Button size="sm" variant="destructive">
                  Delete
                </Button>
              </div>
            </Example>

            <Example label="Disabled (dims, never vanishes)">
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled>Save spend</Button>
                <Button variant="secondary" disabled>
                  Cancel
                </Button>
                <Button variant="destructive" disabled>
                  Delete
                </Button>
              </div>
            </Example>
          </div>
        </Section>

        <Section
          title="Card"
          summary="A bordered panel. There is no shadow token: surfaces separate by their edge."
        >
          <Card>
            <h3 className="text-fg text-sm font-medium">August</h3>
            <p className="text-fg-muted mt-1 text-sm">
              Cards hold a section of a screen. This one is the whole component.
            </p>
          </Card>
        </Section>

        <Section
          title="Forms"
          summary="Field owns the label, the ids, and the aria wiring, so a caller cannot forget them. Controls are uncontrolled, so the form works before JavaScript loads; the trade is that nothing validates until submit."
        >
          <Card className="max-w-md">
            <form className="flex flex-col gap-5">
              <Field
                label="Amount"
                name="amount"
                hint={`In ${symbol}, decimals allowed`}
              >
                {(control) => (
                  <AmountInput
                    {...control}
                    currencySymbol={symbol}
                    placeholder="0.00"
                  />
                )}
              </Field>

              <Field label="Note" name="note">
                {(control) => (
                  <Input {...control} placeholder="Coffee with Sam" />
                )}
              </Field>

              <Field label="Category" name="category">
                {(control) => (
                  <Select
                    {...control}
                    placeholder="Choose a category"
                    options={[
                      { value: "groceries", label: "Groceries" },
                      { value: "transport", label: "Transport" },
                      { value: "rent", label: "Rent" },
                    ]}
                  />
                )}
              </Field>

              <Field
                label="Amount in error"
                name="amount-error"
                error="Enter an amount greater than zero."
              >
                {(control) => (
                  <AmountInput {...control} currencySymbol={symbol} />
                )}
              </Field>

              <Field
                label="Hint and error together"
                name="both"
                hint="The hint is announced first."
                error="Then the error."
              >
                {(control) => <Input {...control} />}
              </Field>

              <Field label="Disabled" name="disabled">
                {(control) => <Input {...control} disabled value="Locked" />}
              </Field>
            </form>
          </Card>
        </Section>

        <Section
          title="Money, dates, categories"
          summary="Amount calls formatCents() and does no arithmetic of its own. Income carries a leading plus as well as a colour, so the meaning survives without the colour."
        >
          <div className="flex flex-col gap-5">
            <Example label="Amount">
              <div className="flex flex-wrap items-center gap-6">
                <Amount cents={4250} direction="spend" />
                <Amount cents={4250} direction="income" />
                <Amount cents={129999} direction="spend" />
                <Amount cents={0} direction="spend" />
              </div>
            </Example>

            <Example label="Date">
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <DateDisplay date="2026-08-19" />
                <DateDisplay date="2026-08-19" format="full" />
                <DateDisplay date="2026-01-01" format="full" />
              </div>
            </Example>

            <Example label="Category chip (colour is never the only signal)">
              <div className="flex flex-wrap gap-2">
                {categories.map((color: CategoryColor) => (
                  <CategoryChip key={color} name={color} color={color} />
                ))}
              </div>
            </Example>
          </div>
        </Section>

        <Section
          title="List rows"
          summary="The amount on the right never shrinks, wraps, or truncates. The title gives way instead, and the full text stays in the DOM for a screen reader."
        >
          <Card className="py-0">
            <ul>
              <ListRow
                leading={<CategoryChip name="Groceries" color="green" />}
                title="Weekly shop"
                subtitle={<DateDisplay date="2026-08-18" />}
                trailing={<Amount cents={8734} direction="spend" />}
              />
              <ListRow
                leading={<CategoryChip name="Salary" color="emerald" />}
                title="August salary"
                subtitle={<DateDisplay date="2026-08-01" />}
                trailing={<Amount cents={412500} direction="income" />}
              />
              <ListRow
                leading={<CategoryChip name="Transport" color="blue" />}
                title="A merchant name far longer than the row it has to fit inside, which truncates while the amount stays whole"
                subtitle={<DateDisplay date="2026-08-15" />}
                trailing={<Amount cents={1250} direction="spend" />}
                actions={
                  <>
                    <Button size="sm" variant="ghost">
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost">
                      Delete
                    </Button>
                  </>
                }
              />
            </ul>
          </Card>
        </Section>

        <Section
          title="Empty, loading, failed"
          summary="Each stands in the space its content would have taken. Nothing here ever renders a zero or a dash where a real value failed to arrive, because a confident wrong number is worse than an honest error."
        >
          <div className="flex flex-col gap-5">
            <Example label="Empty">
              <EmptyState
                title="Nothing logged in August yet"
                body="Add your first spend and this list fills up."
                action={<Button size="sm">Log a spend</Button>}
              />
            </Example>

            <Example label="Failed, with the real message">
              <ErrorState
                title="Could not load this month"
                detail="The request to the database timed out after 10 seconds."
                retryAction={retryExample}
              />
            </Example>

            <Example label="Loading">
              <div className="flex flex-col gap-4">
                <Skeleton label="Loading this month's total" variant="text" />
                <Skeleton
                  label="Loading this month's transactions"
                  variant="row"
                  count={3}
                />
                <Skeleton label="Loading the breakdown" variant="block" />
              </div>
            </Example>
          </div>
        </Section>

        <Section
          title="AuthLayout"
          summary="Signed out screens use a different frame, with no navigation. It renders its own main landmark, so it lives on its own route rather than inside this page."
        >
          <a
            href="/design/auth"
            className="focus-ring text-fg inline-flex h-11 items-center rounded-sm px-3 text-sm font-medium underline underline-offset-4"
          >
            Open the AuthLayout preview
          </a>
        </Section>
      </div>
    </AppShell>
  );
}
