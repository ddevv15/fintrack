# 0001. Rationale: stack and architecture

The decision itself lives in [index.md](index.md). This file is the record of why.

## Context

FinTrack is a personal money tracker for exactly one person, built and maintained by that same person in whatever time is spare. The project is empty today: no code, no context files, not even a git repository. Every technical decision is open, and the plan in `docs/scope/scope.md` lays out twenty features across six releases, from logging a spend through to a live bank connection. Nothing in that plan can start until the foundation is chosen, because the scope explicitly parks all tooling behind this decision.

Three forces press harder than the rest. The first is correctness of money. The scope demands amounts be stored exactly rather than as approximate decimals, and it says so twice, because binary floating point arithmetic is the classic way money software goes quietly wrong: a total that is off by a cent, in a way nothing warns about and nobody notices for months. The second is the cost of being wrong. The scope notes the data model is the most expensive thing to redo, and the foundation underneath it is worse still, since every later release inherits whatever is picked here. The third is maintenance capacity. A single person maintaining this in spare time cannot absorb an unfamiliar stack, several vendors, and a large operational surface at once. Whatever is chosen must be operable on a Tuesday evening by someone who has not looked at it in three weeks.

Against those, the requirements are modest in scale but not in shape. One user, a few hundred rows a month, and a workload that is idle almost all the time. But the app must survive across laptop and phone, must keep everything behind a sign in, must total spending by category correctly, and must later grow to hold budgets, repeating bills, several accounts, receipt photographs, and eventually a regulated connection to a real bank. It also needs one public page for search engines, which means the same codebase has to serve both a private application and an indexable marketing surface.

The consequence of not deciding is total: no other work in the plan can begin, since the scope gates conventions, tooling, the data model, and the design system behind this one choice.

## Options considered

### Option 1: Next.js with InsForge as the backend, hosted on Vercel

One Next.js application in TypeScript, with InsForge supplying Postgres, sign in, storage, and scheduling as a single platform. Data access goes through the InsForge SDK under row level security, schema through plain SQL migration files, and hosting through Vercel.

**Pros**:

- Already proven by you on this exact combination in `jobpilot`, running Next.js 16.2 against InsForge, so the unfamiliar surface is unusually small.
- Covers Release 6 receipt storage, Release 4 recurring bill scheduling, and Release 2 error monitoring from one platform, removing three future vendor decisions.
- Row level security puts the privacy guarantee in the database, which is a stronger place for it than app code.
- Four InsForge skills are already installed locally, so the agent knows the platform's real conventions rather than guessing.

**Cons**:

- Heavy vendor concentration. Database, auth, storage, and scheduling all in one place, so a failure or a price change hits four things at once.
- No ORM exists for it, so there is no compile time link between the schema and the code, and a renamed column breaks the app silently.
- Aggregates must be SQL functions, which splits behaviour between the app and the database.
- A wrong row level security policy leaks data quietly rather than failing loudly.

### Option 2: Next.js with Neon Postgres, Drizzle, and Better Auth, hosted on Vercel

The assemble it yourself stack. Plain managed Postgres from Neon, schema and queries through Drizzle with full type safety, sign in through Better Auth in your own tables, and everything on Vercel.

**Pros**:

- Genuine type safety from the database schema all the way to the screen, which catches exactly the class of mistake Option 1 leaves to runtime.
- No vendor holds more than one job, so replacing any single piece is a contained change.
- Neon scales to zero when idle and wakes in under half a second, which suits an app used for a minute a day almost perfectly.
- Better Auth keeps users in your own Postgres with no vendor tie, and reached v1.6 in May 2026.

**Cons**:

- Every later capability is a fresh decision. Storage for receipts, scheduling for recurring bills, and error monitoring each become their own vendor evaluation.
- More pieces to wire and keep in step, which is the exact operational surface a spare time maintainer struggles with.
- Authorization moves into app code rather than the database, so a missed check is a leak.
- Nothing here is already familiar to you, so the whole stack is new surface at once.

### Option 3: Next.js with Supabase, hosted on Vercel

The other mature backend as a service. Postgres plus auth, storage, realtime, and edge functions, with the same PostgREST and row level security model as Option 1.

**Pros**:

- The largest community of any option here, so almost every problem has already been written up by someone.
- Same structural benefits as Option 1: one platform, row level security in the database, storage included.
- More portable than Option 1 in practice, since Supabase is open source and can be self hosted if the hosted service stops suiting you.

**Cons**:

- New surface for you, where InsForge is not, which is the whole argument that separates it from Option 1.
- The free tier pauses an inactive project after about a week, which is a poor fit for an app you might not open while on holiday.
- Duplicates what you already run elsewhere, so you would maintain familiarity with two similar platforms rather than one.

### Option 4: TanStack Start with Neon and Drizzle

The type safety first stack. TanStack Start on Vite, with fully typed routing, Neon Postgres, and Drizzle, deploying anywhere.

**Pros**:

- The best end to end type safety available in the React world in 2026, with route and search parameters typed without annotations.
- Vite makes the development loop noticeably faster than the alternatives.
- Very portable, with no framework specific hosting assumptions.

**Cons**:

- Youngest and smallest ecosystem of the four, which bites hardest when you are alone and stuck.
- The Release 6 public page needs its metadata and structured data built more manually than Next.js requires.
- Combines an unfamiliar framework with an unfamiliar backend, which is the largest total risk of any option here.

## Rationale

