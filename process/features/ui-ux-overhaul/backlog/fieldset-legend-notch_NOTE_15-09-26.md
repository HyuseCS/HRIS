---
name: note:fieldset-legend-notch
description: "Owner click pass 15-09-26: fieldset legends sit in a notch in the container border (---title---), which does not match the rest of the system's section headings"
date: 15-09-26
feature: ui-ux-overhaul
---

# Fieldset legend notch does not match the system

Owner, click pass of the surfaces work, 15-09-26, on
`http://localhost:5173/recruitment/jp_seed_demo/apply`:

> "Good but the design of the containers where the title of the container is ---"title"----, does not
> match the aesthetic/theme of the rest of the system. It looks cool tho"

Screenshot (dark, phone-ish width): `fieldset-legend-notch_15-09-26.png`.

## What it is

A native `<fieldset class="rounded-md border bg-card p-4">` with `<legend class="px-1 text-sm
font-semibold">`. The browser cuts the legend into the top border. The `bg-card` fill added in the
surfaces sweep (`189819f`, `2a70952`) makes the notch easier to see. Everywhere else a section title
sits inside the card as a heading, not on its border.

Sites (`grep -rln "<legend" src`):
- `src/routes/(app)/recruitment/[id]/apply/+page.svelte` (2 fieldsets)
- `src/routes/(app)/employees/new/+page.svelte` (7 fieldsets)
- `src/routes/(app)/settings/roles/+page.svelte` (check whether it is visible)

## Direction for the polish pass

Keep `<fieldset>`/`<legend>` for accessibility, but render the legend as an in-card heading (for
example `float-left w-full` on the legend, or `sr-only` legend plus a visible heading) so it matches the
other card sections.

**DONE 15-09-26** in `bbe3768`: owner asked for the titles inside the container. Legend `float-left mb-4
w-full font-semibold`, fieldset `rounded-lg p-6 [&>legend+*]:clear-left`, matching `employees/[id]` cards.
