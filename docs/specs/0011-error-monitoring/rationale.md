# Rationale: Error monitoring · spec 0011

The reasoning behind [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: the feature was scoped as "strip money amounts and personal detail", which describes a deny list, meaning a set of things removed on the way out. A deny list is the wrong construction for this particular job. It is correct only about the things you thought of, and the thing it is filtering is a third party library whose collected fields change between versions. The day the reporting SDK starts attaching a new piece of request context, a deny list keeps working, keeps reporting success, and starts leaking. The right framing is an allow list: build each outgoing report from scratch out of fields you named, and let everything else fail to travel by default. Same intent, opposite default, and only one of the two is safe when something upstream changes underneath you. The spec is written to the allow list framing.
>
> A second, smaller premise correction. The scope row reads as though the danger is data being attached to a report. In this app the sharper risk is the error message itself, because these messages are deliberately written as readable prose and are the entire value of a report. They cannot be stripped without making monitoring pointless. Today they are safe, carrying row counts and read names rather than amounts, and that is a property of how the messages happen to be written rather than anything enforced. It is recorded as an invariant and a follow up, not left implicit.

FinTrack has shipped eleven features and has no way to tell its owner that any of them broke. Every failure path in the app is currently a private event between the code and whoever happens to be looking at the screen. If a Server Action throws while saving a spend, the entry is lost and nothing records that it happened. If a route fails on a Tuesday and nobody opens the app until Friday, there is nothing to find on Friday.

That gap is unusually costly here because of how much this project has invested in failing loudly. Three specs built machinery whose entire job is to refuse rather than to guess: `assertCompleteMonthRead()` will not show a month total it cannot prove whole, and spec 0010 extended the same comparison to the export, which will not hand over a backup it cannot prove complete. Rule 3 of `AGENTS.md` states the principle plainly, that a wrong money figure shown confidently is worse than an honest error. All of that machinery is a detector. None of it is wired to anything. A guard that refuses correctly and tells nobody has done half its job, and the half it skipped is the half that would have let somebody fix the cause.

The forces are narrow and worth naming, because they rule out most of the industry's usual answers. There is exactly one user, who is also the developer, the operator, and the person whose money is in the database. There is no on call rotation, no escalation policy, and nobody to page. The app is used in bursts, sometimes months apart, which is precisely the usage pattern that makes a dashboard useless: a dashboard is checked by people with a habit of checking it, and this app does not generate one. Against that, whatever is chosen has to be operable by one person maintaining this alone in spare time, which rules out anything self hosted.

Cutting across all of it is a constraint that is unusual in its direction. The data at risk is not customer data being protected from the company. It is the owner's own spending being protected from a vendor the owner is choosing to introduce. Nothing external enforces this. No regulator applies, no auditor will check, and no user will complain. The scope row sets the bar voluntarily, which means the only thing that will ever hold the line is how the code is built.

The consequence of not deciding is that this stays exactly as it is. The app keeps failing silently, the guards keep refusing into a void, and the first time it matters will be the day an entry goes missing and there is no record of when, why, or how many others went with it.

## Options considered

### Option 1: Sentry, with an allow list report builder

Install Sentry's Next.js SDK across server and browser, gate it to production and preview, and pass every outgoing event through a builder that constructs the report from named fields rather than filtering an existing one.

**Pros**:

- It is the specialist. Error grouping, issue state, release association, and email on first occurrence are the product rather than a feature bolted onto something else.
- Its Next.js integration covers exactly the surfaces this app has: Server Components, Server Actions, route handlers, and the browser, from one install.
- Source map upload is a solved, documented part of the same package, which is what makes a browser stack trace readable rather than a list of positions in a minified bundle.
- The outgoing hook it exposes is a genuine interception point, so the allow list can be enforced in one place rather than sprinkled across call sites.

**Cons**:

- A second vendor, a second dashboard, and a second account to keep alive, which is precisely what spec 0001 was trying to avoid when it consolidated onto InsForge.
- Its defaults are generous about request context, so it is a tool that must be actively constrained rather than one that is safe out of the box. The allow list exists because of this.
- Source maps mean a build step and a credential, and a credential that expires degrades quietly rather than loudly.

### Option 2: PostHog

The option spec 0001 pencilled in. A product analytics platform that also does error tracking, already integrated with InsForge.

**Pros**:

- The consolidation argument is real and was made deliberately in spec 0001: one platform covering observability, with an existing integration path from the backend already in use.
- If product analytics is ever wanted, this is one vendor instead of two, and the marginal cost of error tracking is then nearly zero.
- Its MCP server is already installed in this project, needing only authorisation.

**Cons**:

- Error tracking is the newer, smaller part of the product rather than its centre, and it shows most in the parts that matter here: grouping quality and stack trace fidelity.
- The whole platform is built around capturing behavioural detail, which sits in permanent tension with a requirement that almost nothing be captured. Choosing a data hungry tool and then starving it is a poor fit even when it is achievable.
- Session replay is a headline feature and would be actively dangerous here, since the screens it would record are covered in amounts. A capability that must never be switched on is a liability sitting in the account.

### Option 3: Vercel runtime logs and observability

Use what the hosting platform already collects. No new vendor, no new account, no new credential.

**Pros**:

- Genuinely zero marginal cost, already paid for, already running, and already capturing every server side failure with no code at all.
- No new privacy surface whatsoever, because the data does not move anywhere it is not already going.
- Nothing to maintain, nothing to rotate, nothing that can expire.

**Cons**:

- It fails the scope row's actual bar. Logs do not push, and "somewhere you will actually see it" is the requirement. This is the dashboard nobody opens, in its purest form.
- Retention is short on lower plans, which is fatal for an app used in bursts months apart. The failure you most need to investigate is the one from six weeks ago.
- Grouping is weak, so a recurring problem reads as many separate lines rather than one issue with a count, and there is no notion of an issue being new.
- It sees the server and not the browser, and the log form is a client boundary.

### Option 4: Structured logs only, no service

Write errors in a consistent readable shape and rely on reading them.

**Pros**:

- The honest minimum. No dependency, no vendor, no credential, and no privacy surface at all.
- It would improve the code regardless, since a consistent error shape is worth having whatever is done with it.

**Cons**:

- It does not implement the feature. Nothing reaches anybody, and the scope row's success condition is explicitly that something does.
- It substitutes discipline for machinery, and the discipline in question is remembering to read logs for an app you open every few months.

## Rationale

Sentry wins on the one force that most distinguishes this app from a normal one: the deliberate refusals. Reporting those well is not a generic error tracking job. It needs an issue to be a stable, grouped thing that can be new once and recurring afterwards, so that a guard firing repeatedly is one thing you are told about rather than fifty. It needs a tag that survives grouping, so a refusal and a crash do not merge into an indistinguishable list. And it needs the first occurrence to be the trigger, because the alternative is either silence or a flood. Those are Sentry's core mechanics rather than features at its edges, and they are exactly the parts of PostHog's error tracking that are least mature.

The consolidation argument from spec 0001 is the strongest case against, and it deserves more than a dismissal, because 0001 made it deliberately and made it well. Two things weaken it here. The first is that 0001 never actually weighed PostHog against anything: the name appears in the stack table with a one line justification and never once in that spec's own rationale, and the row explicitly deferred the decision to this feature. It was a direction, not a conclusion, which is precisely why it was deferred. The second is that consolidation buys the most when the second tool is used often and casually. Error monitoring is the opposite: it is configured once, then ideally ignored for months. The ongoing cost of a second dashboard is close to zero for a tool you hope never to open, so the thing consolidation is protecting against barely applies.

The allow list is the part of this decision that is genuinely load bearing, and it comes from the shape of the risk rather than from caution. Every other constraint in this spec is enforced by something: a wrong environment gate shows up immediately, a broken DSN shows up as missing reports, a bad source map shows up as an unreadable trace. A privacy leak is the one failure here with no feedback loop at all. It produces no error, no alert, and no symptom. It would sit in a vendor's database indefinitely, and the owner would have no way to discover it short of reading their own reports field by field. When a failure is both silent and irreversible, the construction has to be the one that is safe by default rather than the one that is correct when you remember everything, which is why the report is rebuilt rather than filtered.

Fail open follows the precedent already set rather than a fresh judgement. `lib/attempt-limit.ts` was built so that a missing `ARCJET_KEY` means no rate limiting and a warning, never a refused sign in, and its own comment states the rule: an error deciding is not a reason to refuse. Monitoring has strictly less claim to break the app than security does. If Arcjet is allowed to fail open, Sentry certainly is, and matching the existing shape means one pattern to understand instead of two.

The choice to report the deliberate refusals at all is worth defending, since it is the least conventional part of this. Conventional practice reports crashes, on the reasoning that anything the code handled on purpose is by definition not a problem. That reasoning inverts here. A completeness guard firing means the database returned a set that disagreed with its own count, which is either a bug in the app or something genuinely wrong with the data. It is handled, in the sense that the app refuses rather than showing a wrong figure, and it is absolutely not fine. The most important thing this app can tell its owner is that it could not prove a money figure, and treating that as unremarkable because it was caught would waste the entire investment in catching it.
