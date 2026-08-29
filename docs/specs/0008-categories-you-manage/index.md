# 0008. Categories you manage

**Date**: 2026-08-28
**Status**: Accepted

## Summary

You get a screen at `/categories` where you can add a spend category, rename it, change its colour, hide it, and delete it if it has never been used. Almost all of it is application code, because spec 0002 already built this feature's table: the name limit, the ten fixed colours, the `is_hidden` flag, the case insensitive uniqueness, and the foreign key that refuses to delete a category still holding history. Two small things are added to the database: a read only view that counts how many entries use each category, so a row can say why it cannot be deleted, and a trigger that refuses to hide or delete your last visible spend category, because that rule has to hold even with two tabs open. The view must be declared `security_invoker`, or it hands every account's counts to everyone, which is why that is an acceptance criterion and not a comment.

## Requirements

**User stories**:

- As the one person using FinTrack, I want to add a spend category, so the breakdown matches how I actually think about my money rather than how a seed script guessed.
- As that person, I want to rename a category and change its colour, so a name I typed in a hurry is not permanent and two categories I compare often do not look alike.
- As that person, I want to hide a category I have stopped using, so it leaves my pickers without taking my history with it.
- As that person, I want to delete a category I created by mistake, so a typo is not something I have to live with forever.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: `/categories` lists every spend category you own, name ascending, each showing its colour swatch and its name. Income categories are not listed and cannot be added.
- **AC-2**: Hidden categories appear under a separate heading below the visible ones, in the same name order, each offering unhide.
- **AC-3**: Each row shows how many transactions use that category, including `0` for one that has never been used.
- **AC-4**: `/categories/new` creates a spend category from a name and a colour, then returns to the list with a confirmation naming what was added, taken from the row the database returned rather than from what was typed.
- **AC-5**: The colour control offers exactly the ten colours the `categories.color` check constraint allows, each carrying its colour name as text so colour is never the only signal, and preselects the first colour in that constraint's order not already used by one of your spend categories.
- **AC-6**: A colour already used by one of your spend categories is marked as used, in text as well as visually, and choosing it anyway is allowed.
- **AC-7**: A name that clashes with one of your existing categories of the same kind, ignoring case, is refused with the message on the name field, and nothing is written. When the clashing category is hidden, the message says so, because being told a name is taken by something you cannot see is otherwise baffling. When the clashing row cannot be found on the follow up read, because it was deleted in between, the plain message is used and nothing throws.
- **AC-8**: A name shorter than 1 or longer than 60 characters is refused with the message on the name field, and nothing is written.
- **AC-9**: Adding a category when you already hold 40 spend categories is refused with a message naming the limit, and nothing is written.
- **AC-10**: `/categories/[id]/edit` opens with the current name and colour prefilled, and saving writes both. AC-7 and AC-8 apply here identically.
- **AC-11**: A category's `kind` is never editable and no control anywhere offers to change it.
- **AC-12**: Hide and unhide happen from the list row. A hidden category leaves the Log screen picker and an unhidden one returns to it, with no manual reload.
- **AC-13**: Hiding or deleting your last visible spend category is refused with a message saying why, and nothing is written. The refusal holds under concurrency: two browser tabs each hiding one of your last two visible categories cannot both succeed, and the one that loses is told why.
- **AC-14**: A hidden category that has spend in the current month still appears in the breakdown and in the month list, with its name and colour. Hiding changes no total anywhere.
- **AC-15**: On the edit screen, a category with no transactions offers delete. One with transactions offers no delete control at all, and shows in its place a line naming the count and pointing at hide.
- **AC-16**: Delete is behind a confirm step naming the category, and confirming returns to the list with a confirmation naming what was deleted.
- **AC-17**: If the database refuses a delete because an entry was logged against the category while you were on the screen, the refusal is shown as a clear message and nothing is reported as deleted.
- **AC-18**: After any successful add, rename, recolour, hide, unhide, or delete, the change is visible on the Log picker, the month list, and the breakdown without a manual reload.
- **AC-19**: The confirmation after a write is shown exactly once. A reload, a bookmark, or the back button never brings it back, and it never appears in a URL.
- **AC-20**: Every route under `/categories` requires a signed in session and can reach only your own categories. A category id belonging to another account is indistinguishable from one that does not exist.
- **AC-21**: A failed read shows no partial list and no zero; it hands over to the route error boundary.
- **AC-22**: The `category_usage` view is declared `WITH (security_invoker = true)`, is revoked from `anon` and granted only to `authenticated`, and a second account querying it sees only its own rows. The two account part is checked by an integration test, not by reading the migration.
- **AC-23**: Every control on every screen in this feature is reachable and operable by keyboard with a visible focus ring, and each row's actions name their category through an `aria-label` of the form `Hide Groceries`, so somebody using a screen reader knows which row an action belongs to.

