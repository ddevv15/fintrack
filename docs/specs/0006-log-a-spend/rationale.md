# 0006 rationale · Log a spend

The reasoning behind [index.md](index.md). The build spec is there; this is the record of why it says what it says.

## Context

> ⚠️ Premise note: this feature ships before feature 7, this month's transactions, so for as long as that gap lasts there is no way to see or correct a logged spend from inside the app. The scope's own wording, that a mistake is caught before saving rather than after, is therefore not a nicety here. It is the only protection there is, because there is no after. That raises the value of refusing a doubtful amount and of naming the stored amount back to you, and it lowers the value of anything that trades correctness for speed. The right fix is still to ship feature 7 promptly rather than to overbuild this screen, which is why an edit path is a follow up item and not part of this spec.

Three separate places in this repository defer the same decision to this feature. `lib/money.ts` says that rounding a typed amount is a product choice, round, truncate, or refuse, and that it belongs with feature 6. `components/ui/AmountInput.tsx` says it captures text and parses nothing for the same reason. [Spec 0002](../0002-data-model/index.md) says turning what you type into cents belongs to feature 6. Three authors each declined to settle it in passing, which is a fair signal that it is not a detail.

What makes it load bearing is that the result is invisible. A form that silently turns `12.567` into `1257` looks identical to one that turns it into `1256`, and identical again to one that refuses. The difference shows up as a month total that is slightly wrong in a way nobody can trace, in an app whose entire promise is that its numbers are right.

The currency exponent makes the problem wider than it first appears. [Spec 0004b](../0004-sign-in-and-your-account/0004-money-units-and-locale.md) established that an amount is a whole number of minor units, and that how many minor units make one major unit is a fact about the currency, held in `lib/currency.ts`. The supported list deliberately includes two currencies with no minor unit at all, yen and won, and one with three, the Kuwaiti dinar. So the parse cannot be written against two decimal places. `500.5` is a meaningless yen amount and `1.005` is a perfectly ordinary dinar one, and a single rule has to get both right.

There is also a trap sitting underneath all of this that has nothing to do with product choice. JavaScript numbers are binary floating point, so the obvious implementation is quietly wrong. The evidence is below, and it constrains the options more than any preference does.

## The floating point evidence

The natural implementation is to parse the text as a number and multiply by ten to the power of the currency's decimals. Run against the first 2000 cent values on a two decimal currency, that expression fails to produce an integer 271 times:

```
0.07 -> 7.000000000000001
0.14 -> 14.000000000000002
0.28 -> 28.000000000000004
0.29 -> 28.999999999999996
0.55 -> 55.00000000000001
0.56 -> 56.00000000000001
```

`8.29 * 100` is `828.9999999999999`. Not close to wrong, actually wrong, and `8.29` is an utterly ordinary price.

Wrapping the multiplication in a rounding call papers over most of these, and that is what most codebases do. It has two problems. The first is that it does not always work: `1.005 * 1000` is `100.49999999999999`, which rounds to `1004` on a three decimal currency where a person typing `1.005` means `1005`. The second is worse for this project specifically. Once you round, you can no longer tell whether the extra precision came from the person or from the float, so you cannot implement a rule that refuses extra decimal places at all. Rounding is not just one option among three; choosing the multiplication forecloses the other two.

Splitting the string has none of this. `8.29` becomes `8` and `29`, the fraction is checked and padded against the currency's decimals, and `829` is read back as an integer. It is exact by construction because no arithmetic happens.

## Options considered

### Option 1: Parse as a number, multiply by the power of ten, round half up

The conventional approach, and what most money forms on the web do. Read the field with `Number()`, multiply by `10 ** decimals`, round, store.

**Pros**:
- Two lines of code, immediately readable, and familiar to every reviewer.
- Never blocks the person. Anything vaguely numeric produces an amount.
- Forgiving of pasted input with stray precision.

**Cons**:
- Demonstrably inexact: 271 failures in the first 2000 cent values, and a wrong result at `1.005` on a three decimal currency even with rounding applied.
- The rounding is silent, so the stored amount can differ from the typed one with no signal, which is exactly what rule 3 of `AGENTS.md` exists to prevent.
- It multiplies an amount outside any consideration of rule 1, and it makes the refuse and truncate options impossible to build later.

### Option 2: String only parse, refusing anything it cannot represent exactly (chosen)

Split on the single dot, validate the shape, compare the fraction length against the currency's decimals, pad or refuse, join the digits, read as an integer. Return a result the caller turns into a field error.

**Pros**:
- Exact by construction. There is no arithmetic to be imprecise.
- Correct for zero, two, and three decimal currencies from one rule, because the decimal count is an input rather than a constant.
- The person always knows what happened. Nothing is changed behind their back.
- Trivial to test exhaustively, since it is a pure function over strings.

**Cons**:
- Stricter than people expect. Pasting `1,234.50` from a bank statement is refused, and that will feel pedantic the first time it happens.
- More code and more tests than a multiplication, and it looks like overengineering to anyone who has not seen the evidence above.
- Puts the burden of a correct message on the form, since a refusal is only acceptable if it explains itself well.

### Option 3: String only parse, but round or truncate the excess digits

The same exact string handling, but instead of refusing extra decimals, drop or round them.

