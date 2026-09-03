---
name: context:all-uxui
description: "Svelte 5 runes, the HSL token system, button/dialog conventions, and the accessibility floors — the uxui group entrypoint/router"
keywords: ui, ux, svelte, runes, component, tailwind, design tokens, dark mode, dialog, modal, button, form, accessibility, a11y, touch target, focus trap, table, snippet, layout
related: [context:all-auth]
date: 17-08-26
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

- **Touch targets:** a `@media (pointer: coarse)` block in `src/app.css` sets a 44px floor on
  BOTH axes for `button`, `[role=button]`, `select`, `textarea`, and non-hidden inputs.
  Checkbox/radio are excluded on purpose — they are square, and a one-axis floor deforms them.
  Mouse/desktop density is untouched.
- **Dialogs:** the house pattern is a hand-rolled modal, not native `<dialog>`. See
  `ui/ConfirmDialog.svelte` and `timesheets/PunchMapDialog.svelte`. A dialog is expected to:
  close on backdrop click and Escape, take focus on open, **trap Tab and Shift+Tab inside itself**,
  and **restore focus to the trigger** on close. `aria-modal` alone does not trap Tab.

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
