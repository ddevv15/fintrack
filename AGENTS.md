# FinTrack

A personal money tracker for one person: log a spend, put it in a category, see where the month went.

## Stack

- **Language / Runtime**: TypeScript (strict), Node 22
- **Framework**: Next.js 16 App Router, React 19, server first
- **Backend**: InsForge (Postgres, Auth, Storage) through `@insforge/sdk`. No ORM; schema is plain SQL in `migrations/`
- **Key dependencies**: Tailwind v4, Zod v4, date-fns
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

- Money is integer cents everywhere. `lib/money.ts` is the only module that converts an amount for display; nothing else multiplies or divides one.
- What today is, and where a month starts and ends, comes from `APP_TIMEZONE` on the server via `lib/time.ts`. Never the server clock, never the browser.
- Errors are explicit: return them and show them. Never fall back to a zero or a partial total; a wrong money figure shown confidently is worse than an honest error.
- Functions are pure by default, data is immutable, side effects sit at the edges. Prefer composition over classes; avoid `null` in favour of explicit `undefined` unions.
- Strict TypeScript, no `any`. Named exports only, except Next.js pages, layouts, and route handlers, which must stay default exports.
- Every table holding personal data has row level security on, keyed to the signed in user id. A table with no policy is a data leak, not a to do.
- Environment variables are declared and validated in `lib/env.ts` with Zod. Add new ones there; never read `process.env` directly.
- Layout is by layer: `app/`, `components/`, `lib/`, `actions/`, `migrations/`, `tests/`. Naming: `camelCase` functions and variables, `PascalCase` components and types, `snake_case` database columns.
- Every exported function carries a short comment saying what it does and why. UI meets WCAG AA: reachable by keyboard, correct to a screen reader.
- Tailwind is v4, not v3.4. InsForge's docs say to use 3.4 and not upgrade; spec 0001 chose v4 and v4 is installed. The spec wins.

## Tooling

All installed: ESLint plus Prettier (`eslint-config-prettier` last in the flat config, so the two never fight) · a husky pre commit hook running lint and format on staged files, then a project wide typecheck · Vitest for logic in `tests/unit/`, Playwright for flows in `tests/e2e/` · a GitHub Actions check on every push and pull request.

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

Declined: Drizzle, Prisma, Better Auth, Clerk, Biome, pnpm, bun

MCP servers: insforge (configured in `.mcp.json`, restart the session to load it), playwright (available), vercel (available), posthog (installed, not yet authorised)

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
