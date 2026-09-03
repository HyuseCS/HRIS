# Template Builder — Design Brief (pre-implementation)

**Feature:** #178 performance evaluation revamp
**Surface:** `/performance/templates` (list) and `/performance/templates/[id]` (builder)
**Status:** brief only — no code. Written 2026-08-26, before EXECUTE.
**Mode:** Operate. HR is completing a task, not being persuaded. Scanability, consistency and the
real usage scene outrank expression; the brand lives in precise details.

---

## 1. Job and audience

**HR_ADMIN, at a desk, reproducing a paper form they already have in front of them.** They are not
designing an evaluation process — that argument is already settled inside their organization. They
are transcribing a document into the app so it can be issued, filled, signed and stored.

The owner's own framing is the whole brief in one line: *"we only provide the platform for easier
creation of documents."*

Success: HR gets a template that **prints and reads like the paper form they were holding**, on the
first attempt, without asking an engineer for anything. Adding a third template next year is data
entry, not a ticket.

## 2. Outcome and proof

- **Primary task:** compose or duplicate one evaluation template and save it.
- **The proof that it worked is visual, not a success toast.** HR must be able to see the finished
  form take shape as they build it. This is why the preview is not a nice-to-have here — a
  transcription task with no view of the output is guesswork.
- **Real evidence on hand:** two actual HR forms in `docs/references/`. Design against those, not
  against a toy two-field example. Note they are *structurally* the evidence — the AE form's
  personal data was stripped and must never be seeded.

## 3. Selected direction

**Visual authority: the incumbent Veent HRIS system, preserved.** This is an extension, not a
rebrand. Tokens in `src/app.css`, Veent Red `#CC1515` used sparingly for primary action and focus,
`rounded-lg border bg-card p-4` section cards, `--radius: 0.625rem`, small dense type, both themes.
Extend `src/lib/components/ui/` rather than starting a parallel kit — use `PageHeader` (not a
hand-rolled `<h1>`; the onboarding page predates it), `EmptyState`, `ConfirmButton`,
`ConfirmDialog`, `Toaster`.

**Structural thesis — one loud zone, four quiet ones.** The template has six repeatable list types.
Treating them as six equal stacked sections produces a wall of inputs where the important thing is
invisible. Split by what HR actually spends their time on:

- **Loud — "The form":** categories and their criteria. This is the substance and the only part
  that differs meaningfully between templates. It gets the space, the largest hit targets and the
  top of the page.
- **Quiet — "Scoring labels" (rating scale, interpretation bands), "Narrative blocks",
  "Recommendation checklist", "Signing order":** collapsible sections, sensibly pre-filled from the
  seeded template, opened only when HR needs to differ from the default. Most templates will not
  touch four of these.

**Interaction thesis — one draft, one Save.** Confirmed with the owner. The whole template is edited
client-side and committed by a single Save. This matches the one-JSON-column storage design and
avoids ~40 server round-trips to compose a five-category form. It deliberately diverges from
`settings/onboarding`'s per-row `?/move` / `?/save` actions; note the divergence in a comment so the
next reader sees a decision rather than an inconsistency.

**Focal moment:** the live preview updating as HR types a criterion. That is the moment the screen
proves it is a document builder and not a settings form.

### Implementation consequence — the preview must not be a second implementation

The preview renders through **the same component the evaluator's real review form uses**, in a
read-only mode. If the preview is a separate approximation of the form, it will drift, and a
drifting preview is worse than none — it teaches HR to trust a lie. One component, two modes.

## 4. Scope and boundaries

**In scope:** the templates list page, the builder page, their empty and error states, both themes,
desktop and mobile.

**Untouched:** the review-filling surface, the sign-off surface, the release gate, the cadence
setting, and every non-performance route. The RBAC, redaction and snapshot behaviour specified in
the plan is product truth here, not something this brief may reopen.

**Anti-goals — do not build these:**

- **No drag-and-drop reordering.** The app already has an accessible, touch-safe, keyboard-reachable
  ordering pattern: `↑` / `↓` buttons (`settings/onboarding/+page.svelte:104-123`). Drag-and-drop
  costs a keyboard fallback, a touch story and a live-region announcement to reach the same place.
- **No auto-save.** The owner chose an explicit Save; a half-autosaved template is a worse failure
  than a lost draft.
- **No rich-text editing** anywhere in the template. These are labels on a printed form.
- **No scoring engine, no computed review totals** — see §6.

## 5. States and ranges

Design for the two real forms, verify at double:

| | Typical | Design must survive |
|---|---|---|
| Categories | 4–6 | 12 |
| Criteria per category | 4–6 | 15 |
| Rating-scale rows | ~5 | 10 |
| Interpretation bands | ~5 | 10 |
| Narrative blocks | 4 | 8 |
| Signatories | ~4 | 8 |

States that must be designed, not discovered:

- **List page, first run:** two seeded templates exist, so a truly empty list is rare — but design
  `EmptyState` (`variant="empty"`) anyway for a fresh organization, with "Create template" as the
  way forward.
