---
name: context:all-uxui
description: "Svelte 5 runes, the HSL token system, button/dialog conventions, and the accessibility floors — the uxui group entrypoint/router"
keywords: ui, ux, svelte, runes, component, tailwind, design tokens, dark mode, dialog, modal, button, form, accessibility, a11y, touch target, focus trap, table, snippet, layout, toast, banner, feedback, aria-live, error surface
related: [context:all-auth]
date: 10-09-26
---

# UX/UI Context

This file is the canonical UX/UI context entrypoint for Veent HRIS.

Use it after `process/context/all-context.md` when the task needs interface work, component conventions, or accessibility review.

---

## Scope

This group covers:

- Svelte 5 runes usage and the syntax traps this codebase hits
- The HSL design-token system in `src/app.css` and dark mode
- Button, dialog, and table conventions as they actually exist (not as they ought to)
- Accessibility floors that are already enforced

It does not cover:

- Whether a control should be *visible* to a role — that is `process/context/auth/all-auth.md`
- Server load/action shape — that is a route concern, see `all-context.md`

## Read When

Read this entrypoint when:

- building or changing any component or page
- adding a dialog/modal
- touching styling, tokens, or dark mode
- reviewing accessibility

## Svelte 5 — Runes Only

`$state`, `$derived`, `$effect`, `$props`, `$bindable`. No stores for component state.

**Hard syntax rule:** `{@const}` must be an **immediate child of a block tag** (`{#if}`, `{#each}`,
`{#snippet}`). Never inside a plain HTML element. This is a compile error, and it is hit often
enough to be worth stating first.

## Component Layout

```text
src/lib/components/
  ui/          shared primitives: ConfirmDialog, ReasonDialog, Table, Toaster,
               PageHeader, EmptyState, Skeleton, TableSkeleton, MaskedField,
               BackButton, ConfirmButton, PeriodPicker
  charts/  dashboard/  dev/  employees/  leave/  payroll/  recruitment/  timesheets/
  Pagination.svelte
```

## Styling

- Tailwind CSS v3 with **43 HSL custom properties** defined in `src/app.css`
- Dark mode via `html.dark` plus `color-scheme`; both themes must be styled
- Token names follow shadcn conventions: `--background`, `--foreground`, `--primary`,
  `--muted`, `--accent`, `--destructive`, `--border`, `--ring`, `--card`

## Buttons — Know This Before "Fixing" Them

There is **no single button class in use**. Measured on this codebase:

- `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-destructive`: **27 usages total**
- Raw `<button>` tags: **252**
- Of 193 `h-9` occurrences, **167 are on inputs/selects/textareas**, only 3 on buttons

So a change to the `.btn-*` variants in `app.css` reaches almost nothing. Any app-wide button
change has to be a global selector or 250 edits. This premise has already been got wrong once, in
the #302 UI audit.

`.btn-row*` variants are the compact bordered actions used inside table rows, deliberately dense.

## Accessibility Floors Already In Place

- **Touch targets:** a `@media (pointer: coarse)` block in `src/app.css` sets a 24px floor on
  BOTH axes for `button`, `[role=button]`, `select`, `textarea`, checkboxes/inputs (radio still
  excluded — it's the one control this floor doesn't apply to, on purpose, per the #a11y-approvals
  fix), and the `.btn-row`/`.btn-row-positive`/`.btn-row-warning`/`.btn-row-danger` anchor classes
  specifically (a bare `a` selector was rejected — it would also floor prose links). Mouse/desktop
  density is untouched. Verify a touch-target CSS change live under `pointer: coarse` emulation —
  a box can measure 24px because the control was naturally that wide, not because the rule fired.
- **Contrast:** "go one shade darker" is not a fix — compute the ratio. `orange-500 → orange-600`
  still failed AA at 3.56:1 on the approvals Return button; only `orange-700` (5.18:1) cleared it.
  When auditing a row of sibling controls (e.g. 3 filled buttons), **measure every one of them
  individually** — a partial sweep reads as a complete one. The approvals audit measured Return
  (2.80:1) and Reject (4.83:1) but never measured Approve, which was silently failing at 3.30:1
  and only surfaced later, during planning, when replacement shades were being computed.
