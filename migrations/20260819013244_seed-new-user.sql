-- FinTrack new account seed. Spec 0002, build plan task 3.
--
-- A new account needs a profile row and a set of categories before it can log
-- anything. Feature 6 saves a spend against a category in Release 1, while
-- managing categories does not arrive until Release 2, so the starting set
-- cannot wait for a screen to create it.
--
-- These are ordinary rows you own. Nothing marks them as special, so renaming,
-- recolouring, hiding, or adding your own is just an ordinary write.

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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
