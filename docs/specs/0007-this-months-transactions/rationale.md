# 0007 rationale · This month's transactions

The reasoning behind [index.md](index.md). The build spec is there; this is the record of why it says what it says.

## Context

> ⚠️ Premise note: this feature makes past money editable, and records nothing about the edit. Change an amount from 45.00 to 4.50 and every figure the Breakdown ever showed for that month changes with it, leaving only `updated_at` to say that anything happened at all, and not what. For a mutation touching money that would normally be an amendment record, not an option. Two things make it acceptable here and both are worth stating plainly, because they are also the conditions under which it stops being acceptable: there is exactly one person in this system, so the only person who can be misled by an untraceable edit is the person who made it, and nothing downstream is derived from a month once it closes. Release 3 breaks the second condition. A budget you met can become a budget you missed with no trace, which is a different kind of wrong from a total being restated. The right call now is to ship the correction path, because a tracker you cannot correct is a tracker you stop trusting within a week, and to decide the amendment record before budgets arrive rather than after. It is enrolled as a follow up item.

Feature 6 shipped the ability to log a spend. It shipped without any way to see what you logged, or to change it. Spec 0006 said so in its own premise note and left an edit path as a follow up item that names this feature. So the gap this closes is not a refinement, it is the missing half of the app's core loop: today you can put money in and never take it back out.

Three forces shape what this screen has to be.

The first is that the numbers have to agree. Feature 8 already renders a total for this month, worked out in TypeScript from month scoped, spend filtered rows. This screen shows the same month, and if it computes its window or its filter even slightly differently, two screens in the same app quietly report two different totals for the same money. Nothing in the type system would catch it, and the person looking at it has no way to tell which one is right. Spec 0005 anticipated exactly this, noting that its loader reads the same rows feature 7's list would read.

The second is that the schema is already built for this. Spec 0002 created an index named for this feature, `transactions_owner_occurred_idx (user_id, occurred_on DESC, created_at DESC)`, whose comment says it exists for feature 7's month list and that `created_at` is the newest first tiebreak for two entries logged on the same day. Update and delete policies on `transactions` exist. The `updated_at` trigger exists. Even `AppShell` already ships a `/transactions` tab with a comment saying feature 7 drops its `prefetch: false` flag, and `ListRow` reasons in its own documentation about how a row with a chip, an amount, and two row actions should wrap at 320 pixels. Several past authors built toward this screen. The main design question is therefore not what to build, it is what shape the correction path takes.

The third is that correcting and deleting are destructive, and they sit next to each other on a small screen, on rows that all look alike. The failure here is not a crash. It is deleting the wrong entry, or re filing an entry you only opened to fix a typo, and either one damages the data this app exists to keep honest.

There is also a constraint on the UI layer worth naming. Spec 0003 built sixteen primitives, deliberately server first, and `AppNav` is the only `"use client"` file among them, permitted because marking the active tab genuinely needs the current path. A second one needs its reason written in the file. There is no modal or dialog primitive, and no focus trap, so anything that wants one is not reusing existing work, it is scoping new shared UI.

## Options considered

### Option 1: The list only, corrections deferred

Ship the read only month list now and leave editing and deleting to a later feature.

**Pros**:

- The smallest possible slice, and genuinely useful on its own: seeing the month is the thing that cannot be done at all today.
- No destructive action, so no confirm step, no focus management, and no second client component.
- Would ship in a fraction of the time.

**Cons**:

- It fails the feature's own stated purpose. The scope line is "so you can spot a mistake and fix it", and this half only spots.
- Being able to see a wrong entry and not correct it is arguably worse than not seeing it, because it makes the flaw a daily irritation rather than an abstract one.
- Spec 0006 already deferred correcting a spend to this feature. Deferring it again means two consecutive features each assuming the next one handles it.

### Option 2: A dedicated edit route, with delete confirmed in the row

Editing happens at `/transactions/[id]/edit`, a server rendered form on the existing primitives. Deleting happens on the row itself behind a two step confirm, and removes the row for real.

**Pros**:

- The edit form is a Server Component reading its own data, so the currency, the decimal count, and today never reach the browser, matching how the Log screen already works.
- It is linkable, back button friendly, works without JavaScript, and gets the route error boundary and `notFound()` for free.
- Delete stays one tap from the row it acts on, which is right for the common case of a duplicate you want gone, and the confirm is what stops it being dangerous.
- Splitting the two actions puts the heavier one behind a navigation and the lighter one in reach, which matches how often each is actually used.

**Cons**:

- Two surfaces for what a person may think of as one job, and correcting several entries means several round trips.
- It still costs one client component for the confirm, spending the bar spec 0003 set.
- Delete and edit end up implemented in noticeably different styles, which reads as inconsistent until you know why.

### Option 3: Inline editing in the list

The row expands into an edit form in place, with no navigation.

**Pros**:

- You never lose your place, which is the nicest version of this for correcting several entries in a row.
- One screen to build rather than two, and one mental model for both actions.

**Cons**:

- The list becomes a client component holding which row is open and the state of its fields. Money and the currency's decimal count then live in the browser, which every earlier spec in this project has deliberately kept on the server.
- A form inside a list row is hard to make correct for a screen reader: the row's own semantics and the form's compete, and the list's item count changes as rows expand.
- No deep link to an entry, and the back button does not close a form.

### Option 4: A dialog for both editing and confirming

A modal over the list handles the edit form and the delete confirm.

**Pros**:

- One consistent pattern for both actions, and the list stays visible behind it for context.
- The resulting dialog primitive would serve later features, including feature 9's category management and the existing account deletion in settings.

**Cons**:

- Building a correct dialog is not small: focus trapping, focus restoration, Escape, scroll locking, and screen reader semantics are each a place to get it subtly wrong, and getting it subtly wrong is invisible to anyone not using a screen reader.
- It is new shared UI that spec 0003 did not scope, designed against a single caller, which is the usual way a shared component ends up slightly wrong for its second caller.
- It puts the whole feature behind a piece of infrastructure rather than behind the feature's own work.

## Rationale

Option 2 wins because of what the Context makes expensive. The money rule in this project is that the server owns the currency, the decimal count, and today, and that no component does arithmetic on an amount. A server rendered edit route satisfies that by construction: the form receives strings, `parseAmount()` runs in the action with the decimal count read from the profile at the moment of the save, and the browser never learns the currency. Option 3 does not fail that rule by necessity, but it moves the form into the browser and then relies on discipline to keep money out of it, which is precisely the kind of arrangement that holds until someone adds a live total to the row.

Option 4 was tempting and was refused on cost, not on taste. The engineer had already chosen an in row confirm over a dialog, and the reasoning holds independently: a dialog is a piece of accessibility infrastructure whose defects are invisible to the person who builds it, and scoping it here would mean this feature's schedule is set by shared UI rather than by the feature. When a second destructive confirm appears, the primitive will have two callers to be designed against, which is when it should be built. That is a follow up item rather than a no.

Option 1 was refused because deferring twice is how a gap becomes permanent. Spec 0006 already pushed correction into this feature, and its own note observed that a tracker you cannot correct stops being trusted quickly. Shipping the list alone would make the flaw more visible without making it fixable.

Two smaller calls deserve their reasoning recorded, because both look like details and are not.

**Deleting for real rather than marking a row deleted.** A soft delete is the reflex here, and it is wrong for this app in a specific way. Every query that touches `transactions` would have to filter the flag forever, including `loadMonthBreakdown()`, which is shipped and verified. Miss it in one place and the Breakdown includes rows the list does not, which is the same two totals for one month problem the whole design is trying to prevent, arriving through a different door. A real delete keeps every existing query correct as written and needs no migration. The cost is honest: a deletion cannot be undone, which is what the confirm step is there to make acceptable. The general principle that soft deletes pollute queries and create ghost data is doing real work here rather than being cited for form.

**Two loaders, but one month window.** Merging the two loaders outright would make the totals equal by construction, which is genuinely better than equal by discipline. It was refused because feature 8 is shipped and verified, and rewriting its loader to serve a screen that does not exist yet trades a proven thing for an unproven one at the moment there is nothing to test the result against. The first draft of this spec left the mitigation as an optional follow up, which a cross check correctly called out: a spec that names something its own largest maintenance risk and then makes the fix optional has given a builder under pressure permission to skip it. So the extraction is now build task 1 and comes before the second loader is written, because extracting after the copy exists is how the copy survives. Separate loaders, one definition of what a month is and what counts as a spend. If that stops being enough, spec 0005 already anticipated feature 16 forcing the question properly.

**A cookie flash rather than a query parameter, for the edit confirmation.** This decision only exists because of a gap the same cross check found: the app has no way to carry a message across a navigation. `LogSpendForm` shows its result inline and never navigates, and the one cross page precedent, sign in reading `?reset=done`, carries a static boolean with fixed copy. The confirmation here is dynamic and names an amount. Putting that in the URL would make it bookmarkable and replayable by the back button, so a stale "Saved 45.00 to Groceries" could be shown long after the entry changed again, which is the confidently wrong money figure this project's third rule exists to prevent. A single use cookie, set by the action and cleared by the list on first read, keeps money off the URL and makes the message unrepeatable by construction. Confirming on the edit screen instead would avoid the mechanism altogether and was the runner up, refused because it undoes the deliberate choice to land back on the list, and because the delete confirmation has to appear on the list regardless, so a second pattern would be needed anyway.

Finally, on loading the whole month rather than paginating. The general rule is that unpaginated lists become production incidents, and it is a good rule. It does not bind here for a reason that must be stated so that it can be checked later rather than assumed: the query is bounded by a calendar month for one person, which is tens of rows in practice, and the alternative actively harms correctness, because paging means the visible rows and the total come from different reads and the completeness guard no longer proves anything. The guard is what makes this safe: an over sized month produces an honest refusal rather than a quietly short total. The moment a legitimate month can exceed the cap, this decision needs revisiting, and by then feature 10's filtering will likely have supplied the mechanism.