**Pros**:
- Keeps the exactness of option 2 while staying forgiving like option 1.
- Never blocks anyone, so the fastest screen in the app stays fast.

**Cons**:
- Still silently stores a number the person did not type, which is the actual objection to option 1 rather than the float being the objection.
- Truncating loses money on every entry it touches, and rounding half up gains it. Neither is what somebody typing three decimals into a dollar field intends.
- Leaves the question of what a person typing `500.5` into a yen field meant, and answers it by guessing.

### Option 4: A decimal arithmetic library

Bring in a money or decimal library and let it own the conversion.

**Pros**:
- Battle tested, and it handles a much larger surface than this app needs, including arithmetic across currencies.
- Removes the temptation for a future contributor to reintroduce a multiplication.

**Cons**:
- A dependency, its updates, and its own opinions about representation, for a problem that is about twenty lines of string handling here.
- It would have to be taught this project's rule that the decimal count comes from `lib/currency.ts` and not from its own tables, or the two sources drift, which is the exact failure spec 0004b already guards against with `Intl`.
- Most such libraries expose arithmetic this project has deliberately kept out of every module except one, so it widens the surface rule 1 narrows.

## Rationale

Option 2 is chosen because the evidence removes options 1 and 3 from serious contention on different grounds, and option 4 solves a bigger problem than this app has.

Option 1 fails on correctness, not taste. A project whose first stated rule is that money is integer minor units everywhere, and whose third is that a wrong money figure shown confidently is worse than an honest error, cannot adopt a conversion that is measurably wrong 271 times in the first 2000 values. That it is the common approach does not help; the common approach is written for codebases that have not made this promise.

Between refusing and rounding, the choice is genuinely a product one, and it goes to refusing because of what this specific app is for and when this feature ships. FinTrack exists so its numbers are the real numbers. The breakdown already refuses to show percentage shares that do not add to a hundred, and already renders a real but tiny share as `<1%` rather than rounding it to zero, because the smaller lie was still a lie. Rounding a typed amount is the same class of decision and deserves the same answer. The premise note above sharpens it further: with no correction path until feature 7, a silently altered amount is not merely undetected, it is uncorrectable.

The cost is real and worth naming plainly. Refusing is stricter than most money forms, and someone will paste an amount with a thousands separator and be stopped. The accepted input rule is therefore deliberately narrow and deliberately explainable in one sentence, digits with at most one dot, because a rule you can state in a sentence is a rule the error message can teach in a sentence. Accepting thousands separators was considered and rejected for a specific reason rather than a stylistic one: accepting `1,234.50` and accepting `12,50` as twelve and a half cannot both be true, so taking the separator now would permanently rule out comma decimal entry for anyone who types that way. Refusing both keeps the door open, and feature 10 or a later locale pass can decide it with more information than exists today.

Option 4 was set aside on operational grounds rather than technical ones. A dependency has to be learned, updated, and constrained to this project's single source for decimal counts. The parse here is a pure function over strings with a small, exhaustively testable surface, and keeping it inside `lib/money.ts` keeps the rule that one module owns every money conversion literally true, which is easier to enforce in review than a rule with an exception.

On the rest of the screen, the reasoning is shorter because the constraints do most of the work. Validation lives on the server because every existing form in the project already works that way, because the server is the only place the rules can be trusted, and because a browser copy of the money parse would be a second implementation of the one thing that must never have two implementations. Native controls are used throughout because spec 0003 chose them and because the accessibility of a native date input is free and the accessibility of a custom one is not. Staying on the form after a save follows from what the screen is for, several entries in a sitting, and from the fact that there is nowhere better to go until feature 7 exists. Naming the stored amount in the confirmation is the piece that ties back to the parse: it is what turns an invisible conversion into a visible one, on every single entry, at no cost.

## Three calls made after a cross check

An independent read of the draft found gaps worth recording, because each was a place a builder would otherwise have guessed.

The minus sign is not in the accepted character set. The draft refused negatives twice, once by a shape rule that had no minus in it and once by a separate check, which reads as a contradiction and leaves the parse function's accepted characters genuinely undetermined. A negative is now refused by the shape rule alone, and the separate check narrowed to zero and the safe integer bound.

An amount typed with more zeros than the currency has, `500.00` on the yen, is refused. This is the one call in this spec that could reasonably go the other way, since those zeros lose no information and people carry the habit across from other apps. It is refused because the rule then counts digits typed rather than reasoning about their value, which keeps it to the single sentence that an error message can teach. If it turns out to annoy in practice, relaxing it later is a small change to one function with an exhaustive test suite already around it.

The action narrows the profile itself. The draft leaned on the completeness redirect in `app/(app)/layout.tsx`, which is wrong in a way that is easy to miss: a server action is its own entry point, reached by a POST that renders no layout, so a guard living in a layout is simply absent from every action beneath it. The same reasoning the layout already applies to the proxy, that a second check catches what the first cannot see, applies one level further down.

The decision to add no rate limiting deserves one line, since the project has Arcjet installed and a rule about protecting endpoints. That rule is about public endpoints. This one is behind two authentication gates and row level security, and the only party who can reach it can already write these rows. A limit here would add a way for the most used screen in the app to fail, in exchange for nothing.
