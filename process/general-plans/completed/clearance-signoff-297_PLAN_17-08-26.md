---
name: plan:clearance-signoff-297
description: "#297 only — whoever cleared a clearance item may not finalize that separation; nobody finalizes their own; an already-cleared item may not be touched by a second person"
date: 17-08-26
feature: general-plans
complexity: SIMPLE
spec: process/general-plans/active/separation-of-duties-298-297_SPEC_17-08-26.md
---

# #297 — Clearance sign-off separation of duties

Date: 17-08-26
Status: DRAFT — awaiting VALIDATE
Complexity: SIMPLE

## Overview

**TL;DR** — Add three refusals to the separation service: (D4) you cannot finalize your own
separation, (D3) you cannot finalize a separation whose clearance items you cleared, and (D8) you
cannot touch a clearance item that a different person already cleared. All three live in
`src/lib/server/services/separation.ts`. One shared exported helper produces the refusal message so
the server guard and the greyed-out Finalize button can never disagree. Tests come first: the area
has **zero** tests today, so a characterization baseline is written and proven green before any
guard lands.

**Scope fence.** This plan touches ONLY:

- `src/lib/server/services/separation.ts`
- `src/routes/(app)/separations/[id]/+page.server.ts`
- `src/routes/(app)/separations/[id]/+page.svelte`
- `tests/unit/separation-*.test.ts` (3 new files)

Payroll, `prisma/schema.prisma`, and the audit-log pages are owned by the parallel #298 agent. This
plan adds **no schema change at all** — every column it reads (`ClearanceItem.status`,
`ClearanceItem.clearedById`, `Employee.userId`) already exists.

---

## Acceptance Criteria (Goals)

| # | Goal | SPEC criterion |
|---|---|---|
| G1 | A person who cleared ≥1 item on a case is refused at finalize, with a reason | AC-3.1 |
| G2 | A person who cleared nothing finalizes normally, and the finalize still does all its work | AC-3.2 |
| G3 | The screen warns before the first tick that clearing will bar finalizing | AC-3.3 |
| G4 | Single-HR tenants are not stranded — the CEO is the named escape route, in the message | AC-3.4 |
| G5 | Cases already open still complete | AC-3.5 |
| G6 | Who may tick an item is otherwise unchanged | AC-3.6 |
| G7 | Nobody finalizes their own separation; another admin can | AC-4.1, AC-4.2 |
| G8 | The self refusal reads like the existing offboard refusal | AC-4.3 |
| G9 | The self bar and the clearer bar are independent and ordered | AC-4.4 |
| G10 | An already-cleared item cannot be re-cleared or un-cleared by a second person, and the D3 bar cannot be defeated by the un-clear-then-clear route | AC-9.1, AC-9.2, AC-9.3, AC-9.4, AC-9.5 |
| G11 | Every guard is mutation-checked and proven live, refusal AND success | AC-5.1, AC-5.3 |
| G12 | A characterization baseline pins current behaviour before the change | AC-5.2 |

## Non-goals (out of scope, one line each)

