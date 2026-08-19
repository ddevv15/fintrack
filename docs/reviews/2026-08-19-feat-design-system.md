# Review, feat/design-system, 2026-08-19

**Reviewed by**: Claude Sonnet 5 (author on Claude Opus 5 / Sonnet 5)
**Scope**: 40 files, branch vs `main` (merge base `e4f39bc`)
**Verdict**: Changes requested

## Summary

This lands the token-first design system from spec 0003: a `@theme` CSS layer with light/dark values for every color, sixteen server-rendered components over native HTML elements, the `/design` gallery gated behind `UI_GALLERY`, and a genuinely strong test story (contrast math in Vitest, axe + keyboard + reduced-motion + touch-target checks in Playwright). The component work is careful and largely matches the spec's invariants (exhaustive color maps, no interpolated classes, `Amount`/`DateDisplay` staying server-only, the single client boundary in `AppNav`). One real defect: the `UI_GALLERY` env var, as literally shipped in `.env.example`, crashes the entire app rather than defaulting to off, which contradicts the spec's own stated contract and undermines exactly the onboarding flow the file's header comment describes. A handful of minor issues round it out, several already known and tracked (the two console 404s from `AppNav`, the pre-existing `lib/money.ts` zero-decimal-currency bug), plus a couple not previously surfaced (an environment-coupled e2e assertion, a dev-mode-only e2e failure, an under-sized currency-symbol adornment).

## Major

### 🟠 `UI_GALLERY=` in `.env.local`, as `.env.example` ships it, crashes the whole app, not just the gallery, `lib/env.ts:27`, `.env.example:19`

**Problem**: `UI_GALLERY` is validated as `z.enum(["1", "0", "true", "false"]).optional()`. `.optional()` only accepts `undefined` — it does not accept an empty string. `.env.example` adds the line `UI_GALLERY=` (no value) as the template row, under the header "Copy this file to .env.local and fill it in." I verified with the project's own `@next/env` loader (the same one Next.js uses for `.env.local`) that a bare `KEY=` line parses to `process.env.UI_GALLERY === ""`, not `undefined`:

```
node -e "
const { loadEnvConfig } = require('./node_modules/@next/env/dist/index.js');
...
loadEnvConfig(tmpDir, false, ...);
console.log(JSON.stringify(process.env.UI_GALLERY)); // => \"\"
"
```

And confirmed separately that Zod's `z.enum([...]).optional()` rejects `""`:
```
schema.safeParse('')  // => { success: false, ... "Invalid option: expected one of ..." }
```

Since `env()` parses the whole schema in one `safeParse` call and caches nothing on failure, an invalid `UI_GALLERY` field fails validation for `NEXT_PUBLIC_INSFORGE_URL`, `APP_CURRENCY`, `APP_TIMEZONE` too — `env()` throws on every call, from every route, not only `/design`. I reproduced this directly against the app's own env loader; I did not need to touch the working `.env.local` in this repo (it happens to omit the `UI_GALLERY` line entirely, which is why the app works today).

**Why it matters**: the schema's own comment says "Unset means false, which is what production runs," and AC-17 says the same. A blank value from the literal, documented setup path (`cp .env.example .env.local`) is not the same as unset to Zod, so the file that exists specifically to make setup foolproof contains a value that breaks setup. This also matters in a real Vercel deployment: adding the `UI_GALLERY` key in the dashboard with an empty value (which the UI allows) reproduces the same crash in production, not just locally.

**Suggested fix**: either strip a blank string before validation (e.g. `z.string().optional().transform(v => v === "" ? undefined : v)` piped into the enum check), or drop `.env.example`'s `UI_GALLERY=` line entirely (comment-only, no `KEY=`) so copying the file can never produce this state. The second is cheaper and matches how the file already documents `APP_TIMEZONE`/`APP_CURRENCY` (real example values, not blank keys).

## Minor

### 🟡 e2e assertions hardcode `$`-formatted text without pinning `APP_CURRENCY`, `tests/e2e/design-system.spec.ts:113`, `:169`

**Problem**: "income carries a sign, not only a colour (AC-11)" and "an amount never truncates (AC-13)" assert literal strings like `"+$42.50"` and `"$12.50"`, but `Amount`/`AmountInput` format through `formatCents()`/`currencySymbol()`, which read `APP_CURRENCY` from the environment. CI pins `APP_CURRENCY: USD` at the workflow level, so these pass there, but I ran the suite locally against this repo's own `.env.local` (which sets a non-USD currency) and both tests failed for exactly this reason — not a rendering bug, a currency mismatch. `npm run test:e2e` is the command `AGENTS.md` documents for local use, and `playwright.config.ts`'s `webServer` block does not pin `APP_CURRENCY`.

