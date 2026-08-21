-- The new account trigger writes the name, and only the name.
-- Spec 0004, build plan task 4. Corrects task 3.
--
-- The previous migration had this function read NEW.profile ->> 'currency' and
-- NEW.profile ->> 'timezone', on the spec's description of a signup profile
-- payload. That payload does not exist. InsForge's signUp accepts an email
-- address, a password, a name, a redirect, and an auto confirm flag, and its
-- schema strips anything else, so those two reads were always NULL and always
-- would be.
--
-- Leaving them in would be the same kind of statement `amount_cents` was: SQL
-- that claims something about the world which is not true. So they come out,
-- and the currency and the time zone are collected once on /setup by every new
-- account, whether it signed up with a password or with Google.
--
-- Nothing enforcing correctness changes. The BEFORE INSERT trigger on
-- transactions still refuses any amount while the profile is incomplete, so the
-- gap between creating an account and answering those two questions cannot
-- contain a single entry.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Why SECURITY DEFINER, and what it depends on. Read this before changing
  -- anything here or in the policies (spec 0002, Security model):
  --
  -- 1. This fires during the auth.users insert, when there is no signed in
  --    user, so auth.uid() is NULL. Every insert below therefore writes
  --    NEW.id into user_id LITERALLY. Relying on the DEFAULT auth.uid() on
  --    these columns would insert NULL and violate NOT NULL, and no account
  --    could ever be created.
  --
  -- 2. The insert policies check user_id = auth.uid(), which is NULL here and
  --    would reject every one of these rows. What saves it is that a Postgres
  --    table owner is exempt from that table's own row level security. This
  --    function is SECURITY DEFINER and migrations run as project_admin, which
  --    owns both this function and the tables, so the policies never apply.
  --
  -- Two conditions must therefore keep holding:
  --   a. this function stays owned by the role that owns profiles and
  --      categories (project_admin, which is what applies migrations), and
  --   b. profiles and categories NEVER get FORCE ROW LEVEL SECURITY.
  -- Turning either of those the other way breaks account creation silently,
  -- with no error at migration time. Only a real signup shows it.

  -- 'name' is the one profile value the platform carries through signUp. A
  -- Google account gets its Google name here; a password account gets whatever
  -- was typed, or NULL. currency and timezone stay NULL until /setup.
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.profile ->> 'name')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.categories (user_id, name, kind, color)
  VALUES
    (NEW.id, 'Groceries',     'spend',  'green'),
    (NEW.id, 'Eating out',    'spend',  'orange'),
    (NEW.id, 'Transport',     'spend',  'blue'),
    (NEW.id, 'Housing',       'spend',  'purple'),
    (NEW.id, 'Utilities',     'spend',  'yellow'),
    (NEW.id, 'Health',        'spend',  'red'),
    (NEW.id, 'Shopping',      'spend',  'pink'),
    (NEW.id, 'Entertainment', 'spend',  'teal'),
    (NEW.id, 'Other',         'spend',  'slate'),
    (NEW.id, 'Salary',        'income', 'emerald')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
