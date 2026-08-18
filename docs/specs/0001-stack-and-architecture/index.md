# 0001. Build FinTrack on Next.js with InsForge as the backend

**Date**: 2026-08-19
**Status**: Accepted

## Summary

FinTrack will be a responsive web app written entirely in TypeScript, built with Next.js and hosted on Vercel, with InsForge as the backend that provides the Postgres database, sign in, and file storage in one place. Money is stored as whole cents in an integer column, never as a decimal number, because binary floating point quietly loses accuracy and this is a money app. There is no ORM (a library that maps database rows to objects): the database schema lives in plain SQL migration files, and the app reads and writes through the InsForge SDK with row level security (rules inside the database itself that decide which rows a signed in person may see). This choice was made to reuse a platform you already run in another project, and because it covers storage, scheduling, and analytics that later releases need anyway.

## Decision

**Chosen option**: Option 1: Next.js with InsForge as the backend, hosted on Vercel.

FinTrack is built as a single Next.js application in TypeScript, backed by one InsForge project supplying Postgres, authentication, and storage, deployed to Vercel, with all money held as integer cents (basis: the Money pattern, storing exact minor units rather than binary floating point).

**Implementation skills**: `insforge` (InsForge, `~/.agents/skills/insforge/`) · `insforge-cli` (InsForge, `~/.agents/skills/insforge-cli/`) · `insforge-debug` (InsForge, `~/.agents/skills/insforge-debug/`) · `arcjet` (`arcjet/skills`, `.agents/skills/arcjet/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture pattern | Single application, no services | One user and one maintainer, so anything split apart is pure overhead (basis: monolith first, extract only when a real bottleneck forces it) |
| Language | TypeScript everywhere | One language across screens, server, and the public page, so there is no context switch and no second toolchain |
| Framework | Next.js 16 | Deepest ecosystem when you are solo, and its metadata support covers the Release 6 public page natively (basis: your `jobpilot` project already runs Next.js 16.2 on this same backend) |
| Backend platform | InsForge, one project for now | Supplies Postgres, sign in, storage, and scheduling together, which covers Releases 1, 4, and 6 without four separate vendor decisions |
| Primary database | Postgres, managed by InsForge | Relational is the right default for money that must total exactly and join to categories (basis: a relational database handles almost every product workload without specialist knowledge) |
| Schema management | Plain `.sql` files in `migrations/`, applied by `npx @insforge/cli db migrations up` | The only mechanism InsForge offers, and version numbered SQL is readable and reversible by hand |
| Data access | `@insforge/sdk`, which is PostgREST underneath | No ORM exists for this platform, so the SDK is the supported path, and row level security travels with every call |
| Rendering and data pattern | Server first: `createServerClient` in Server Components, `createAuthActions` for sign in, Server Actions for writes, `updateSession` in `proxy.ts` | InsForge's own documented Next.js pattern, and it keeps the refresh token httpOnly so no script can read it (basis: OWASP session handling guidance) |
| Money representation | Whole cents in an integer column | Exact by construction, exact under Postgres `SUM`, and exact across JSON since integers below 2^53 survive the wire intact (basis: the Money pattern) |
| Currency | USD, fixed in one config value, formatted with `Intl.NumberFormat` | Built into the platform so nothing to install, and one config value means changing it later touches one line |
| Date model | An `occurred_on` date column plus a `created_at` timestamp | A spend happens on a calendar day, so comparing dates needs no timezone maths, and `created_at` gives Feature 7 a reliable newest first tiebreak. Deciding which month is the current one is a separate problem, settled by rule 6 |
| Aggregates | SQL functions called through `.rpc()` | PostgREST cannot do an ad hoc `GROUP BY`, and Postgres totalling integers stays exact and gets reused by Releases 3 and 5 |
| Auth | InsForge Auth | Row level security policies key off its user id, so the database itself enforces the privacy rule rather than app code remembering to |
| File storage | InsForge Storage | Already part of the platform, ready for Release 6 receipt photos, and files never belong in database rows |
| Hosting | Vercel, directly | Same runtime InsForge deployments use anyway, plus per branch preview deployments and the full dashboard |
| Styling | Tailwind v4 with shadcn/ui | shadcn sits on Radix primitives, so keyboard and screen reader behaviour arrives built rather than hand written (basis: WCAG 2.2, cited in your scope) |
| Validation | Zod v4 | One library covers the spend form, Server Action inputs, environment variables at boot, and the shape SQL functions return |
| Dates in code | date-fns | Tree shakeable plain functions, and start and end of month read clearly, which is most of what a month based tracker needs |
| Testing | Vitest for logic, Playwright for the app | Vitest covers money maths and month boundaries; Playwright is what `/check verify` drives anyway |
| Lint and format | ESLint with `eslint-config-next`, plus Prettier | The Next config carries App Router rules that catch server and client boundary mistakes nothing else will |
| Package manager | npm | What `jobpilot` uses and what every InsForge instruction assumes, since the CLI runs through `npx` |
| Security hardening | Arcjet, designed at Feature 5 | Rate limiting and bot protection on sign in, which nothing else in this stack provides |
| Observability | PostHog, designed at Feature 12 | Covers the Release 2 error monitoring feature, and InsForge already integrates with it |
| Layout | `app/`, `components/`, `lib/`, `actions/`, `migrations/` | Mirrors `jobpilot`, so moving between your two projects costs nothing |

**Configuration required**:

- `NEXT_PUBLIC_INSFORGE_URL`: the project URL, taken from `oss_host` in `.insforge/project.json`
- `NEXT_PUBLIC_INSFORGE_ANON_KEY`: the anon key, read with `npx @insforge/cli secrets get ANON_KEY`
- `APP_CURRENCY`: the currency code, `USD`, read by the one module that formats amounts
- `APP_TIMEZONE`: the reference timezone used to work out what today is and where a month starts and ends. Set it to the zone you actually live in, and read rule 6 for why this exists
- `ARCJET_KEY`: added when Feature 5 wires up sign in protection, not before
- PostHog keys: added when Feature 12 designs error monitoring, not before

Keep these in `.env.local`, keep a committed `.env.example` documenting them, and make sure `.env*.local` is ignored by git.

**Rules the build must honour**:

1. Money is read and written as integer cents only. One module owns the conversion to and from display, and nothing else multiplies or divides an amount.
2. No amount column is ever declared `numeric` with a JavaScript number mapping. This is the exact failure the scope forbids.
3. Every table holding personal data has row level security switched on, with a policy tied to the signed in user id. A table without a policy is a data leak, not a to do.
4. Totals and breakdowns come from SQL functions, not from fetching rows and adding them up in the browser.
5. Auth mutations run on the server through `createAuthActions`, never from the browser.
6. What counts as today, and where a month starts and ends, is worked out on the server from `APP_TIMEZONE`. Never from the server's own clock, and never from the browser's. Storing plain dates removed timezone maths from comparing two dates, but something still has to decide which month is the current one, and a server in one place deciding that for a person in another gets it wrong late on the last evening of a month.
7. Aggregate SQL functions are declared `SECURITY INVOKER`, which is the Postgres default, so row level security applies to whoever calls them. A function declared `SECURITY DEFINER` runs as its owner and silently ignores those policies, so if one is ever genuinely needed it must filter by the caller's user id by hand and carry a comment explaining why it exists. The same trap applies to views: any view over personal data is created with `security_invoker = true`, or it too runs as its owner and bypasses the policies.
8. No Vercel preview deployment ever points at the production InsForge project. Preview environment variables point at the InsForge branch, and previews only exist once that branch does. Sharing one backend would mean a test push writing invented transactions into your real spending history.
9. Migrations are applied before the code that depends on them is deployed, following expand then contract: add a column before anything reads it, and drop a column only after nothing does. The two run through different tools, the InsForge CLI and Vercel, so nothing enforces the order for you.
10. A new account receives its starting categories from a Postgres trigger on user creation, defined in a migration. Feature 6 has to save a spend against a category in Release 1, while managing categories does not arrive until Release 2, so the defaults cannot wait for a screen to create them.
11. A failing SQL function surfaces an explicit error on screen. It never falls back to zero or to a partial total, because a wrong money figure shown confidently is worse than an honest error.

## Consequences

**Positive**:

- Three later scope features stop being separate vendor decisions: Release 6 receipt storage, Release 4 recurring bills scheduling, and Release 2 error monitoring all have a home already.
- The privacy rule in Feature 5, that nothing is readable without being signed in, is enforced by the database rather than by remembering to check in app code.
- Reusing a platform and a layout you already run in `jobpilot` means the unfamiliar surface is small, which matters a great deal for a solo project you maintain in spare time.
- Money correctness is structural rather than careful. Integer cents cannot drift, through Postgres or across JSON.

**Negative / tradeoffs**:

- Real vendor concentration. InsForge holds the database, sign in, storage, and scheduling. If it becomes unavailable or too expensive, you are not swapping one component, you are rebuilding four. The partial mitigation is that the tables and the data are plain Postgres, so they move to any other Postgres host untouched. Do not overstate it: the row level security policies are written against InsForge's token shape, and those are schema too, so they would need rewriting rather than copying. That is the security critical layer, which makes it the worst part to migrate under pressure.
- No ORM means no compile time link between the schema and your code. Rename a column in a migration and nothing tells you the app is now broken until it runs. Feature 3 needs to settle whether types are generated or hand written, and that is genuinely unresolved today.
- Some logic moves into the database. Category breakdowns live in SQL functions, so behaviour is split between two places, and a change to how a total is computed means a migration rather than an edit.
- A mistaken row level security policy is a silent data leak rather than a loud error. These policies need testing deliberately, which is work Release 1 would otherwise not have.
- Two vendors instead of one, since you chose Vercel directly rather than InsForge deployments. Environment variables now have to be kept in step in two dashboards.
- Multi currency is now a migration rather than a configuration change, because no currency column exists. That was a deliberate call and the scope defers the feature, but the cost is real if you ever travel and want to log in another currency.

**Neutral**:

- Writing SQL by hand is new work compared to an ORM, and for a money app that is arguably a benefit rather than a cost, but it is still a skill this project now requires.
- Next 16 renamed middleware to `proxy.ts`. Older guides will refer to `middleware.ts` and will look wrong.
- Arcjet and PostHog are recorded here but deliberately not wired up yet, so Release 1 ships without rate limiting. For a single user app with no public sign up that is acceptable, but it is a conscious gap rather than an oversight.

## Follow-up

- [ ] Run `git init`. This project is not a git repository yet, so the scaffold cannot land as a first commit and no later skill can read history.
- [ ] Run `/audit` once the scaffold boots, to write the `AGENTS.md` this decision currently has to substitute for.
- [ ] Record the installed skills (`arcjet`, `vitest`) in the `## Agent skills` section of `AGENTS.md` when it exists, with their locations.
- [ ] Record the declines so nothing offers them again: Drizzle and Prisma (no ORM fits InsForge), Better Auth and Clerk (the platform supplies auth), Biome (framework rules matter more), pnpm and bun (npm matches the tooling).
- [ ] Authorize the PostHog MCP server. It is installed but unauthenticated, and this session could not run the sign in flow.
- [ ] Add the Arcjet MCP server with `claude mcp add arcjet -- npx -y @arcjet/mcp`. It is not a registry connector, so it needs adding by hand.
- [ ] Decide how schema types reach the app: generated from the database, or hand written alongside each migration. This belongs in Feature 3, and until it is settled `/develop` will invent something. Cover two separate things, not one: table columns, and the contracts of the SQL functions called through `.rpc()`, meaning the function name, its parameter names and types, and the shape it returns. The function contracts are the riskier half, since a mistyped function name fails only when it runs, with nothing to catch it earlier.
- [ ] Decide the actual list of default categories the trigger in rule 10 inserts. The mechanism is settled here, the list is a product choice that belongs with Feature 3 or Feature 9.
- [ ] Arcjet has no scope row. Consider whether `/scope` should enroll it, or whether Feature 5 absorbs it, since nothing in the current scope mentions rate limiting or bot protection.
- [ ] The `docs/.agent-cache/` folder now holds a landscape check. Decide whether that is committed or ignored.

## Rationale

The full decision record, meaning the problem, the stacks weighed against each other, the reasoning, and the sources, lives in [rationale.md](rationale.md).
