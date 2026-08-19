# Verify: design system and UI foundation · spec 0003 · updated 2026-08-19

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Start the gallery first: `UI_GALLERY=1 npm run dev`, then open `/design`.

## Commands

- [ ] `npm run test` → 93 pass, including the token contract in `tests/unit/tokens.test.ts` → AC-1, AC-2
- [ ] `UI_GALLERY=1 npm run test:e2e` → 17 pass, including axe on both routes in both themes → AC-5, AC-7, AC-11, AC-12, AC-13, AC-14, AC-15, AC-17, AC-18
- [ ] `npm run build` then `npm start` with `UI_GALLERY` **unset** → `curl -o /dev/null -w '%{http_code}' localhost:3000/design` returns `404` → AC-17
- [ ] Same build, restarted with `UI_GALLERY=1` → `/design` returns `200`. The flag must be read per request, not baked at build time → AC-17
- [ ] `grep -rEn "#[0-9a-fA-F]{3,6}|rgb\(" components/ app/ --include=*.tsx` → no matches → AC-1

## UI / manual

- [ ] Open `/design`, switch the operating system between light and dark → every component renders correctly in both, no missing token, no console error → AC-9
- [ ] Tab from the top of `/design` → first stop is "Skip to content", then the three nav tabs, then content in visual order; 22 stops, every one showing the same focus ring → AC-5
- [ ] Tab onto the primary (black) button and onto a bare surface button → the ring is visible against both, in both themes → AC-5
- [ ] Narrow the window to 320px → the tab bar moves to the bottom, every tab is at least 44px tall, and the amount in each list row is complete and unwrapped while the long merchant name truncates → AC-13, AC-14
- [ ] Widen past 768px → the tab bar becomes a left rail → AC-4
- [ ] Look at the "Failed, with the real message" example → it shows the actual timeout text, not a generic apology, and no zero, dash, or empty list appears where a value failed → AC-19
- [ ] Look at the ten category swatches side by side → all ten are tellable apart, including the three greens → AC-2
- [ ] Read `docs/design.md` → it covers the type scale, every colour token with both values, spacing, radius, focus, motion, and every component with its variants and states → AC-3

## Value sourcing (one per row, exercising the edge that breaks if the source is wrong)

- [ ] Set `APP_CURRENCY=EUR`, restart, reload `/design` → every `Amount` shows `€` and the amount input adornment shows `€`, not `EUR` → sources: `formatCents()`, `currencySymbol()`
- [ ] Set `APP_CURRENCY=JPY`, restart → amounts show no decimal places, since Intl knows JPY has none, and nothing in a component rounds → AC-10
- [ ] Compare the spend and income rows → the same 4250 renders as `$42.50` and `+$42.50`; the sign comes from `direction`, never from the number, which is always stored positive → AC-11
- [ ] Set `APP_TIMEZONE=Pacific/Kiritimati`, restart → `DateDisplay` still shows `Aug 19` for `2026-08-19`. A plain date must not shift with a zone → AC-12
- [ ] Inspect a `<time>` element → `datetime` carries the raw `2026-08-19`, not the formatted text → AC-12
- [ ] Submit the gallery form with the browser's JavaScript disabled → the controls still render and accept text, since they are uncontrolled → AC-4
- [ ] Inspect the "Hint and error together" field → `aria-describedby` lists the hint id first, then the error id, and `aria-invalid` is set → AC-6
- [ ] Inspect the three skeletons → each announces a different label, so two loading at once are told apart → AC-19
- [ ] Build for production and inspect a category dot's computed `background-color` → a real colour, not `rgba(0, 0, 0, 0)`. An interpolated Tailwind class compiles to nothing and only fails here → AC-18

## Owed: needs a person with a screen reader

Automated tooling and the accessibility tree cannot answer these. Full detail in
[../../accessibility-pass.md](../../accessibility-pass.md).

- [ ] Submit a form with an error → the message is spoken and focus does **not** move → AC-6, AC-8
- [ ] With both a hint and an error present → the hint is read before the error → AC-6, AC-8
- [ ] A `Skeleton` replaced by content → no stale "loading" announcement is left behind → AC-8
- [ ] Each of the ten category chips → announces its name, never a colour → AC-8
- [ ] The bottom tab bar on a phone → the active tab is announced as current → AC-8
- [ ] The ten swatches under deuteranopia and protanopia simulation → still tellable apart → AC-2, AC-8

## Acceptance-criteria coverage

- AC-1 · token test + the grep · AC-2 · token test + swatch look + colour blindness sim (owed)
- AC-3 · read `docs/design.md` · AC-4 · gallery renders all 16, one client file
- AC-5 · tab walk + axe · AC-6 · describedby inspection + screen reader (owed)
- AC-7 · axe in CI · AC-8 · `docs/accessibility-pass.md`, screen reader rows owed
- AC-9 · light and dark walk · AC-10 · currency env checks
- AC-11 · sign check · AC-12 · timezone and `datetime` checks
- AC-13 · 320px row check · AC-14 · 320px target sweep
- AC-15 · reduced motion test · AC-16 · amount input returns raw text
- AC-17 · flag on and off against one build · AC-18 · production computed colour
- AC-19 · error and empty examples
