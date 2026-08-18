# Verify: Stack and architecture · spec 0001 · updated 2026-08-19 · verified 2026-08-19
_Steps derived from the scope Done when and from the rules in spec 0001. `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [x] `npm run dev` → server ready, and `curl -s localhost:3000` returns the FinTrack heading → scaffold boots locally
- [x] `npm run build` → completes with no errors and no Turbopack root warning → production build passes
- [x] `npx tsc --noEmit` → no output → the stack typechecks
- [x] `npm run lint` → no findings → eslint-config-next is wired
- [x] `git check-ignore .env.local` → prints `.env.local`, and `git check-ignore .env.example` → prints nothing → real values stay local, the documented example is committed

## UI / manual
- [x] Visit `http://localhost:3000` → the page renders and the dev log shows `proxy.ts` ran → updateSession sits in front of Server Components
- [x] Visit `http://localhost:3000/api/auth/refresh` with a POST and no session → responds rather than crashing → the browser refresh route exists

## Value sourcing
One step per value the scaffold produces, exercising the edge that breaks if the source is wrong.

- [x] **The current calendar day** comes from `APP_TIMEZONE`, never the server clock (rule 6). With the instant `2026-09-01T03:30:00Z`: `today(instant, "America/New_York")` → `2026-08-31`, and `today(instant, "Asia/Tokyo")` → `2026-09-01`. Two different months from one instant is the exact failure this rule exists to stop.
- [x] **The month boundary** is half open and comes from the calendar day, not from a timestamp. `monthRange("2026-08-31")` → `{ start: "2026-08-01", endExclusive: "2026-09-01" }`; `monthRange("2026-12-05")` rolls the year to `2027-01-01`; `monthRange("2028-02-10")` → `2028-03-01` across the leap year.
- [x] **A displayed amount** comes from whole cents through the one money module (rule 1). `formatCents(123456, "USD")` → `$1,234.56`; `formatCents(5, "USD")` → `$0.05`; `formatCents(-2599, "USD")` → `-$25.99`; `formatCents(10.5, "USD")` throws rather than rounding, because a fractional cent means an amount was divided somewhere it should not have been.
- [x] **Currency** comes from `APP_CURRENCY` and only on the server. `formatCents(1000)` with `APP_CURRENCY=EUR` → a euro amount; called from a Client Component with no explicit currency → throws, because that value is deliberately not in the browser bundle.
- [x] **Configuration** comes from the environment and fails loudly (rule 11). With `NEXT_PUBLIC_INSFORGE_URL=not-a-url`, an empty anon key, `APP_CURRENCY=dollars`, and `APP_TIMEZONE=Mars/Olympus`, calling `env()` throws once and names all four problems. It never falls back to a default.

## Coverage
The scope Done when for this feature has three parts, and this feature has no numbered acceptance criteria because spec 0001 is a decision spec.

- stack choice written down in a spec → spec 0001 exists and is linked from the scope
- scaffold boots locally → the `npm run dev` and homepage steps
- production build passes → the `npm run build`, typecheck, and lint steps

## Backend reachability
- [x] With `.env.local` filled in, `client.database.from("transactions").select("*")` returns the Postgres error `42P01 relation "public.transactions" does not exist` → the anon key was accepted and the request reached Postgres.
- [x] Negative control, required: repeat that call with a deliberately wrong anon key → `401 AUTH_INVALID_CREDENTIALS, Invalid anon key`. Two different failures means the probe really discriminates.

> Do not use `auth.getCurrentUser()` as the reachability probe. With no session it returns `{ user: null }` with `error: null` whether the key is right or wrong, because it never leaves the machine. It passes against a backend that does not exist.

## Not covered yet
- No table has been created, so nothing exercises row level security yet. Proving a policy actually blocks another person's rows belongs to feature 3, data model.
- The InsForge CLI is not logged in, so `db migrations up` cannot run yet. Feature 3 needs that.
