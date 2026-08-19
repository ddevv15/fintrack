# components/ui

The shared UI primitives every screen reuses. Introduced by [spec 0003](../../docs/specs/0003-design-system-ui-foundation/index.md); the visual language and the full component contract live in [docs/design.md](../../docs/design.md).

## What is here

Sixteen components on plain HTML elements, no component library: `AppShell`, `AppNav`, `AuthLayout`, `Button`, `Input`, `AmountInput`, `Select`, `Field`, `Card`, `ListRow`, `EmptyState`, `ErrorState`, `Skeleton`, `Amount`, `DateDisplay`, `CategoryChip`.

## Conventions

- **Server first.** `AppNav` is the only file here carrying `"use client"`, and only because marking the active tab needs `usePathname()`. A second one needs its reason written in the file. An in place action is a `<form>` posting a server action, never an `onClick`.
- **Colours come from tokens.** `@theme` in `app/globals.css` opens with `--color-*: initial`, which deletes Tailwind's default palette, so `bg-red-500` compiles to nothing. A hex value or an `rgb()` in a component is a bug.
- **Never build a class name by interpolation.** Tailwind v4 only generates CSS for class names it can statically read, so `` `bg-category-${color}` `` produces no CSS and the element renders invisible, in a production build and not in dev. Anything varying at runtime goes through an exhaustive `Record<T, string>`, which turns a missing case into a type error. See `CategoryChip`.
- **One focus ring.** Every focusable element applies the `focus-ring` utility. No component defines its own.
- **Money and dates belong to their modules.** `Amount` calls `formatCents()` and does no arithmetic; `DateDisplay` calls `formatPlainDate()`. Neither reads the clock. Both must stay server rendered, because their defaults read server only environment values; a Client Component that shows money takes the formatted string as a prop.
- **`Field` owns the accessible wiring.** It generates the ids and the `aria-describedby` and `aria-invalid` linkage, and hands them to its child through a render prop, so a caller cannot render a control without them.
- **Meaning never rests on colour alone.** Income carries a `+`, a category chip carries its name, an error carries text.
- **A failure renders as an error**, never as a zero, a dash, or an empty list.

## Seeing it

```bash
UI_GALLERY=1 npm run dev    # then open /design
```

The gallery renders every component in every state, and is what the `axe` check in `tests/e2e/design-system.spec.ts` runs against. A component added without its states is a component the accessibility gate never sees.

_Drafted by /sync from the introducing change, worth a quick human pass._
