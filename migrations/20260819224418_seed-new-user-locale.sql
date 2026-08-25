-- The new account trigger also writes your currency and your timezone.
-- Spec 0004, build plan task 3 (AC-1).
--
-- One insert, no follow up write from the app. A second write would mean a
-- window where a profile exists with no currency and the app believes it has
-- one, and that window is exactly where a wrong amount gets rendered.
--
-- Everything about SECURITY DEFINER in the previous version of this function
-- still applies and is still load bearing; the comment below is the whole of it
-- rather than a pointer, because this file is the one someone reads.
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

  -- currency and timezone come from the signup payload the server action built,
  -- already validated in Zod against the supported list. A Google signup sends
  -- neither, so both land NULL and the one time setup screen collects them.
  -- The foreign key and the timezone trigger are the last word either way: a
  -- bad value fails account creation loudly rather than writing a bad profile.
  INSERT INTO public.profiles (user_id, display_name, currency, timezone)
  VALUES (
    NEW.id,
    NEW.profile ->> 'name',
    NEW.profile ->> 'currency',
    NEW.profile ->> 'timezone'
  )
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
