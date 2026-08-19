# 0003. A token first UI foundation on native elements, server rendered

**Date**: 2026-08-19
**Status**: Proposed

## Summary

FinTrack gets one visual vocabulary, written down once and reused by every screen. Colours, type sizes, spacing, corner radius, and the focus ring are defined as CSS variables in `app/globals.css`, each with a light and a dark value, and nothing anywhere is allowed to hardcode a colour. On top of that sit sixteen small components built on plain HTML elements, with no component library, so they stay server rendered and inherit keyboard and screen reader behaviour from the browser instead of reimplementing it. The look is quiet: near monochrome surfaces, borders rather than shadows, and colour saved for the things that carry meaning, which are the ten category colours the database already fixed and a single accent for focus.

## Requirements

**User stories**:

- As the person using FinTrack, I want every screen to look like the same app, so nothing makes me stop and work out where I am.
- As the person using FinTrack, I want to log a spend one handed on a phone, so logging never feels like a chore worth skipping.
- As the person using FinTrack, I want the app usable by keyboard alone and correct to a screen reader, so it stays usable however I am using it.
- As the person using FinTrack, I want a failed number to say it failed, so I never act on a total that is quietly wrong.
- As the person maintaining FinTrack, I want the visual rules written down in one place, so a screen built in six months matches one built today without me remembering anything.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

- **AC-1**: Every colour, type size, line height, radius, border width, focus ring, and motion duration is defined once as a CSS variable inside the `@theme` block in `app/globals.css`, and every colour token carries both a light and a dark value. No component file contains a hex value, an `rgb()`, or an arbitrary Tailwind colour class.
- **AC-2**: Each of the ten names in the `categories.color` constraint (`green`, `orange`, `blue`, `purple`, `yellow`, `red`, `pink`, `teal`, `slate`, `emerald`) maps to a `--color-category-*` token with a light and a dark value. All ten are visually distinct from each other when shown side by side, and each reaches at least 3:1 contrast against both `--color-bg` and `--color-surface` in both themes, since a chip appears on each.
- **AC-3**: `docs/design.md` documents the type scale, every colour token with its light and dark value, the spacing steps, radius, focus treatment, motion rule, and each component with its variants and its empty, loading, and error states.
- **AC-4**: The set exists under `components/ui/`: `AppShell`, `AppNav`, `AuthLayout`, `Button`, `Input`, `AmountInput`, `Select`, `Field`, `Card`, `ListRow`, `EmptyState`, `ErrorState`, `Skeleton`, `Amount`, `DateDisplay`, `CategoryChip`. `AppNav` is the only file carrying `"use client"`; every other component renders on the server.
- **AC-5**: Every interactive element is reachable and operable using the keyboard alone, in an order that matches the visual order, and shows the single shared focus ring. The ring is visible against every surface the element can sit on, in both themes.
- **AC-6**: Every form control has a label associated with it programmatically, an error message linked to its control through `aria-describedby`, and `aria-invalid` set when that control is in error. An error appearing after submission is announced to a screen reader without moving focus. When a hint and an error are both present, `aria-describedby` carries both ids, hint first.
- **AC-7**: An automated `axe` accessibility check runs against the gallery route in Playwright at the WCAG 2.2 AA rule set and reports zero violations. It runs in CI on every push and pull request with `UI_GALLERY` set, and a violation fails the run.
- **AC-8**: A manual keyboard pass over the gallery route is recorded in the repository, covering tab order, focus visibility on every surface, and what a screen reader announces for each component, including its error and empty states.
- **AC-9**: The theme follows `prefers-color-scheme` with no toggle and no stored preference, and every component in the gallery renders correctly in both themes.
- **AC-10**: `Amount` renders on the server and produces its text only through `formatCents()` from `lib/money.ts`. No component multiplies, divides, rounds, or otherwise transforms an amount. A Client Component that must show money receives the already formatted string as a prop, never cents and never a currency code.
- **AC-11**: An income amount renders with a leading `+` and the income colour; a spend amount renders plain with no colour. The sign distinguishes them, so meaning never rests on colour alone.
- **AC-12**: `DateDisplay` renders a `PlainDate` through a formatter exported from `lib/time.ts`. No component formats a date itself, and no component reads the browser clock.
- **AC-13**: In a list row at the narrowest supported width, the amount is never truncated, wrapped, or shrunk. A category or merchant name too long for the space truncates with an ellipsis, and its full text remains available to assistive technology.
- **AC-14**: Every interactive target is at least 44 by 44 CSS pixels at phone widths, including the navigation tabs and any row level edit or delete control.
- **AC-15**: No transition runs longer than 150 milliseconds, there are no page or route transitions, and every animation is removed entirely under `prefers-reduced-motion: reduce`.
- **AC-16**: `AmountInput` returns the raw text it captured and performs no parsing, rounding, or conversion to cents. It sets the numeric keyboard on a phone and shows the currency symbol as a non editable adornment.
- **AC-17**: The gallery route renders every component in every state, in both themes, and is reachable only when the `UI_GALLERY` environment variable is set. With the flag unset it returns a 404 in every environment, production included. Exactly one place in the codebase reads that flag.
- **AC-18**: `CategoryChip` maps a `CategoryColor` to its class through an exhaustive `Record<CategoryColor, string>` literal, never an interpolated class name. All ten chips render their colour in a production build.
- **AC-19**: `EmptyState`, `ErrorState`, and `Skeleton` render in place of the content they stand in for, and a route level `error.tsx` catches what they cannot. No component renders a zero, a dash, or a placeholder number where a real value failed to load.

