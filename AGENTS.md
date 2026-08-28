# FinTrack

A personal money tracker for one person: log a spend, put it in a category, see where the month went.

## Stack

- **Language / Runtime**: TypeScript (strict), Node 22
- **Framework**: Next.js 16 App Router, React 19, server first
- **Backend**: InsForge (Postgres, Auth, Storage) through `@insforge/sdk`. No ORM; schema is plain SQL in `migrations/`
- **Key dependencies**: Tailwind v4, Zod v4, date-fns, lucide-react (icons), clsx plus tailwind-merge (class joining)
- **Package manager**: npm · **Hosting**: Vercel

Full decision record and its reasoning: [spec 0001](docs/specs/0001-stack-and-architecture/index.md).

## Build approach

**Skateboard**: ship the thinnest usable whole first, then grow it release by release, shippable at every step.

## Commands

```bash
npm install                                # Install
npm run dev                                # Dev server on http://localhost:3000
npm run build                              # Production build
npm run typecheck                          # Typecheck (generates route types first)
npm run lint                               # Lint
npm run format                             # Format everything, or format:check to verify
npm run test                               # Unit tests (Vitest)
npm run test:e2e                           # Browser tests (Playwright)
npx @insforge/cli db migrations up --all   # Apply migrations (needs `cli login` first)
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`. The feature scope lives in `docs/scope/`.

## Rules

- Money is integer minor units everywhere, the smallest unit the currency actually has, so a cent for a dollar and a whole yen for a yen. `lib/money.ts` is the only module that converts an amount, into a display string or back out of a form field; nothing else multiplies or divides one.
- What today is, and where a month starts and ends, comes from the signed in person's own timezone, read through `getSettings()` and passed into `lib/time.ts` as a required argument. Never the server clock, never the browser, and no longer `APP_TIMEZONE`, which spec 0004 demoted to the suggestion the sign up form preselects.
- One month, one read. Every screen that totals a month takes it from `lib/month.ts`: the window, the spend filter, the row cap, and the completeness check, all in one place. Two screens totalling the same month from two definitions can drift apart and disagree with nothing to say which is right, so `tests/unit/month-window.test.ts` fails if a loader starts writing its own.
- Errors are explicit: return them and show them. Never fall back to a zero or a partial total; a wrong money figure shown confidently is worse than an honest error.
- A message only the browser needs does not travel through the server. A confirmation shown after a navigation is handed over in the browser (`components/transactions/confirmation.ts`), because a server carried one is consumed by whichever request arrives first and a write always produces more than one.
- Functions are pure by default, data is immutable, side effects sit at the edges. Prefer composition over classes; avoid `null` in favour of explicit `undefined` unions.
- Strict TypeScript, no `any`. Named exports only, except Next.js pages, layouts, and route handlers, which must stay default exports.
- Every table holding personal data has row level security on, keyed to the signed in user id. A table with no policy is a data leak, not a to do.
- Environment variables are declared and validated in `lib/env.ts` with Zod. Add new ones there; never read `process.env` directly.
- Layout is by layer: `app/`, `components/`, `lib/`, `actions/`, `migrations/`, `tests/`. Inside `components/`: `components/ui/` holds the shared primitives, `components/<feature>/` holds anything specific to one feature. Naming: `camelCase` functions and variables, `PascalCase` components and types, `snake_case` database columns.
- Every exported function carries a short comment saying what it does and why. UI meets WCAG AA: reachable by keyboard, correct to a screen reader.
- Design system: build all UI to `docs/design.md` (the visual language and the component contract); token values live in `app/globals.css`, never in a component. `docs/accessibility-pass.md` records what has and has not been checked by hand.
- Tailwind is v4, not v3.4. InsForge's docs say to use 3.4 and not upgrade; spec 0001 chose v4 and v4 is installed. The spec wins.

## Tooling

All installed: ESLint plus Prettier (`eslint-config-prettier` last in the flat config, so the two never fight) · a husky pre commit hook running lint and format on staged files, then a project wide typecheck · Vitest for logic in `tests/unit/`, Playwright for flows in `tests/e2e/` · an `@axe-core/playwright` accessibility check at WCAG 2.2 AA against the component gallery, which fails the run on a violation · a GitHub Actions check on every push and pull request.