**Why it matters**: a developer running the documented command with their own `.env.local` gets two failures that look like product bugs and are not, which erodes trust in the suite exactly the way `docs/design.md`'s "the CSS is right" philosophy is trying to avoid for tokens.

**Suggested fix**: set `APP_CURRENCY: "USD"` in `playwright.config.ts`'s `webServer.env`, alongside the existing `UI_GALLERY` override, so the gallery's currency is deterministic regardless of the developer's own `.env.local`.

### 🟡 The 44×44 target-size test only passes under a production build, `tests/e2e/design-system.spec.ts:187`

**Problem**: "every interactive target clears 44 by 44 (AC-14)" scans `a:visible, button:visible, select:visible, input:visible`. Run against `npm run dev` (the default `webServer.command` when `CI` is unset, i.e. any local `npm run test:e2e`), it fails on `"Open Next.js Dev Tools (32x32)"` — Next 16's built-in dev-mode indicator button, which is not part of the shipped app. I reproduced this directly: the test fails under plain `UI_GALLERY=1 npx playwright test`, and passes once `CI=1` forces the config's `npm run build && npm run start` path.

**Why it matters**: same class of problem as the currency one above — the documented local command produces a failure unrelated to anything in this PR, on a machine that has done nothing wrong.

**Suggested fix**: filter out `[data-nextjs-dev-tools-button]` (or the framework's dev-indicator container) from the target scan, or scope the selector to `main` / a `data-testid` boundary that excludes framework chrome.

### 🟡 `AppNav`'s default nav items point at routes that do not exist yet, producing console 404s, `components/ui/AppNav.tsx:1`, `components/ui/AppShell.tsx:16`

**Problem**: `AppShell`'s default `navItems` (and the gallery's override) include `/transactions` and `/breakdown`. I confirmed both return a real `404` from the dev server. `next/link` prefetches viewport-visible links by default, so these two produce console-visible failed requests on every load of `/design`. This is already called out as **open** in `docs/specs/0003-design-system-ui-foundation/verify.md:17`, so it's known, not new — flagging it here because it is the *default* `navItems` in `AppShell`, not just a gallery artifact, so it will still be there the moment a real route mounts `AppShell` before features 7/8 exist.

**Why it matters**: noisy, expected-but-unresolved console errors make a genuine regression harder to spot later, and AC-9's manual check row explicitly asks for "no console error."

**Suggested fix**: none required for this PR specifically (tracked already), but consider `prefetch={false}` on tabs whose target route doesn't exist yet, removable once features 7/8 land.

### 🟡 `AmountInput`'s adornment padding assumes a ~2 character glyph; `currencySymbol()` can return more, `components/ui/AmountInput.tsx:51`, `lib/money.ts:59`