## Decision

**Chosen option**: Option 3: hand rolled components on native elements, over a Tailwind v4 token layer.

FinTrack defines its visual language as CSS variables in Tailwind v4's `@theme`, and builds sixteen thin server rendered components over plain HTML elements with no component library, adopting a headless primitive later only when a real overlay requirement arrives.

**Implementation skills**: `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.agents/skills/playwright-best-practices/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`)

## Rationale

Reasoning, the options weighed, and the premise challenge: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No database change. This feature adds no table, no column, and no migration. It adds exactly one environment variable, `UI_GALLERY`. What it does define is a token vocabulary and a component contract, given below in place of a schema.

Token groups, all declared in `@theme` in `app/globals.css`, each with a light value and a dark value:

| Group | Tokens | Notes |
|---|---|---|
| Surface | `--color-bg`, `--color-surface`, `--color-border`, `--color-border-strong` | `surface` is a raised or inset panel. `border-strong` is for form controls, which need more definition than a card. |
| Text | `--color-fg`, `--color-fg-muted`, `--color-fg-subtle` | All three reach at least 4.5:1 against `--color-bg` and `--color-surface`. `subtle` is the floor, never used below 14 pixels. |
| Category | `--color-category-{green,orange,blue,purple,yellow,red,pink,teal,slate,emerald}` | Exactly the ten names in the `categories.color` constraint. Used only inside `CategoryChip` and chart swatches, never for interface chrome. |
| Semantic | `--color-focus`, `--color-income`, `--color-danger` | `income` aliases `--color-category-emerald`, `danger` aliases `--color-category-red`. `focus` is the one colour outside the ten, so focus can never be read as a category. |
| Type | `--text-xs` through `--text-2xl`, each with its line height | Geist Sans throughout. Amounts carry `font-variant-numeric: tabular-nums` so digits do not shift width. |
| Shape | `--radius-sm` (controls), `--radius-md` (cards) | Nothing larger. Borders only, no shadow tokens exist. |
| Motion | `--duration-fast` | One value, 120 milliseconds, ease out. There is no slower token to reach for. |

One breakpoint exists: phone layout below Tailwind's `md` (768 pixels), desktop layout at and above it. The narrowest width the design must hold is 320 pixels. Every criterion that says "phone widths" or "the narrowest supported width" means these two numbers and no others.

The three greens are separated by lightness as well as hue, because the database fixed all three names: `emerald` dark, `green` mid, `teal` light.

**State transitions**:

Every component that stands in for server data moves through one state machine, and the components exist so each state has somewhere to live:

```
loading (Skeleton) → loaded (content)
loading (Skeleton) → empty (EmptyState)
loading (Skeleton) → error (ErrorState)
```

There is no transition back into `loading` and no partial state. A section that failed shows `ErrorState` in the space its content would have occupied; it never degrades into a zero or an empty list, which would be indistinguishable from `empty`.

**API surface** (components, not endpoints; this feature exposes no HTTP surface):