## Decision

**Chosen option**: Option 2: a dedicated `/categories` route with its own add and edit screens, hide on the list row, delete behind the edit screen.

Category management gets its own route and its own two forms, reached from the account screen, with the whole feature resting on constraints spec 0002 already built and one new read only view for the usage count.

**Implementation skills**: `insforge` (`InsForge`, `~/.agents/skills/insforge/`) · `insforge-cli` (`InsForge`, `~/.agents/skills/insforge-cli/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `zod-4` (`prowler-cloud/prowler`, `.agents/skills/zod-4/`) · `accessibility` (`addyosmani/web-quality-skills`, `.agents/skills/accessibility/`)

## Rationale

Reasoning, the options weighed, and the premise note: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new entity and no new column. `public.categories` already carries everything this feature writes, built by spec 0002:

| Column | Type | Required | This feature |
|---|---|---|---|
| `id` | UUID, primary key | yes | route param for edit and delete |
| `user_id` | UUID, FK `auth.users(id)` | yes | never written by application code; `auth.uid()` default plus row level security |
| `name` | TEXT, check 1 to 60 chars | yes | written on add and on rename |
| `kind` | `public.entry_direction` enum | yes | always the literal `'spend'`; never editable afterwards |
| `color` | TEXT, check against ten values | yes | written on add and on edit, database default `slate` |
| `is_hidden` | BOOLEAN | yes | toggled from the list row |
| `created_at` / `updated_at` | TIMESTAMPTZ | yes | `updated_at` maintained by the existing `categories_updated_at` trigger |

One new database object, a read only view holding no data of its own:

```sql
CREATE VIEW public.category_usage
WITH (security_invoker = true) AS
SELECT c.user_id, c.id AS category_id, count(t.id) AS entry_count
FROM public.categories c
LEFT JOIN public.transactions t
  ON t.category_id = c.id AND t.user_id = c.user_id
GROUP BY c.user_id, c.id;

REVOKE ALL  ON public.category_usage FROM anon;
GRANT SELECT ON public.category_usage TO authenticated;
```

Three things in that are load bearing. `security_invoker = true` makes the view run as the person querying it, so the row level security already on `categories` and `transactions` still applies; without it the view runs as its owner, which owns both tables and is therefore exempt from their policies, and every account's counts become readable by everyone. Nothing fails at migration time if it is left out, which is why AC-22 checks it from two real accounts rather than by reading the SQL. The `LEFT JOIN` is the second: an inner join would drop a category with no entries entirely, and a missing row would then be indistinguishable from a real zero, which is exactly the case the delete control depends on. The third is the `REVOKE` and `GRANT` pair, which is not redundant with the policies above it: `migrations/20260819013240_core-schema.sql` does the same for all three tables and says why, that InsForge grants broad data access to `anon` and `authenticated` by default and a money app should not rest on the absence of a policy alone. The one new object this feature adds gets the same treatment as the three that came before it.

A second object, a trigger, enforces AC-13:

```sql
CREATE FUNCTION public.refuse_last_visible_spend_category() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE user_id = OLD.user_id AND kind = 'spend' AND is_hidden = false
      AND id <> OLD.id
  ) AND (TG_OP = 'DELETE' OR NEW.is_hidden = true) THEN
    RAISE EXCEPTION 'last visible spend category'
      USING ERRCODE = 'raise_exception';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
