-- Make the last visible spend category rule hold by construction.
-- Spec 0008, AC-13.
--
-- The guard added an hour earlier, in
-- 20260828140000_category-usage-and-last-visible-guard.sql, reads a count and
-- then allows the write. Inside one trigger that is still two steps, and two
-- browser tabs hiding two different categories are two separate READ COMMITTED
-- transactions touching two different rows. Nothing makes them take turns: they
-- take no lock in common, so both can read "one other category is still
-- visible" before either commits, and both can then succeed. That leaves the
-- Log screen with nothing to file a spend under, which is the exact state
-- AC-13 exists to prevent.
--
-- It is a narrow window rather than a wide one, which is what makes it worth
-- closing properly instead of hoping. A test that races two hides passes on
-- most runs against the old function; "usually holds" is not what an invariant
-- means, and the failure it lets through is silent.
--
-- The fix is one shared lock, taken first, by every operation that could break
-- the rule. Locking the account's own profile row serialises this account's
-- hides and deletes against each other and against nothing else. The second
-- transaction waits at the lock, and because each statement in READ COMMITTED
-- takes a fresh snapshot, the count it runs afterwards sees the first
-- transaction's committed change and refuses. No other account is affected,
-- and category writes are rare enough that the serialisation costs nothing.
--
-- Locking the profile row rather than the sibling category rows is deliberate.
-- Locking siblings deadlocks: two tabs would each hold the row the other wants,
-- and Postgres would break the tie by killing one with a deadlock error, which
-- is a refusal the person cannot be told the reason for. One lock, always the
-- same row, always taken first, cannot deadlock against itself.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

CREATE OR REPLACE FUNCTION public.refuse_last_visible_spend_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- The operation test comes first, so an ordinary rename or recolour never
  -- takes the lock below. Only two operations can reduce how many visible
  -- spend categories you hold: deleting a visible one, and hiding one that was
  -- visible. Deleting a category that is already hidden takes nothing away, so
  -- it is not this trigger's business.
  IF OLD.kind <> 'spend' OR OLD.is_hidden THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT NEW.is_hidden THEN
    RETURN NEW;
  END IF;

  -- The gate. Every hide and every delete of a visible spend category queues
  -- here, so the count below is never read while another one is in flight.
  --
  -- A missing profile row takes no lock and falls through to the count, which
  -- is the old behaviour rather than an error: the profile is created by a
  -- trigger at sign up, so its absence means something is already wrong, and
  -- refusing every category write would be a worse answer than a rare race.
  PERFORM 1 FROM public.profiles WHERE user_id = OLD.user_id FOR UPDATE;

  -- `id <> OLD.id` is what makes this a question about the rest of your
  -- categories rather than about this one. On an UPDATE the row still reads as
  -- visible from here, since this is a BEFORE trigger.
  IF NOT EXISTS (
    SELECT 1 FROM public.categories
    WHERE user_id = OLD.user_id
      AND kind = 'spend'
      AND is_hidden = false
      AND id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'last visible spend category'
      USING ERRCODE = 'raise_exception';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
