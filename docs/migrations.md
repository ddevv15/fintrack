# Migrations

The database schema lives in `migrations/` as plain numbered `.sql` files. There
is no ORM, so that directory is the only description of the schema, and it is
the one to read when you want to know what a table looks like. `lib/schema.ts`
is the same shapes in TypeScript, and nothing keeps the two in step except
`tests/integration/schema-drift.test.ts`.

Keep `migrations/` containing nothing but `.sql` files. The InsForge CLI checks
every filename in there before it will run, and one stray file stops it, which
is why this page lives in `docs/` rather than beside the migrations.

## Commands

```bash
npx @insforge/cli db migrations new <name>   # lowercase and hyphens only
npx @insforge/cli db migrations up --all     # apply everything pending
npx @insforge/cli db migrations list         # what is applied remotely
npx @insforge/cli db tables                  # what actually exists now
```

## Rules every migration follows

- Row level security is on, with a policy for each of select, insert, update,
  and delete, tied to the signed in user id. A table without all four is a data
  leak, not a to do.
- No `BEGIN`, `COMMIT`, or `ROLLBACK`. InsForge wraps each migration in its own
  transaction, and adding your own breaks it.
- Aggregate functions stay `SECURITY INVOKER`, the Postgres default, so those
  policies still apply to whoever calls them.
- Migrations are applied before the code that reads them is deployed. Add a
  column first, then ship the code that uses it. Drop a column only once
  nothing reads it.
- Migration SQL runs as `project_admin` against `public`. Schema qualify
  everything: `public.transactions`, `auth.uid()`.

## Two things in the current schema that look redundant and are not

Both are explained at length in [spec 0002](specs/0002-data-model/index.md).
Read that before you tidy either away.

1. **`categories` has a `UNIQUE (user_id, id, kind)` constraint** on top of its
   primary key. It exists to anchor the foreign key on `transactions`. Dropping
   it breaks that key.
2. **`transactions` references `categories` on three columns**, not two. The two
   column version would confirm the category exists with that kind but not that
   it belongs to you, which would let one account point at another account's
   category and learn which ids exist.

And one thing that is invisible in the schema entirely: **account creation works
only because a Postgres table owner is exempt from its own row level security.**
The `handle_new_user()` trigger runs as `project_admin`, which owns the tables,
so the insert policies never apply to it. Turning on `FORCE ROW LEVEL SECURITY`
on any of these tables, or changing who owns that function, breaks signup with
no error at migration time.

## How the later releases fit

Spec 0002 checked the model against the rest of the roadmap. Each of these is an
additive change: nothing here is dropped, retyped, or has a constraint relaxed.

| Release | What it adds | Change to today's schema |
|---|---|---|
| 13, budgets per category | `budgets` table, `(user_id, category_id, month, limit_cents)` | none |
| 15, recurring bills | `recurring_rules` table | one nullable `transactions.recurring_rule_id` |
| 17, accounts and balances | `accounts` table | one nullable `transactions.account_id`, backfilled to a default account |
| 18, receipt photos | none | one nullable `transactions.receipt_path` into InsForge Storage |
| 19, bank connection | `bank_transactions` staging table | one nullable `transactions.external_id` with a unique index for catching duplicates |

## Running the integration tests

`npm test` is pure and offline. `npm run test:integration` talks to the real
backend: it signs in as two accounts and proves neither can read or change the
other's money, which is the one thing reading the migration cannot tell you.

It needs three values in `.env.local`, listed in `.env.example`. The tests sign
in, do their work, and clean up their own rows between runs. They never delete
the accounts, so the setup below stays done.

### Recreating the two test accounts

The accounts live at `fintrack-test-a@fintrack.invalid` and
`fintrack-test-b@fintrack.invalid`. `.invalid` is reserved and unroutable, so no
mail can ever leave for them, which is deliberate.

That does mean they cannot verify by email, and this project requires
verification. So they are verified directly, which is a row level data fix on
two throwaway rows rather than a schema change:

1. Put both addresses and one shared password in `.env.local`.
2. Sign both up through the SDK. The call returns a 500 because the
   verification email cannot be delivered; the account is still created, and
   the trigger still gives it a profile and ten categories.
3. Mark them verified:

   ```sql
   UPDATE auth.users SET email_verified = true
   WHERE email IN ('fintrack-test-a@fintrack.invalid',
                   'fintrack-test-b@fintrack.invalid');
   ```

4. `npm run test:integration` from then on.

One thing to know about mail generally here: the sender is Resend's shared
`onboarding@resend.dev`, which only delivers to the address on the Resend
account. Every other recipient is refused with a 550. That is fine while you are
the only real user, and feature 5 should decide whether to verify a domain.
