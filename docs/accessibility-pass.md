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

---

# Accessibility pass: where your money went

Spec [0005](specs/0005-where-your-money-went/index.md) AC-5, AC-12.
Route walked: `/breakdown`, signed in, against a seeded month of three
categories at 60, 30, and 10 percent.
Date: 2026-08-25 · Chromium, light and dark.

This is the first route whose accessibility could not be checked from the
gallery. There is no version of it a visitor can reach, so the checks run behind
a real session, built by `tests/e2e/signed-in.setup.ts` and asserted in
`tests/e2e/breakdown.signed.spec.ts`.

## Automated, and passing

| Check | Result |
|---|---|
| `axe` WCAG 2.2 AA, `/breakdown`, light | 0 violations |
| `axe` WCAG 2.2 AA, `/breakdown`, dark | 0 violations |
| Tab order | skip link, then the three nav tabs, then nothing |
| Rows and bars in the tab order | none, which is correct: they are not interactive |
| Bars exposed to assistive technology | none, all three `aria-hidden` |
| The breakdown list carries an accessible name | yes, "Spending by category, largest first" |

## What the accessibility tree exposes

- The heading is a level 1 naming the month and year, for example "August 2026".
- The total is a `<dl>` pair, so "Total spent" and the figure are related to
  each other rather than merely adjacent.
- The category list is a named `list` of three `listitem`s. Each row reads as
  its category name, its amount, and its share, in that order.
- The bars are `aria-hidden`, so a reader hears the share once, as words, and
  never as a second announcement of a rectangle.
- The Breakdown tab carries `aria-current="page"`.

**The colour finding above is honoured.** The measurement in the design system
pass showed that under deuteranopia the ten category colours collapse into about
four groups, and concluded that feature 8 must label every segment directly
rather than lean on a legend. It does: every row prints its category name in
text, and there is no legend anywhere on the screen. Removing all colour from
this page would lose nothing but decoration.

## Owed: the human listen-through

| # | To check | Why the tree cannot answer it |
|---|---|---|
| 1 | Confirm each row is read as one unit, name then amount then share, rather than as three loose fragments | Row grouping is the reader's call, not the tree's |
| 2 | Confirm the list announces its name and its count on entry | Whether `aria-labelledby` on a `<ul>` is spoken varies by reader |
| 3 | Confirm the `<1%` share is spoken usefully rather than as "less than one percent sign" | Punctuation handling is reader and verbosity dependent |
| 4 | Confirm the empty state is reached and read without hunting | It replaces the list entirely, so nothing announces the change |

The same caveat as the design system pass applies: nobody has listened to this
route with a real screen reader yet, so AC-12 is satisfied by the automated and
tree level checks but not yet by ear.

---

# Accessibility pass: log a spend

Spec [0006](specs/0006-log-a-spend/index.md) AC-8, AC-9.
Route walked: `/`, signed in, at 420px and at desktop width.
Date: 2026-08-26 · Chromium, light and dark.

The form is built entirely from primitives feature 4 already checked, so most of
the work here was inherited: `Field` owns every label, id, and
`aria-describedby` link, and no control in this form can render without them.
What is new, and what this pass is actually about, is the confirmation.

## Automated, and passing

| Check | Result |
|---|---|
| `axe` WCAG 2.2 AA, `/`, resting state | 0 violations |
| `axe` WCAG 2.2 AA, `/`, showing a field error | 0 violations |
| Console errors and warnings on load and on submit | none |

Both axe runs live in `tests/e2e/log-spend.signed.spec.ts`, so they run on every
push rather than only when someone remembers. Running them signed in is the
point: there is no version of this screen a visitor can reach.

## A finding worth carrying to the other forms

The confirmation deliberately does **not** use the `empty:hidden` class that
`Field` and `FormError` use on their live regions. That utility resolves to
`display: none`, which removes the element from the accessibility tree, so the
region is absent during exactly the window it needs to be observed in and then
appears with its content already in place. Playwright's `getByRole("status")`
could not find the empty region at all, and it reads the same tree a screen
reader does, which is how this surfaced.

This form reserves the line instead. `Field` and `FormError` still use the old
pattern, and they were shipped against the reasoning that a live region must
exist before its content changes, which is right; the `empty:hidden` part
quietly undoes it. Worth revisiting in spec 0003 rather than patched here.

## What the accessibility tree exposes

| Element | Exposed as |
|---|---|
| Amount | textbox, labelled "Amount", described by its hint then its error, `aria-invalid` when refused |
| Category | combobox, labelled "Category", placeholder option disabled |
| Date | textbox with a date picker, labelled "Date", `max` set to today in your zone |
| Note | textbox, labelled "Note", described by "Optional." |
| Submit | button, disabled while saving, its label changing to "Saving..." rather than becoming a spinner |
| Confirmation | `status` region, present and empty before a save, holding the stored amount after one |

