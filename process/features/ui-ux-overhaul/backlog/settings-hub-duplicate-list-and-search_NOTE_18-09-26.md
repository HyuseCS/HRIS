---
name: note:settings-hub-duplicate-list-and-search
description: "Owner feedback 18-09-26 on /settings — the sub-nav repeats the hub's whole list on the hub itself, the page description should move behind a ? tooltip, and the title row wants a search box on the far right."
date: 18-09-26
feature: ui-ux-overhaul
---

# Settings hub — duplicate list, description tooltip, search

Date: 2026-09-18
Source: owner, live on `/settings` after the phase 07 settings IA landed
Surfaces: `src/routes/(app)/settings/+layout.svelte`, `src/routes/(app)/settings/+page.svelte`
Status: NOTED, not built.

## S1 — the sub-nav repeats the hub, on the hub

Phase 07 gave `/settings` a sub-nav (`+layout.svelte`) that renders every visible destination,
grouped. `/settings/+page.svelte` then renders the same destinations, in the same groups, as
cards. On `/settings` itself both render, so the page shows the full list twice — the nav
strip on top, the cards under it.

Owner: *"the things in 'All Settings' container is redundant when we already have the page
itself."*

**Needs the owner's answer before anyone builds it.** Two readings:

| # | Reading | Change |
|---|---|---|
| R1 | the whole grouped list in the sub-nav is the redundant part, but only while on `/settings` | hide the group links on `/settings`, keep the bar for its child pages |
| R2 | the hub cards are what the sub-nav makes redundant | drop the cards, let `/settings` be the sub-nav plus nothing, or redirect `/settings` to its first destination |

R1 keeps a landing page with the `desc` line per destination, which the strip does not carry.
R2 removes a page but loses those descriptions. R1 looks right, the owner decides.

Whichever wins, `src/lib/settings-destinations.ts` stays the single source — that is the phase 07
guarantee and no fix here may re-introduce a second hand-kept list.

Watch out: `tests/unit/settings-cards.test.ts` asserts the exact ordered href list per role off
the hub, and `tests/e2e/settings-visibility.spec.ts` walks these surfaces. Both need re-pointing
if the cards go.

## S2 — the page description belongs behind a `?`

`PageHeader title="Settings" description="Master data and configuration for your organization."`
Owner wants that line hidden in a `?` tooltip on hover.

**Already filed**, with measurements, as `page-header-bar-and-help-tooltip_NOTE_04-09-26.md`:
34 pages pass a description, 10 run over 120 characters, the longest is 290. That note records
the owner's ruling to move long copy behind a `?` across the app, and it is still BACKLOG.

So this is not a new item. `src/lib/components/ui/HelpTip.svelte` already exists and renders
exactly this control. The open question in that note — whether a short description stays visible
beside the `?` or the `?` carries all of it — is the same question here, and `/settings` at 48
characters is the short end of the range. Settle it there, then apply it everywhere.

## S3 — a search box on the Settings title row

Owner: a settings search, placed on the far right of the same line as the `Settings` title.

This is allowed by the title-row rule in `PageHeader.svelte`: the title row holds at most one
control, a Back link counts as that control, and `/settings` has no Back. So search can be that
one control. `PageHeader` takes no actions prop by design, so the page lays the control out
beside its `PageHeader`, the way the rule already describes.

`src/lib/components/ui/SearchInput.svelte` exists. It should filter `visibleSettings(roles)` on
label and `desc` — client-side, no load, no new query param. Decide whether it also filters the
sub-nav strip or only the hub, which depends on how S1 is settled.

## Scope

Markup and copy only. No change to `settings-destinations.ts`'s contents, no load change, no
capability change.