| Item | Why not here |
|---|---|
| Per-department clearance (#297 Option 3) | Rejected by D3 — the department data does not exist (free text matching no real department; "Immediate Supervisor" is a relationship). |
| A clearance history table | Offered and declined by the owner as too big for now; D8 is the cheaper defence of the same hole. |
| No-undo-after-finalize | SPEC out-of-scope item 8, filed as #304 — finalize stays permanent; this plan adds no new path to it. |
| Final-pay understatement | SPEC out-of-scope 9 — an arithmetic correctness problem, not a "who may press the button" problem. |
| A remedy for the D8 stranding path (a wrongly-ticked item whose clearer has left) | Recorded only — see §Risks. It is a direct consequence of the owner's locked D8 decision (confirmed 18-08-26, AC-9.1–AC-9.5). No remedy is designed here, no issue is filed. |
| Nothing stops the SUBJECT clearing their own items | `setClearanceItem` has no self-check. Related to D8 but a **distinct** hole and not in the locked decisions. Record it, do not fix it here. |
| Anything payroll (#298) | Owned by a parallel agent; do not touch `prisma/schema.prisma`, payroll services, or the audit-log pages. |
| Filing any GitHub issue | Outward-facing; needs explicit owner approval (D6 PROPOSED). |

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/services/separation.ts` | READ+WRITE — new pure predicate `clearedAnyItem`, new async helper `finalizeBarFor`, D8 precondition in `setClearanceItem`, two new guards in `finalizeSeparation` |
| `src/routes/(app)/separations/[id]/+page.server.ts` | WRITE — `load` returns `finalizeBar: string \| null` |
| `src/routes/(app)/separations/[id]/+page.svelte` | WRITE — disable Finalize + show the reason; add the up-front clearing warning |
| `tests/unit/separation-characterization.test.ts` | NEW (step 1, before any guard) |
| `tests/unit/separation-finalize-sod.test.ts` | NEW |
| `tests/unit/separation-clearance-reclear.test.ts` | NEW |
| `src/lib/server/services/employees.ts` | READ ONLY — `offboardEmployee` at :1206-1218 is the wording/placement precedent |
| `src/lib/server/services/approvals.ts` | READ ONLY — `:119` pure-predicate shape, `:636-639` explicit-message-above-generic shape |

## Public Contracts

**New exports from `src/lib/server/services/separation.ts`:**

```
export interface ClearanceActorRef { status: string; clearedById: string | null }
export function clearedAnyItem(items: ClearanceActorRef[], actorId: string): boolean
export async function finalizeBarFor(
  record: { employee: { id: string }; clearanceItems: ClearanceActorRef[] },
  actorId: string
): Promise<string | null>
```

`finalizeBarFor` returns the refusal **message** or `null`. It is the ONE source of truth for both
the server 403 and the cosmetic UI flag — this is why the button and the guard cannot drift apart.

**New behaviour (refusals only, no signature changes):**

| Function | New outcome |
|---|---|
| `finalizeSeparation` | 403 when the actor is the separated employee's user |
| `finalizeSeparation` | 403 when the actor cleared ≥1 item on that case |
| `setClearanceItem` | 403 when the item is already `CLEARED` by a different person |

**New page-data field:** `data.finalizeBar: string | null` on `/separations/[id]`. It is a
sentence already safe to render (no user id, no employee id, no name — see §6.3).

Nothing is removed. No capability, no role, no schema column, no route changes.

## Blast Radius

| Dimension | Value |
|---|---|
| Files changed | 3 source + 3 new test files |
| Packages | 1 (single SvelteKit app) |
| Schema | **none** |
| New auth mechanism | **none** — #282 left exactly two, and this adds no third: `requireAnyCapability` still does the capability work; the new bars are object-level actor comparisons, which is established shape 1 (same-actor comparison, #283) |
| Risk class | permission / trust-boundary logic, plus an irreversible money-adjacent write downstream of it |
| Callers affected | ONE: `src/routes/(app)/separations/[id]/+page.server.ts:57`. No v1 API twin exists today. |
| Data at risk | none written by this change; the risk is a WRONGLY-BLOCKED finalize, not a wrongly-allowed one |

**Why service, not route.** The usual argument ("covers the form action and the API twin") is
genuinely **weaker here — there is no twin yet**. Say so honestly. Service still wins on two
grounds: it is the house convention (`offboardEmployee`, `voidRun`, and the #224 epic all put the
guard in the service), and a twin under `src/routes/api/v1/` is the kind of thing that gets added
later by somebody who will not re-read this plan.

## Implementation

### 6.1 `separation.ts` — the pure predicate (insert after `getSeparation`, before `setClearanceItem`, ~line 117)

```
export interface ClearanceActorRef { status: string; clearedById: string | null }

// #297/D3: whoever ticked any box on this case may not close it out. A PURE function on purpose —
// approvals.ts:119 (decidedActorIds) is the same shape, and it makes the rule testable with zero
// DB mocks. This repo's documented failure mode is exactly the vacuous mock (all-tests.md, five
// recorded cases), so the ~10 extra lines buy a test that cannot lie.
// Un-cleared items carry a null clearedById, so a re-opened item stops barring its clearer.
export function clearedAnyItem(items: ClearanceActorRef[], actorId: string): boolean {
	return items.some((i) => i.status === 'CLEARED' && i.clearedById === actorId)
}
```

### 6.2 `separation.ts` — the shared bar helper (insert immediately after `clearedAnyItem`)

```
export async function finalizeBarFor(
	record: { employee: { id: string }; clearanceItems: ClearanceActorRef[] },
	actorId: string
): Promise<string | null> {
	// SCOPED query, not a widened getSeparation select: userId is an identity column and
	// getSeparation's result goes straight to the client. This repo has shipped a select that
	// leaked a field it did not need twice (#111, #290). One extra indexed lookup is the cheaper bug.
	const employee = await db.employee.findUnique({
		where: { id: record.employee.id },
		select: { userId: true }
	})
	// #297/D4: mirrors offboardEmployee (employees.ts:1216) — finalize does the same destructive
	// thing (OFFBOARDED + isActive=false) plus writes off the actor's own loans.
	if (employee?.userId === actorId) {
		return 'You cannot finalize your own separation — ask another admin to do it.'
	}
	// #297/D3.
	if (clearedAnyItem(record.clearanceItems, actorId)) {
		return 'You cannot finalize a separation whose clearance items you cleared — ask another HR administrator, or your CEO, to finalize it.'
	}
	return null
}
```

**Status code (VALIDATE G4, N2):** the self refusal is **403, not** `offboardEmployee`'s 400 —
four existing self-action bars already use 403 (`approvals.ts:231`, `employee-access.ts:136`,
`action-proposals.ts:71` and `:80`) against that single 400, and AC-4.3 asks only for consistent
wording and placement. `self-guard-consistent-with-offboard` must therefore **not** assert the
status code. The full reasoning is in §Validate Contract → G4.

**Message rules, both load-bearing:**

- **No name is resolved.** `ClearanceItem.clearedById` and `SeparationRecord.finalizedById` are
  bare `String?` columns with **no FK to `User`**, so a name needs a second lookup. It is not worth
  it: the barred actor **IS** the clearer, so a self-referential message is fully actionable and
  leaks nothing.
- **The CEO is named explicitly.** JoJo Potato and Sweetleaf each have exactly one active
  `MANAGE_HR` holder and ship with **no carve-out and no exemption**. The CEO is cross-org and
  reaches `/separations` in both (verified live). Naming them in the message is the entire
  small-tenant mitigation — do not soften it to "another administrator".

### 6.3 `separation.ts` — `setClearanceItem` D8 precondition (insert after the FINALIZED check, currently `:129`)

```
	// #297/D8: an item already cleared by somebody else is theirs. Without this the D3 bar is
	// trivially defeatable — B un-ticks A's item (which NULLs clearedById), re-ticks it, becomes
	// the clearer, and can wipe their own bar the same way. Chosen over a full clearance history
	// table, which the owner declined as too big for now.
	//
	// Covers BOTH directions (re-clear AND un-clear) — owner-confirmed 18-08-26, SPEC AC-9.1 and
	// AC-9.2, with AC-9.4 naming the two-step defeat route this closes. The UI's only path to
	// re-clearing is un-clear-then-clear, so barring only the re-clear would leave the defeat intact.
	if (item.status === 'CLEARED' && item.clearedById && item.clearedById !== ctx.actorId) {
		error(403, 'This clearance item was already cleared by someone else. Only they can change it.')
	}
```

Note this is a NULL-safe check: a legacy `CLEARED` row with a null `clearedById` (none exist today,
but nothing enforces it) stays editable rather than becoming permanently frozen. That is the safe
failure direction.

### 6.4 `separation.ts` — `finalizeSeparation` guard order (currently `:228-234`)

Final order, and **the order is load-bearing** — a test pins it:

| # | Guard | Status | Why here |
|---|---|---|---|
| 1 | already finalized → 409 | unchanged (`:230`) | a **state** fact about the record, not about the actor; must stay first or a barred actor is told the wrong thing about a case that is already closed |
| 2 | self-finalize → 403 | **NEW** | the more fundamental refusal, and it mirrors `offboardEmployee`, which places its self-guard FIRST right after the fetch |
| 3 | cleared-an-item → 403 | **NEW** | |
| 4 | pending items → 409 | unchanged (was `:232`) | |
| 5 | compute + transaction re-check | unchanged (`:235-271`) | |

**Why BOTH new bars sit ABOVE pending-items.** Pending-items is a *fixable* refusal — its implicit
instruction is "go clear the rest". The SoD bars are **not fixable by this actor at all**. Worse,
under D3 every item they clear **deepens their own bar**. Telling a barred actor to go clear more
items is not merely unhelpful, it is actively wrong advice that walks them further into the wall.
This is the same reasoning as `approvals.ts:636-639`, where the specific message is kept above the
generic check precisely so the generic one cannot swallow it.

Edit at `:229-233`:

```
	const record = await getSeparation(id, organizationId)
	if (record.status === 'FINALIZED') error(409, 'Separation is already finalized')

	const bar = await finalizeBarFor(record, ctx.actorId)
	if (bar) error(403, bar)

	const pending = record.clearanceItems.filter((i) => i.status !== 'CLEARED').length
	if (pending > 0) error(409, `Cannot finalize — ${pending} clearance item(s) still pending`)
```

`finalizeSeparation` needs **no extra clearance query** — `getSeparation` at `:229` already loads
every clearance item.

### 6.5 `+page.server.ts` — surface the bar (cosmetic)

In `load`, after the `finalPay` computation:

```
	// Cosmetic affordance only — finalizeSeparation is the enforcement (house rule: a UI check is
	// never enforcement, auth/all-auth.md). Same helper, so the button and the guard cannot drift.
	const finalizeBar =
		separation.status === 'FINALIZED'
			? null
			: await finalizeBarFor(separation, user.id)

	return { separation, finalPay, finalizeBar }
```

Add `finalizeBarFor` to the existing import from `$lib/server/services/separation`. No change to
either action — the `isHttpError` branch already turns the 403 into `form.error`, which the page
already renders at `:48-54`.

### 6.6 `+page.svelte` — disable + warn

1. After `const pendingCount = ...` (`:12`):
   ```
   const finalizeBar = $derived(data.finalizeBar)
   ```
2. In the clearance-checklist header block (inside the `border-b` div, after the `h2` at `:85`),
   add the up-front warning (AC-3.3), shown only while the case is open:
   ```
   {#if !isFinalized}
     <p class="mt-1 text-xs text-amber-600">
       Marking any item cleared here means you will not be able to finalize this case.
       Another HR administrator, or your CEO, will have to finalize it.
     </p>
   {/if}
   ```
   Place it as its own block below the header row, not inside the flex row, so it does not fight
   the `justify-between` counter.
3. In the Finalize card, after the `pendingCount` warning (`:163-168`):
   ```
   {#if finalizeBar}
     <p class="mt-2 text-sm text-amber-600">{finalizeBar}</p>
   {/if}
   ```
4. Change the button `disabled` at `:172` to:
   ```
   disabled={pendingCount > 0 || !!finalizeBar || finalize.busy}
   ```

This mirrors the existing `canVoid` / `canUnlock` / `canReveal` convention: the flag hides the
affordance, the service refuses the request.

## Existing open cases (AC-3.5) — explicit answer

Checklists are frozen once a case opens, and items may already be `CLEARED` with a `clearedById`
recorded by the current schema. Three consequences, all benign:

1. **No migration, no backfill.** Every column the guards read already exists and is already
   populated by today's `setClearanceItem`.
2. **An in-flight case whose items were all cleared by admin A becomes finalizable only by someone
   other than A.** That is the intended new rule applying retroactively, and it is *completable* —
   any other `MANAGE_HR` holder, or the CEO, closes it. Nothing is bricked.
3. **A legacy `CLEARED` row with a null `clearedById` bars nobody and freezes nobody** (§6.3). Safe
   direction on both guards.

Live check `L5` (§Live verification) proves this against a case created before the guard ships.

## Verification Evidence

Runner: **vitest** — `pnpm test`. There is no `test:unit` script.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `separation-characterization` — finalize happy path writes finalPayAmount + OFFBOARDED + isActive=false; pending → 409; already-finalized → 409 | Fully-Automated | AC-5.2 |
| `clearedAnyItem` predicate: actor cleared → barred | Fully-Automated | AC-3.1 |
| `clearedAnyItem` predicate: only others cleared → allowed | Fully-Automated | AC-3.2 |
| `clearedAnyItem` predicate: nobody cleared → allowed | Fully-Automated | AC-3.2 |
| `clearedAnyItem` predicate: item un-cleared (status PENDING / `clearedById` null) → allowed | Fully-Automated | AC-3.2 |
| `finalize-refuses-clearer` — service 403 + nothing mutated | Hybrid (unit + L2) | AC-3.1 |
| `finalize-allows-clean-actor` — **negative control**: resolves AND `finalPayAmount`, `OFFBOARDED`, `isActive:false` writes asserted | Hybrid (unit + L3) | AC-3.2 |
| `finalize-refuses-self` — actor is the separated employee's user → 403 | Hybrid (unit + L4) | AC-4.1 |
| `finalize-allows-other-for-self-case` | Hybrid (unit + L4) | AC-4.2 |
| `finalize-guards-independent` — actor is BOTH subject and clearer → message is the SELF one, not the clearance one (pins order) | Fully-Automated | AC-4.4 |
| `finalize-bar-above-pending` — barred actor on a case with pending items gets the 403 bar, not the pending 409 (pins order) | Fully-Automated | AC-4.4 |
| `self-guard-consistent-with-offboard` — the self message matches `offboardEmployee`'s wording style ("ask another admin to do it") | Fully-Automated | AC-4.3 |
| `reclear-refused-for-other-actor` — already-CLEARED item, different actor, `cleared=true` → 403, no update | **Hybrid (unit + L2c)** | AC-9.1 |
| `unclear-refused-for-other-actor` — same item, `cleared=false` → 403, no update | **Hybrid (unit + L2b)** | AC-9.2 |
| `reclear-allowed-for-original-clearer` — A un-ticks their OWN item, then re-ticks it; both calls succeed and `clearedById` ends back at A | **Hybrid (unit + L2d)** | AC-9.3, AC-3.6 |
| `d3-not-defeatable-by-reclear` — **the end-to-end defeat walk, one named test, one sequence**: A cleared the item; B calls `setClearanceItem(cleared=false)` → 403 and NO update; B then calls `setClearanceItem(cleared=true)` on the same item → 403 and NO update; `clearedById` is still A; finally `finalizeSeparation` as B still refuses. Written as its own test, NOT as a consequence of `unclear-refused-for-other-actor` + `reclear-refused-for-other-actor` | **Hybrid (unit + L2e)** | AC-9.4 |
| `clear-pending-item-unchanged` — a PENDING item is still clearable by anyone with MANAGE_HR | Fully-Automated | AC-9.5, AC-3.6 |
| `existing-cases-unaffected` — a pre-existing case with a null `clearedById` on a CLEARED item stays editable and finalizable | Hybrid (unit + L5) | AC-3.5 |
| L1–L6 live browser walkthrough (§Live verification) | Agent-Probe | AC-3.4, AC-5.1 |
| Mutation checks M1–M8 (§Mutation checks), including the two DELETE mutations M7/M8, results recorded | Fully-Automated | AC-5.3 |

### TDD stubs (red-first, for the fully-automated rows)

```
test("clearedAnyItem: actor cleared an item -> barred", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: actor cleared -> barred")
})
test("finalize-refuses-self", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: actor is the separated employee -> 403")
})
test("finalize-guards-independent", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: subject AND clearer -> SELF message")
})
test("reclear-refused-for-other-actor", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: already-cleared item, different actor -> 403")
})
test("d3-not-defeatable-by-reclear", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-9.4 — B un-clears A's item, then clears it; refused at BOTH steps, clearedById still A, and B still cannot finalize")
})
```

### Test file layout and mock shape

Copy the mock harness from `tests/unit/offboard-self-guard.test.ts` — same `vi.hoisted` +
`vi.mock('$lib/server/db')` + `vi.mock('$lib/server/audit')` shape.

`separation.ts` also imports `./offboarding`, `./payroll/compensation` and
`$lib/server/notifications`. For the finalize tests, mock `$lib/server/notifications` (unused on this
path but imported at module load) and let `currentCompensation` run for real; `computeFinalPay`
needs `db.employee.findUniqueOrThrow`, `db.employeeCompensation.findMany`, `db.leaveBalance.findMany`,
`db.loan.findMany`, `db.cashAdvance.findMany` mocked. Keep the fixtures minimal — the arithmetic is
NOT under test here (out of scope 9), only that the writes happen.

`db` methods to stub: `separationRecord.findFirst` (via `getSeparation`), `separationRecord.updateMany`,
`employee.findUnique`, `employee.findUniqueOrThrow`, `employee.update`, `clearanceItem.findFirst`,
`clearanceItem.update`, `clearanceItem.count`, `loan.updateMany`, `cashAdvance.updateMany`,
`user.updateMany`, `$transaction` (implement as `async (fn) => fn(dbMock)`).

## Live verification (Agent-Probe)

**Preconditions.** The **user** starts the dev server — never the agent. `separation_records` is
**EMPTY in dev**, so a case must be opened by hand first.

Discover the actors:

```
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc \
  "select email, \"organizationId\", roles, \"isActive\" from users where roles && ARRAY['HR_ADMIN','SUPER_ADMIN','CEO','MANAGER']::\"Role\"[] order by \"organizationId\";"
