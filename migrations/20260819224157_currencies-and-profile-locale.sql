-- The supported currencies, and where your currency and timezone live.
-- Spec 0004, build plan task 2 (AC-11, AC-12).
--
-- Two nullable columns on profiles and one small reference table. Null in
-- either column means not chosen yet, never a default: an amount in a currency
-- nobody picked is worse than a screen that asks.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

-- ---------------------------------------------------------------------------
-- currencies: reference data, so the database can refuse a code the app made up
-- ---------------------------------------------------------------------------
CREATE TABLE public.currencies (
  code     TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  decimals SMALLINT NOT NULL CHECK (decimals BETWEEN 0 AND 3),
  name     TEXT NOT NULL
);

-- The twenty from spec 0004. Two zero decimal currencies and one three decimal
-- currency are here deliberately, so the exponent path is reachable by a real
-- choice on the sign up form and not only by a test.
INSERT INTO public.currencies (code, decimals, name) VALUES
  ('USD', 2, 'US dollar'),
  ('EUR', 2, 'Euro'),
  ('GBP', 2, 'British pound'),
  ('INR', 2, 'Indian rupee'),
  ('JPY', 0, 'Japanese yen'),
  ('CNY', 2, 'Chinese yuan'),
  ('AUD', 2, 'Australian dollar'),
  ('CAD', 2, 'Canadian dollar'),
  ('CHF', 2, 'Swiss franc'),
  ('SGD', 2, 'Singapore dollar'),
  ('HKD', 2, 'Hong Kong dollar'),
  ('NZD', 2, 'New Zealand dollar'),
  ('SEK', 2, 'Swedish krona'),
  ('NOK', 2, 'Norwegian krone'),
  ('DKK', 2, 'Danish krone'),
  ('ZAR', 2, 'South African rand'),
  ('AED', 2, 'UAE dirham'),
  ('SAR', 2, 'Saudi riyal'),
  ('KRW', 0, 'South Korean won'),
  ('KWD', 3, 'Kuwaiti dinar');

-- Every signed in account may read all of it, and nobody may write any of it.
-- A table with no policy is a leak by the rule in AGENTS.md, even one holding
-- nothing personal, so the read is granted explicitly rather than left implied.
-- There is deliberately no insert, update, or delete policy: the only way this
-- list changes is a migration, which is the intent.
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY currencies_read_all ON public.currencies
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON public.currencies FROM anon;
GRANT SELECT ON public.currencies TO authenticated;

-- ---------------------------------------------------------------------------
-- profiles: your currency and your timezone, both chosen by you
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN currency TEXT REFERENCES public.currencies(code),
  ADD COLUMN timezone TEXT;

-- The timezone check cannot be a CHECK constraint. pg_timezone_names is a view,
-- and a CHECK may not run a subquery; a function marked IMMUTABLE that reads a
-- catalog view is a lie Postgres will eventually act on. So it is a trigger.
CREATE OR REPLACE FUNCTION public.assert_timezone_is_real()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.timezone IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone
     )
  THEN
    RAISE EXCEPTION 'timezone % is not an IANA time zone name', NEW.timezone
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_timezone_is_real
  BEFORE INSERT OR UPDATE OF timezone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assert_timezone_is_real();

-- Currency locks the moment history exists. Reinterpreting stored amounts would
-- silently change what past months mean, and rescaling them would invent an
-- exchange rate nobody supplied, so the honest answer is to refuse.
--
-- Setting a currency for the first time, null to a value, is always allowed.
-- That carve out is safe only because of the second trigger below, which makes
-- a transaction genuinely impossible before a currency is chosen.
CREATE OR REPLACE FUNCTION public.assert_currency_not_locked()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.currency IS DISTINCT FROM OLD.currency
     AND OLD.currency IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.transactions WHERE user_id = OLD.user_id
     )
  THEN
    RAISE EXCEPTION
      'currency cannot change once this account has transactions'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_currency_locked
  BEFORE UPDATE OF currency ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assert_currency_not_locked();

-- No amount may exist in a currency nobody chose. This is what makes the carve
-- out above honest: without it, "null to a value is always allowed" rests on an
-- assumption rather than on something the database enforces. It lives here
-- rather than in app code so no future write path can go around it.
CREATE OR REPLACE FUNCTION public.assert_profile_is_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  profile_currency TEXT;
  profile_timezone TEXT;
BEGIN
  SELECT currency, timezone INTO profile_currency, profile_timezone
  FROM public.profiles WHERE user_id = NEW.user_id;

  IF profile_currency IS NULL OR profile_timezone IS NULL THEN
    RAISE EXCEPTION
      'this account has not chosen a currency and a time zone yet'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER transactions_profile_is_complete
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.assert_profile_is_complete();