| Component | Rendering | Key props | Renders | Key failure or edge case |
|---|---|---|---|---|
| `AppShell` | server | `children` | Bottom tab bar under phone widths, left side rail above | Tabs must stay above the safe area on a phone |
| `AppNav` | **client** | `items: {href, label, icon}[]` | The three tabs, active one marked | Reads `usePathname()`, the only reason any component needs the client |
| `AuthLayout` | server | `children`, `title` | Centred card, app name above, no nav | No session read; purely presentational |
| `Button` | server | `variant: primary｜secondary｜ghost｜destructive`, `size: sm｜md`, `disabled` | `<button>` | `disabled` must still be perceivable, so it dims rather than vanishes. `destructive` uses `--color-danger` |
| `Input` | server | `id`, `name`, `type`, `invalid`, `describedBy` | `<input>` | Uncontrolled by design, so it works before JavaScript loads |
| `AmountInput` | server | `id`, `name`, `currencySymbol`, `invalid`, `describedBy` | `<input inputmode="decimal">` with a symbol adornment | Returns raw text, parses nothing (AC-16). The symbol is a glyph, not a currency code |
| `Select` | server | `id`, `name`, `options`, `invalid`, `describedBy` | `<select>` | Native, so it cannot show a colour swatch in an option |
| `Field` | server | `label`, `hint`, `error`, `children` | Label, control, hint, error, wired together | Generates the ids and the `aria-describedby` linkage so a caller cannot forget it. Both hint and error ids are carried when both exist (AC-6) |
| `Card` | server | `children` | Bordered container | None |
| `ListRow` | server | `leading`, `title`, `subtitle`, `trailing`, `actions` | One row | `trailing` (the amount) never shrinks; `title` truncates (AC-13). `actions` holds row level edit and delete, each meeting the target size (AC-14) |
| `EmptyState` | server | `title`, `body`, `action` | Centred message | Must read as deliberate, never as a failure |
| `ErrorState` | server | `title`, `detail`, `retryAction` | Message plus optional retry | Shows the real error, never a generic apology that hides it. Retry is a `<form>` submitting a server action, never an `onClick`, so no client boundary is needed |
| `Skeleton` | server | `variant: text｜row｜block`, `count`, `label` (required) | Placeholder blocks | Marked `aria-hidden`, with a polite live region announcing `label`, so two skeletons on one screen are told apart |
| `Amount` | server | `cents: Cents`, `direction`, `currency?` | Formatted money | Calls `formatCents()` and nothing else (AC-10) |
| `DateDisplay` | server | `date: PlainDate`, `format: short｜full` | Formatted date in a `<time>` element | `dateTime` carries the machine readable value |
| `CategoryChip` | server | `name`, `color: CategoryColor` | Colour dot plus the name | Always carries the name, so it is never colour alone. Colour comes from an exhaustive literal map, never an interpolated class (AC-18) |

Four supporting module changes land alongside the components:

- `lib/ui.ts`, new: exports `cn()` over `clsx` and `tailwind-merge`.
- `lib/forms.ts`, new: exports `FormState`, the result shape a server action returns and `Field` reads. `{ status: "idle" } | { status: "error", message: string, fieldErrors?: Record<string, string> } | { status: "ok" }`. This feature defines it; feature 6 is the first to return one.
- `lib/time.ts`, extended: gains `formatPlainDate(date, format)`.
- `lib/money.ts`, extended: gains `currencySymbol(currency?, locale?)`, which pulls the glyph out of `Intl.NumberFormat().formatToParts()`. It lives here because it is money display, and money display has one home.

**Value sourcing** (every value a component displays, and where it comes from):

