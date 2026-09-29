---
name: note:separations-action-on-title-row
description: "Owner feedback 18-09-26 on /separations — New Separation sits in its own row under the header instead of on the title row, and the page description should move behind a ? tooltip."
date: 18-09-26
feature: ui-ux-overhaul
---

# Separations — put New Separation on the title row

Date: 2026-09-18
Source: owner, live on `/separations`
Surface: `src/routes/(app)/separations/+page.svelte`
Status: NOTED, not built. Owner called the page good — this is layout and copy only.

## T1 — the lone action wastes a row

Lines 23-34 render the header, then a whole row holding one button:

```svelte
<PageHeader
    title="Separations"
    description="Record resignations and terminations, run clearance, and settle final pay."
/>

<div class="flex justify-end">
    <button onclick={() => (showForm = true)} ...>New Separation</button>
</div>
```

Owner wants `New Separation` moved up to the top right of the header line.

**This is what the title-row rule already says to do.** From the comment in `PageHeader.svelte`:

> The title, its description and at most ONE control — the Back link counts as that control.
> A page with no Back link may put its single page-level action (or one filter-like control) on
> the title row, laid out by the page beside its PageHeader.

`/separations` has no Back link and exactly one page-level action, so it qualifies. `PageHeader`
takes no actions prop by design, so the page lays the button out beside its `PageHeader`. Note
the `back` snippet is the only right-edge slot the component itself owns — do not repurpose it
for an action, that is what the rule separates.

Recorded earlier as the same rule: `single-page-action-on-title-row` (owner, 17-09-26).

## T2 — how widespread

Measured across every route that uses `PageHeader`, not sampled:

| Shape | Count | Files |
|---|---|---|
| `<PageHeader/>` immediately followed by a `flex justify-end` action row | **1** | `separations/+page.svelte` |
| a `justify-end` row within 8 lines of a `<PageHeader` | **2** | `separations/+page.svelte`, `payroll/+page.svelte` |

So this is close to a one-off, not a pattern to sweep. Check `payroll/+page.svelte` by eye before
touching it — it may hold more than one control, in which case the rule sends its actions to the
panel toolbar rather than the title row.

## T3 — the description belongs behind a `?`

`description="Record resignations and terminations, run clearance, and settle final pay."` — 78
characters. Owner wants it hidden in a `?` hover tooltip.

**Already filed program-wide** as `page-header-bar-and-help-tooltip_NOTE_04-09-26.md`, with the
measurements: 34 pages pass a description, 10 over 120 characters, longest 290. That note carries
the owner's ruling to move long copy behind a `?`, and it is still BACKLOG.
`src/lib/components/ui/HelpTip.svelte` already renders this control.

This is the second page the owner has asked for it on today — `/settings` was the first, see
`settings-hub-duplicate-list-and-search_NOTE_18-09-26.md`. Two separate requests for the same
change is a signal to do the 04-09-26 note as one program-wide pass rather than page by page.
The open question there is unchanged: does a short description stay visible beside the `?`, or
does the `?` carry all of it. Settle that once, then apply it to all 34.

## Scope

Markup and copy only. No load change, no action change. `tests/e2e/separations.spec.ts` drives
this page — re-run it, since moving the button changes where its locator finds it.
