---
name: note:roster-select-typeahead
description: "Five picker <select> elements render one <option> per active employee and are deliberately uncapped — capping a picker makes a person unreachable. The honest fix is a typeahead, not a cap."
date: 04-09-26
feature: ui-ux-overhaul
metadata:
  node_type: memory
  type: references
  feature: ui-ux-overhaul
  phase: phase-10
---

# Roster pickers need a typeahead, not a cap

**Raised by:** phase 10 (`container-bounds`), trap T4. Recorded residual — phase 10 bounded every
list container in the app **except** these five, on purpose.

## The five sites

Each renders one `<option>` (or one checkbox row) per active employee, with no ceiling:

| File | What it picks |
|---|---|
| `src/routes/(app)/dashboard/+page.svelte` — `{#each data.awardEmployees …}` | award recipient |
| `src/routes/(app)/employees/[id]/+page.svelte` — `{#each data.supervisorOptions as opt …}` | additional supervisors (checkbox list) |
| `src/routes/(app)/employees/[id]/+page.svelte` — `{#each data.supervisorOptions as s …}` | reports-to |
| `src/routes/(app)/benefits/+page.svelte` — `{#each data.employees …}` | enrolment subject |
| `src/routes/(app)/settings/posting-approvers/+page.svelte` — `{#each data.employees …}` | department approver |

## Why phase 10 left them alone

A cap on a list is a display decision — the reader can still get to the rest another way. A cap on a
**picker** is a functional one: the person simply is not in the form, and there is no other route to
them. At 500 staff a capped picker silently makes 490 people un-assignable.

A native `<select>` also already scrolls itself, so the page-growth problem these pickers would
otherwise cause does not exist. The additional-supervisors checkbox list is the one non-native case
and it already carries `max-h-48 … overflow-y-auto`.

`tests/unit/container-bounds-scan.test.ts` pins all five against a `.slice(` being added.

## The actual fix

A typeahead: type two or three characters, the server returns matching employees, the form binds the
chosen id. It needs a search endpoint (or a `?search=` load parameter) plus one shared component,
which is a feature, not a bounding pass — which is why it is here and not in phase 10.

Until then the pickers stay uncapped and the residual is a slow render on a very large roster, not
a correctness problem.