Option 1 wins on the maintenance force, which is the one that actually decides this project's fate. The scope describes twenty features across six releases built by one person in spare time, and the most common way such a project dies is not a wrong database, it is the maintainer losing momentum against accumulated unfamiliar surface. You already run Next.js 16 against InsForge in `jobpilot`. That is not a mild preference, it is the difference between a foundation you can pick up cold after three weeks away and one you have to relearn. Option 3 is arguably the stronger platform in the abstract, with a far larger community and a genuine self hosting escape route, and Option 2 is the better engineering answer on type safety. Both lose here to the fact that neither is already in your hands.

The scope's own sequencing reinforces it. Release 6 needs file storage for receipts, Release 4 needs scheduling for repeating bills, and Release 2 needs somewhere errors can land. Under Options 2 and 4 each of those is a future decision, a future vendor, and a future integration. Under Option 1 they are already present. Reuse beats sprawl, and here the reuse is unusually well aligned with what the plan already says it needs.

Two of your choices deserve calling out as better than the obvious alternative. Integer cents rather than a `numeric` column looked like the more conservative pick at the time, but it became the decisive one once InsForge entered, because PostgREST puts a JSON boundary between the database and the app. A `numeric` value would have depended on how the SDK serialises decimals across that boundary, which is precisely the quiet lossy conversion the Money pattern exists to prevent. Integers below 2^53 cross JSON untouched, so the guarantee is structural rather than trusted. Similarly, storing a plain calendar date rather than a timestamp removes timezone handling from every month query in the app, and since every screen in this product is organised by month, that eliminates a whole category of bug before any code exists.

The honest weakness of this decision is the ORM gap, and it should not be glossed over. Options 2 and 4 would have given you a compile time link between the schema and your code, and Option 1 gives you nothing of the kind. Rename a column in a migration and the app keeps compiling and starts failing at runtime. This is a real regression against the alternatives, it is not solved by care, and it is why the follow up list carries an unresolved question about generated versus hand written types that Feature 3 must settle before the schema grows.

A database view was weighed as the alternative to SQL functions for category breakdowns, and rejected in favour of functions. It is worth recording why the usual argument for views does not apply here: a view is often assumed to inherit row level security automatically, and it does not. A Postgres view runs with its owner's permissions unless it is created with `security_invoker = true`, so it carries exactly the same bypass risk as a `SECURITY DEFINER` function. Views were not the safer path, only the differently shaped one, and rule 7 now covers both.

Two process notes worth recording. Drizzle and InsForge were chosen roughly ninety seconds apart in the same conversation and are incompatible, since InsForge exposes no ORM integration and no documented direct Postgres connection. Each pick was reasonable alone. Only writing the combination down surfaced the conflict, which is the argument for this spec existing at all.

The second is that rules 6 through 11 exist because an independent model read this spec and found them missing. Four of the six gaps land inside Release 1, and the timezone one is the sharpest lesson: fixing date storage genuinely removed timezone maths from comparing dates, and that made it harder, not easier, to notice that deciding which month is the current one is a separate question with no answer named. A fix that solves most of a problem is good at hiding the rest of it.

## References

**Project sources** (verifiable, in this repo and on this machine):

- `docs/scope/scope.md`, the exact money storage rule at line 51 and the practices list at line 185
- `docs/scope/scope.md`, the Skateboard build approach and the Beta workflow tier on Feature 1
- `docs/scope/scope.md`, the WCAG, OWASP, and Money pattern links already fetched and confirmed during scope
- Your `jobpilot` project: Next.js 16.2.10, React 19.2.4, `@insforge/sdk` 1.4.3, Tailwind v4, Zod v4, npm, and the `app`, `components`, `lib`, `actions`, `migrations` layout
- Installed InsForge skills, confirming SQL migration files, PostgREST semantics, the `@insforge/sdk/ssr` helper set, and frontend deployment through Vercel
- `docs/.agent-cache/research/stack-architecture.md`, the landscape check run for this decision

**Practices and standards**:

- The Money pattern: store exact minor units, never binary floating point
- Monolith first: extract services only when a real bottleneck forces it, never by architectural taste
- A relational database as the default, since it handles almost every product workload without specialist knowledge
- Row level security: enforce authorization in the database rather than trusting every call site
- OWASP session handling: keep refresh tokens httpOnly and run auth mutations server side
- WCAG 2.2 for keyboard and screen reader access, met through accessible component primitives rather than retrofitted
- Boring technology as a feature: proven tools with large communities and well understood failure modes

**Links** (returned and confirmed by the landscape and discovery checks run on 2026-08-19):

- Drizzle Postgres column types, confirming `numeric` returns strings by default: https://orm.drizzle.team/docs/column-types/pg
- TanStack Start compared with Next.js: https://makerkit.dev/blog/tutorials/tanstack-start-vs-nextjs
- React Router v7, TanStack Start, and Next.js compared: https://kanopylabs.com/blog/react-router-v7-vs-tanstack-start-vs-nextjs
- Drizzle compared with Prisma: https://makerkit.dev/blog/tutorials/drizzle-vs-prisma
- Better Auth compared with Clerk and Auth.js: https://makerkit.dev/blog/tutorials/better-auth-vs-clerk
- Better Auth compared with NextAuth and Clerk: https://supastarter.dev/blog/better-auth-vs-nextauth-vs-clerk
- Neon compared with Supabase: https://designrevision.com/blog/supabase-vs-neon
- Neon compared with Supabase, second source: https://www.bytebase.com/blog/neon-vs-supabase/
- Arcjet MCP server: https://github.com/arcjet/mcp
- Arcjet Agent Skills: https://github.com/arcjet/skills
- Arcjet for Next.js: https://www.npmjs.com/package/@arcjet/next
- Arcjet rate limiting quick start: https://docs.arcjet.com/rate-limiting/quick-start
- The installed Vitest skill: https://skills.sh/antfu/skills/vitest
- The installed Arcjet skill: https://skills.sh/arcjet/skills/arcjet