- **Contrast checkers must composite alpha.** A translucent fill (`bg-foreground/15`) and
  translucent text (`text-muted-foreground` at partial opacity) resolve to the same raw luminance
  if you don't composite each over its actual backdrop first — an uncomposited check silently
  returns a meaningless ratio (observed: 1.0) instead of failing loudly. Always composite against
  the real rendered background before computing WCAG contrast.
- **Dialogs:** the house pattern is a hand-rolled modal, not native `<dialog>`. See
  `ui/ConfirmDialog.svelte` and `timesheets/PunchMapDialog.svelte`. A dialog is expected to:
  close on backdrop click and Escape, take focus on open, **trap Tab and Shift+Tab inside itself**,
  and **restore focus to the trigger** on close. `aria-modal` alone does not trap Tab.
- **Skip links and focus order must be verified against a production build, not just `pnpm dev`.**
  `DevLoginSwitcher.svelte` renders a real focusable floating button ahead of the skip link
  whenever `dev && !navigator.webdriver` — true in exactly the environment (`pnpm dev`, live
  browser) a focus-order check would naturally run in. The fix verified correctly only against
  `pnpm build && node build/index.js`. Name the build mode explicitly in any focus-order
  verification step; a claim proven in dev can be false in prod, and vice versa.

## Feedback Surfaces — One Message Per Action

The phase-04 rule, applied six times now: **one message per action, whichever surface sits
NEAREST THE BUTTON.** It is not "delete the banner" — both directions have shipped:

- `661719d`, `1a17ebd`, `a4b3dcd` — the message sat in a page header or scrolled off the top of a
  `size="full"` dialog while the button was in the footer. Banner/strip deleted, toast kept.
- `0a2f11d` — the inline error sat physically ON the row beside its own button. Inline kept, toast
  suppressed with `submitFeedback({ error: null })`.

