# Dashboard layout — INNOVATE decision summary (17-09-26)

## Quick recap before the options

Locked ask: fix two unbounded alert cards (min/max height) and redesign the whole dashboard layout, especially for HR_ADMIN/CEO/SUPER_ADMIN. Fixed vocabulary: `.card`, `Container.svelte`'s shell+scroll-body recipe, Tailwind v3 HSL tokens, both themes, Svelte 5 runes, no new deps. Fixed contracts: `h1` = "Dashboard", Postings rows stay `<li>` with a button named exactly "Approve", Announcement items stay `<li>`, the three metric tiles stay named anchors. Flagged decision: old "Pending Approvals" tile vs new "Awaiting you" card — both exist and overlap today.

I did not need `vc-docs-seeker` (no library/API surface — pure Tailwind/Svelte layout) or `vc-security`/`vc-scenario` (no new trust boundary or destructive action — Approve/Send-back behavior is unchanged, only geometry changes).

---

## 1–2. Three candidate layouts

**Common building block for all three:** replace the "grid-cols-3 with N conditional children" pattern with a **card array + zone-derived column count** — build a `$derived` list of the cards a role actually sees, then pick `grid-cols` from `Math.min(list.length, maxCols)` instead of a hard-coded `lg:grid-cols-3`. That's what kills orphans: a zone with 1, 2, or 3 cards always fills its row.

### O1 — Two-column shell (persistent right rail)

Left column (2/3) carries everything sequential; right column (1/3) is a sticky rail for glance-only content.

```
HR_ADMIN/CEO/SUPER_ADMIN (lg)                 EMPLOYEE (lg)
┌─Dashboard──────────────────┐               ┌─Dashboard──────────────────┐
│┌──────────────┐┌──────────┐│               │┌──────────────┐┌──────────┐│
││Attendance    ││Upcoming  ││               ││Attendance    ││Upcoming  ││
││KPI tiles x4  ││Events    ││               ││KPI tiles x4  ││Events    ││
│├──────────────┤│(rail,    ││               │├──────────────┤│(rail,    ││
││Employees|Pend││ Container││               ││Employees|Pend││ Container││
││Payroll (3-up)││ bound)   ││               ││(2-up, no pay)││ bound)   ││
│├──────────────┤├──────────┤│               │├──────────────┤├──────────┤│
││Regularizatons││My Status ││               ││Recent Activty││My Status ││
││Postings      ││(rail,    ││               ││(if any)      ││(rail)    ││
││Awaiting-you  ││ bound)   ││               │└──────────────┘└──────────┘│
││ (3-col,bound)│└──────────┘│               │ Announcements (full-w)    │
│├──────────────┴┐           │               │ Quick actions (2-up)      │
││Recent|Announce│           │               └────────────────────────────┘
│└────────────────┘          │
│ Quick actions (3-up)        │
└──────────────────────────────┘
```

- **Pros:** clear "task column vs. context column" mental model; matches admin-panel conventions (`ui-ux-pro-max` data-dense-dashboard row: real-time/glance content lives in a persistent rail).
- **Cons:** biggest rewrite — every card needs re-homing into two columns; the rail height must track the left column's height or it looks orphaned on a short EMPLOYEE view; two independently-scrolling regions is a new interaction the codebase has never had (Container is used per-panel, never for a whole-page rail).
- **Zone stability:** left column already uses the array+derived-cols trick for the decision row; right rail is fixed-slot (Events, Status) so it doesn't have an orphan problem, it just collapses cells that are absent.

### O2 — Priority-ordered zones, same single column (recommended baseline)

Keep the page as one scrolling column (no new rail), but reorder into four named zones and turn the three full-width alert cards into one bounded grid zone.

```
HR_ADMIN/CEO/SUPER_ADMIN (lg)                  EMPLOYEE (lg)
┌─Dashboard────────────────────────┐          ┌─Dashboard────────────────┐
│ NEEDS A DECISION                 │          │ (zone hidden — 0 cards)  │
│┌──────────┐┌──────────┐┌────────┐│          │ AT A GLANCE               │
││Regularize││Postings  ││Awaiting││          │┌────────┐┌────────┐      │
││(bounded) ││(bounded) ││you     ││          ││Attend. ││Employ. │      │
│└──────────┘└──────────┘└────────┘│          │└────────┘└────────┘      │
│ AT A GLANCE                      │          │ FEED                     │
│┌────┐┌────┐┌────┐┌────┐          │          │┌──────────┐┌──────────┐  │
││Att.││Emp.││Pend││Payrl│         │          ││My Status ││Events    │  │
│└────┘└────┘└────┘└────┘          │          │└──────────┘└──────────┘  │
│ FEED                             │          │ Announcements (full-w)  │
│┌─────────┐┌────────┐┌──────────┐ │          │ DOORS                    │
││Recent Act││Announce││My Status│ │          │┌────────┐┌────────┐      │
│└─────────┘└────────┘└──────────┘ │          ││Onboard ││File Leave│    │
│         Upcoming Events (bound)  │          │└────────┘└────────┘      │
│ DOORS (quick actions, 3-up)      │          └───────────────────────────┘
└───────────────────────────────────┘
```

