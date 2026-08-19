# FinTrack design system

The visual language, written down once. Spec [0003](specs/0003-design-system-ui-foundation/index.md)
decided it; this describes what was actually built.

**Character**: quiet. Near monochrome surfaces, borders instead of shadows, and
colour spent only where it carries meaning. The loudest control on a screen is
black, not blue. The ten category colours and the focus ring are the only
saturated things in the app.

**Where the values live**: `app/globals.css`, in the `@theme` block. Not here.
The tables below are a reading of that file, and if the two ever disagree the
CSS is right. `tests/unit/tokens.test.ts` re-derives the contrast figures on
every test run, so a value that drifts below its floor fails the build.

## Build mandate

- No component file contains a hex value, an `rgb()`, or a Tailwind palette
  class. The `@theme` block opens with `--color-*: initial`, which deletes
  Tailwind's default palette outright, so `bg-red-500` does not compile to
  anything. The rule is enforced by the build, not by review.
- No component does arithmetic on money. `lib/money.ts` converts; components
  display.
- No component reads the clock. `lib/time.ts` is the only source of a date.
- Meaning is never carried by colour alone. Income has a `+`, a category chip
  has its name, an error has words.
- A failed value renders as an error, never as a zero, a dash, or an empty list.
- Every focusable element uses the one shared `focus-ring` class.
- A Tailwind class is never built by string interpolation. Anything varying at
  runtime goes through an exhaustive `Record<T, string>`, so a missing case is a
  type error rather than an invisible element.
- `AppNav` is the only `"use client"` file in `components/ui/`. A second needs a
  reason written in the file.

## Colour

Every colour has a light and a dark value and follows `prefers-color-scheme`.
There is no theme toggle and nothing is stored.

### Surface and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#fcfcfb` | `#111113` | The page |
| `--color-surface` | `#ffffff` | `#1a1a1d` | A raised or inset panel |
| `--color-border` | `#e5e5e3` | `#2b2b2f` | Card and row edges |
| `--color-border-strong` | `#c7c7c4` | `#47474c` | Form controls, which need more definition than a card |
| `--color-fg` | `#161614` | `#f1f1f3` | Body and headings (17.6:1 light, 16.8:1 dark) |
| `--color-fg-muted` | `#53534f` | `#adadb2` | Secondary text (7.6:1 / 8.5:1) |
| `--color-fg-subtle` | `#6f6f6b` | `#8e8f93` | Hints and captions (4.9:1 / 5.8:1). Never below 14px |

### Category

Exactly the ten names the `categories.color` `CHECK` constraint allows. Used
only in `CategoryChip` and, later, chart swatches. Never for interface chrome.
Contrast is quoted against `--color-surface`, the tougher of the two surfaces a
chip sits on; the floor is 3:1 and the worst case is 3.53:1.

| Token | Light | on surface | Dark | on surface |
|---|---|---|---|---|
| `--color-category-green` | `#217d2d` | 5.18:1 | `#6bd672` | 9.56:1 |
| `--color-category-orange` | `#a55a1b` | 5.16:1 | `#fca34d` | 8.72:1 |
| `--color-category-blue` | `#1862c5` | 5.87:1 | `#6ba5fb` | 6.98:1 |
| `--color-category-purple` | `#753cbb` | 6.74:1 | `#b88efc` | 6.88:1 |
| `--color-category-yellow` | `#98862f` | 3.62:1 | `#efd956` | 12.23:1 |
| `--color-category-red` | `#c31b1f` | 5.98:1 | `#fe7065` | 6.39:1 |
| `--color-category-pink` | `#bc3075` | 5.50:1 | `#ff8abb` | 7.98:1 |
| `--color-category-teal` | `#04848f` | 4.47:1 | `#7ee2ed` | 11.57:1 |
| `--color-category-slate` | `#586474` | 5.99:1 | `#99a6b6` | 7.03:1 |
| `--color-category-emerald` | `#13614a` | 7.43:1 | `#2eb88f` | 6.92:1 |

Colours are authored in OKLCH, where lightness is a real perceptual axis. That
matters because the database fixed three green names, and they are separated by
lightness as well as hue: `emerald` darkest, `green` mid, `teal` lightest.
Yellow is the tightest of the ten in light theme, because a yellow that clears
3:1 on white has to be an olive.

**Known limit**: no palette can fully separate three greens for a red green
colour vision deficiency. Anything showing all ten at once, such as feature 8's
breakdown, must label its segments rather than rely on the swatch.

### Semantic

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--color-focus` | `#5358ee` | `#90a2ff` | The one colour outside the ten, so a focus ring is never read as a category. 5.1:1 and 7.9:1 against the page |
| `--color-income` | alias of `emerald` | alias of `emerald` | Always paired with a `+` sign |
| `--color-danger` | alias of `red` | alias of `red` | Errors and the destructive button |

## Type

Geist Sans throughout, loaded through `next/font`. Amounts and the amount input
carry `font-variant-numeric: tabular-nums` (via `data-tabular`) so digits do not
shift width as a figure changes.

| Token | Size | Line height |
|---|---|---|
| `--text-2xl` | 2rem / 32px | 1.2 |
| `--text-xl` | 1.5rem / 24px | 1.3 |
| `--text-lg` | 1.125rem / 18px | 1.45 |
| `--text-base` | 1rem / 16px | 1.5 |
| `--text-sm` | 0.875rem / 14px | 1.5 |
| `--text-xs` | 0.75rem / 12px | 1.5 |

Form controls are always 16px. Below that, iOS zooms the page when an input
takes focus, which throws the layout on a phone.