- **Duplicate is the high-value action.** HR's second form is a variation of their first. "Duplicate"
  must be as reachable as "Create" on the list page — the fastest path to a third template is
  copying the second, not starting from nothing.
- **New template:** starts with one empty category holding one empty criterion, not a blank void.
  A blank canvas with an "Add category" button makes HR guess the shape.
- **Unsaved draft:** a single Save means leaving the page loses work. Guard it — a native
  `beforeunload` for tab close, and `ConfirmDialog` for in-app navigation. Non-negotiable: this is
  data loss, not polish.
- **Validation failure on Save:** errors must appear **on the offending row**, and the page must
  scroll to the first one. A single banner at the top of a 60-input page is not usable.
- **A template already in use.** Editing it must state plainly that reviews already opened are
  unaffected, because they carry a snapshot. HR will otherwise assume they are rewriting history —
  or worse, assume they are not when they think they are.
- **Saving / busy:** reuse `createSubmitGuard` and its `…` idiom, consistent with the rest of the app.

## 6. The rule the interface itself must carry

**The app performs no arithmetic on evaluation scores.** HR calculates. The evaluator types every
rating, every subtotal and the overall total, and picks the band. Weights, maxima and band tables
are display-only labels.

This is a design problem, not only an engineering one: a screen full of weight fields and maxima
*looks* like a calculator, and HR will assume totals are computed unless the interface says
otherwise. So:

- Label the weight and maximum inputs as what they are — **text that will be printed on the form** —
  in the field hints, not in a paragraph nobody reads.
- The preview must show subtotal and total lines as **empty boxes the evaluator will write in**, not
  as computed zeroes. A preview showing `0 / 100` teaches exactly the wrong model.

**One deliberate exception, and it earns its place.** In the *builder only*, show a non-blocking hint
when the category weights do not add to 100% — e.g. *"Weights add to 95%."* This is not a scoring
engine: it is never stored, never reaches a review, and blocks nothing. It exists because **this
exact error is already present in HR's real paper form** — the Admin Staff form prints 30/20/20/10/15
on its headers and 30/20/20/15/15 in its summary table. Catching that at authoring time is the
single highest-value thing this screen can do that paper cannot.

**It must not leak.** The hint belongs to the builder and must never appear on the review form.
Keep the plan's structural guard (item 134) intact — it forbids `.reduce(` in
`reviews/[id]/+page.svelte`, which is the right boundary and is unaffected by a hint in the builder.

## 7. Interaction and layout

**Topology, desktop (`xl` and up):** two panes. Editor left (~60%), preview right (~40%), preview
sticky so it stays visible while the editor scrolls. A sticky bottom action bar carries Cancel and
Save with the unsaved-changes state.

**Below `xl`:** the panes stack and the preview becomes a segmented **Editor / Preview** toggle.
Never render a 40%-wide preview on a tablet — it is legible in neither pane. On mobile the builder
is a long single column; that is acceptable for what is fundamentally a data-entry task.

**Category card:** a bordered `bg-card` block, collapsible, with the category name, its weight label
and its subtotal label on one row, then its criteria beneath. Collapsed state shows name, weight and
a criterion count so a 12-category template stays navigable.

**Criterion row:** number, the criterion text input, and a remove control. Remove is
`ConfirmButton`-guarded only when the row has content — confirming the deletion of an empty row is
friction for nothing.

**Ordering:** `↑` / `↓` on categories, on criteria within a category, and on signatories. Disabled at
the ends, matching the existing pattern. Each control needs a real accessible name — "Move
*Sales Performance* up", not "Move up" repeated 40 times on one page.

**Keyboard:** the whole builder must be operable without a mouse, and adding a criterion must place
focus in the new input. The plan already gates this with an agent-probe Tab pass; design for it
rather than retrofitting.

**Motion:** minimal and functional — the collapse/expand transition and nothing else. Respect
`prefers-reduced-motion`.

## 8. Constraints and open decisions

- Svelte 5 runes (`$state`, `$derived`, `$props`), Tailwind v3, tokens only — no raw hex, no
  parallel colour scale.
- `{@const}` must be an immediate child of a block tag. A nested-repeatable builder is exactly where
  this bites; the onboarding page's `{@const save = saveGuard(item.id)}` inside `{#each}` is the
  correct shape to copy.
- Both themes must be checked, not assumed. Dark mode here is `--card: 0 0% 11%` against
  `--background: 0 0% 6%`; nested cards inside cards can flatten to invisibility.
- Every criterion and category needs a **stable client-side id** for `{#each … (key)}` and for the
  `answers` JSON keying. Reordering rows without stable keys corrupts which answer belongs to which
  criterion — a data bug wearing a UI costume.
- **Not decided here, and a builder must not invent it:** whether HR can delete a template that has
  already been used by a review. The plan's snapshot design makes it technically safe; whether it
  should be offered is the owner's call.

## 9. What would make this wrong even if it looked polished

1. A preview that does not match the real review form.
2. Any computed score reaching a review.
3. Losing an unsaved draft silently.
4. Reordering that scrambles which answer belongs to which criterion.
5. A screen that is beautiful at three criteria and unusable at forty.