| Action | Value produced / displayed | Source |
|---|---|---|
| `Amount` renders a spend or income | The formatted money string | `formatCents()` in `lib/money.ts`, decided in spec 0001 rule 1 |
| `Amount` renders on the server | The currency code | `env().APP_CURRENCY`, server only, so `Amount` must not be a Client Component |
| A Client Component shows money | The formatted money string | Passed in as an already formatted `string` prop from a server parent. Cents never cross into the browser (AC-10) |
| `Amount` decides sign and colour | Whether this is a spend or an income | The `direction` prop, sourced from the `transactions.direction` column. The stored amount is always positive, so the sign is never read from the number |
| `DateDisplay` renders a date | The formatted date text | A new `formatPlainDate()` export in `lib/time.ts`. Does not exist yet, added by this feature |
| `DateDisplay` renders a date | The `dateTime` attribute | The raw `PlainDate` prop, passed straight through unformatted |
| Anything asking what today is | Today's calendar day | `today()` in `lib/time.ts`, which reads `APP_TIMEZONE`. Never the browser clock, never `new Date()` in a component |
| `CategoryChip` picks its colour | The `--color-category-*` token | The `color` value on the row, constrained by the `categories.color` `CHECK` to exactly ten names, and typed by `categoryColorSchema` in `lib/schema.ts` |
| `CategoryChip` renders its label | The category name | The `name` column on `categories` |
| `AppNav` marks the active tab | The current path | `usePathname()`. This is the sole reason a client boundary exists in this feature |
| `Field` links a control to its error | The control id and the description id | Generated inside `Field` via React `useId`, never supplied by the caller, so the linkage cannot be forgotten |
| `Field` renders an error message | The error text | The `error` prop, sourced by the caller from a server action's returned state. This feature defines the shape; feature 6 supplies the action |
| `ErrorState` renders a failure | The failure text | The real error returned by the caller. Never a substituted default, per the errors rule in `AGENTS.md` |
| `AmountInput` shows a currency symbol | The symbol glyph | `currencySymbol()` in `lib/money.ts`, added by this feature. `APP_CURRENCY` is a three letter code, not a glyph, so the code cannot be shown directly |
| `CategoryChip` turns a colour name into a class | The class string | An exhaustive `Record<CategoryColor, string>` literal in the component. Tailwind v4 only generates classes it can see in source, so an interpolated name produces no CSS at all and the chip renders invisible (AC-18) |
| `Field` and `ErrorState` read a failure | The error and field messages | The `FormState` shape in `lib/forms.ts`, added by this feature. Feature 6 returns the first one |
| `AppShell` picks a layout | Which side of the breakpoint we are on | Tailwind's `md` (768 pixels), stated once in this spec. Not a per component judgement |
| The gallery route decides whether to render | Whether the gallery is enabled | `UI_GALLERY` via `env()` in `lib/env.ts`, read in exactly one place (AC-17) |
| Every component picks a colour | The colour value | A `--color-*` token in `@theme`. No other source exists (AC-1) |

**Key invariants**:

- No file outside `app/globals.css` contains a colour value. Components reference tokens only.
- `--color-category-*` tokens appear only in `CategoryChip` and, later, chart swatches. Never in a button, a border, a link, or any other chrome.
- No component performs arithmetic on an amount. `lib/money.ts` converts; components display.
- No component reads the clock. `lib/time.ts` is the only source of a date, and it reads `APP_TIMEZONE` on the server.
- `AppNav` is the only `"use client"` file in `components/ui/`. Adding a second requires a reason recorded in the file.
- Meaning is never carried by colour alone. Income has a sign, a category chip has its name, an error has text.
- A failed value renders as an error, never as a zero, a dash, or an empty list.
- Every focusable element uses the one shared focus ring. No component defines its own.
- A Tailwind class is never built by string interpolation. Tailwind v4 generates CSS only for class names it can statically see, so an interpolated class silently produces nothing. Anything varying at runtime goes through an exhaustive literal map keyed by its type, which turns a missing case into a type error.
- A retry or any other in place action is a form submitting a server action, never an `onClick`. This is what keeps the client boundary at one file.

**Security model**:

Nothing here reads or writes user data, so there is no ownership model and no row level concern. Three points still matter.

- `APP_CURRENCY` and `APP_TIMEZONE` are server only and must not reach the browser bundle. Keeping `Amount` and `DateDisplay` server rendered is what enforces that.
- The gallery route renders only when `UI_GALLERY` is set, and returns a 404 otherwise. Its code is present in a production bundle but unreachable, which is acceptable because it reads no user data, takes no input, and calls nothing. The flag is what makes it reviewable on a real device when you want that.
- No component logs, reports, or transmits anything. Error text passed to `ErrorState` is rendered, not sent anywhere.

No compliance scope is triggered: this feature handles no personal data of its own.

**Configuration required**:

- `UI_GALLERY`: enables the component gallery route. Unset or absent means the route returns a 404, which is what production runs. Set it in local development, in CI so the accessibility check can reach the route, and temporarily on a preview deployment when you want to check tap targets on a real phone. Declared and validated in `lib/env.ts` as an optional boolean like value, never read from `process.env` directly.

No credential, and nothing secret: the flag reveals only that a design gallery exists. Four packages are added: `lucide-react`, `clsx`, `tailwind-merge`, and `@axe-core/playwright` as a dev dependency.

**Critical test scenarios**:

- Happy path: the gallery route renders all sixteen components in every state, in light and in dark, with no missing token and no console error, verifies **AC-4**, **AC-9**, **AC-17**
- Happy path: a spend row shows a plain amount and an income row shows the same amount with a leading `+` and the income colour, both with digits aligned, verifies **AC-10**, **AC-11**
- Failure case: a section whose data failed renders `ErrorState` carrying the real message, and no zero, dash, or empty list appears anywhere on the screen, verifies **AC-19**
- Failure case: all ten `CategoryChip` colours render correctly in a production build, which is where an interpolated class name would have silently produced nothing, verifies **AC-18**
- Failure case: a category name far longer than its row truncates while the amount beside it stays complete and unwrapped at the narrowest supported width, and the full name is still exposed to assistive technology, verifies **AC-13**
- Failure case: a submitted form with an invalid field marks the control `aria-invalid`, links its message through `aria-describedby`, and announces it without stealing focus, verifies **AC-6**
- Accessibility: `axe` reports zero WCAG 2.2 AA violations across the gallery route in both themes, verifies **AC-7**
- Accessibility: every interactive element in the gallery is reachable by keyboard in visual order, and its focus ring is visible on every surface it sits on in both themes, verifies **AC-5**
- Accessibility: with `prefers-reduced-motion: reduce` set, no animation runs at all, verifies **AC-15**
- Accessibility: all ten category swatches shown together are distinguishable, and each clears 3:1 against its surface in both themes, verifies **AC-2**

## Build plan

Ordered by the project's Skateboard approach: get one real, themed, viewable thing working end to end first, then widen it. Every step leaves the gallery route rendering and the build green.

1. Add the dependencies (`lucide-react`, `clsx`, `tailwind-merge`, `@axe-core/playwright`), write `lib/ui.ts` exporting `cn()` and `lib/forms.ts` exporting `FormState`, and declare `UI_GALLERY` in `lib/env.ts`. No visual change yet, satisfies **AC-4**, **AC-17**
2. Replace the starter contents of `app/globals.css` with the full `@theme` token layer: surface, text, all ten category colours, semantic aliases, type scale, radius, motion, each with a light and a dark value under `prefers-color-scheme`. Remove the hardcoded `body` font override, satisfies **AC-1**, **AC-2**, **AC-9**, **AC-15**
3. Build the gallery route at `app/design/page.tsx`, calling `notFound()` unless `UI_GALLERY` is set, showing the raw token layer first: every colour swatch, every type size, the spacing steps. This is the skateboard, a real page proving the vocabulary before a single component exists, satisfies **AC-17**
4. Build `Button` (including the `destructive` variant) and `Card`, and define the shared focus ring once as a reusable token driven class applied by every focusable element from here on. Add both to the gallery in every variant, size, and state, satisfies **AC-4**, **AC-5**
5. Build `AppShell`, `AppNav`, and `AuthLayout`, switching layout at `md` (768 pixels). Wire `AppShell` into a signed in route group and confirm the tabs sit in thumb reach and meet the target size down to 320 pixels wide, satisfies **AC-4**, **AC-14**
6. Add `currencySymbol()` to `lib/money.ts` with its unit tests, then build the form layer: `Field`, `Input`, `AmountInput`, `Select`. `Field` owns id generation and the `aria-describedby` and `aria-invalid` wiring, carrying both hint and error ids when both exist; `AmountInput` captures text and parses nothing. Add every state, including hint plus error together, to the gallery, satisfies **AC-4**, **AC-6**, **AC-16**
7. Add `formatPlainDate()` to `lib/time.ts` with its unit tests, then build `Amount`, `DateDisplay`, `CategoryChip`, and `ListRow`, including the exhaustive colour map, the `actions` slot, the truncation rule, and tabular numerals. Confirm all ten chips render in a production build, satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-18**
8. Build `EmptyState`, `ErrorState` (retry as a form, not an `onClick`), and `Skeleton` (with its required `label`), and add the route level `error.tsx`. Render each in the gallery in the position it stands in for, satisfies **AC-19**
9. Wire the `axe` check into Playwright against the gallery route in both themes, and set `UI_GALLERY` in the CI workflow's e2e job so the production build under test can serve the route. A violation fails the run, satisfies **AC-7**
10. Walk the gallery by keyboard and with a screen reader, fix what it finds, and record the pass in the repository, satisfies **AC-5**, **AC-8**
11. Write `docs/design.md` from what was actually built: tokens with their values, the type scale, spacing, focus, motion, and every component with its variants and states, satisfies **AC-3**

## Consequences

**Positive**:

- The token layer is one file, so a colour changes in one place and every screen follows.
- Every component except the nav renders on the server, so the browser receives no component library, no cents value, and no currency code.
- Native controls mean keyboard support, screen reader semantics, and the right mobile keyboard arrive without being written, which is most of the accessibility work.
- Release 1 features build against a settled vocabulary instead of inventing three contradicting ones.
- The gallery route makes empty, loading, and error states reachable on purpose, which is the only reliable way they get tested at all.

**Negative / tradeoffs**:

- The category picker is a native `select`, so it cannot show a colour swatch alongside each option. On a phone that is a good trade; on a desktop it is plainly less nice.
- Release 2's dialog and toast will need a headless primitive added then, with its own styling and its own learning curve. This defers that cost rather than removing it.
- No library safety net: an accessibility mistake is ours to catch, which is why the axe checks and the manual pass are contract rather than optional, and the manual pass has to be repeated when components change.
- Sixteen components are specified before any real screen exists, so some will be wrong. Expect Release 1 to amend them.
- Three of the ten category colours are greens, fixed by the database. They are separated by lightness, but a chart of all ten will always need labels rather than colour alone.
- The form controls are uncontrolled, which is what makes them work before JavaScript loads, but it also means no feedback on a field until the form is submitted. That sits in real tension with logging a spend in a hurry, and feature 6 may decide a live amount preview is worth a client boundary. If it does, this is the constraint it is trading away, not an oversight.
- The gallery route's code is present in a production bundle even though the flag makes it unreachable. That is the price of keeping the gallery inside the real Next and Tailwind pipeline instead of standing up a second build system for it.

**Neutral**:

- Four new packages, all small and all replaceable.
- One new environment variable, `UI_GALLERY`. Spec 0001 fixed four; this is the fifth, added the way that spec said later features should add them.
- `AGENTS.md` currently lists `components/` flat; this introduces `components/ui/` and needs that line updated.
- `lib/time.ts` gains a date formatter and `lib/money.ts` gains a currency symbol reader. Both modules are governed by earlier specs, and both changes are additive with no conflict, but readers of specs 0001 and 0002 should know they grew rather than finding out from a diff.
- The gallery route is a real page that has to be kept working as components change. That is the point of it, and it is still upkeep.

## Follow-up

- [ ] The `accessibility` community skill (`addyosmani/web-quality-skills`) was installed during this design and is not yet in root `AGENTS.md` `## Agent skills`. Its conventions apply to every UI file in the project, so it belongs at root level rather than in a nested area file.
- [ ] Record in `AGENTS.md` `Declined:` that `community-access/accessibility-agents@playwright-testing`, `nweii/agent-stuff@suggest-lucide-icons`, and `hairyf/skills@tailwindcss` were considered and passed over, so a later stage does not offer them again. The Tailwind one was declined specifically because it does not distinguish v3 from v4 and this project is on v4.
- [ ] `AGENTS.md` `## Rules` says layout is by layer with a flat `components/`. Update it to `components/ui/` for primitives and `components/<feature>/` for feature components, and add the four new dependencies to the stack list.
- [ ] No MCP server was found that helps with icons, class merging, or accessibility testing. The Playwright MCP already connected covers the browser driving this feature needs.
- [ ] Feature 8, where your money went: the breakdown must label its segments rather than rely on the swatch, because the database fixes three green category names and no palette can fully separate them.
- [ ] Verify the ten category swatches under a deuteranopia and protanopia simulation during the manual pass in build step 10, not only against the contrast numbers.
- [ ] Feature 5 owns the authentication model and has no spec yet. `AuthLayout` and `AppShell` are purely presentational and read no session, so nothing feature 5 decides invalidates them, but the route grouping that decides which layout wraps which page is feature 5's to settle.
- [ ] Revisit the overlay question when Release 2 needs a dialog or a toast. Choose the headless primitive then, with the real requirement in hand, and style it with the tokens this spec defines.
- [ ] Storybook remains the fallback for the gallery. It was passed over because it is a second build system, and the `UI_GALLERY` flag was chosen instead. If the flag proves fragile, or the gallery grows past what one route can hold legibly, Storybook is the option that makes "never reaches production" structural rather than enforced by a check.
- [ ] Specs 0001 and 0002 both grew because of this feature: `lib/money.ts` gains `currencySymbol()`, `lib/time.ts` gains `formatPlainDate()`, and the four environment variables become five. Neither spec is wrong, but `/sync` should reconcile them so a future reader is not surprised.