Two things to know before you touch a config here. `npm run typecheck` runs `next typegen` first, because `LayoutProps` and friends are generated into `.next/types/` and a fresh clone has no `.next/`. And Prettier skips `docs/`, because reformatting those hand aligned tables buries the one line a skill actually changed.

## Git

- integration: on
- branch prefix: `feat/`
- commit: per-milestone
- messages: conventional commits (`feat:`, `fix:`, `chore:`)

## Agent skills

- [insforge](~/.agents/skills/insforge/): `InsForge`, app code with `@insforge/sdk`: database, auth, storage, and the Next.js SSR auth pattern
- [insforge-cli](~/.agents/skills/insforge-cli/): `InsForge`, migrations, RLS, secrets, branches, and everything else through the CLI
- [insforge-debug](~/.agents/skills/insforge-debug/): `InsForge`, diagnosing RLS denials, failed queries, and auth errors
- [zod-4](.agents/skills/zod-4/): `prowler-cloud/prowler`, Zod v4 schema patterns, including what moved since v3
- [nextjs-app-router-patterns](.agents/skills/nextjs-app-router-patterns/): `wshobson/agents`, App Router, Server Components, and data fetching
- [playwright-cli](.agents/skills/playwright-cli/): `microsoft/playwright-cli`, driving the browser and writing Playwright tests
- [playwright-best-practices](.agents/skills/playwright-best-practices/): `currents-dev/playwright-best-practices-skill`, tests that do not flake
- [vitest](.agents/skills/vitest/): `antfu/skills`, unit testing for money maths and month boundaries
- [arcjet](.agents/skills/arcjet/): `arcjet/skills`, rate limiting and bot protection, wired up at feature 5
- [accessibility](.agents/skills/accessibility/): `addyosmani/web-quality-skills`, WCAG patterns and the checks that catch a barrier early. Applies to every UI file.

Declined: Drizzle, Prisma, Better Auth, Clerk, Biome, pnpm, bun · `community-access/accessibility-agents@playwright-testing` · `nweii/agent-stuff@suggest-lucide-icons` · `hairyf/skills@tailwindcss` (it does not distinguish v3 from v4, and this project is on v4)

MCP servers: insforge (configured in `.mcp.json`, restart the session to load it), playwright (available), vercel (available), posthog (installed, not yet authorised)

## Context files

- [docs/owed-checks.md](docs/owed-checks.md): every verification step written down and not yet closed, grouped by what is blocking it.

<!-- Nested AGENTS.md files are listed here as they are created -->

- [components/ui/AGENTS.md](components/ui/AGENTS.md): the shared UI primitives, their server first rule, and the token and class name constraints that are easy to break.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- INSFORGE:START -->

## InsForge backend

This project uses [InsForge](https://insforge.dev): an all-in-one, open-source Postgres-based backend (BaaS) that gives this app a database, authentication, file storage, edge functions, realtime, an AI model gateway, and payments through one platform.

- **Project:** **finTrack** (API base `https://pjnvx97x.ap-southeast.insforge.app`)
- **Skills:** these InsForge skills are installed for supported coding agents. Reach for them before implementing any InsForge feature instead of guessing the API:
  - `insforge`: app code with the `@insforge/sdk` client (database CRUD, auth, storage, edge functions, realtime, AI, email, and Stripe payments).
  - `insforge-cli`: backend and infrastructure via the `insforge` CLI (projects, SQL, migrations, RLS policies, storage buckets, functions, secrets, payment setup, schedules, deploys).
  - `insforge-debug`: diagnosing failures (SDK/HTTP errors, RLS denials, auth and OAuth issues) and running security or performance audits.
  - `insforge-integrations`: wiring external auth providers (Clerk, Auth0, WorkOS, Better Auth, etc.) for JWT-based RLS, or the OKX x402 payment facilitator.
  - `find-skills`: discovering additional skills on demand.
- **Credentials:** app code reads keys from `.env.local`; the CLI reads `.insforge/project.json`. Never hardcode or commit keys.

Key patterns:

- Database inserts take an array: `insert([{ ... }])`.
- Reference users with `auth.users(id)`; use `auth.uid()` in RLS policies.
- For storage uploads, persist both the returned `url` and `key`.

<!-- INSFORGE:END -->