```

Login harness (dev only):

```
curl -s -c /tmp/cj.txt -X POST http://localhost:5173/api/v1/_dev/login-as \
  -H 'content-type: application/json' -d '{"email":"<EMAIL>"}'
```

| # | Step | Expected |
|---|---|---|
| L0 | As admin **A** (Veent, MANAGE_HR): `/separations` → create a case for an employee who is NOT A. Plant a marker in the `reason` field, e.g. `SOD297-CASE-1`. | Case opens; clearance items seeded from the template |
| L0b | `select id,status from separation_records where reason='SOD297-CASE-1';` | one OPEN row — this is the id used below |
| L1 | Open `/separations/<id>` as A **before** ticking anything | The amber warning "Marking any item cleared here means you will not be able to finalize this case" is visible. **Screenshot it.** Assertions do not see layout. |
| L2 | As A, tick **every** item, then press Finalize | Button is disabled and the clearer message is shown. Force the POST with curl to prove the SERVER refuses too → 403 with the clearance message. `select status,\"finalizedById\" from separation_records where id='<id>';` → still not FINALIZED |
| L2b | As admin **B**, try to un-tick one of A's items | 403 "already cleared by someone else"; `select \"clearedById\" from clearance_items where id='<item>';` → unchanged (D8) |
| L2c | As admin **B**, tick (RE-clear) one of A's already-cleared items — use the checkbox in the clearance checklist on `/separations/<id>`; force the POST with curl if the box is disabled | 403 "already cleared by someone else". `select \"clearedById\",status from clearance_items where id='<item>';` → still A's user id, still `CLEARED` (AC-9.1 refusal side) |
| L2d | As admin **A** (the original clearer), un-tick that same item, then tick it again | **Both succeed.** After the un-tick: `select status,\"clearedById\" from clearance_items where id='<item>';` → `PENDING`, `clearedById` null. After the re-tick: → `CLEARED`, `clearedById` = A's user id. This is the success side of the same control — the item is not frozen, it is A's (AC-9.3) |
| L2e-pre | **Set up the two-item state.** L2 left every item cleared by A, so B owns nothing yet. As **A**, un-tick `ci2` (allowed — A is its clearer; this is the same operation L2d proves). Then as **B**, tick `ci2` (allowed — the item is now `PENDING` and nobody has cleared it, AC-9.5). | `select id,status,\"clearedById\" from clearance_items where \"separationRecordId\"='<id>';` → `ci1` `CLEARED`/A and `ci2` `CLEARED`/B. Both operations use only permitted paths — if either is refused, D8 is over-blocking and that is a defect, not a setup problem |
| L2e | **The defeat route, end to end. Needs a TWO-item case — see the note below.** Item `ci1` cleared by **A**, item `ci2` cleared by **B**, so B is already barred and has a motive to launder ownership of `ci1`. As admin **B**: (1) POST the un-tick on `ci1`, (2) POST the tick on `ci1`, (3) POST Finalize. Use curl for all three so no disabled control hides the result | (1) 403 "already cleared by someone else". (2) 403, same message. (3) 403 with the clearer bar. After all three: `select status,\"clearedById\" from clearance_items where id='<ci1>';` → `CLEARED`, `clearedById` = A; `select status,\"finalizedById\" from separation_records where id='<id>';` → still `OPEN`, `finalizedById` null. B changed nothing and gained nothing (AC-9.4) |