**Problem**: the input reserves `calc(--spacing(3) + 2ch)` of left padding for the currency adornment. `currencySymbol()` falls back to the ISO code (or Intl's longer display form) when a locale has no distinct glyph — verified directly: `Intl.NumberFormat("en-US", {style:"currency", currency:"KWD"}).formatToParts(0)` yields `"KWD"` (3 chars), and `"XPF"` yields `"CFPF"` (4 chars). `tests/unit/money.test.ts` explicitly exercises `KWD` and `XPF` in `currencySymbol`'s own test, so this is a known-reachable case for the function, just not for the component that consumes it.

**Why it matters**: low risk today since `APP_CURRENCY` is fixed to `USD` for this single-user app, but `currencySymbol()` is written as a general-purpose function and `AmountInput` is a shared component; a future currency change would produce visibly overlapping text with no test catching it (the e2e suite never sets a non-glyph currency).

**Suggested fix**: either size the padding off the actual rendered symbol length (e.g. `ch` count derived from `symbol.length`), or accept the constraint explicitly in a comment near `AmountInput` the way other trade-offs in this PR are documented.

### 🟡 `formatCents()` divides by 100 regardless of a currency's real minor-unit count; this PR's own tests and `verify.md` normalize the result rather than flag it, `lib/money.ts:36`, `tests/unit/money.test.ts:39`, `docs/specs/0003-design-system-ui-foundation/verify.md:29`

**Problem**: not introduced by this diff — `formatCents` is unchanged here, only `currencySymbol` was added alongside it — so this is a `lib/money.ts` / spec 0001 defect, not a spec 0003 one. Flagging because this PR's own additions document the wrong behavior as correct: `tests/unit/money.test.ts:39` asserts `formatCents(1250, "JPY", "en-US") === "¥13"`, and `verify.md:29` records "amounts show no decimal places, since Intl knows JPY has none, and nothing in a component rounds" as a passing check. Both are true statements about *how* it renders, but neither checks that the *magnitude* is right. If `1250` were meant to represent ¥1,250 (the natural reading of "cents" for a currency whose smallest unit is 1 yen), the correct render is `¥1,250`, not `¥13` — the code silently divides by 100 a second time on top of Intl's own zero-decimal formatting.

**Why it matters**: `AGENTS.md` rule 3 — "a wrong money figure shown confidently is worse than an honest error" — is exactly what this produces for any zero-decimal currency, and it would sail through `/check verify` again next time, since the verify step's own JPY row doesn't check the number.

**Suggested fix**: out of scope for this PR (belongs to `lib/money.ts` / spec 0001). Worth a follow-up: either document `APP_CURRENCY` as "must have a minor unit of exactly 100" as a stated constraint, or make `formatCents`/`currencySymbol` handle zero-decimal currencies correctly.

## Nits

- ⚪ `app/error.tsx:16`, the default export is internally named `GlobalError`, but this file is the route-level `error.tsx`, not `global-error.tsx` — the name invites confusion with the different root-level boundary Next.js also supports.
- ⚪ `components/ui/Skeleton.tsx:33`, `role="status"` already implies `aria-live="polite"` per the ARIA spec; both are set explicitly. Harmless, just redundant.
- ⚪ `docs/scope/scope.md:66` / `docs/specs/0003.../index.md:190`, build-plan step 5 is checked off as "Wire `AppShell` into a signed in route group," but no route group exists yet in this diff — only the gallery consumes `AppShell`. Matches the spec's own follow-up note that feature 5 owns this, but the checkbox slightly overstates what landed.
- ⚪ `AGENTS.md` still describes `components/` as flat and doesn't list `lucide-react`/`clsx`/`tailwind-merge`/`@axe-core/playwright` or the `accessibility` skill; the spec's own Follow-up list already flags this for `/sync`, so not a defect in this PR, just noting it's still open.

## Strengths

- `tests/unit/tokens.test.ts` re-derives real WCAG contrast ratios from the OKLCH values in `app/globals.css` on every run — a design-token regression fails the build instead of waiting for someone to notice a chip looks off. Unusually rigorous for this kind of PR.
- The exhaustive `Record<CategoryColor, string>` pattern (`CategoryChip`) is not just asserted by convention — `tests/e2e/design-system.spec.ts:128` reads computed `background-color` in a production build, which is the one place an interpolated Tailwind class would actually fail silently. Good instinct to test the failure mode, not just the happy path.
- `ListRow`'s "wrap rather than crush" layout for AC-13, with the comment explaining why `min-w-20` is tuned rather than arbitrary, is a genuinely well-reasoned solution to a real constraint (320px, chip + amount + two actions).
- `docs/accessibility-pass.md` is honest about what's actually been verified (automated tooling, accessibility tree) versus what's still owed (a real screen reader), rather than blurring the two — matches the project's stated preference for an honest gap over a confident gloss.
- Every reviewed component stayed within its stated contract: `Amount`/`DateDisplay` never format independently of `lib/money.ts`/`lib/time.ts`, `AppNav` remains the only client component, and no hex/`rgb()` values or interpolated Tailwind classes were found anywhere in `components/` or `app/`.

## Test coverage

Strong for what's testable by machine: unit tests lock `formatCents`, `currencySymbol`, `formatPlainDate`, and the token contrast/distinctness contract with real arithmetic, not snapshots. e2e covers axe (both themes, both gallery routes), keyboard order, focus-ring visibility, reduced motion, 320px truncation, and touch targets. Gaps found during review: two e2e assertions are coupled to an unpinned `APP_CURRENCY` and the local (non-CI) `webServer` command in ways that make `npm run test:e2e` non-portable across developer machines, even though CI itself is unaffected — see the two Minor findings above. AC-8 (the human screen-reader pass) is honestly tracked as not-yet-done in `docs/accessibility-pass.md` and `docs/scope/scope.md`, which is correct and not a finding.
