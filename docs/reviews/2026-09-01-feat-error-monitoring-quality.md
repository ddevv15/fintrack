# Review, feat/error-monitoring, 2026-09-01

**Reviewed by**: Claude (Opus 5), against the `thermo-nuclear-code-quality-review` standard
**Scope**: 27 files (excl. `package-lock.json`), branch vs `main`, 10 commits, ~1,984 insertions
**Verdict**: Changes requested, both since fixed

A maintainability pass rather than a correctness one. The
[31 August review](2026-08-31-feat-error-monitoring.md) covered behaviour and found three
majors; this one asked a different question, which is whether the invariants the code states
about itself are actually enforced by anything.

## Summary

The design holds up. Building a report from an allow list rather than filtering one is the
right architecture and `lib/monitoring.ts` argues for it correctly. `ErrorScreen` is a proper
extraction of the one thing two boundaries must agree on. Splitting `lib/env.ts` into
`publicEnvSchema` and an `envSchema` that extends it adds the browser-safe subset with no
duplication. No file is near 1,000 lines, the largest touched being `lib/export.ts` at 479.
The diffs into existing read paths are 1:1 substitutions that leave those files tidier than
they were: no new branching, no special cases threaded through unrelated flows.

Both findings were about contracts, and both were the same shape. The module's own thesis is
that a privacy failure is silent, unlike every other failure in the feature. Two of its
guarantees were themselves being held up by nothing that would make a noise if they broke.

## 1. The `dataCollection` block was unchecked by the compiler

`monitoringOptions()` had no declared return type. `Sentry.init()` takes a variable rather
than a fresh object literal, so TypeScript's excess-property check never ran. Verified by
injecting `thisOptionDoesNotExistAtAll: true` into the returned object: `tsc --noEmit`
exited 0 with zero errors.

Every key was in fact correct, checked one by one against `DataCollection` in the installed
SDK, including that `CollectBehavior` is `boolean | {allow} | {deny}` so each `false` is
valid. It was correct by careful authorship, and nothing kept it correct. A key renamed in
an SDK upgrade would have started collecting again in silence, which is the precise failure
the module's opening paragraph exists to prevent.

**Fixed** by annotating the return type as `BrowserOptions | undefined`. That is the type
that accepts the whole object; `NodeOptions` rejects `replaysSessionSampleRate` and
`replaysOnErrorSampleRate`, and `Options` is declared but not exported from
`@sentry/nextjs`. Re-running the same injection now fails to compile:

```
error TS2353: Object literal may only specify known properties,
and 'stackFrameVariablesTYPO' does not exist in type 'BrowserOptions'.
```

That `NodeOptions` rejection was worth keeping: it means the two replay settings are browser
only and inert on the server, which the comment above them did not say. It says so now.

## 2. `fault()`'s logging contract lived in a docstring

`fault()` deliberately destroys the driver payload, which is the point of it. The payload's
only other home was a `console.error` the caller was expected to write first, stated in the
docstring and enforced by nothing. Six call sites, all compliant; three of them in
`lib/categories.ts` byte-identical. A seventh that forgot would have destroyed the only copy
of the diagnosis with no test, no type, and no lint rule noticing, because the person would
still have seen honest prose and the cause would simply have ceased to exist.

**Fixed** by moving the log inside: `fault(what, cause)` writes `[read] <what> failed` with
the payload and then returns the error. Six two-line pairs became six one-line calls, the
three duplicated literals are gone, and the invariant is now unforgeable, because there is
no way to construct a fault without the payload reaching the log. The signature change
forced every existing site to be updated, so no site could migrate silently.

The cost is that `fault()` is no longer pure, and `lib/errors.ts` made a point of importing
nothing. The module docstring now records that trade: `refusal()` and `refusalKindOf()` stay
pure, `fault()` has one deliberate side effect, and the purity that matters, in the
`lib/month.ts` and `lib/export.ts` read paths, is untouched. The invariant is also now
testable, which it was not before, because it lived at the call sites rather than in the
function. `tests/unit/errors.test.ts` asserts it.

## Left open

- **`identifyForMonitoring()` inside `currentUser()`** (`lib/auth.ts`). Feature logic in a
  shared auth path: a read function now carries a monitoring side effect on every call, and
  a reader of an auth function has no reason to expect an SDK call there. The docstring's
  justification is fair, since it genuinely is the one place that knows who is signed in and
  `onRequestError` has a request rather than a session. `proxy.ts` already resolves the
  session before every request and may be the more canonical home. Raised as a question, not
  a regression, and not changed: the alternative may be worse for reasons the spec knows.
- **`keepFrame()` keeps `abs_path`**, which carried a local home directory and username in
  every frame of the reports generated on 2026-09-01. Not money data and not covered by any
  acceptance criterion, and `filename` already carries what makes a trace readable. Worth a
  decision rather than a silent change to what a report contains.
- **`buildReport()` builds then mutates a local.** Pure with respect to its input, so this is
  style only, but the file already uses conditional spreads for `mechanism` and `stacktrace`
  and `AGENTS.md` asks for immutable data. Not worth churning a privacy-critical function for
  no behavioural gain.

## After

`npm run typecheck`, `npm run lint` clean. `npm run test` 325 across 22 files, one more than
before: the new one asserts the payload reaches the log. Both grep-count steps in
[verify.md](../specs/0011-error-monitoring/verify.md) still hold, 2 and 4 refusals and 0 and
0 bare throws.
