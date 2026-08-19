# 0003. Rationale: design system and UI foundation

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: this designs sixteen components before a single real screen exists, which is the opposite of what Skateboard asks for. Some of these components will be wrong, because no real screen has pushed back on them yet, and a component set built in a vacuum tends to grow parts nothing ever uses while missing the one prop the first real screen needs. The right framing is a **first draft with a forcing function**: build the token layer and the two layouts properly, because those are genuinely expensive to change later and every screen depends on them; treat the component set as provisional, build nothing Release 1 does not need, and expect features 6, 7, and 8 to amend it without that counting as a failure. The gallery route is the forcing function: a component that cannot be rendered in every one of its states is not finished.
>
> This feature also assumes an authentication model that has no spec yet. It defines a signed out frame and a signed in shell, which means it assumes there is such a thing as being signed in. Feature 5 owns that decision. Both layouts here are purely presentational and read no session, so nothing feature 5 decides can invalidate them, but the assumption is real and is written down as a constraint below.

FinTrack has a running scaffold, a proven data model, and no visual language at all. What exists today in `app/globals.css` is the Next.js starter default: two colours, a body font override, nothing else. Release 1 puts three screens in front of a person: log a spend, this month's transactions, where your money went. Without a settled vocabulary each of those three screens invents its own spacing, its own idea of what an error looks like, and its own way of showing an amount, and the third screen quietly contradicts the first.

Three forces shape this decision.

**The database has already made design decisions.** `categories.color` is a `CHECK` constraint over exactly ten names: green, orange, blue, purple, yellow, red, pink, teal, slate, emerald. Those names exist; nothing yet says what they look like. Feature 8 puts all ten side by side in a category breakdown, so they must be told apart at a glance. Three of the ten are greens, which is not a choice available to revisit without a migration.

**Two modules already hold exclusive rights.** `lib/money.ts` is the only place an amount is converted for display, and its currency default reads `env().APP_CURRENCY`, which exists only on the server and throws in a browser. `lib/time.ts` is the only source of what today is. Any component showing an amount or a date has to route through them rather than around them, and where a component renders decides whether it can call them at all.

**This is a personal app used mostly on a phone, standing up, in a hurry.** Logging a spend has to be fast one handed. The monthly review happens on a laptop. Nobody else uses it, so there is no design team to serve and no brand to satisfy; the cost that matters is the cost of maintaining the thing alone, in bursts, months apart.

Not deciding means each Release 1 feature guesses, and the first two get rewritten once the third reveals the contradiction.

## Options considered

### Option 1: adopt shadcn/ui and style its tokens

Copy the shadcn component set into the repo and retheme its CSS variables. The most trodden path in this stack, and a large component surface arrives working on day one.

**Pros**:
- Fastest route to a broad, competent component set, including the overlays Release 2 will want.
- Accessibility behaviour arrives already solved, via the Radix primitives underneath.
- Enormous community familiarity, so any future help understands the code immediately.

**Cons**:
- Every component is a Client Component, which pulls a server first app toward the client for no gain on a set this simple.
- You own the copied code and inherit its maintenance, so the simplicity is borrowed rather than kept.
- Brings Radix packages and a token naming scheme that does not match the ten category names the database already fixed, so the palette work still has to be done by hand.
- A default look strong enough that the app ends up looking like every other shadcn app, which is the opposite of a considered visual language.

### Option 2: a headless primitive library, styled from scratch

Take Base UI or React Aria Components for behaviour and write all the styling. Correct behaviour without inheriting anyone's look.

**Pros**:
- Best in class keyboard and screen reader behaviour, particularly React Aria.
- The visual language stays entirely ours.
- The right foundation once complex overlays and comboboxes actually arrive.

**Cons**:
- Substantial dependency and a real learning curve, paid up front for a set whose hardest control is a category picker.
- A native select already beats any custom listbox on a phone, so the headless machinery earns nothing on the one control that would justify it.
- Its own component model to learn and keep current, months apart, alone.

### Option 3: hand rolled on native elements, with a token layer

Define the tokens in Tailwind v4's `@theme`, then write thin components over `button`, `input`, `select`, and `label`. Adopt a primitive later, per component, only when a real requirement forces it.

**Pros**:
- No component dependency at all, and every component stays a Server Component.
- Native controls bring keyboard support, screen reader semantics, and the correct mobile keyboard for free, which is most of the accessibility work already done.
- The token layer is the part that is genuinely expensive to change later, so effort concentrates where it pays.
- Nothing to relearn in six months; it is HTML.

**Cons**:
- A native select cannot show a colour swatch inside its options, so the category picker is plainer than a custom one would be.
- Overlays in Release 2 (dialog, toast) will need a primitive added then, so this defers rather than avoids that decision.
- No safety net: an accessibility mistake is ours to catch, which is exactly why the axe checks and the manual pass are part of the contract rather than a nice to have.

## Rationale

Option 3, because the forces in Context point at the token layer rather than at the components. The expensive, hard to reverse work here is the ten category swatches, the light and dark pairing, and the focus treatment. None of that is made easier by a component library; shadcn would hand over a token scheme that does not know the ten names the database fixed, so the palette work happens by hand either way. What a library would actually buy is behaviour on complex controls, and the set has none: the hardest control is a category picker, and on a phone first app a native `select` is not a compromise but the better answer, since it opens the platform picker with real one handed ergonomics.

The rendering model settles it. Spec 0001 chose server first, and `formatCents` defaults its currency to a server only value. A set of Client Components would mean either threading the currency into the browser or formatting money in the browser, and both weaken the rule that says one module owns money conversion. Hand rolled components stay server rendered, so `Amount` calls `formatCents` directly and the browser never sees `APP_CURRENCY` or a cents value. Exactly one component in the whole set needs the client, and only because it reads the current path to mark the active tab.

The honest cost is that Release 2 will need an overlay primitive, and that this defers rather than avoids the choice. That is the right trade: choosing a primitive with a real dialog requirement in hand beats choosing one now against an imagined requirement, and the token layer this spec builds is what any later primitive gets styled with anyway.

Two smaller calls deserve their reasoning recorded. **The accent is not a new hue.** The ten category names cover most of the colour wheel, so an accent invented alongside them would collide with one. Instead the semantic tokens alias the palette that has to exist regardless: income aliases emerald, which is what the seeded Salary category already is, so an income amount and its Salary chip agreeing in colour reads as coherence rather than coincidence; destructive aliases red. Only the focus ring gets a colour of its own, because focus must never be mistaken for a category and must survive sitting on top of any of the ten. **Category colours are confined to chips and chart swatches** and are never used for interface chrome, which is what makes that reuse safe.

**Three of the ten names are greens**, which the database fixed and this spec cannot undo. Separating them by hue alone fails, so they are separated by lightness as well: emerald sits dark, green sits mid, teal sits light. A chip always carries its category name, so a chip is never colour alone. A chart is, which is why the follow up asks feature 8 to label its segments rather than rely on the swatch.