## Spacing, shape, motion

- **Spacing**: `--spacing` is `0.25rem`, and every step is a multiple of it.
  There is no separate scale to memorise.
- **Radius**: `--radius-sm` (`0.375rem`) on controls, `--radius-md`
  (`0.625rem`) on cards. Nothing larger, and no shadow token exists.
- **Motion**: `--duration-fast`, 120ms, with `--ease-out-fast`. One duration, so
  there is no slower one to reach for. There are no page or route transitions.
  Under `prefers-reduced-motion: reduce` every animation and transition is cut
  to 0.01ms, which is removal rather than shortening.

## Layout

One breakpoint: `md`, 768px. Below it a phone layout with a bottom tab bar;
at and above it a desktop layout with a left rail. The narrowest width the
design has to hold is 320px.

Every interactive target is at least 44 by 44 CSS pixels at phone widths. Small
buttons shrink to 36px only at `md` and above, where there is a pointer.

## Focus

One ring, defined once as the `focus-ring` utility in `app/globals.css`: a 2px
`--color-focus` outline at a 2px offset, on `:focus-visible` only. The offset is
what keeps it readable on a solid primary button as well as on a bare surface.
No component defines its own.

## Components

All in `components/ui/`. Every one renders on the server except `AppNav`.

| Component | Props | States and notes |
|---|---|---|
| `AppShell` | `children`, `items?` | Bottom tab bar below `md`, left rail above. Owns the skip link and the one `<main>`. `items` is overridden only by the gallery |
| `AppNav` | `items` | The three tabs, active one marked with `aria-current="page"`. The only client component: it needs `usePathname()`. Icons are named by string, since a server parent cannot pass a component across the boundary |
| `AuthLayout` | `title`, `children` | Centred card, app name above, no nav. Renders its own `<main>`, so it never nests inside `AppShell` |
| `Button` | `variant`, `size`, plus every `<button>` attribute | `primary` (monochrome), `secondary` (bordered), `ghost`, `destructive` (the only coloured one). Sizes `sm` and `md`. Disabled dims to 50% rather than vanishing |
| `Field` | `label`, `name`, `hint`, `error`, `children` | Owns the ids and the whole aria wiring. `children` is a function receiving `{id, name, invalid, describedBy}`, so a control cannot be rendered without them. The error paragraph is always in the DOM so its live region can announce |
| `Input` | `FieldControlProps` plus `<input>` attributes | Uncontrolled, so it works before JavaScript loads |
| `AmountInput` | `FieldControlProps`, `currencySymbol` | `inputmode="decimal"`, currency glyph as a non editable adornment. Returns raw text and parses nothing |
| `Select` | `FieldControlProps`, `options`, `placeholder` | Native `<select>` with a drawn chevron, since `appearance-none` removes the platform's own. Cannot show a colour swatch per option |
| `Card` | `children` | Bordered panel, no shadow |
| `ListRow` | `leading`, `title`, `subtitle`, `trailing`, `actions` | The amount never shrinks, wraps, or truncates; the title truncates instead, keeping its full text in the DOM. The row wraps to a second line when actions will not fit, rather than crushing the title to nothing |
| `EmptyState` | `title`, `body`, `action` | Dashed border, so it reads as deliberate rather than as a failure |
| `ErrorState` | `title`, `detail`, `retryAction` | Shows the real message. Retry is a `<form>` posting a server action, never an `onClick`, which is what keeps this on the server |
| `Skeleton` | `label` (required), `variant`, `count` | Blocks are `aria-hidden`; a polite live region announces `label`. The label is required so two loading sections are told apart |
| `Amount` | `cents`, `direction`, `currency?` | Calls `formatCents()` and nothing else. Income gets a leading `+` and the income colour; spend is plain |
| `DateDisplay` | `date`, `format` | A `<time>` element carrying the raw `PlainDate` in `dateTime` |
| `CategoryChip` | `name`, `color` | Colour dot plus the name, always. Colour comes from an exhaustive literal map |

Every component stands in one state machine:
`loading (Skeleton) → loaded | empty (EmptyState) | error (ErrorState)`. There is
no path back into loading and no partial state. `app/error.tsx` catches what a
component's own error state cannot.

## The gallery

`app/design` renders every component in every state, and `/design/auth` shows
`AuthLayout`. Both return a 404 unless `UI_GALLERY` is set, checked in exactly
one place, `app/design/layout.tsx`.

That layout is `force-dynamic` on purpose. Left static, the flag would be read
once at build time and baked into prerendered HTML, so a build made with the
flag on (which CI has to do, to run axe) would keep serving the gallery after a
deploy where the flag is off.

```bash
UI_GALLERY=1 npm run dev   # then open /design
```

## Accessibility

WCAG 2.2 AA. `axe` runs against both gallery routes in both themes on every push
and pull request, and a violation fails the run. The recorded keyboard and
screen reader pass is in [accessibility-pass.md](accessibility-pass.md).

## Do's and don'ts

| Do | Don't |
|---|---|
| `text-fg-muted` | `text-gray-500`, `#666`, `rgb(...)` |
| `bg-category-blue` from an exhaustive map | `` `bg-category-${color}` `` |
| `<Amount cents={n} direction="spend" />` | `{(cents / 100).toFixed(2)}` |
| `<DateDisplay date={d} />` | `new Date(d).toLocaleDateString()` |
| `focus-ring` | a per component `focus:ring-2 focus:ring-blue-500` |
| `<ErrorState detail={realMessage} />` | rendering `0`, `—`, or an empty list on failure |
| A form posting a server action | an `onClick` that forces a client boundary |
