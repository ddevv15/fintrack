-- Delete your own account, and nothing else.
-- Spec 0004, build plan task 8 (AC-18).
--
-- The spec called for an InsForge edge function holding an elevated credential,
-- because the SDK exposes no self deletion. This is the smaller answer the
-- engineer chose during /develop instead: a SECURITY DEFINER function that
-- takes the account to remove from auth.uid() and never from an argument.
--
-- Why this is the safer of the two. There is no parameter, so there is nothing
-- to tamper with: a caller cannot name another account because there is nowhere
-- to name one. There is no second deployable artifact with its own lifecycle,
-- and no admin credential stored anywhere for something to leak. The privilege
-- is scoped to this one statement rather than to a whole runtime.
--
-- The cascade does the rest. profiles, categories, and transactions all
-- reference auth.users(id) ON DELETE CASCADE (spec 0002), so removing the one
-- row removes every row of yours in the database. No soft delete, no marked
-- state, no grace period.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  caller UUID := auth.uid();
BEGIN
  -- SECURITY DEFINER means this runs as the function's owner, which can delete
  -- from auth.users. The whole safety of that rests on the next three lines:
  -- the id comes from the verified session and from nowhere else, and an
  -- unauthenticated caller is refused rather than deleting a NULL id row.
  IF caller IS NULL THEN
    RAISE EXCEPTION 'delete_own_account() requires a signed in caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  DELETE FROM auth.users WHERE id = caller;
END;
$$;

-- Signed in accounts only. anon has no business calling this at all, and
-- without the REVOKE it would inherit EXECUTE from PUBLIC, which combined with
-- SECURITY DEFINER is exactly the shape of mistake this comment exists to stop.
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
