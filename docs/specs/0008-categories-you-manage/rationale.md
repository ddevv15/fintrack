# 0008. Categories you manage · rationale

The reasoning, the options weighed, and what was challenged. The build spec is [index.md](index.md); `/develop` reads that and skips this.

## Context

> ⚠️ Premise note: this feature builds a place to manage categories, but not the moment you need one. The realistic trigger for adding a category is logging a spend that fits nothing you have, and at that moment you are on the Log screen with an amount typed and a picker in front of you. A management screen elsewhere does not serve that: you either abandon what you typed and go looking for the screen, or you file the spend under `Other` and never come back. That is not a reason to build something else here, because rename, hide, and delete genuinely need a screen of their own and would be wrong as a control inside a picker. It is a reason to record that the feature is deliberately incomplete, and that adding a category from the Log picker is the follow up that finishes it. Building it now would fold a second decision, about what a picker may write, into a spec that is already about a screen.

Nine spend categories and one income category are seeded into every account by the trigger in migration `20260819013244_seed-new-user.sql`. They are ordinary rows with nothing marking them as special, chosen so that Release 1 could log a spend before any screen existed to manage one. They are also somebody else's guesses. Whether `Eating out` and `Groceries` are one thing or two, whether `Transport` covers a car or only a bus fare, and whether `Other` is a category or an admission are all answers that differ per person, and getting them wrong makes the breakdown say less than it could. The whole point of the breakdown screen is to tell you where your money went in terms you recognise, and it cannot do that on a fixed vocabulary.

Three forces shape what is possible here. First, spec 0002 built the `categories` table for exactly this feature and put the hard rules in Postgres: a name between 1 and 60 characters, a colour from a fixed set of ten, a case insensitive unique name per account and per kind, and an `ON DELETE RESTRICT` foreign key that refuses to delete a category still holding history. None of that has to be designed again, and none of it should be restated in TypeScript. Second, specs 0006 and 0007 already decided what a hidden category means downstream: it leaves the Log picker, and it stays available on the edit screen for an entry already filed under it. Anything decided here has to agree with that. Third, the app is server rendered with progressive enhancement, and every screen in it so far is a Server Component with forms posting server actions; a category screen that needs client state to work would be the first exception.

The cost of not deciding is not that categories stay fixed. It is that the seeded set quietly becomes the ceiling on how useful the breakdown can be, and the one screen this app was built to show becomes a report in somebody else's vocabulary.

## Options considered

### Option 1: a section on the account screen

Add a categories card to `/settings`, listing the categories with inline controls, alongside the existing details, sign out, password, and delete account cards.

**Pros**:
- Nothing new to navigate to, and categories are arguably account configuration rather than a place you go.
- No new route, no new layout question, no new link to add anywhere.

**Cons**:
- `/settings` is already four cards deep and ends in a delete account danger zone. A list of ten editable rows on top of that makes a long screen with two unrelated kinds of danger on it.
- The add and edit forms still need somewhere to live, so the route saving never materialises; it only moves.

### Option 2: a dedicated route with its own add and edit screens (chosen)

`/categories` lists your spend categories with hide and unhide on the row. `/categories/new` and `/categories/[id]/edit` are two small screens sharing one form component, and delete lives on the edit screen behind a confirm.

**Pros**:
- Matches what feature 7 already established, where `/transactions/[id]/edit` is its own small screen, so the app gains no second pattern for the same problem.
- Every screen stays a Server Component with a plain form posting a server action, and no client state is needed to decide which row is open.
- Puts navigation between a glance at a list and an irreversible act, while keeping the reversible act, hiding, one tap away where you notice you want it.

**Cons**:
- Three routes for a feature you might use twice a year, and a link on the account screen that somebody has to find.
- Adding several categories in a row costs a navigation each way every time.

### Option 3: manage categories from the Log picker

No dedicated screen. The picker on the Log screen gains an add option, and renaming or hiding happens through a control on the picker itself.

**Pros**:
- Serves the actual moment of need, which is exactly the gap the premise note names: you want a new category while logging a spend that fits nothing.
- Nothing to discover and nowhere to navigate to.

**Cons**:
- Rename, hide, and especially delete are not picker actions. Putting a destructive control inside a control whose job is choosing one of ten things is how people delete a category while trying to select it.
- It makes the Log screen, the screen used more than any other, into a client component with modal state, which is a large cost paid on every visit for a feature used rarely.
- There is nowhere to show the entry count, so the delete rule can only be discovered by tripping over it.

## Rationale

Option 2 wins on the force that Context names third: this app is server rendered, and Option 3 would make its most used screen a client component with modal state to serve a feature used a few times a year. That is the wrong trade in the wrong place. Option 1 does not actually save the routes it appears to, because the add and edit forms need somewhere to live either way, so its only real effect is to lengthen a screen that already ends in account deletion.

The chosen split between the list row and the edit screen follows the reversibility of each act rather than convenience. Hiding is reversible and is something you decide while scanning, so it belongs on the row. Deleting is permanent and rare, and the edit screen is already where the entry count that permits or forbids it is shown, so the explanation and the control sit together.

Two smaller calls are worth recording because they are easy to undo by accident.

The duplicate name refusal is caught from the database rather than checked first, because the unique index is the only thing that can answer without a race, and a check first approach needs the catch anyway and then has two code paths saying the same thing. What the catch cannot supply on its own is whether the clashing category is hidden, since a unique violation names the constraint and not the row; that is why the design adds an explicit follow up read. Without it, AC-7's message cannot be written, and being told that `Groceries` already exists when no `Groceries` is visible is the kind of small mystery that makes a person distrust the screen.

The entry count needed a source, and this is where the earlier answer of no migration changed. The InsForge SDK is PostgREST shaped, with filters, pagination, and RPC but no aggregate in the query builder, so a grouped count has three possible homes: read every transaction's `category_id` and count in TypeScript, run one head count per category, or group in the database. Counting in TypeScript is what spec 0005 chose for the breakdown, deliberately, to avoid securing a new database object, and consistency with a reasoned precedent is worth a lot. But 0005's read is bounded to one month and this one is bounded by nothing, so it would need an all time row cap, and crossing that cap would turn the categories screen into a permanent error with no way back. In a tracker that accumulates for years, that is a cliff rather than a limit. Forty round trips for one list is not a serious alternative. A grouped view is the boring answer whose read stays the same size forever, and its one real risk, that a view over a row level security protected table runs as its owner unless declared `security_invoker`, is a known and nameable failure rather than a slow one. It is named in the design section, made an acceptance criterion, and checked from a second account, because it is invisible to every other kind of check.

The last visible category rule was first written as an application check, on the reasoning that it is a product rule about what the Log screen needs rather than a data integrity rule. A cross check pass caught that as wrong, and it is worth recording why rather than quietly fixing it. Over this SDK the read and the write are two statements, so two tabs each hiding one of your last two visible categories both see two and both succeed. The distinction between a product rule and a data rule does no work here: a rule that has to hold under concurrency is an invariant whatever you call it, and `core-schema.sql` already states the project's position that correctness lives in Postgres. So the rule moved into a trigger, with the actions still reading the count so that the ordinary refusal is a written message rather than a caught exception. The forty category cap keeps the application only check deliberately, because a raced forty first row is cosmetic and self correcting, where the raced state above breaks a screen.

The forty category cap was not asked for by the product and is worth defending. It should never be reached in real use, which is what makes it cheap, and it earns its place twice: it bounds the picker on the Log screen, the screen used most, and it is what makes rendering the category list unpaginated defensible rather than an oversight to be fixed later.