- **Pros:** smallest diff — reuses the existing `.card` grids, just re-groups and reorders them and bounds the three alert cards; each zone's card list is already a filtered array (`data.canPost && …`), so the array+derived-cols trick drops in cleanly per zone; solves the actual owner complaint (decision cards buried at the bottom) without inventing new chrome.
- **Cons:** still a single long scroll for HR_ADMIN — four zones is better than one flat list but it's still a lot of vertical real estate; doesn't solve "the page overall feels dense" as strongly as O1/O3.
- **Zone stability:** each zone's card count is now explicit and small (0–4), so `grid-cols` from `min(count, 3 or 4)` never orphans.

### O3 — Compact KPI strip + action-queue panel

Collapse the four KPI cards into one slim stat strip (not full `.card` boxes), and merge the three alert/approval cards into a single `Container`-based tabbed/accordion "Action Queue" panel with one fixed height.

```
HR_ADMIN/CEO/SUPER_ADMIN (lg)                  EMPLOYEE (lg)
┌─Dashboard──────────────────────────┐        ┌─Dashboard──────────────┐
│ [Attend][Employ][Pending][Payroll] │        │ [Attend][Employees]     │
│  (slim stat strip, 1 row)          │        │  (slim strip)           │
│┌─────────────────┐┌──────────────┐│        │┌──────────────┐┌──────┐│
││ ACTION QUEUE     ││ TODAY        ││        ││ My Status    ││Events││
││ tabs: Regularize/││ Events       ││        │└──────────────┘└──────┘│
││ Postings/Awaiting││ My Status    ││        │ Announcements (full-w) │
││ (Container,fixed)││ (Container)  ││        │ Quick actions (2-up)   │
│└─────────────────┘└──────────────┘│        └─────────────────────────┘
│ Recent Activity | Announcements    │
│ Quick actions (3-up)               │
└──────────────────────────────────────┘
```

- **Pros:** most visually "clean admin panel" outcome — the queue becomes one fixed-height object instead of three stacked ribbons; strongest fit for `ui-ux-pro-max`'s "Data-Dense Dashboard" guidance (real-time glance strip + bounded panels).
- **Cons:** the merge into tabs is the riskiest change against the fixed contracts — the postings `<li>`/`Approve`-button requirement and the amber/blue color coding both have to survive inside a shared tabbed container; a tab that's empty for a role (e.g. no Regularizations) needs its own empty-state, adding logic; biggest behavior change of the three, so it needs the most e2e re-verification (`posting-approver-sod.spec.ts` locators must still resolve inside a tab panel that may start non-active).
- **Zone stability:** the queue panel is single-slot by construction (one panel, N tabs) so there's no grid-orphan question there; the KPI strip's cell count still needs the array/derived-cols technique.

### Height bounds (all three options use the same numbers)

| Card | min-h | max-h | Why |
|---|---|---|---|
| Upcoming Regularizations | `7rem` (~112px) | `20rem` (~320px) | min = header + badge + 1 row, so a single-item card doesn't look "broken" short next to its sibling; max ≈ 4–5 rows visible (rows run ~56–60px with the two-line name/date content) before `overflow-y-auto` kicks in, scaled down from Recent Activity's existing `max-h-96` precedent because these rows carry more per-row weight (name + role + date + status chip) |
| Postings awaiting approval | `7rem` | `20rem` | same reasoning; rows are taller when a "Send back" note is expanded, so the scroll body (not the card) absorbs that growth — this is exactly what `Container`'s `min-h-0 flex-1 overflow-y-auto` body is for |
| Upcoming Events / Announcements / My Status | rely on `flex h-full` (already present) to match the tallest sibling in their row + an internal list `max-h-64`–`max-h-80` with `overflow-y-auto` | | these already stretch to match siblings; the only fix needed is capping the **inner list**, not the card, so a 20-item announcement feed doesn't blow out the row the way it can today |

**Ordering rule (recommended):** *decision → glance → doors.* Cards with an action verb (Approve, Regularize, Post) sort first because that's what "messy" actually means today — they're buried at the bottom. Read-only glance content (KPIs, feeds) sorts second. Static navigation (Quick Actions) sorts last, unconditionally.

**Alternative rule considered:** *role-conditional first-card* — pin the viewer's own status card (My Status) first for EMPLOYEE and pin the decision zone first only for approver roles. Rejected as the primary rule because it makes the zone order role-dependent (harder to reason about, harder to test) — but it's compatible as a small tweak on top of decision→glance→doors (EMPLOYEE simply has an empty decision zone, so glance is already first for them without special-casing).

