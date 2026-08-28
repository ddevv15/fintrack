-- Categories you manage: the usage count, and the last visible category rule.
-- Spec 0008, build plan task 1 (AC-3, AC-13, AC-22).
--
-- This feature adds no column and no table. `categories` already carries
-- everything it writes, built by spec 0002: the 1 to 60 name check, the ten
-- colour check, `is_hidden`, the case insensitive unique index, and the three
-- column foreign key that refuses to drop a category still holding history.
--
-- Two objects are added, and each exists because application code cannot
-- produce the answer honestly on its own.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

-- ---------------------------------------------------------------------------
-- category_usage: how many entries each of your categories holds.
--
-- Three things here are load bearing, and none of them fails loudly if it is
-- dropped, which is why each is written down.
--
-- security_invoker = true makes the view run as the person querying it, so the
-- row level security already on categories and transactions still applies.
-- Without it the view runs as its owner. This project's migrations run as
-- project_admin, which owns both underlying tables and is therefore exempt
-- from their policies, so omitting this one option produces a working view
-- that silently hands every account's counts to everybody. Nothing fails at
-- migration time and nothing fails a type check. Spec 0008 AC-22 checks it
-- from two real accounts rather than by reading this file, because a query
-- from a second account is the only thing that can catch it.
--
-- The LEFT JOIN is the second. An inner join would drop a category with no
-- entries entirely, and by the time the rows reach TypeScript a missing row is
-- indistinguishable from a real zero. Telling those two apart is the whole
-- basis of the delete control (AC-15), so the join has to keep the zeroes.
--
-- The join carries `t.user_id = c.user_id` alongside the category id. That is
-- not redundant with row level security: it matches the three column foreign
-- key on transactions, so the count is scoped the same way the constraint is.
-- ---------------------------------------------------------------------------
CREATE VIEW public.category_usage
WITH (security_invoker = true) AS
SELECT
  c.user_id,
  c.id            AS category_id,
  count(t.id)     AS entry_count
FROM public.categories c
LEFT JOIN public.transactions t
  ON t.category_id = c.id
 AND t.user_id     = c.user_id
GROUP BY c.user_id, c.id;

-- Privileges, the same treatment the three tables in core-schema.sql get, and
-- for the reason stated there: InsForge grants broad data access to anon and
-- authenticated by default, and a money app should not rest on the absence of
-- a policy alone. The one new object this feature adds is not the exception.
REVOKE ALL  ON public.category_usage FROM anon;
GRANT SELECT ON public.category_usage TO authenticated;

-- ---------------------------------------------------------------------------
-- You always keep at least one visible spend category.
--
-- Why this is in Postgres rather than in the server action, having first been
-- written the other way. The guard reads a count and then writes, and over the
-- SDK those are two statements and not one transaction, so two tabs each
-- hiding one of your last two visible categories can both read two and both
-- succeed, leaving the Log screen with no category to file a spend under. That
-- is a real race, and calling this a product rule rather than a data rule does
-- not make it one: a rule that has to hold under concurrency is an invariant.
--
-- The actions still perform their own read, through one shared helper, so the
-- ordinary refusal is a written message rather than a caught exception. This
-- trigger is what makes the rule true rather than usually true (AC-13).
--
-- No SECURITY DEFINER. The function runs as the caller, so the select below
-- sees exactly the rows row level security already allows it to see, which are
-- this account's own. Elevating it would widen what it can count for no gain.
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.refuse_last_visible_spend_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- The operation test comes first, so an ordinary rename or recolour never
  -- pays for the count below. Only two operations can reduce how many visible
  -- spend categories you hold: deleting a visible one, and hiding one that was
  -- visible. Deleting a category that is already hidden takes nothing away, so
  -- it is not this trigger's business.
  IF OLD.kind <> 'spend' OR OLD.is_hidden THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT NEW.is_hidden THEN
    RETURN NEW;
  END IF;

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

CREATE TRIGGER categories_keep_one_visible
  BEFORE UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.refuse_last_visible_spend_category();
