-- FinTrack core schema. Spec 0002, build plan task 2.
--
-- Three owner scoped tables. Money is a whole number of cents in a bigint and
-- is always positive; the direction column carries the sign, never the number.
-- Correctness lives in Postgres rather than in app code, because a query
-- written under time pressure two years from now cannot go around a constraint.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

-- The one enum, shared by transactions.direction and categories.kind. Sharing
-- it is what makes the kind matching foreign key below possible at all, since
-- a foreign key needs matching column types on both sides.
CREATE TYPE public.entry_direction AS ENUM ('spend', 'income');

-- ---------------------------------------------------------------------------
-- profiles: one row per account, created by the trigger in the next migration.
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT CHECK (char_length(display_name) <= 100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Select and update only. The trigger creates the row and the cascade above
-- removes it, so there is no legitimate insert or delete by a signed in user.
CREATE POLICY profiles_owner_select ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY profiles_owner_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- categories: yours to name, colour, and hide. Never deleted while it has
-- history, which is what keeps a past month's breakdown honest.
-- ---------------------------------------------------------------------------
CREATE TABLE public.categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT auth.uid()
             REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  kind       public.entry_direction NOT NULL,
  color      TEXT NOT NULL DEFAULT 'slate' CHECK (color IN (
               'green', 'orange', 'blue', 'purple', 'yellow',
               'red', 'pink', 'teal', 'slate', 'emerald')),
  is_hidden  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Anchors the three column foreign key on transactions below. Redundant
  -- against the primary key on purpose: Postgres needs a unique constraint on
  -- exactly the referenced columns, and including user_id is the whole point.
  -- Without it a transaction could reference another account's category id,
  -- and a failed insert would reveal whether that id exists.
  -- Do not "simplify" this away. See spec 0002, Security model.
  CONSTRAINT categories_owner_id_kind_key UNIQUE (user_id, id, kind)
);

-- Case insensitive name uniqueness, per account and per kind, so Groceries and
-- groceries cannot both exist while a spend Gifts and an income Gifts can.
-- This must be a unique INDEX: a UNIQUE table constraint cannot call lower().
CREATE UNIQUE INDEX categories_owner_kind_name_key
  ON public.categories (user_id, kind, lower(name));

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_owner_select ON public.categories
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY categories_owner_insert ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY categories_owner_update ON public.categories
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY categories_owner_delete ON public.categories
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();

-- ---------------------------------------------------------------------------
-- transactions: every spend and every income.
-- ---------------------------------------------------------------------------
CREATE TABLE public.transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL DEFAULT auth.uid()
               REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL,
  direction    public.entry_direction NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),

  -- No default, deliberately. A calendar day must be supplied by the caller,
  -- worked out on the server from APP_TIMEZONE via today() in lib/time.ts.
  -- A default of CURRENT_DATE here would silently use the database's zone.
  occurred_on  DATE NOT NULL,

  merchant     TEXT CHECK (char_length(merchant) <= 200),
  note         TEXT CHECK (char_length(note) <= 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Three columns, not two. A two column key (category_id, direction) would
  -- confirm the category exists with that kind but not that it is yours.
  -- RESTRICT is what stops a category with history being deleted; a cascading
  -- account delete still works, because RESTRICT is checked at the end of the
  -- statement, by which time these rows are already gone. Verified on this
  -- database before the schema was written.
  CONSTRAINT transactions_category_fkey
    FOREIGN KEY (user_id, category_id, direction)
    REFERENCES public.categories (user_id, id, kind)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Feature 7's month list and every month total. created_at is the newest first
-- tiebreak for two entries logged on the same day.
CREATE INDEX transactions_owner_occurred_idx
  ON public.transactions (user_id, occurred_on DESC, created_at DESC);

-- Feature 8's breakdown by category, and feature 9's rename safety.
CREATE INDEX transactions_owner_category_idx
  ON public.transactions (user_id, category_id);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_owner_select ON public.transactions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY transactions_owner_insert ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY transactions_owner_update ON public.transactions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY transactions_owner_delete ON public.transactions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION system.update_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges. Policies decide which rows; privileges decide which operations.
-- InsForge grants broad DML on public tables to anon and authenticated by
-- default, so revoke from anon explicitly: none of these tables has a policy
-- for anon, but a money app should not rely on the absence of a policy alone.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.profiles     FROM anon;
REVOKE ALL ON public.categories   FROM anon;
REVOKE ALL ON public.transactions FROM anon;

GRANT SELECT, UPDATE                 ON public.profiles     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
