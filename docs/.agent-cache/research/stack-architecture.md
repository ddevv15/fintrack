# Landscape check: stack & architecture
Run: 2026-08-19 · for docs/specs/0001 · reuse until 2026-09-18

Fixed by the engineer before the check: TypeScript everywhere, responsive web,
managed platform plus managed database.

## Framework layer
- Next.js: incumbent. v16 defaults to Turbopack. RSC, Partial Prerendering,
  Server Actions. Deepest ecosystem and docs. Strongest metadata/structured
  data story, which Release 6 needs.
- TanStack Start: React framework on TanStack Router + Vite + Nitro. Best end to
  end type safety of any React router in 2026. Smaller ecosystem.
- React Router v7: absorbed Remix. Simplest loader/action model, web standards
  familiar.

## Data layer
- Drizzle: SQL first, schema in TypeScript. CONFIRMED from official docs:
  Postgres `numeric` returns a STRING by default, preserving exactness.
  `mode: 'number'` opts into lossy JS numbers; `mode: 'bigint'` for large ints.
  JS number is exact for integers only below 2^53.
- Prisma: managed ORM, own schema language, generated client.

## Auth layer
- Better Auth: TypeScript native, users live in your own Postgres, no vendor
  lock in. Launched 2024, reached v1.6 May 2026. 2FA, passkeys, RBAC.
- Clerk: hosted, drop in UI. Free to 10k monthly active users, then $0.02/MAU.
  User data lives in Clerk infrastructure.
- Auth.js (NextAuth): most established, now largely legacy for new builds.

## Database host
- Neon: serverless Postgres, scale to zero after an idle timeout as short as
  5 min, resume typically under 500ms. Free tier ~0.5 GB/project, 100 compute
  hours/month. Paid from $19/mo. Vercel Postgres is Neon.
- Supabase: Postgres plus auth, realtime, storage, edge functions. Free tier
  pauses inactive projects after about a week. Paid from $25/mo.

## Sources
- https://makerkit.dev/blog/tutorials/tanstack-start-vs-nextjs
- https://kanopylabs.com/blog/react-router-v7-vs-tanstack-start-vs-nextjs
- https://orm.drizzle.team/docs/column-types/pg  (numeric as string, verified)
- https://makerkit.dev/blog/tutorials/drizzle-vs-prisma
- https://makerkit.dev/blog/tutorials/better-auth-vs-clerk
- https://supastarter.dev/blog/better-auth-vs-nextauth-vs-clerk
- https://designrevision.com/blog/supabase-vs-neon
- https://www.bytebase.com/blog/neon-vs-supabase/