---

## 3. Decision summary

**Chosen approach: O2 — priority-ordered zones, single column.** It fixes the actual named complaint (decision cards buried under a dense grid) with the smallest, lowest-risk diff, reuses `.card` and the array+derived-cols technique the codebase already half-does (the `canViewPayroll` 3rd-cell case), and needs no new interaction pattern.

| Alternative | Why rejected (as the primary direction, not discarded) |
|---|---|
| O1 (two-column rail) | Introduces a second independently-scrolling region the codebase has never had; rail height tracking is a new problem; better fit for a bigger redesign than this brief asked for |
| O3 (KPI strip + tabbed action queue) | Highest risk against the fixed Playwright contracts (`<li>` + exact "Approve" button inside a tab panel); requires new empty-state and tab-active logic; best visual payoff but disproportionate risk for a layout-only brief |

### Risk Predictions (5-persona debate on O2)

- **Architect:** Low coupling risk — this is a template reorganization, not a data-shape change. Only concern: the `$derived` card-array-per-zone pattern should be written once as a small helper (or inline convention), not copy-pasted four times, or the "no orphan" property silently breaks in one zone during a future edit.
- **Security:** No new surface — no auth/data change, purely visual regrouping. No STRIDE concerns.
- **Performance:** Neutral to positive — bounding the two alert-card lists with `overflow-y-auto` actually caps DOM paint work for large HR orgs instead of rendering every row unbounded.
- **UX:** Directly answers the brief — decision-first ordering is the single highest-leverage fix for the "headache" complaint. Caution: verify the `min-h-[7rem]` floor doesn't make a 1-item card look empty/awkward next to a 3-item sibling in the decision row — worth a live check at lg width.
- **Devil's Advocate:** Why not just add `max-h` to the two named cards and stop there (skip the reorder)? Because the RESEARCH report's role matrix shows HR_ADMIN/CEO/SUPER_ADMIN get all 12 blocks with the 3 decision cards positioned dead last — a height fix alone doesn't touch the "messy to look at" complaint, which is explicitly about ordering/density, not just scroll overflow.

**Verdict: GO** — no conflicts require resolution; proceed to PLAN with O2 as the base, keeping O1's rail idea and O3's queue-merge idea noted as backlog-able "further overhaul" options if the owner wants to go further later.

### Open decisions the owner must answer (max 3)

1. **Awaiting-you card vs. Pending Approvals tile:** keep both (today's state), fold the tile into the decision zone as a 4th card alongside Regularizations/Postings, or drop the tile and let the decision zone's "Awaiting you" card be the only door to `/requests` etc.?
2. **Decision-zone card width when only 1 card is present** (e.g. a role that only ever sees Postings): let it go full-width like today's amber/blue ribbons, or cap it to a fixed max-width so a lone card doesn't stretch edge-to-edge?
3. **Confirm ordering rule:** decision → glance → doors (recommended), or the role-conditional variant that pins My Status first for EMPLOYEE specifically?

---

**Suggested Phase Ordering (optional):**
```
Phase 1: Bound the two named alert cards (min/max-h + overflow-y-auto) — no dependencies, ships owner's literal ask fastest
Phase 2: Introduce the zone reorder (decision/glance/feed/doors) + array-derived grid-cols — depends on Phase 1's height values being settled
Phase 3: Role-matrix + viewport Playwright coverage for the new zones — depends on Phase 2
```

**Strategy for PLAN phase:** scored 1/7 signals present (S3: 3 directions surfaced) — LOW band. Recommend **sequential** — one `vc-plan-agent` pass is enough; this is a single-page template reorg with a small, well-scoped blast radius (`+page.svelte`, `app.css` if any new utility is added), not a multi-package or multi-phase program.

Feature scope stays `ui-ux-overhaul`; PLAN should continue from `process/features/ui-ux-overhaul/active/dashboard-layout_17-09-26/`. Relevant shared skills for PLAN/EXECUTE: `vc-generate-plan`, `vc-scout` (to confirm no other route reuses these card patterns before extracting a helper), and `impeccable`'s `operate.md` (already loaded here) for the actual visual pass.

Ready to create detailed plan. Say 'go' to move to PLAN mode.

PHASE_COMPLETE: INNOVATE — Decision Summary written

**Status:** DONE
**Summary:** Explored 3 dashboard layouts (two-column rail, priority-ordered single column, KPI-strip + action-queue panel) with lg-width wireframes for admin and employee roles, height numbers for the two unbounded alert cards, and an ordering rule; recommended O2 as lowest-risk fit for the brief, ran a 5-persona GO verdict, and flagged 3 open decisions for the owner.
**Concerns/Blockers:** None blocking — all three open decisions are choices, not unknowns, and PLAN can proceed once the owner answers them (or PLAN can proceed with the stated defaults and surface them as an explicit checklist item).