Focus after a successful save returns to the amount field, and the confirmation
never takes focus, so a keyboard user is left ready to type the next entry
rather than somewhere they have to navigate out of.

## Owed: the human listen-through

| # | To check | Why the tree cannot answer it |
|---|---|---|
| 1 | Confirm the confirmation is actually spoken on a save, and not swallowed | Whether a `status` region announces at the moment it changes is the reader's call, and is the exact thing the `empty:hidden` finding above is about |
| 2 | Confirm the amount is read as money rather than digit by digit | Number and currency handling is reader and verbosity dependent |
| 3 | Confirm a refused save announces the field error without the person having to hunt for it | Two live regions update at once, the summary and the field, and the order they are read in is not something the tree fixes |
| 4 | Confirm the native date picker is usable by keyboard on a phone reader | Platform pickers vary, and this is the one control not built from our own primitives |

The same caveat as the earlier passes applies: nobody has listened to this route
with a real screen reader yet, so AC-8 is satisfied by the automated and tree
level checks but not yet by ear.

# Accessibility pass: categories you manage

Spec 0008, AC-23. Two new screens (`/categories` and its add and edit forms) and
three new controls: a colour radio group, a hide control on every row, and a
delete confirm step.

## Automated, and passing

`tests/e2e/categories.signed.spec.ts` runs `@axe-core/playwright` at WCAG 2.2 AA
against `/categories` and `/categories/new`, signed in, and fails the run on any
violation. It found none. The same suite drives the whole flow, add, rename,
hide, unhide, delete, entirely through accessible names (`Edit Groceries`,
`Hide Groceries`, `Confirm deleting Groceries`), so a control whose name stopped
saying which category it belongs to would fail the suite rather than only
looking fine.

## The colour picker, which is the one worth explaining

Colour is the whole subject of this control, which makes it the one place where
colour cannot carry any meaning on its own.

Three things do that work. Every swatch has its colour written beside it in
words, so the option is `Green` and not a green square. A colour one of your
categories already uses says `used` in text next to it, rather than being dimmed
or marked with a ring. And the selected option is shown by a heavier border and
a check mark, never by a colour change, because a colour change on a swatch is
indistinguishable from the swatch itself.

It is a real `<fieldset>` of real `<input type="radio">` elements. That is what
makes arrow key navigation, the single tab stop, and the group's announcement
arrive from the browser rather than being rebuilt. The inputs carry `sr-only`,
which keeps them focusable and in the accessibility tree while the swatch and
the word are what you see; `hidden` or `display: none` would take them out of
both. The focus ring is drawn on the visible label through `has-focus-visible`,
so focus is visible on the thing the eye is actually on.

## What the accessibility tree exposes

| Element | Exposed as |
|---|---|
| Name | textbox, labelled "Name", described by its hint then its error, `aria-invalid` when refused |
| Colour | radiogroup, labelled "Colour", ten radios named "Green", "Orange used", and so on |
| Add / Save | button, disabled while saving, its label changing to "Adding..." / "Saving..." |
| Each row's Edit | link, named "Edit &lt;category&gt;" |
| Each row's Hide | button, named "Hide &lt;category&gt;" or "Unhide &lt;category&gt;" |
| Delete | button, named "Delete &lt;category&gt;", replaced on click by "Confirm deleting &lt;category&gt;" and "Keep &lt;category&gt;" |
| Confirmation | `status` region, present and empty on arrival, holding the stored sentence a tick later |
| Hidden section | `h2` "Hidden", labelling its own list, absent entirely when nothing is hidden |

Focus moves in three places, all deliberate. Revealing the delete confirm step
moves focus onto Confirm; dismissing it puts focus back on Delete. Hiding or
unhiding a category moves focus to the status region, because that control's own
row is about to be unmounted from one list and remounted under the other
heading, and focus left on a removed element drops to the top of the document.

## Owed: the human listen-through

| # | To check | Why the tree cannot answer it |
|---|---|---|
| 1 | Confirm the ten radios are announced as one group of ten, and not as ten unrelated controls | Whether a reader announces the group and the position depends on the reader and its verbosity |
| 2 | Confirm "used" is heard as part of the option and not as loose text after it | It is inside the label, but where a reader breaks the accessible name is its own call |
| 3 | Confirm hiding a category is actually spoken, and that focus landing on the status region does not swallow the announcement | Focus and a live region update happen in the same tick, and which wins is reader dependent |
| 4 | Confirm the confirm step's question is not read three times over | The sentence is `aria-hidden` precisely because both buttons already name the category, and whether that lands is a listening question |

The same caveat as every earlier pass applies: nobody has listened to these
routes with a real screen reader yet, so AC-23 is satisfied by the automated and
tree level checks but not yet by ear.