> **Why L2e needs two items, and why the one-item version of this step was wrong.**
> The original step used a single item cleared by A and expected B's finalize at (3) to be
> refused. **On a one-item case that expectation is false, and the plan would have failed a
> correct implementation.** Steps (1) and (2) are refused precisely as designed, so B never
> becomes a clearer of anything — and an uninvolved B is *supposed* to finalize. That is L3.
>
> The defeat route only means something when B is **already barred**. Then D8 is what stops B
> from laundering A's tick into their own name, un-clearing it, and wiping their own bar. So
> `ci2` must be cleared by B first. The unit test `d3-not-defeatable-by-reclear` was built this
> way; this step now matches it.
>
> Confirmed by the owner 18-08-26.
| L3 | As admin **B** (uninvolved, MANAGE_HR), press Finalize | Succeeds. `select status,\"finalPayAmount\",\"finalizedById\" from separation_records where id='<id>';` → FINALIZED, amount non-null, finalizedById = B. `select \"employmentStatus\" from employees where id='<emp>';` → OFFBOARDED. `select \"isActive\" from users where id=...;` → false. **Assert the DB row, not the screen.** |
| L4 | Open a case for admin **A's own** employee record (marker `SOD297-SELF`), have **B** tick all items, then A presses Finalize | 403 with the self message. Then B finalizes → succeeds |
| L5 | **Existing-case control.** Before applying the guards, open case `SOD297-LEGACY` and tick items as A. Apply the guards, restart, reload the page | Page still loads, checklist intact, B can still finalize. Nothing about the frozen checklist broke |
| L6 | **CEO escape route.** Login as the CEO, `POST /api/v1/session/switch-org` into `org_jojo`, then `org_sweetleaf`. Open a case in each, tick as the single local HR holder, finalize as the CEO | The CEO reaches `/separations`, sees the create affordance, and finalizes. This is the whole small-tenant mitigation — if it fails, STOP and report; the no-carve-out decision rests on it |

Run L1–L4 plus L2b–L2e **before AND after** the change, with the same script, keeping the negative
controls (L2d's two successes, L3, and L4's second half) on both sides (`verify-live-before-and-after.md`). Before the change, L2 and L4 must SUCCEED — that is
what proves the harness can actually observe the difference.

## Mutation checks (AC-5.3 — run them, record the results)

| # | Break this on purpose | This test MUST go red |
|---|---|---|
| M1 | In `clearedAnyItem`, drop the `i.clearedById === actorId` comparison (return `items.some(i => i.status === 'CLEARED')`) | `finalize-allows-clean-actor` (a clean actor is now wrongly barred) |
| M2 | In `clearedAnyItem`, invert to `!==` | `finalize-refuses-clearer` |
| M3 | In `finalizeBarFor`, move the self check BELOW the clearer check | `finalize-guards-independent` (message becomes the clearance one) |
| M4 | In `finalizeSeparation`, move the `bar` block BELOW the pending-items check | `finalize-bar-above-pending` |
| M5 | In `setClearanceItem`, drop the `item.clearedById !== ctx.actorId` clause | `reclear-allowed-for-original-clearer` |
| M6 | In `setClearanceItem`, gate the D8 check on `cleared === true` only | `unclear-refused-for-other-actor`, and `d3-not-defeatable-by-reclear` at its step 1 |
| **M7 — DELETE** | In `finalizeBarFor`, delete the whole `if (employee?.userId === actorId) { return … }` block outright (not reorder, not weaken — remove it) | `finalize-refuses-self` |
| **M8 — DELETE** | In `finalizeSeparation`, delete the whole `if (bar) error(403, bar)` line outright | `finalize-refuses-clearer` **and** `finalize-refuses-self` must BOTH go red, plus `d3-not-defeatable-by-reclear` at its finalize step |

M7 and M8 are the strongest checks in this table: a guard whose *removal* leaves the suite green is
not proven at all. M1–M6 only perturb the guards; only M7/M8 prove the tests depend on them existing.

A mutation check written in a plan is a hypothesis. Only running it makes it evidence — paste the
red output into the execution report.

## Risks

