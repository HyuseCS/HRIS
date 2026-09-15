---
name: note:settings-roles-no-container
description: "/settings/roles: the filter and the table sit straight on the page background with no container, and the content is hard to tell apart, worst in light mode"
date: 15-09-26
feature: ui-ux-overhaul
---

# `/settings/roles` needs a container and more contrast

**Status**: BACKLOG. The owner wants it done right after P2 of the phase 05 owner pass.
**Raised by**: the owner, 15-09-26, during P2 test 1 (deactivate login):

> *"The filter and the table needs to be inside a container so that the page background and the
> content have a distinction. Also the contents of the page are hard to distinguish specially in
> light mode."*

**Screen**: `http://localhost:5173/settings/roles` as `admin@veent.ph`, light mode, 1528px wide.
Screenshot: `settings-roles-no-container_15-09-26.png` next to this note.

## Not covered elsewhere

- `settings-roles-unbounded-table_NOTE_10-09-26.md` is pagination and the filter box. RESOLVED in `d26066d`.
- `page-header-bar-and-help-tooltip_NOTE_04-09-26.md` is the header bar only, not the body.
- Phase 06 (surface consolidation) and phase 07/08 plans do not name this page's layout.

## What to do

1. Put the filter row and the table (with its pagination) inside one surface container.
2. Raise the contrast between page background, container, table rows and the text, in light
   mode first. Check dark mode after.
