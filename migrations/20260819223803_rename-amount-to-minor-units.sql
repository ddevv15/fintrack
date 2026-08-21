-- Cents become minor units. Spec 0004, build plan task 1 (AC-9).
--
-- The stored integer was always right. The name was wrong: "cents" asserts that
-- the smallest unit of a currency is one hundredth of it, which is false for
-- the yen, the won, and the dinar. A minor unit is whatever the currency's own
-- smallest unit is, and how many of them make one major unit comes from the
-- currency, not from a hardcoded hundred.
--
-- Nothing about the data changes. Same bigint, same values, same positive only
-- check. Only the assertion in the name changes, which is why this is cheap
-- today and a data migration under pressure in two years.
--
-- No BEGIN/COMMIT here: InsForge wraps each migration in its own transaction.

ALTER TABLE public.transactions
  RENAME COLUMN amount_cents TO amount_minor;

-- Renaming a column leaves its inline CHECK constraint carrying the old name,
-- and a failed insert would then report "transactions_amount_cents_check" for a
-- column nothing calls that any more.
ALTER TABLE public.transactions
  RENAME CONSTRAINT transactions_amount_cents_check TO transactions_amount_minor_check;