```

Why this is in Postgres rather than in the action, having first been written the other way. The guard reads a count and then writes, and over this SDK those are two statements and not one transaction, so two tabs each hiding one of your last two visible categories can both read two and both succeed. That is a real race, and calling the rule a product rule rather than a data rule does not make it one: a rule that has to hold under concurrency is an invariant, and `core-schema.sql` already states this project's position, that correctness lives in Postgres because a query written under time pressure two years from now cannot go around a constraint. The action still performs its own read, so the ordinary refusal is a clean message rather than a caught exception; the trigger is what makes the rule true rather than usually true.

Existing constraints this feature leans on, all from spec 0002 and none of them re implemented in TypeScript:

- `categories_owner_kind_name_key`, a unique index on `(user_id, kind, lower(name))`, produces the duplicate name refusal
- `transactions_category_fkey`, `ON DELETE RESTRICT` over `(user_id, category_id, direction)`, is the final word on whether a delete is allowed
- `transactions_owner_category_idx` on `(user_id, category_id)` serves the view's group by
- the four row level security policies on `categories` are the entire authorization model for this feature

**State transitions**:

A category is `visible` or `hidden`, and moves either way freely from the list row, except that the last visible spend category cannot leave `visible` (AC-13). Deletion is not a state; it is removal, reachable only from `visible` or `hidden` when the entry count is zero. `kind` has no transitions at all: `ON UPDATE RESTRICT` on the three column foreign key means Postgres would refuse to change it on any category that has ever been used, so no control offers it (AC-11).

**API surface**:

All four writes are Next.js server actions in `actions/categories.ts`, reached by a form POST. There is no HTTP route handler and no public endpoint.

| Action | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `createCategory` | server action | `name:string` (req), `color:CategoryColor` (req) | `FormState` with a confirmation naming the stored row | session cookie, row level security | name clash on the field, name length, 40 cap reached, incomplete profile |
| `updateCategory` | server action | `id:uuid` (req), `name:string` (req), `color:CategoryColor` (req) | `FormState` with a confirmation naming the stored row | session, row level security | name clash, name length, already gone |
| `setCategoryHidden` | server action | `id:uuid` (req), `hidden:boolean` (req) | `FormState` naming the new state | session, row level security | last visible category refused, already gone |
| `deleteCategory` | server action | `id:uuid` (req) | `FormState` naming what was deleted | session, row level security | still in use (foreign key restrict), last visible category refused, already gone |

Reads live in `lib/categories.ts` beside the two existing picker reads:

| Function | Returns | Notes |
|---|---|---|
| `listManagedCategories()` | every spend category with its colour, hidden state, and entry count, name ascending | two reads, `categories` and `category_usage`, joined by id in TypeScript; throws rather than returning a partial list |
| `getManagedCategory(id)` | one spend category plus its entry count, or `undefined` | `undefined` is what the edit route turns into the standard not found page |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| `listManagedCategories` | name, colour, hidden state | `categories` columns, row level security scoped |
| | entry count per category | `category_usage.entry_count`, `LEFT JOIN` so an unused category yields `0` rather than no row |
| | the ordering | database `order by name asc`, matching the existing `listSpendCategories()` so both agree |
| | the count's type | parsed through a new `categoryUsageSchema` in `lib/schema.ts`; `count()` is a Postgres `bigint`, so the parse pins it to a non negative integer rather than trusting the wire format |
| `createCategory` | `user_id` | never written; the `auth.uid()` column default plus the insert policy |
| | `kind` | the literal `'spend'`, decided in this spec, not an input |
| | the preselected colour | the first value in the `categories.color` check constraint's declared order (`green`, `orange`, `blue`, `purple`, `yellow`, `red`, `pink`, `teal`, `slate`, `emerald`) not already used by one of your spend categories; that order is the source, so it is read from a single exported constant, not retyped per screen |
| | whether a colour is marked used | the colours of your spend categories, from the same read that renders the list |
| | whether the 40 cap is reached | a count of your spend categories, read inside the action rather than passed from the form, because a form value is a claim and not a fact. This read and the insert are two statements, so two tabs can race past the cap to 41. Accepted deliberately: an extra row is cosmetic and self correcting, unlike AC-13, where the raced state breaks a screen |
| every write | the confirmation sentence | the row the database returned, never the submitted text. This covers all four actions, not just create: each write selects the affected row back and quotes that, the way `actions/transactions.ts` already does |
| `createCategory`, `updateCategory` | whether a name clash is with a hidden category | a follow up read of the clashing row's `is_hidden`, keyed on `(kind, lower(name))`, performed only after the unique violation is caught. This value has no other source: the violation itself names the constraint and not the row, so AC-7's message cannot be written without it. The read can legitimately find nothing, when the clashing row is deleted in between, and that case uses the plain message rather than throwing |
| `setCategoryHidden`, `deleteCategory` | whether this is your last visible spend category | one shared helper, `countVisibleSpendCategories()` in `lib/categories.ts`, called by both actions so the rule has one implementation. The read is what produces the clean message; the trigger is what makes the rule hold under two tabs |
| `deleteCategory` | whether the category has entries | `category_usage.entry_count` for the decision to show the control, and the foreign key's restrict for the decision to allow the write; the second is authoritative and the first is only what the screen renders |
| every write | freshness of the Log picker, month list, and breakdown | `revalidatePath("/", "layout")`, which clears the router cache the three screens read category names and colours through |
| every write | the confirmation crossing the navigation | `components/categories/confirmation.ts`, a module variable in the browser, taken once on the list's mount |

**Key invariants**:

- You always hold at least one visible spend category. Enforced by the trigger above, and separately read by the actions so the ordinary refusal is a written message rather than a caught exception.
- A category's `kind` never changes once the row exists. Enforced by `ON UPDATE RESTRICT` and by offering no control.
- A category with transactions is never deleted. Enforced by `ON DELETE RESTRICT`; the screen's count only decides what to render.
- Hiding a category changes which pickers offer it and nothing else. No total, on any screen, in any month, moves when a category is hidden or unhidden.
- At most 40 spend categories per account, give or take a raced extra row. Enforced in `createCategory` only, deliberately: unlike the invariant above, exceeding it by one breaks nothing. This is also what makes the list safe to render unpaginated.
- `user_id` is never named by application code on any write in this feature.
- Every read is parsed through a Zod schema before anything renders it, the view included.

**Security model**:

Nothing new. Reads and writes are scoped entirely by the four existing row level security policies on `categories`, keyed to `auth.uid()`, plus the session gates already in `proxy.ts` and `app/(app)/layout.tsx`. The new view adds one surface and exactly one way to get it wrong: a view over a row level security protected table runs as its owner unless declared `security_invoker`, and this project's migrations run as `project_admin`, which owns both underlying tables and is therefore exempt from their policies. Omitting the option produces a working view that silently returns every account's counts. AC-22 exists because that failure is invisible to every check except a query from a second account.

Category names are personal data of no regulatory sensitivity, so no compliance scope applies and no audit log is required. No rate limiting is added: every route here is behind a session, consistent with how transaction writes are already treated, and Arcjet stays scoped to sign in attempts.

**Configuration required**: none. No new environment variable, secret, or third party credential.

**Critical test scenarios**:

- Happy path: add a category, see it on the list with a count of `0` and on the Log picker, rename it, and see the new name on the breakdown without a reload, verifies **AC-4**, **AC-10**, **AC-18**
- Failure case: add a name matching a hidden category's name in different case, and get the refusal on the name field saying the clash is with a hidden category, verifies **AC-7**
- Failure case: open a category with zero entries in two tabs, log a spend against it in a third, then delete it in the first, and get a clear refusal with nothing reported as deleted, verifies **AC-17**
- Failure case: hide categories until one visible spend category remains, then try to hide it, and be refused with a reason, verifies **AC-13**
- Failure case: with exactly two visible spend categories, hide each from a separate tab at the same time, and find that one succeeds and the other is refused rather than both succeeding, verifies **AC-13**
- Failure case: hide a category with spend this month, then open the breakdown, and find its total unchanged and the category still shown, verifies **AC-14**
- Auth and permission: sign in as a second account and query `category_usage`, and see only that account's rows, verifies **AC-22**
- Auth and permission: open `/categories/[id]/edit` with another account's category id, and get the same not found page a nonexistent id gives, verifies **AC-20**

## Build plan

Ordered by the project's Skateboard approach: slice 1 is the thinnest version of this feature you would genuinely use, and each later slice is shippable on its own.

**Slice 1: see your categories, and add one**

1. One migration carrying three things: the `public.category_usage` view with `security_invoker = true` and a `LEFT JOIN`, its `REVOKE` from `anon` and `GRANT SELECT` to `authenticated`, and the trigger refusing a hide or delete that would leave no visible spend category, satisfies **AC-3**, **AC-13**, **AC-22**
2. `categoryUsageSchema` in `lib/schema.ts`, pinning `entry_count` to a non negative integer, satisfies **AC-3**
3. `listManagedCategories()` and `countVisibleSpendCategories()` in `lib/categories.ts`: spend only, name ascending, counts joined in, throwing on any read error rather than returning a partial list, with the visible count as one helper both write actions will call, satisfies **AC-1**, **AC-3**, **AC-13**, **AC-21**
4. The `/categories` route and its list: visible categories, a separate Hidden heading below them, swatch, name, and count per row, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-23**
5. `components/categories/ColorPicker.tsx`: the ten colours as a keyboard operable radio group, each named in text, used ones marked in text as well as visually, defaulting to the first unused colour in the check constraint's order, satisfies **AC-5**, **AC-6**, **AC-23**
6. `actions/categories.ts` and `/categories/new`: the create action with the length check, the 40 cap read inside the action, the unique violation caught and reported on the name field with the hidden clash looked up and the not found fallback wired, and `revalidatePath("/", "layout")` on success, satisfies **AC-4**, **AC-7**, **AC-8**, **AC-9**, **AC-18**, **AC-20**
7. `components/categories/confirmation.ts` and the list's live region, single use and never in the URL, satisfies **AC-4**, **AC-19**
8. A link to `/categories` from the account screen, so the feature is findable, satisfies **AC-1**

**Slice 2: correct a category**

9. `updateCategory` and `/categories/[id]/edit`, prefilled with the stored name and colour, no control for `kind`, an unknown or foreign id answering with the standard not found page, satisfies **AC-10**, **AC-11**, **AC-18**, **AC-19**, **AC-20**

**Slice 3: retire a category without losing its history**

10. `setCategoryHidden`, the row control on the list with its `aria-label` naming the category, and the last visible category guard reading through the shared helper and falling back to the trigger's refusal, satisfies **AC-12**, **AC-13**, **AC-18**, **AC-23**
11. Confirm across the Log picker, the month list, and the breakdown that a hidden category with spend this month keeps its place and changes no total, satisfies **AC-14**

**Slice 4: clear a mistake**

12. `deleteCategory` with a confirm step naming the category, the entry count gate and its explanatory line on the edit screen, the restrict refusal turned into a clear message, and the last visible category guard, satisfies **AC-13**, **AC-15**, **AC-16**, **AC-17**, **AC-18**

**Slice 5: prove it**

13. Unit tests for the colour default and the cap, integration tests signing in as two accounts against `category_usage` and driving the two tab hide race, browser tests for the flows, and a keyboard and screen reader pass folded into `docs/accessibility-pass.md`, satisfies **AC-13**, **AC-22**, **AC-23**

## Consequences

**Positive**:

- The breakdown finally reflects how you think about your money, which is the thing this app exists to tell you.
- No category is ever lost by accident: hiding keeps every past entry intact, and deleting is only reachable when there is nothing to lose.
- The entry count makes the delete rule explain itself on the screen, instead of arriving as a refusal after you have already decided.
- Almost the whole feature rests on constraints written two specs ago, so the rules are enforced in one place rather than restated in TypeScript.

**Negative and tradeoffs**:

- Two new database objects rather than the one this feature first appeared to need: a view and a trigger. The trigger puts a product rule, what the Log screen needs to work, into the schema, where somebody reading `categories` later has to understand why a hide can be refused. And the view is the project's first, carrying one way to get it badly wrong: without `security_invoker` it is a complete, silent leak of every account's data, and nothing in the migration or the type checker fails if the option is dropped. AC-22 is the only thing standing between that mistake and production.
- Rendering the list now costs two reads where the pickers cost one.
- There are now two copies of the confirmation handover, in `components/transactions/` and `components/categories/`, so a fix to the subtle part of one can miss the other.
- Income categories stay unmanageable until Release 4. The seeded `Salary` row cannot be renamed by anyone, and there is no screen that says why.
- The 40 category cap is a rule nobody asked for. It should never be met in real use, which is the point, but it is one more refusal message to write, translate one day, and keep honest.
- You still cannot create a category at the moment you actually want one, which is while logging a spend that fits nothing. See the premise note in [rationale.md](rationale.md).

**Neutral**:

- No column changes and no data migration, so nothing about how money is stored, read, or totalled moves.
- `revalidatePath("/", "layout")` clears the whole router cache on every category write. That is heavier than naming paths, and correct here, because a rename genuinely changes what every screen displays and category writes are rare.
- The palette stays at ten colours. This feature lets you arrange them; it does not add any.

## Follow-up

- [ ] Adding a category from the Log screen, at the moment a spend fits none of the existing ones. This spec deliberately does not cover that moment; see the premise note in [rationale.md](rationale.md).
- [ ] `emerald` is both a category colour and the income accent token (`--fintrack-income` in `app/globals.css`). A spend category coloured emerald will match the income colour on any screen that later shows both kinds. Worth deciding when feature 14 lands, not before.
- [ ] Root `AGENTS.md` says every table holding personal data has row level security on. That rule should be extended to say a view over such a table must be `security_invoker`, since a view is where the rule is easiest to lose. `/sync` owns that edit.
- [ ] Income categories remain unmanageable until feature 14. Revisit this spec then rather than building half of it now.
- [ ] `components/transactions/confirmation.ts` now has a sibling copy. Spec 0007's follow up asked for promotion to a shared helper on the third caller; this is the second, so the next one triggers it.
