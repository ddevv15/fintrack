# Accessibility pass: design system

Spec [0003](specs/0003-design-system-ui-foundation/index.md) AC-5, AC-6, AC-8.
Route walked: `/design` and `/design/auth` with `UI_GALLERY=1`.
Date: 2026-08-19 · Chromium, light and dark.

> **One part of this is not done.** Everything below was checked with automated
> tooling and by reading the accessibility tree the browser actually exposes.
> Nobody has yet listened to this page with a real screen reader. VoiceOver and
> NVDA differ from the tree in ways that matter, particularly around whether a
> live region announces at the moment it changes, so the rows marked **owed**
> still need a person with the audio on. AC-8 is not fully satisfied until they
> are done.

## Automated, and passing

| Check | Result |
|---|---|
| `axe` WCAG 2.2 AA, `/design`, light | 0 violations |
| `axe` WCAG 2.2 AA, `/design`, dark | 0 violations |
| `axe` WCAG 2.2 AA, `/design/auth`, light | 0 violations |
| `axe` WCAG 2.2 AA, `/design/auth`, dark | 0 violations |
| Interactive targets at 320px | all ≥ 44×44 |
| Contrast, ten category colours, both themes | worst case 3.53:1 against a 3:1 floor |
| Contrast, three text colours, both themes | worst case 4.93:1 against a 4.5:1 floor |
| `prefers-reduced-motion: reduce` | every animation 0.01ms, none running |

Re-run with `UI_GALLERY=1 npm run test:e2e`. These live in
`tests/e2e/design-system.spec.ts` and `tests/unit/tokens.test.ts`, so they run
on every push rather than only when someone remembers.

## Tab order

22 stops, identical in light and dark, and matching the visual order. Every one
shows the shared focus ring; none was missing it. Disabled buttons are correctly
skipped.

| # | Element | Announced as | Size |
|---|---|---|---|
| 1 | Skip link | link, "Skip to content" | 122×37 |
| 2–4 | Nav tabs | link, "Log" / "Month" / "Breakdown", active one `aria-current="page"` | 199×44 |
| 5–8 | Buttons, medium | button, "Save spend" / "Cancel" / "Edit" / "Delete" | 44 tall |
| 9–12 | Buttons, small | same names | 36 tall at desktop, 44 at phone widths |
| 13 | Amount input | textbox, "Amount" | 44 tall |
| 14 | Note input | textbox, "Note" | 44 tall |
| 15 | Category select | combobox, "Category" | 44 tall |
| 16 | Amount in error | textbox, "Amount in error", `[invalid]` | 44 tall |
| 17 | Hint and error together | textbox, "Hint and error together", `[invalid]` | 44 tall |
| 18–19 | Row actions | button, "Edit" / "Delete" | 44 at phone widths |
| 20 | Empty state action | button, "Log a spend" | |
| 21 | Error state retry | button, "Try again" | |
| 22 | AuthLayout preview | link | 44 tall |

The skip link is first because the nav precedes the content in the DOM, which is
what the desktop rail needs. Without the skip link a screen reader user would
cross three tabs before reaching content on every screen.

## What the accessibility tree exposes

Read from the browser's own tree, not from the markup:

- `textbox "Amount"`, `textbox "Note"`, `combobox "Category"` — every control
  takes its name from its `Field` label, so none is unlabelled.
- `textbox "Amount in error" [invalid]` — the invalid state is exposed, not just
  drawn in red.
- `textbox "Disabled" [disabled]: Locked` — disabled is exposed and the value is
  still readable.
- `status: Loading this month's total`, `status: Loading this month's
  transactions`, `status: Loading the breakdown` — three distinct labels, which
  is why `Skeleton` requires one. "Loading" three times would say nothing about
  which part of the screen is still coming.
- `alert` — `ErrorState` carries the real failure text, not a generic apology.
- Category chips expose their name; the colour dot is `aria-hidden`, so the
  meaning never rests on colour.

## Owed: the human listen-through

| # | To check | Why the tree cannot answer it |
|---|---|---|
| 1 | Submit a form with an error and confirm the message is spoken **without focus moving** | The tree shows the live region exists; only a real screen reader shows whether it fires and when |
| 2 | Confirm hint then error are read in that order when both are present | `aria-describedby` order is correct in markup; announcement order is the reader's call |
| 3 | Confirm a `Skeleton` replaced by content does not leave a stale announcement | Depends on the reader's queueing |
| 4 | Walk the ten category chips and confirm each announces its name, not a colour | |
| 5 | Confirm the bottom tab bar's active tab is announced as current on a phone | iOS VoiceOver handles `aria-current` differently from desktop |
| 6 | ~~View the ten swatches under a deuteranopia and protanopia simulation~~ **Done, see below** | Ran with Chrome's vision deficiency emulation rather than by ear |

Item 6 is carried from the spec's own follow up list, and is now **done**: see
the section below.

## Colour vision: measured, and worse than the spec assumed

Run on 2026-08-20 with Chrome's `Emulation.setEmulatedVisionDeficiency`, taking
the rendered pixels of all ten category swatches and measuring the closest pair
in each mode. Distance is plain RGB, on a 0 to 441 scale.

| Simulation | Light, closest pair | Dark, closest pair |
|---|---|---|
| none | green vs emerald, 41.6 | orange vs yellow, 54.9 |
| deuteranopia | orange vs red, **8.6** | blue vs purple, **9.6** |
| protanopia | pink vs slate, 22.9 | pink vs slate, **10.2** |
| tritanopia | blue vs teal, 15.9 | orange vs pink, 15.9 |
| achromatopsia | green vs orange, **0.0** | purple vs emerald, **0.0** |

Spec 0003 predicted that the three greens would be hard to separate. The real
picture is broader. Under deuteranopia, the most common deficiency, a viewer
sees roughly **four groups rather than ten**: green, orange, yellow, and red
collapse into one olive family; blue and purple become the same blue; pink,
teal, and slate become one grey blue. Under achromatopsia two pairs render
pixel identical.

**This does not change the components, and nothing here is a defect.** The
palette is fixed by the ten names in the `categories.color` constraint, and no
set of ten hues survives these simulations. What matters is that the invariant
already holds: `CategoryChip` always renders the category name beside the dot,
so colour is never the only signal anywhere in the interface. The swatch grid in
the gallery is a token reference, not a screen anyone reads meaning from.

**What it sharpens.** Feature 8, where your money went, must label every segment
of its breakdown directly. A legend that maps colour to category is not enough,
because a third of the palette is one colour to a deuteranope. Spec 0003 already
requires labelling; this is the measurement behind it, and it is stronger than
"the greens are close".

## Known limits, accepted

- **Three greens**. The database fixes `green`, `emerald`, and `teal`. They are
  separated by lightness, but anything showing all ten at once must label its
  segments. Feature 8 owns that.
- **No live validation**. Form controls are uncontrolled so they work before
  JavaScript loads, which means nothing is announced until submit. Recorded as a
  trade in spec 0003; feature 6 may revisit it.
- **Native `<select>`**. It cannot show a colour swatch per option, so the
  category picker is names only.