**Before suppressing a toast, prove the replacement surface exists — don't assume it.** Two
feedback defects landed in one PR (`3aa9fb7`, PR #13, 10-09-26) from the same move: deciding a
form's feedback on the reasoning that a page-local surface handles it, without checking that
surface was actually wired for that action. `attendance ?/saveTimesheet` took `success: null` and
had no banner at all, so a successful save said nothing. The dashboard's `decideGuard` was NOT
suppressed and duplicated its own scoped banner. Grep the page for the `actionError`/scoped-banner
call site for that specific action name before adding or trusting a `{ success: null }` /
`{ error: null }` override — see `removing-a-banner-can-silence-errors` for the inverse mistake
(deleting a shared surface without checking who still relies on it).

**The `error` option only covers `fail()`. A thrown `error()` always toasts.** The same PR's review
called `employees/[id]`'s audited `reveal` a silent failure because it carries `error: null` and
sits in zero `actionError` lists. It is not. `submitFeedback`'s `error` option is read only on
`result.type === 'failure'`, which is what a `fail()` return produces; `?/reveal` has no `fail()`
call, and `requireAnyCapability`'s `error(403)` arrives as `result.type === 'error'`, a branch that
toasts `FRIENDLY_ERROR` unconditionally. Before calling an `error: null` guard silent, check
whether its action returns `fail()` at all — and remember that the `error()` path can only ever say
"Something went wrong", so it tells a denial and a crash apart for nobody.

Selector facts, and they decide whether any assertion means anything:

- **`getByRole('alert')` matches the `Banner` component ONLY**, for `kind="error"` and
  `kind="warning"` (`Banner.svelte:42`). The toast is not `role="alert"`.
- The toast region is `div[role="status"]` (`Toaster.svelte:48`).
- **Success toasts carry NO `aria-live`.** `Toaster.svelte:64` sets `aria-live="assertive"` only
  when `kind === 'error'`; every other kind gets `undefined`. So a probe selecting
  `[role="status"] [aria-live]` sees **error toasts only** and reports zero for every success
  toast that is plainly on screen. Distrust a "no toast" result from that selector before
  reporting it as a product failure (hit 10-09-26; the agent correctly re-checked instead of
  filing a bug).
- Hand-rolled `bg-destructive` strips carry **no ARIA role at all** — they match neither locator.
  Assert on their class scoped to a container, never on a role.

A rejection currently reports through the `saved` key (`?/review`, and recruitment's
`Posting sent back to draft.`), so `submitFeedback` dispatches `kind: 'success'` and announces a
rejection in **green**. Owner ruling owed —
`process/features/ui-ux-overhaul/backlog/rejection-toast-is-green_NOTE_10-09-26.md`.

## Svelte 5 Binding Gotchas

- **`bind:indeterminate` cannot target a `$derived` (read-only) value.** Even though the binding
  itself is supported by the installed Svelte version, `bind:indeterminate={someDerivedValue}`
  fails at lint time (`Cannot bind to constant`). Fall back to `bind:this` on the element plus an
  `$effect` that sets `.indeterminate` imperatively.
- **A native checkbox click flips its own `.checked` DOM property before `onchange` fires.** This
  can leave a one-way `checked={someState}` binding stale: if the state diff sees no change,
  Svelte won't re-sync the DOM, and the box can render checked when its bound state says it isn't
  (or vice versa). If you're setting `.indeterminate` imperatively in an `$effect`, set `.checked`
  imperatively in the same effect and drop the declarative `checked={...}` attribute — don't mix
  imperative and declarative sync on the same control.
- Controls with internal DOM state (indeterminate, checked, open/closed) need a **live
  state-transition walk** — click through every state in a real browser — not just a render check.
  Both bugs above were found only by clicking through empty→some→all→empty in a live browser; a
  static read of the source or a single render assertion would have missed both.
- **A Playwright check that clicks before hydration settles proves nothing.** A select-all test
  (`/requests/approvals`) called `.check()` and then asserted the post-click state — Svelte
  repropped `checked={picked}` from a stale one-way binding and silently undid the click, and the
  test passed anyway because it never looked at the PRE-click state to confirm the click had any
  effect. The control that actually caught the real bug (F15, PR #13) asserted the state
  immediately BEFORE the click too, so a no-op click shows up as "nothing changed" instead of
  reading as a pass. Assert before and after, not just after.
- **Deleting the `enhance` import breaks `use:enhance={someGuard.enhance}` silently.** The
  directive name `use:enhance` resolves to the *imported* SvelteKit action; `someGuard` (e.g. a
  `submitFeedback()` guard) is only the argument passed to it. If the import is removed but a bare
  `use:enhance` directive is left behind pointing at a guard's `.enhance` property, the form still
  submits but nothing about the result — success or failure — reaches the user; there is no error,
  no type-check failure, and no visual break. It looks exactly like the toast/banner bug being
  fixed. Grep every `use:enhance` call site in a component before removing or moving an `enhance`
  import near it (`b026395`, 10-09-26 — a stage-move form left on a bare `use:enhance` after a
  UI sweep missed a child component).

## Verification Expectation

**Green tests do not prove a UI works.** This repo has a live example: 1432 unit tests passed while
`/attendance` returned 500 on every visit, because a CommonJS named import that Vitest tolerates
breaks Vite's SSR transform.

Therefore:

- After adding a production dependency, **load an affected page in a real browser** before calling
  it done.
- **Look at a screenshot**, not only the assertion count. Two defects in the punch map shipped
  past green checks and were caught only by looking.
- Prefer asserting a computed style over a measured box when testing a CSS rule — a box can be the
  right size by accident.

## Source Paths

- `src/app.css`
- `src/lib/components/**`
- `src/routes/(app)/+layout.svelte`
- `tailwind.config.js`

## Update Triggers

Update this group when:

- the token set or dark-mode mechanism changes
- a shared UI primitive is added to `ui/`
- the button situation is actually consolidated
- accessibility floors move

## Canonical Notes

- `impeccable` and `ui-ux-pro-max` are **installed skills**, not adjectives. Check
  `~/.claude/skills/` before assuming a word in a request is descriptive.
- Leaflet (`leaflet@1.9.4`) is used for maps. It touches `window` on init, so it must be
  **dynamically imported inside an effect**, never at module scope. Its stylesheet import is
  SSR-safe at module scope.