| Risk | Mitigation |
|---|---|
| D8 stranding: once A clears an item, ONLY A may change it — so if A ticks an item in error and then leaves the company (or is deactivated, or is simply away), that item can never be un-cleared and the case can never be finalized | **Recorded consequence of the owner's locked decision, not a defect to fix here.** D8 was confirmed on 18-08-26 in both directions and carries AC-9.1–AC-9.5; the clearance-history table that would have solved this was declined by the owner as too big for now. The AC-3.5 / L5 answer covers *finalizing* legacy cases, NOT *correcting a wrong tick* — a different problem. No remedy is designed here and no issue is filed. |
| D8's both-directions reading (bar un-clear too, not just re-clear) | **No longer an interpretation.** The owner confirmed D8 on 18-08-26 in **both** directions, and the SPEC now carries AC-9.1 (re-clear refused), AC-9.2 (un-clear refused), AC-9.3 (original clearer still free), AC-9.4 (the defeat route) and AC-9.5 (fresh items unchanged). §6.3's rationale stands as the reason: the UI's only re-clear path is un-clear-then-clear, so a re-clear-only bar would leave the defeat fully intact. |
| Wrongly-blocked finalize at a small tenant | The CEO route is named in the message AND proven by L6. No carve-out ships. |
| Unit tests mock the DB and cannot prove a permission hole | Every guard has a live gate (L2, L2b, L3, L4) with a psql assertion, plus a before-and-after run. |
| The e2e suite is flaky (#287) | Do not add a Playwright spec. Use the ad-hoc driven-browser + `_dev/login-as` harness, which is this repo's strongest verification artifact. |
| Stale generated Prisma client causing phantom `pnpm check` errors | Run `pnpm prisma generate` before believing a red `pnpm check`. |

## Implementation Checklist

1. `pnpm prisma generate` — clear any stale client before touching anything.
2. Write `tests/unit/separation-characterization.test.ts` pinning CURRENT behaviour: finalize happy path (asserting `separationRecord.updateMany` got `finalPayAmount`/`status: 'FINALIZED'`, `employee.update` got `OFFBOARDED`, `user.updateMany` got `isActive: false`, `loan.updateMany` and `cashAdvance.updateMany` got `status: 'PAID'`), pending-items → 409, already-finalized → 409, `setClearanceItem` clears a PENDING item.
3. Run `pnpm test tests/unit/separation-characterization.test.ts` → must be **GREEN against unmodified code**. This is the proof the harness is not vacuous. Do not proceed until it is.
4. Add `ClearanceActorRef` + `clearedAnyItem` to `src/lib/server/services/separation.ts` after `getSeparation` (~line 117), per §6.1.
5. Add `finalizeBarFor` immediately after it, per §6.2.
6. Insert the D8 precondition in `setClearanceItem` after the FINALIZED check at `:129`, per §6.3.
7. Replace `finalizeSeparation`'s `:229-233` with the ordered guard block in §6.4.
8. Write `tests/unit/separation-finalize-sod.test.ts`: the four `clearedAnyItem` predicate cases (zero mocks), `finalize-refuses-clearer`, `finalize-allows-clean-actor` (negative control — assert the writes), `finalize-refuses-self`, `finalize-allows-other-for-self-case`, `finalize-guards-independent`, `finalize-bar-above-pending`, `self-guard-consistent-with-offboard`, `existing-cases-unaffected`.
9. Write `tests/unit/separation-clearance-reclear.test.ts`: `reclear-refused-for-other-actor`, `unclear-refused-for-other-actor`, `reclear-allowed-for-original-clearer`, `d3-not-defeatable-by-reclear` (the AC-9.4 end-to-end walk — one test, the full un-clear → clear → finalize sequence as B, asserting a 403 at every step, `clearedById` unchanged, and no finalize), `clear-pending-item-unchanged`.
10. `pnpm test` → full suite green (~1446 tests, ~15s). The characterization file from step 2 must STILL be green — it uses an uninvolved actor.
11. Add `finalizeBarFor` to the import and return `finalizeBar` from `load` in `src/routes/(app)/separations/[id]/+page.server.ts`, per §6.5.
12. Edit `src/routes/(app)/separations/[id]/+page.svelte` per §6.6 (four edits: `$derived`, checklist warning, bar message, `disabled`).
13. `pnpm check` && `pnpm lint` && `pnpm format:check`.
14. Run mutation checks M1–M8 (§Mutation checks) one at a time, recording each red result, then revert each. M7 and M8 are deletions — confirm the named tests actually go RED, not merely that the suite still passes.
15. Ask the user to start the dev server. Run live steps L0–L6 including L2b, L2c, L2d, **L2e-pre** and L2e (§Live verification), before-and-after, capturing screenshots for L1 and psql output for L2, L2b, L2c, L2d, L2e-pre, L2e, L3 and L4. **L2e-pre is not optional** — without it L2e runs on a one-item case, where B's finalize correctly succeeds and the step fails a correct implementation. Every D8 live step must show BOTH the refusal (L2b, L2c, L2e) and the success (L2d).
16. Record results in the execution report. **Commit nothing** — this plan ends at PLAN; committing is a separate, separately-authorised step.

## Test Infra Improvement Notes

- The separation area has **zero** tests today (SPEC follow-up, filed as #305). This plan adds three
  files covering the two SoD guards and a thin characterization baseline; `computeFinalPay`
  arithmetic, `createSeparation`, `listSeparations`, `generateSeparationReport` and all three
  routes remain uncovered. Worth a standalone coverage task.
- No shared separation test fixture exists. Each of the three new files builds its own `db` mock.
  If a fourth separation test file appears, extract a `tests/fixtures/separation.ts` builder first.
- `finalizeSeparation`'s `$transaction` takes a callback, so the mock must be
  `async (fn) => fn(dbMock)`, unlike `offboardEmployee`'s array form. Record this in the fixture if
  one is extracted.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/clearance-signoff-297_PLAN_17-08-26.md`
2. **Last completed step:** PLAN written. No code touched, nothing committed.
3. **Validate-contract status:** pending — VALIDATE has not run.
4. **Context loaded:** `process/context/all-context.md`, `process/context/auth/all-auth.md`,
   `process/context/tests/all-tests.md`,
   `process/general-plans/active/separation-of-duties-298-297_SPEC_17-08-26.md`,
   `src/lib/server/services/separation.ts`, both `/separations/[id]` route files,
   `src/lib/server/services/employees.ts:1206-1240`, `src/lib/server/services/approvals.ts:105-135,600-660`,
   `tests/unit/offboard-self-guard.test.ts`, `prisma/schema.prisma:380-420,959-997`.
5. **Next step for a fresh agent:** run VALIDATE against this plan, then EXECUTE from §Implementation Checklist step 1.
   Branch is `feat/separation-of-duties-298-297`. A parallel agent owns #298 — do NOT touch
   `prisma/schema.prisma`, payroll services, or the audit-log pages.

## Phase Completion Rules

This is a SIMPLE single-phase plan, so the phase is the whole plan.

- `CODE DONE` = checklist steps 1-13 complete and `pnpm test`, `pnpm check`, `pnpm lint` green.
- `TESTED` = mutation checks **M1-M8** (§Mutation checks) all recorded RED-on-break, reverted.
  M7 and M8 are the two DELETE mutations; M1-M6 only perturb the guards, so a run that stops at
  M6 has not proven the tests depend on the guards existing at all.
- `✅ VERIFIED` = live steps L0-L6 run before AND after, screenshots and psql output captured,
  AND the user has confirmed working — user-confirmed, not agent-asserted. Never mark VERIFIED on a green unit suite
  alone — the unit suite mocks the DB and cannot prove a permission hole.
- Nothing is committed in this session. Committing is a separately-authorised step.

**Next step:** say `ENTER VALIDATE MODE` to validate this plan. EXECUTE is next session.

## Validate Contract

Status: CONDITIONAL
Date: 18-08-26
date: 2026-08-18
generated-by: outer-pvl
supersedes: 2026-08-18 (outer-pvl) — re-validated from V1 after the G1/G2/G3/G5 repair pass and the orchestrator's G4 decision

Parallel strategy: sequential
Rationale: 6/7 signals present, but this plan's own EXECUTE is genuinely sequential — a single file
set, one strict checklist, tests-before-guards. Both fan-out layers ran inline against the live
source and the live database (read-only). The plan itself runs on an independent track and may go
in parallel with the two payroll plans.

### Re-validation result — the four mandated repairs are DONE

- **G1 — DONE.** `d3-not-defeatable-by-reclear` now exists as a named, standalone gate (Verification
  Evidence), as a TDD stub, as checklist step 9, and as the live L2e walk. It is written as one
  test covering the whole sequence, explicitly "NOT as a consequence of" the two one-step tests —
  which is what AC-9.4 asks for.
- **G2 — DONE.** AC-9.1 / AC-9.2 / AC-9.3 / AC-9.4 are re-tiered **Hybrid** in the Verification
  Evidence table, with live L2c (B re-clears A's item → 403), L2d (A un-clears and re-clears their
  own → both succeed), and L2e (the full defeat route) added and named in checklist step 15.
- **G3 — DONE.** M7 (delete the self check outright) and M8 (delete `if (bar) error(403, bar)`
  outright) are present, are labelled DELETE, and carry the correct "must go red" targets. The
  table's own note — "M1–M6 only perturb the guards; only M7/M8 prove the tests depend on them
  existing" — is the right framing.
- **G5 — DONE.** G10 now cites AC-9.1 – AC-9.5. The stale "VALIDATE should confirm the owner is
  content for D8 to ship without a SPEC amendment" risk row is replaced with "No longer an
  interpretation. The owner confirmed D8 on 18-08-26 in both directions."
- **G6 — RECORDED, not built,** in both the non-goals table and the Risks table, correctly framed
  as a consequence of the owner's locked decision rather than a defect.

### G4 — the orchestrator's decision to keep 403: JUDGED CORRECT

Every cited site was read this session.

| Site | Code | Is it a self-action bar? |
|---|---|---|
| `approvals.ts:231` — "You cannot decide your own request" | **403** | yes |
| `employee-access.ts:136` — `assertNotSelf` → `SELF_ACTION_DENIED` | **403** | yes |
| `action-proposals.ts:71` — "You cannot confirm a change you proposed yourself." | **403** | yes |
| `action-proposals.ts:80` — "You cannot confirm a change to your own pay." | **403** | yes |
| `employees.ts:1217` — "You cannot offboard your own employee record — ask another admin to do it." | **400** | yes — the outlier |
| `employees.ts:399` — "An employee cannot report to themselves." | 400 | no — a field-validation error |

**One correction to the evidence, which does not change the verdict.** `timesheets.ts:125` was cited
as a fifth 403 self-action bar. It is not one: the code is
`if (isOwner) return { isOwner: true } … error(403, 'You can only modify your own timesheet')` — an
**ownership requirement**, the logical inverse of a self-action bar. It refuses you for acting on
someone ELSE's record. So the count is **four self-action bars at 403 against one at 400**, not five
to one. Still decisive, and the argument does not lean on the fifth.

Keeping 403 is right on the merits too: the request is well-formed and it is the *actor* who is
refused, which is exactly what 403 means. AC-4.3 asks for consistency in "wording style and
placement" and does not name a status code, so `self-guard-consistent-with-offboard` must assert:

- **wording** — "ask another admin to do it", which matches `employees.ts:1217` verbatim in shape;
- **placement** — in the service, before the transaction, covering both the form action and any
  future v1 API twin in one check;
- and it must **NOT** assert the status code.

Not in scope: changing `offboardEmployee` to 403 to match. It is a live API contract and nobody
asked. Recorded so the inconsistency is deliberate and known rather than a fresh accident.

### Re-verified line anchors (unchanged since the first pass — code has not moved)

`getSeparation` ends at `:115`/`:116`; `setClearanceItem` starts at `:118`; its FINALIZED check is
at `:129`; `finalizeSeparation` at `:228` with `:229` fetch, `:230` the 409, `:232` the pending
count, `:233` the pending 409. `setClearanceItem`'s `findFirst` returns the full `ClearanceItem`
row (only the nested `separation` is `select`-narrowed), so `item.status` and `item.clearedById` are
available with NO extra query. `offboardEmployee`'s self-guard is at `employees.ts:1216-1218`.
`MANAGE_HR: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` at `rbac.ts:25`.

### NEW findings from this pass

**N1 — the Phase Completion Rules are stale by two mutations.** `TESTED = mutation checks M1-M6
(§Mutation checks) all recorded RED-on-break`. M7 and M8 were added by the G3 repair and are the
plan's own strongest checks — the only two that prove the tests depend on the guards *existing*.
Excluding them from the definition of TESTED means the plan can be marked TESTED without the
evidence it says matters most. One-line fix: `M1-M8`. Severity: CONCERN (documentation).

**N2 — the G4 rationale lived only in the superseded contract.** The plan BODY records the
decision's *effect* (§6.2 and §6.4 both use 403) but not its *reason*, and the "assert wording and
placement, not the status code" instruction existed only in a TDD-stub comment inside the old
contract. It is carried forward in full above; add a one-line pointer at §6.2 so a reader of the
plan alone does not re-open it. Severity: CONCERN (documentation).

**N3 — the small-tenant premise is VERIFIED TRUE against the live database.** The plan's whole
no-carve-out decision rests on "JoJo Potato and Sweetleaf each have exactly one active MANAGE_HR
holder, and the CEO reaches both". Read live: `org_jojo` has exactly one active user with any HR
role — `manager@jojo.ph` (`{MANAGER}`) — and `org_sweetleaf` has exactly one — `manager@sweetleaf.ph`
(`{MANAGER}`). `MANAGE_HR` does include `MANAGER` (`rbac.ts:25`, #133), so each really is a single
local MANAGE_HR holder. `ceo@veent.ph` is the only CEO and
`src/routes/api/v1/session/switch-org/+server.ts` exists, so L6 is executable end to end. Not a
concern — recorded because L6 is the gate the whole decision rests on and it now has confirmed
actors. `separation_records` and `clearance_items` are both **empty**, as the plan says; a new case
seeds its checklist from `clearanceTemplateForOrg` with built-in defaults (`separation.ts:49`), so
L0 will produce tickable items. All four org_seed admins (`admin@`, `hr@`, `ceo@`,
`manager@veent.ph`) have `employees` rows, so L4's "a case for A's own employee record" works.

### Test gates (5-column)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-5.2 | current behaviour is pinned before any guard lands | Fully-Automated | `pnpm test tests/unit/separation-characterization.test.ts` GREEN against unmodified code (checklist step 3 hard gate) | A |
| AC-3.1 | a clearer of ≥1 item is refused at finalize, with a reason | Hybrid | `pnpm test -- separation-finalize-sod` (`finalize-refuses-clearer`) + live L2 (curl-forced POST → 403, psql shows still not FINALIZED) | A |
| AC-3.2 | a clean actor finalizes AND all the writes still happen | Hybrid | `pnpm test -- separation-finalize-sod` (`finalize-allows-clean-actor`, asserting finalPayAmount / OFFBOARDED / isActive:false) + live L3 psql | A |
| AC-3.2 | the pure predicate is correct on all four shapes | Fully-Automated | `pnpm test -- separation-finalize-sod` — 4 `clearedAnyItem` cases, ZERO db mocks | A |
| AC-3.3 | the screen warns before the first tick | Hybrid | live L1 screenshot of the amber warning + `pnpm check` on the `+page.svelte` edit | A |
| AC-3.4 | a single-HR tenant is not stranded | Agent-Probe | live L6 — `ceo@veent.ph` switches into `org_jojo` and `org_sweetleaf` and finalizes end to end. Actors verified present this pass | A |
| AC-3.5 | pre-existing frozen checklists still complete | Hybrid | `pnpm test -- separation-finalize-sod` (`existing-cases-unaffected`, null `clearedById`) + live L5 | A |
| AC-3.6 | who may tick a fresh item is unchanged | Fully-Automated | `pnpm test -- separation-clearance-reclear` (`clear-pending-item-unchanged`) | A |
| AC-4.1 | nobody finalizes their own separation | Hybrid | `pnpm test -- separation-finalize-sod` (`finalize-refuses-self`) + live L4 | A |
| AC-4.2 | another admin can finalize that same case | Hybrid | `pnpm test -- separation-finalize-sod` (`finalize-allows-other-for-self-case`) + live L4 second half | A |
| AC-4.3 | the self refusal reads and sits like the offboard refusal | Fully-Automated | `pnpm test -- separation-finalize-sod` (`self-guard-consistent-with-offboard`) — asserts **wording and placement only**, never the status code. 403 is the deliberate, recorded choice | A |
| AC-4.4 | the self bar and the clearer bar are independent and ordered | Fully-Automated | `pnpm test -- separation-finalize-sod` (`finalize-guards-independent`, `finalize-bar-above-pending`) | A |
| AC-9.1 | person B is refused when re-clearing A's item | Hybrid | `pnpm test -- separation-clearance-reclear` (`reclear-refused-for-other-actor`) + live **L2c** | A |
| AC-9.2 | person B is refused when un-clearing A's item | Hybrid | `pnpm test -- separation-clearance-reclear` (`unclear-refused-for-other-actor`) + live L2b | A |
| AC-9.3 | person A may still un-clear and re-clear their own item | Hybrid | `pnpm test -- separation-clearance-reclear` (`reclear-allowed-for-original-clearer`) + live **L2d** (both calls succeed, `clearedById` ends back at A) | A |
| AC-9.4 | the un-clear-then-clear defeat route does not work, end to end | Hybrid | `pnpm test -- separation-clearance-reclear` (**`d3-not-defeatable-by-reclear`**, one named test, the full sequence) + live **L2e** on the two-item state built by **L2e-pre** (three curl POSTs, all 403, `clearedById` still A, record still OPEN) | A |
| AC-9.5 | a fresh, never-cleared item is clearable by anybody who could clear it before | Fully-Automated | `pnpm test -- separation-clearance-reclear` (`clear-pending-item-unchanged`) | A |
| AC-5.1 | every new refusal is proven live, refusal AND success, both sides | Agent-Probe | live L1–L4 plus L2b–L2e run BEFORE and AFTER the change with the same script; before the change L2 and L4 must SUCCEED | A |
| AC-5.3 | every guard is mutation-checked | Fully-Automated | **M1–M8** RUN with results recorded, including the two DELETE mutations M7 and M8 | A |

Failing stubs (Fully-Automated rows only — red-first starting points for EXECUTE):

```
test("clearedAnyItem: actor cleared an item -> barred", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: actor cleared -> barred")
})
test("finalize-refuses-self", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: actor is the separated employee -> 403")
})
test("finalize-guards-independent", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: subject AND clearer -> SELF message")
})
test("finalize-bar-above-pending", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: barred actor on a case with pending items gets the 403 bar, not the pending 409")
})
test("reclear-refused-for-other-actor", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: already-cleared item, different actor -> 403")
})
test("unclear-refused-for-other-actor", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: already-cleared item, different actor, cleared=false -> 403")
})
test("d3-not-defeatable-by-reclear", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: AC-9.4 — B un-clears A's item, then clears it; refused at BOTH steps, clearedById still A, and B still cannot finalize")
})
test("clear-pending-item-unchanged", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: a PENDING item is still clearable by anyone with MANAGE_HR")
})
test("self-guard-consistent-with-offboard", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the self refusal matches offboardEmployee in WORDING and PLACEMENT. Do NOT assert the status code — 403 is the deliberate, recorded choice (G4).")
})
```

Legacy line form (for existing validate-contract consumers):

- separation guards (unit): `Fully-automated: pnpm test -- separation-characterization separation-finalize-sod separation-clearance-reclear`
- full-suite regression: `Fully-automated: pnpm test` — baseline verified in a prior session at 119 files / 1446 tests / 19s
- live refusal + success, both sides: `hybrid: the _dev/login-as curl harness + docker exec veent-db-5434 psql -p 5434 assertions` — precondition: the USER starts the dev server and the database (both currently up)
- small-tenant escape route: `agent-probe: ceo@veent.ph switches into org_jojo and org_sweetleaf and finalizes a case in each; the single local MANAGE_HR holder is manager@jojo.ph / manager@sweetleaf.ph`
- AC-9.4 defeat-route walk: `Fully-automated: pnpm test -- separation-clearance-reclear` (`d3-not-defeatable-by-reclear`) + `hybrid: live L2e`

### Dimension findings

- Infra fit: PASS — runner is vitest via `pnpm test` (correct; there is no `test:unit`). No schema change, no `db:push`, nothing in `prisma/**` or `scripts/**`, so the `pnpm check` blind spot does not apply. `tests/unit/offboard-self-guard.test.ts` exists and is the right harness template. `src/routes/api/v1/_dev/login-as/+server.ts` and `src/routes/api/v1/session/switch-org/+server.ts` both exist. The database is up and holds the actors every live step needs.
- Test coverage: PASS — the characterization-first ordering (write it, prove it GREEN against unmodified code, only then add guards) remains the strongest anti-vacuous-mock design of the three plans, and the four gaps that made this CONCERN last pass are all closed: AC-9.4 now has its own named test and its own live walk, the three D8 criteria are Hybrid, and both headline guards now carry a delete-mutation.
- Breaking changes: PASS — no schema, no capability, no route, no signature change. The one caller is `src/routes/(app)/separations/[id]/+page.server.ts:57`; there is genuinely no v1 API twin. `finalizeBarFor` returning a message string is additive page data.
- Security surface: PASS — object-level actor comparison, established shape 1, no third auth mechanism. `finalizeBarFor` does a SCOPED `employee.findUnique({ select: { userId: true } })` instead of widening `getSeparation`'s select — the correct #111/#290 lesson. Refusal messages carry no id and no name. The D8 check is NULL-safe in the safe direction (a legacy CLEARED row with a null `clearedById` stays editable rather than frozen).
- Section feasibility (§6.1 predicate): PASS — insert point exact.
- Section feasibility (§6.3 D8 precondition): PASS — `item.status` and `item.clearedById` available with no extra query; FINALIZED check at `:129` confirmed verbatim.
- Section feasibility (§6.4 guard order): PASS — the `:229-233` replacement block is exact; `getSeparation` already loads every clearance item.
- Section feasibility (§6.5/§6.6 UI): PASS — every anchor verified exact in the prior pass and unchanged since. This is still the most mechanically accurate plan of the three.

### Open gaps

- **N1 — Phase Completion Rules say `M1-M6`; the table is now M1–M8.** The two DELETE mutations are excluded from the definition of TESTED. Fix to `M1-M8` before EXECUTE marks anything TESTED. gap-resolution B.
- **N2 — the G4 403 rationale is contract-only.** Carried forward in full above; add a one-line pointer at §6.2 so the plan alone is enough. gap-resolution B.
- **G6 — the D8 stranding path**, recorded not built: once A clears an item, ONLY A may change it, so a wrongly-ticked item whose clearer has left the company can never be un-cleared and the case never finalized. A direct consequence of the owner's locked D8 decision; the clearance-history table that would solve it was declined. Report to the owner; do not build; no issue filed. gap-resolution C.
- known-gap: nothing stops the SUBJECT of a separation clearing their own clearance items — `setClearanceItem` has no self-check. A distinct hole, correctly excluded from the locked decisions. Documented as NEW PLAN REQUIRED. gap-resolution D.
- known-gap: `computeFinalPay` arithmetic, `createSeparation`, `listSeparations`, `generateSeparationReport` and all three routes stay uncovered. Filed as #305. gap-resolution D.
- known-gap: `offboardEmployee` keeps its 400 while every new self-action bar uses 403. Deliberate, recorded, not fixed. gap-resolution C.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Before marking anything TESTED, change Phase Completion Rules `M1-M6` to `M1-M8`. M7 and M8 are the two that prove the tests depend on the guards existing. | Checklist step 14 |
| E2 | `self-guard-consistent-with-offboard` asserts **wording** ("ask another admin to do it") and **placement** (service layer, before the transaction). It must NOT assert the HTTP status. 403 is deliberate (G4) and `offboardEmployee`'s 400 is the outlier that stays. | Checklist step 8 |
| E3 | Live actors, verified present: A and B are any two of `hr@veent.ph`, `manager@veent.ph`, `ceo@veent.ph`, `admin@veent.ph` (all org_seed, all MANAGE_HR, all with `employees` rows). L6's CEO is `ceo@veent.ph`; the single local MANAGE_HR holder is `manager@jojo.ph` in org_jojo and `manager@sweetleaf.ph` in org_sweetleaf. | Checklist step 15 |
| E4 | `separation_records` and `clearance_items` are both empty. Every live case must be created by hand; the checklist seeds from `clearanceTemplateForOrg`'s built-in defaults. Plant the `SOD297-CASE-1` / `SOD297-SELF` / `SOD297-LEGACY` markers as written and clean up after, or say why not. | Checklist step 15 |

### D9 drift check

**No drift.** This plan does NOT assume any final-pay arithmetic change. Its non-goals table lists
"Final-pay understatement | SPEC out-of-scope 9", its test-mock guidance states "the arithmetic is
NOT under test here", and no checklist step touches `computeFinalPay`. AC-6.x is nowhere in the
plan. Consistent with the SPEC's 18-08-26 drop of D9.

### Execution track

This plan runs on an **independent track** and may proceed in parallel with the two payroll plans at
any time. Its file set — `separation.ts`, both `/separations/[id]` route files, three new
`tests/unit/separation-*.test.ts` — is fully disjoint from `payroll-void-audit-298` and
`void-semantics-and-sweep`. No shared file, no shared test file, no schema overlap. The only
coupling is the shared `pnpm test` run, which is a whole-suite gate for both tracks. Its Phase 0
"before" live pass (L0–L4 including L2b–L2e) should still be taken in the same clean-tree session as
the payroll plans' before-pass, so one dev-server session covers all three.

### What this coverage does NOT prove

- `pnpm test -- separation-*` mocks `$lib/server/db`. It does NOT prove that a 403 reaches a real HTTP client, that the guards hold under real tenant scoping, or that `clearedById` really matches a real session's user id. Only L2/L2b–L2e/L3/L4 psql do.
- `d3-not-defeatable-by-reclear` proves the defeat route is closed against the mocked db. Only L2e proves it against Postgres with real session cookies — and only for the UI's un-clear-then-clear path. A direct DB write, or a future second re-clear route, is outside what either proves.
- The characterization test proves the finalize path's WRITES happen. It does NOT prove the final-pay figures are correct — the arithmetic is deliberately out of scope, so a regression in `computeFinalPay` would pass this suite silently.
- `pnpm check` proves the `.svelte` edits typecheck. It does NOT prove the amber warning is VISIBLE, correctly placed, or readable. Only the L1 screenshot does — and an assertion cannot tell a hidden element from a missing one.
- Nothing proves the CEO escape route holds in PRODUCTION. L6 proves it in development seed data, where each small tenant happens to have exactly one MANAGER. SPEC Open Question B stays open.
- No test covers the G6 stranding path (a wrongly-ticked item whose clearer is gone). It is recorded, not gated. Nothing in this plan would detect it in the field.
- Nothing covers the SUBJECT clearing their own clearance items. That hole is untouched by this plan and is not gated by any test here.
- M1–M8 prove the tests depend on the guards. They prove nothing about a path that reaches `clearanceItem.update` or `separationRecord.updateMany` without going through these two service functions.

Gate: CONDITIONAL — 0 FAILs, 2 new documentation CONCERNs (N1 the stale `M1-M6` completion rule; N2 the G4 rationale lived only in the superseded contract), 4 known-gaps. G1, G2, G3 and G5 are all verified applied; G4 is judged CORRECT with one cited site reclassified. Both new concerns are one-line plan edits covered by E1 and E2. EXECUTE may proceed on the independent track.
Accepted by: session — accepted concerns, by name: N1 Phase Completion Rules still define TESTED as `M1-M6`, excluding the two DELETE mutations that G3 added (fixed by E1); N2 the G4 403-vs-400 rationale and the "assert wording and placement, not the status code" instruction existed only in the superseded contract and are carried forward here (pointer added by E2); G6 the D8 stranding path, recorded for the owner and deliberately not built. Plus known-gaps: the subject may clear their own items; the rest of the separation service stays untested (#305); `offboardEmployee` keeps its outlier 400.

## Autonomous Goal Block

```
SESSION GOAL
Execute process/general-plans/active/clearance-signoff-297_PLAN_17-08-26.md — the #297 offboarding
half: whoever cleared any clearance item may not finalize that separation (D3), nobody finalizes
their own separation (D4), and a second person may neither re-clear nor un-clear an item somebody
else already cleared (D8). One shared helper finalizeBarFor() feeds both the server 403 and the
greyed-out Finalize button. Characterization tests first. Gate is CONDITIONAL; the four mandated
repairs from the first VALIDATE pass are verified applied.

AUTONOMY RULES
- Follow the Implementation Checklist 1-16 in order. Step 3 is a hard gate: the characterization
  suite MUST be green against UNMODIFIED code before any guard is written. Do not proceed past it.
- Apply these four execute-agent instructions from the contract:
  E1 change Phase Completion Rules "M1-M6" to "M1-M8" before marking anything TESTED. M7 and M8 are
     the DELETE mutations and are the only two that prove the tests depend on the guards existing.
  E2 self-guard-consistent-with-offboard asserts WORDING ("ask another admin to do it") and
     PLACEMENT (service layer, before the transaction). It must NOT assert the status code. 403 is
     the deliberate choice; offboardEmployee's 400 is the outlier and stays.
  E3 live actors verified present: A/B from hr@veent.ph, manager@veent.ph, ceo@veent.ph,
     admin@veent.ph (all org_seed, all MANAGE_HR, all with employees rows). L6's CEO is
     ceo@veent.ph; the single local MANAGE_HR holder is manager@jojo.ph and manager@sweetleaf.ph.
  E4 separation_records and clearance_items are EMPTY. Create every live case by hand; the checklist
     seeds from clearanceTemplateForOrg's built-in defaults. Plant the SOD297- markers, clean up
     after or say why not.
- Record the ACTUAL red output of every mutation row M1-M8. A mutation table in a plan is a
  hypothesis.
- Run pnpm prisma generate before believing a red pnpm check.

HARD STOPS
- Ask the user to start the dev server and the veent-db-5434 container. Never start either
  yourself. Both are currently UP.
- Do not mutate the database outside the SOD297- marker cases.
- If L6 fails (the CEO cannot reach /separations in org_jojo or org_sweetleaf), STOP and report.
  The whole no-carve-out decision rests on it.
- Do NOT touch prisma/schema.prisma, any payroll service, or the audit-log pages. Two parallel
  plans own them. Confirm with git diff --name-only at the end.
- Commit nothing. Committing is a separately authorised step.
- Do not file any GitHub issue.

NEXT PHASE
EXECUTE. This plan runs on an INDEPENDENT track — its file set is disjoint from both payroll plans,
so it may run in parallel with them at any time. Take its L0-L4 (including L2b-L2e) "before" pass in
the same clean-tree dev-server session as the payroll plans' Phase 0.

CONTRACT SUMMARY
Gate CONDITIONAL. 0 FAILs, 2 documentation CONCERNs, 4 known-gaps. G1 (the named d3-not-defeatable-
by-reclear test), G2 (Hybrid re-tiering plus live L2c/L2d/L2e), G3 (delete-mutations M7/M8) and G5
(the stale D8 provenance text) are all verified applied. G4's decision to keep 403 is judged
CORRECT: four self-action bars use 403 against offboardEmployee's one 400 — the fifth cited site,
timesheets.ts:125, is an ownership check, not a self-action bar, so the count is 4-to-1 not 5-to-1,
and the verdict is unchanged.

EXECUTE START COMMAND
ENTER EXECUTE MODE for process/general-plans/active/clearance-signoff-297_PLAN_17-08-26.md
```
