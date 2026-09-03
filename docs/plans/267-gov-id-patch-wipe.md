# Issue #267 — `PATCH /api/v1/employees/[id]` silently wipes government IDs

**Repo:** `veent_hris` (all paths below are repository-relative) · **Branch:** `fix/gov-id-patch-wipe-267` · **HEAD/base:** `9e39689540bda41c4af13195e087e597ed18b0d6`
**Modes run:** PLAN → INNOVATE (per `.claude/skills/riper5/SKILL.md`). No repository file was modified; every quote below was re-read at this HEAD.
**Scope:** standalone. Does not touch, reference, or depend on the pending #235/#263/#264/#265/#266 stack (PR #268).

---

## 0. Ground truth re-verified at HEAD

The RESEARCH pass handed over a set of findings. All of them were re-checked against disk, not copied.

| Claim from RESEARCH                                                                                                   | Verified at `9e39689`                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `govIdSchema` at `gov-ids.ts:136-144`, `.optional()` then `.transform(v => v ? v : null)`                             | **True**, verbatim (block quoted in §3.1).                                                                                                                                                                                                                                           |
| An absent `govIdSchema` key survives parsing as `null`; a plain `.optional()` key is dropped                          | **True.** Re-reproduced independently against the installed zod (see §0.1).                                                                                                                                                                                                          |
| The four gov IDs are the only non-plain-optional fields in `updateSchema`                                             | **True.** `+server.ts:20-39`: every other field is plain `.optional()` / `z.enum(...).optional()` / `z.coerce.number().positive().optional()`. **No `.default()` and no other `.transform()` anywhere in the schema** — so no other key is ever synthesised. Load-bearing; see §4.2. |
| `+server.ts:102` destructures pay out, `:153` guards on `Object.keys(rest).length > 0`, `:154` calls `updateEmployee` | **True**, exact lines.                                                                                                                                                                                                                                                               |
| A completely empty `PATCH {}` writes all four IDs to `null`                                                           | **True**, and confirmed by the repro: `{}` parses to `{sssNumber: null, …}`, four keys, so the `:153` guard can never be false.                                                                                                                                                      |
| `updateEmployee` writes `data: input` wholesale, no field filtering                                                   | **True.** `employees.ts:582-586`.                                                                                                                                                                                                                                                    |
| Gov IDs excluded from `HISTORY_FIELDS`, so the wipe logs only field **names**                                         | **True.** `employees.ts:104-118` + the `otherChanged.push(key)` branch at `:604`. The old values are not recoverable from the audit log.                                                                                                                                             |
| Three `govIdSchema` call sites; the HR edit form already strips nulls                                                 | **True.** `grep -rn govIdSchema src/ tests/` → `gov-ids.ts:136`, `employees/new/+page.server.ts:86-89,95-96`, `employees/[id]/+page.server.ts:302-305,319-320`, `api/v1/employees/[id]/+server.ts:34-37`. Strip at `employees/[id]/+page.server.ts:438-459`, verbatim as quoted.     |
| `a18536e` (2026-07-27) is the only commit to `gov-ids.ts`                                                             | **True.** `git log --follow -- src/lib/utils/gov-ids.ts` → one commit.                                                                                                                                                                                                               |
| No product caller of this PATCH; API-direct only                                                                      | **True.** No `method: 'PATCH'` anywhere in `src/` or `tests/`.                                                                                                                                                                                                                       |
| No test pins gov-ID values in any `employee.update` `data` argument                                                   | **True**, and stronger — see §0.2.                                                                                                                                                                                                                                                   |

### 0.1 The zod behaviour, re-reproduced (and extended to the candidate fix)

Run inside the repo so `zod` resolves to the installed 3.25.76:

```js
const govIdNull = z
	.string()
	.trim()
	.optional()
	.transform((v) => (v ? v : null))
const govIdUndef = z
	.string()
	.trim()
	.optional()
	.transform((v) => (v === undefined ? undefined : v || null))
```

```
zod 3.25.76
CURRENT(null)   {"firstName":"Ana"}            => {"firstName":"Ana","sssNumber":null}   hasSss=true
CURRENT(null)   {}                             => {"sssNumber":null}                     hasSss=true
CURRENT(null)   {"sssNumber":""}               => {"sssNumber":null}                     hasSss=true
CURRENT(null)   {"sssNumber":"34-1234567-8"}   => {"sssNumber":"34-1234567-8"}           hasSss=true
OPT1(undefined) {"firstName":"Ana"}            => {"firstName":"Ana"}                    hasSss=false
OPT1(undefined) {}                             => {}                                     hasSss=false
OPT1(undefined) {"sssNumber":""}               => {"sssNumber":null}                     hasSss=true
OPT1(undefined) {"sssNumber":"34-1234567-8"}   => {"sssNumber":"34-1234567-8"}           hasSss=true
S1.safeParse({ sssNumber: null }).success      => false
```

Two things this establishes that the plan turns on:

1. Mapping absent → `undefined` **drops the key entirely**, while mapping absent → `null` retains it. `.optional()` does not short-circuit a downstream `.transform()`; the transform runs on `undefined` and its output is written back into the object.
2. The `undefined` variant **still maps an explicit `''` to `null`.** Absent and empty become distinguishable, which the current schema cannot do. This is the whole argument in §4.

### 0.2 Two findings the RESEARCH pass did not have

**(a) An explicit `''` is the API's only "clear this ID" affordance today — and Option 2 destroys it silently.**

`{"sssNumber": null}` does **not** clear the field: `z.string()` rejects `null` outright, so the request is a **400 `Invalid request body`** (last line of the repro). `{"sssNumber": ""}` is therefore the _only_ way any caller anywhere in the product can clear a stored government ID. The HR edit form deliberately cannot (`employees/[id]/+page.server.ts:441-445`: _"Explicit clearing is deferred until a dedicated clear affordance exists"_).

This matters because the route's own contract comment (`+server.ts:32-33`) says _"a PATCH only carries the fields the caller intends to change"_ — under that contract `""` is an intentional, explicit instruction. Any fix that maps absent **and** empty to "leave unchanged" turns that instruction into a **200 OK with the write silently discarded**. §4.1.

**(b) `govIdSchema` has no test at all.** `tests/unit/gov-ids.test.ts` (101 lines) covers `normalizeGovId`, `isValidGovId` and `govIdError` — the pure helpers. It never imports `govIdSchema`. The zod wrapper, which is where the bug is, is entirely unpinned. This is why `a18536e` could ship a schema whose contract contradicted its own `.optional()` and no gate fired.

### 0.3 One RESEARCH framing I disagree with

RESEARCH: _"Option 2 has the strongest precedent argument."_ Half true. RESEARCH itself lists **two** precedents for absent-vs-null in this repo, and the second one is Option **1**'s shape, not Option 2's:

- `employees/[id]/+page.server.ts:448-459` — conditional-spread strip (Option 2's shape), 1 site.
- `employees/[id]/+page.server.ts:334-363` — `promoteSchema.positionId` / `jobTitle` / `reportsToId` and `changeCompensationSchema.note`, all `.transform((v) => (v ? v : undefined))`, with the comment _"an empty positionId/jobTitle means 'not part of this promotion', never 'clear it'"_ — **4 fields, Option 1's shape, solving the identical hazard at the schema layer.**

Both patterns are house style. Precedent does not decide this; §4 does.

---

# [MODE: PLAN] — first-pass draft

_(Recorded as drafted, before the INNOVATE critique. The critique in §4 reverses the central decision; §5 is what to implement.)_

The draft took RESEARCH's steer and chose **Option 2** — strip the nulls in the route:

1. `+server.ts:102` — destructure the four gov IDs alongside the pay fields, rebuild an `input` object with the same conditional-spread pattern as `employees/[id]/+page.server.ts:448-459`.
2. `+server.ts:153` — move the emptiness guard onto the rebuilt `input` rather than `rest`.
3. Leave `gov-ids.ts` and the two form sites untouched (CLAUDE.md §3).
4. Two route tests: omitted IDs unchanged; sent ID written.

Rationale as drafted: smallest blast radius; verbatim copy of an existing in-repo pattern; touches only the one broken site.

That draft is wrong. §4.

---

## 1. The three options, stated precisely

| #   | Where          | Mechanism                                                            | Sites affected                 |
| --- | -------------- | -------------------------------------------------------------------- | ------------------------------ |
| 1   | `gov-ids.ts`   | absent → `undefined` (key dropped), `''` → `null`, value → canonical | all 3 (2 provably no-op)       |
| 2   | `+server.ts`   | route strips `null` gov IDs before calling `updateEmployee`          | 1                              |
| 3   | `employees.ts` | merge semantics inside `updateEmployee`                              | all 4 `updateEmployee` callers |

**Option 3 is dismissed on the facts, not on taste.** `UpdateEmployeeInput` declares `sssNumber?: string | null` (`employees.ts:86-89`) and the HR edit form's strip exists precisely so it can pass `undefined`, not `null`. `null` is a _legal, deliberate_ "clear this column" value that `updateEmployee` cannot distinguish from an accident without a shape change. Making `updateEmployee` ignore `null` would silently break the one thing the API can still do (§0.2a) and change the contract for `(app)/profile/+page.server.ts:122`, `(app)/departments/+page.server.ts:103` and the edit form, none of which are broken. Rejected.

So the real choice is 1 vs 2.

---

# [MODE: INNOVATE] — critique of the draft

## 4.1 The draft's central mistake: Option 2 converts a wipe bug into a silent-discard bug

The draft never asked what happens to `{"sssNumber": ""}` under Option 2. Trace it:

`''` → trim → `''` → `.transform(v => v ? v : null)` → `null` → the route's new strip drops the key → `updateEmployee` never sees it → `db.employee.update` writes nothing → the route re-fetches and returns **200 OK** with the ID still present.

The caller asked to clear a field. The API answered 200 and did nothing, with no error, no warning, and a response body that looks like success. Under the current (buggy) code that same request works correctly.

**This repo has already ruled on that failure mode.** `docs/plans/235-reportstoid-cross-tenant.md` §3, rejecting its own smallest-diff option:

> **Silent no-op on a write.** … A caller PATCHing `{ reportsToId: "x" }` would get **200 OK** with the field silently discarded and the response showing the old manager. Silent data loss on a write request is a worse failure mode than the 404 it replaces.

Same shape, same route, same verdict. Option 2 trades a loud-ish destructive bug for a quiet non-destructive one; it does not eliminate the class of "the caller's intent and the row disagree, and nothing says so."

The draft's implicit defence — _"nobody clears gov IDs via `''` today, there are no callers at all"_ — cuts both ways. If there are no callers, there is also no compatibility cost to keeping the affordance. And "no caller exists" is exactly the argument that would have justified shipping the wipe.

## 4.2 What Option 1 actually costs — checked, not assumed

Option 1's stated risk is that it changes shared code used by three sites. I checked the other two rather than asserting they were fine.

**Create form (`employees/new/+page.server.ts:86-89,95-96`).** Input is `Object.fromEntries(await request.formData())` (`:130`). An HTML form posts every named text input, so each gov-ID key arrives as `''` at worst → `null` under both old and new schema. Identical. And in the impossible case of an absent key: `parsed.data` spreads into `createEmployee` (`:143-150`) → `employees.ts:483` `sssNumber: input.sssNumber` inside `tx.employee.create` → Prisma treats `undefined` on create as "not supplied" → column takes its `null` default. Same row either way. **Provably no-op.**

**HR edit form (`employees/[id]/+page.server.ts:302-305,319-320`).** Same `Object.fromEntries` shape (`:404`) → `''` → `null` → the existing conditional-spread strip (`:448-459`) drops it → unchanged. Identical. In the impossible absent case: `undefined` → `sssNumber !== null` is `true` → spreads `{ sssNumber: undefined }` → Prisma ignores `undefined` on update → unchanged. **Provably no-op, on both branches.** The strip at `:448-459` remains necessary and is **not** orphaned by this change: it is what turns `''`→`null` into "leave unchanged" for the form, which is a form-specific policy the schema must not decide.

**Typing.** `govIdSchema`'s output widens from `string | null` to `string | null | undefined`. Both consumer types already accept it: `CreateEmployeeInput.sssNumber?: string | null` (`employees.ts:49`) and `UpdateEmployeeInput.sssNumber?: string | null` (`:86-89`). `tsconfig.json` sets `strict: true` but **not** `exactOptionalPropertyTypes`, so `string | undefined` → `string | null | undefined` assigns cleanly. `pnpm check` is the gate.

So Option 1's "wider blast radius" is nominal. Three call sites, one changes behaviour — the one that is broken.

## 4.3 What Option 1 buys that Option 2 does not

1. **It fixes the defect, not an instance of it.** The bug is that `govIdSchema` says `.optional()` and then makes the field mandatory-with-a-default. That contradiction is the artifact `a18536e` shipped; Option 2 leaves it in place, correct only because two of three consumers happen to compensate for it downstream. The next consumer inherits the trap with zero friction — which is exactly how this bug was born (`a18536e` added the compensating strip to one of the two new sites and not the other).
2. **The route needs no code change at all.** Under Option 1 the `:153` guard `Object.keys(rest).length > 0` becomes correct again _as written_ — see §4.4. Option 2 requires editing the destructure **and** relocating the guard, i.e. a larger diff in the more dangerous file.
3. **It preserves the explicit-clear affordance** (§0.2a, §4.1).
4. **It does not add a third hand-written copy** of the conditional-spread strip.

## 4.4 The `Object.keys(rest).length > 0` question, traced precisely

The task asks whether the guard at `+server.ts:153` needs to move after a strip. Answer depends on the option, and the trace is exact:

Every field in `updateSchema` (`+server.ts:20-39`) is one of: plain `.optional()`, `z.enum(...).optional()`, `z.coerce.number().positive().optional()`, or `govIdSchema`. There is **no `.default()`** and **no other `.transform()`**. A `ZodOptional` with no transform drops an absent key (repro §0.1, `middleName` case). Therefore the gov IDs are the _only_ source of synthesised keys.

- **Under Option 1:** `parsed.data` contains exactly the keys the caller sent. `rest` = those minus `basicMonthlySalary`/`rateType`/`employmentType`. `Object.keys(rest).length > 0` is false precisely when the caller sent no non-pay field. **The guard is correct where it stands; do not move it.** `PATCH {}` → `rest = {}` → `updateEmployee` is never called → 200 with an unchanged record. `PATCH {basicMonthlySalary: 50000}` → `rest = {}` → no Employee-row write at all, which is what the #170 tests want anyway.
- **Under Option 2:** the guard would be testing the pre-strip `rest`, which still carries the four nulls, so `PATCH {}` would call `updateEmployee({})` → `db.employee.update({ data: {} })` → a pointless write and a `getEmployee` round-trip. The guard would **have** to move onto the rebuilt object. One more reason the "smaller diff" framing was wrong.

## 4.5 Alternatives brainstormed and rejected

| #   | Alternative                                                                                                                                | Verdict                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Drop the first `.transform` entirely — let `undefined` stay `undefined` and `''` fail validation, forcing callers to omit or send a value. | **Rejected.** Breaks both form sites hard: `Object.fromEntries(formData)` sends `''` for every untouched field, so every create and every edit would 400 on four fields at once. Also removes the clear affordance outright rather than preserving it.                                                                          |
| B   | Keep `''` → `null` but make the API **reject** `''` with a 400 ("send a value or omit the field").                                         | **Rejected as out of scope**, though defensible. It is a deliberate API-contract change with no bug behind it, and it needs a product decision about whether clearing a statutory ID should be possible at all. Flag in the PR (§7.4); do not fold in.                                                                          |
| C   | `.strict()` on `updateSchema` so unknown keys 400.                                                                                         | **Rejected.** Unrelated to this bug (the keys are known), and a real behaviour change for existing API callers.                                                                                                                                                                                                                 |
| D   | Two schema variants — `govIdSchema` for forms, `govIdPatchSchema` for the API.                                                             | **Rejected.** Speculative duplication for one consumer, and it re-opens the same trap: whichever variant a future site picks wrong is silently wrong again. The single definition with correct absent-semantics serves all three; the doc comment on `govIdSchema` explicitly exists to keep them unified.                      |
| E   | Also apply the strip in `+server.ts` **as well as** Option 1 (belt and braces).                                                            | **Rejected.** With Option 1 the strip would be dead code that _re-introduces_ the §4.1 silent discard for `''`. Strictly worse than either option alone.                                                                                                                                                                        |
| F   | Change `updateEmployee` to ignore `null` (Option 3).                                                                                       | **Rejected** — §1. `null` is a legal clear value for four other callers.                                                                                                                                                                                                                                                        |
| G   | Add the gov IDs to `HISTORY_FIELDS` so a wipe is at least recoverable from the audit log.                                                  | **Rejected, emphatically.** `employees.ts:106-107` excludes them deliberately: _"Everything else (bank/GCash, government IDs, Discord) is intentionally excluded so sensitive PII never lands in the audit trail."_ Fixing a data-loss bug by writing the lost PII into an audit table is the wrong trade and contradicts #111. |

## 4.6 A hazard I checked for and did not find

Does Option 1's preserved `''`-clear create an accidental-wipe path via naive read-modify-write? **No.** `GET /api/v1/employees/[id]` returns the **masked** record (`employees.ts:302` → `maskEmployee`, `format.ts:73-82`), so a stored ID comes back as `'•••• 5678'` and a blank one as `null` (`maskAccountNumber(null)` → `null`, `format.ts:37-38`). Round-tripping either value into a PATCH is a **400**, not a wipe: `'•••• 5678'` fails `normalizeGovId` (bullets are not digits — pinned by `gov-ids.test.ts:58-63`), and `null` fails `z.string()`. Read-modify-write is already impossible on this route. `''` can only arrive because a caller typed it.

## 4.7 Decision

**Option 1.** One line of behaviour in `src/lib/utils/gov-ids.ts`, zero lines in the route, two consumers provably unaffected, the explicit-clear affordance preserved, and the `:153` guard restored to correctness in place.

---

# 5. FINAL PLAN — exact changes, in order

Style: tabs, single quotes, no semicolons, printWidth 100 (`.prettierrc`).

### Step 1 — `src/lib/utils/gov-ids.ts:129-145`: absent must stay absent

**Before** (verbatim at `9e39689`)

```ts
/**
 * Zod field for a government ID / credential: trims, treats empty as "no value" (null), and
 * otherwise requires a well-formed value, storing it canonically.
 *
 * Lives here rather than in a server schema module so the create form, the edit form and the
 * API all validate through the same definition as the UI hints.
 */
export function govIdSchema(field: GovIdField) {
	return z
		.string()
		.trim()
		.optional()
		.transform((v) => (v ? v : null))
		.refine((v) => v === null || normalizeGovId(field, v) !== null, { message: govIdError(field) })
		.transform((v) => (v === null ? null : (normalizeGovId(field, v) as string)))
}
```

**After**

```ts
/**
 * Zod field for a government ID / credential: trims, requires a well-formed value, and stores it
 * canonically. Three-way by design — absent stays `undefined` ("not part of this request"), an
 * explicit empty string becomes `null` ("clear it"), anything else is validated and canonicalised.
 *
 * #267: absent used to collapse to `null`. `.optional()` does not short-circuit a downstream
 * transform — it runs on `undefined` and its output is written back — so the key survived parsing
 * on every request, and a partial PATCH that never mentioned these fields wiped all four. Callers
 * that treat `null` as "leave unchanged" (the edit form) decide that themselves; the schema must
 * not decide it for them, or the API loses its only way to clear a stored ID.
 *
 * Lives here rather than in a server schema module so the create form, the edit form and the
 * API all validate through the same definition as the UI hints.
 */
export function govIdSchema(field: GovIdField) {
	return z
		.string()
		.trim()
		.optional()
		.transform((v) => (v === undefined ? undefined : v || null))
		.refine((v) => v == null || normalizeGovId(field, v) !== null, { message: govIdError(field) })
		.transform((v) => (v == null ? v : (normalizeGovId(field, v) as string)))
}
```

Three deliberate details:

- `v === undefined ? undefined : v || null` — strict `===` on the first branch, because `''` must **not** take it. `v` is already trimmed, so `v || null` maps `''` → `null` and everything else through.
- `v == null` (loose) in both the refine and the second transform — they must now short-circuit on `undefined` as well as `null`. Leaving `v === null` would pass `undefined` into `normalizeGovId(field, value: string)`, which does `value.replace(...)` → `TypeError` on every request that omits the field. **This is the one line that would silently 500 the whole route if copied carelessly.**
- Return type widens to `string | null | undefined`. Assignable at both consumers (§4.2); `pnpm check` gates it.

### Step 2 — `src/routes/api/v1/employees/[id]/+server.ts:32-33`: comment only

The route needs **no logic change** (§4.4). Its contract comment does need to stop being the reason someone re-breaks this.

**Before**

```ts
// #191: a PATCH only carries the fields the caller intends to change, so anything sent
// here is by definition new and is format-checked and stored canonically.
```

**After**

```ts
// #191: a PATCH only carries the fields the caller intends to change, so anything sent
// here is by definition new and is format-checked and stored canonically. #267: "sent" is
// literal — an omitted field is absent from parsed.data and is never written; an explicit ""
// is a request to clear. Both depend on govIdSchema keeping absent and empty distinct.
```

Two lines. It targets the exact assumption whose violation caused the bug, at the site that regressed.

### Step 3 — the two other `govIdSchema` call sites: **no change**

`employees/new/+page.server.ts` and `employees/[id]/+page.server.ts` are **not touched**. Per CLAUDE.md §3 (surgical changes) and the analysis in §4.2, both are provably behaviour-identical before and after Step 1, and both are correct today. In particular the conditional-spread strip at `employees/[id]/+page.server.ts:448-459` **stays** — it is not made redundant by Step 1; it encodes the form's `''` = "leave unchanged" policy, which the API deliberately does not share.

### Step 4 — no schema, migration, or Prisma change

No column, enum, or type change. `pnpm db:push` is not involved.

---

## 6. Tests

Two levels: the shared contract at its source, and the route regression. Both are needed — Step 1 changes shared code, so pinning only the route would leave the other two consumers protected by nothing but this document.

### 6.1 Append to `tests/unit/gov-ids.test.ts` — the schema contract (currently untested, §0.2b)

Add `import { z } from 'zod'` and `govIdSchema` to the existing import, then one `describe` at the end. Four cases, no new harness:

```ts
describe('govIdSchema — absent, empty and value are three different things (#267)', () => {
	const S = z.object({ sssNumber: govIdSchema('sssNumber') })
	// ...
})
```

| #   | Case                       | Asserts                                                                                                                                       |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | key absent — `S.parse({})` | `'sssNumber' in data === false`. **The regression, at its source.**                                                                           |
| 2   | explicit `''`              | `data.sssNumber === null` — clearing still reaches the writer                                                                                 |
| 3   | a value                    | `data.sssNumber === '34-1234567-8'` from input `'3412345678'` — still canonicalised                                                           |
| 4   | a malformed value          | `safeParse({ sssNumber: '1234' }).success === false`, message `govIdError('sssNumber')` — the refine still fires after the `v == null` change |

Case 4 exists specifically to catch the `v == null` hazard from Step 1: if the short-circuit were widened wrongly (e.g. to `!v`), validation would silently stop rejecting `''`-adjacent input.

### 6.2 New file: `tests/unit/employee-api-gov-ids.test.ts` — the route regression

Name parallels the existing route-level file `employee-api-compensation.test.ts`, matching the repo's focused-file convention. **Do not** extend that file: its documented subject is #170 pay routing, and the harness is small enough to stand alone.

Harness: copy the hoisted `dbMock`/`txMock` block and module mocks from `employee-api-compensation.test.ts:13-44` verbatim, plus the `patch()` helper (`:59-65`) and `beforeEach` (`:67-80`). Notes that matter:

- `$lib/server/services/action-proposals` **must** be mocked with both `createProposal` and `assertMayConfirmProposal` — a factory mock replaces the whole module, so an omitted export becomes `undefined` at import time (`employee-api-compensation.test.ts:35-40`).
- `$lib/server/services/employee-access` needs **no** mock: the actor is `HR_ADMIN`, and `canTouchEmployee` short-circuits on `ADMINISTER_HR_ORGWIDE` before any query (`employee-access.ts:43`). Same reason the sibling file gets away without it.
- `EMP` fixture needs `sssNumber` populated so the masked re-fetch has something to mask.

| #   | it                                                            | Body                          | Asserts                                                                                                                                                                                         |
| --- | ------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **a PATCH that omits the government IDs does not write them** | `{ firstName: 'Ana' }`        | 200; `employee.update` called once; its `data` **has** `firstName` and `not.toHaveProperty` for all four of `sssNumber`, `philhealthNumber`, `pagibigNumber`, `tinNumber`. **The filed bug.**   |
| 2   | **an empty PATCH writes nothing at all**                      | `{}`                          | 200; `employee.update` **not called**. Pins the "worse than filed" case _and_ that the `:153` guard regained its meaning (§4.4) — this test fails under Option 2 unless the guard is relocated. |
| 3   | **an explicitly sent ID is still written, canonically**       | `{ sssNumber: '3412345678' }` | 200; `data.sssNumber === '34-1234567-8'`; the other three absent from `data`. Proves the fix did not make the fields unwritable via this route.                                                 |
| 4   | **an explicit empty string still clears the ID**              | `{ sssNumber: '' }`           | 200; `data.sssNumber === null`. Pins the affordance §4.1 is the reason for choosing Option 1 — if a future change reverts to Option 2, this test says so out loud.                              |
| 5   | **a malformed ID is rejected, and nothing is written**        | `{ sssNumber: '1234' }`       | 400; `employee.update` **not called**. Cheap, and guards the refine at the route layer.                                                                                                         |

All five run against the real route → real `updateEmployee` → mocked Prisma, exactly like the sibling file. **Cases 1-4 fail today; case 5 already passes.** 1, 3 and 4 fail because the write carries four nulls where it should carry one field or none; 2 fails because it writes at all. Case 5's malformed value is rejected by the refine before `updateEmployee` is ever reached, so nothing is written either way — it guards the route-layer refine against regression rather than reproducing the bug. Case 4 fails only on its "the other three are absent" assertion; its `sssNumber === null` half is already true pre-fix, which is why that assertion is not optional. Write them first and watch 1-4 fail before applying Step 1.

### 6.3 Existing tests that must stay green **unmodified**

Verified by trace, not assumption:

- `tests/unit/employee-api-compensation.test.ts` — all 5 cases. Bodies are `{basicMonthlySalary}`, `{rateType}`, `{basicMonthlySalary, jobTitle}`. After the fix, the three pay-only bodies leave `rest = {}`, so `updateEmployee` is not called; `assertNoBarePayWrite()` (`:83-88`) iterates zero `employee.update` calls and passes, and `:176`'s `expect(dbMock.employee.update).not.toHaveBeenCalled()` still holds. **No call-count assertions on `employee.findFirst` exist in this file**, so the fewer `getEmployee` round-trips are invisible to it (checked by grep).
- `tests/unit/pay-write-role-context.test.ts` — PATCH body is `{basicMonthlySalary: 50000}`; `employee.update` appears only as a `mockResolvedValue` at `:116`, never in an assertion. Unaffected.
- `tests/unit/gov-ids.test.ts:1-100` — pure helpers, untouched by Step 1.
- `tests/e2e/pii.spec.ts`, `tests/e2e/admin.spec.ts` — GET-only against this route, plus form-driven flows that post every field. Unaffected.

### 6.4 What is deliberately **not** tested

**No unit test is added for the create or edit form actions.** Their behaviour after Step 1 is fully determined by §6.1 case 2 (`''` → `null`), because `Object.fromEntries(await request.formData())` guarantees every gov-ID key is present as at worst `''`. Standing up two new form-action harnesses to assert a proven no-op is the speculative work CLAUDE.md §2 forbids. (`pay-write-role-context.test.ts` shows what such a harness costs: `db`, `audit`, `bcrypt`, `action-proposals`, `employee-access`, `listReportIdsFor`, `branch.findMany`.)

### 6.5 Validation gates — exact commands, in CI order

CI (`.github/workflows/ci.yml`, `quality` job): install → `prisma generate` → `format:check` → `lint` → `check` → `test`. Format gates everything after it. Reproduce in the same order:

```bash
cd <repo-root>

# 0. only if deps / Prisma client are stale (Node 22 + corepack pnpm per the local-dev notes)
corepack pnpm install --frozen-lockfile
pnpm exec prisma generate

# 1. FORMAT — gates the rest in CI, so run it first
pnpm format:check
#    if it fails, format only what you touched (pnpm format rewrites the whole repo):
#    pnpm exec prettier --write src/lib/utils/gov-ids.ts \
#      src/routes/api/v1/employees/\[id\]/+server.ts \
#      tests/unit/gov-ids.test.ts tests/unit/employee-api-gov-ids.test.ts

# 2. LINT
pnpm lint

# 3. TYPECHECK — the gate for the string|null|undefined widening at both form sites
pnpm check

# 4. UNIT — full suite
pnpm test

# fast inner loop (vitest include = tests/unit/**):
pnpm exec vitest run tests/unit/employee-api-gov-ids.test.ts tests/unit/gov-ids.test.ts \
  tests/unit/employee-api-compensation.test.ts tests/unit/pay-write-role-context.test.ts
```

Unit tests need no database (`vitest.config.ts`: `environment: 'node'`, all Prisma access mocked). The Playwright `e2e` job is unaffected.

### 6.6 Optional live verification (not a gate)

Only if end-to-end proof is wanted, using the PR #254 harness (`src/routes/api/v1/_dev/login-as/+server.ts` + curl, app on 5434 via `./start.sh` with `.env.dev`). `Employee` maps to table `employees`; columns are quoted camelCase.

1. Note the four IDs: `SELECT "sssNumber","philhealthNumber","pagibigNumber","tinNumber" FROM employees WHERE id='<emp>';`
2. `PATCH /api/v1/employees/<emp>` with `{"contactPhone":"09171234567"}` → 200, **all four unchanged** (before the fix: all four `NULL`).
3. `PATCH` with `{}` → 200, all four unchanged, no row write.
4. `PATCH` with `{"sssNumber":"3412345678"}` → 200, column is `34-1234567-8`, other three unchanged.
5. `PATCH` with `{"sssNumber":""}` → 200, column is `NULL`, other three unchanged.

---

## 7. PR description — points that must be carried across

1. **The bug is bigger than filed.** It is not only "unless the caller resends them" — a completely empty `PATCH {}` wipes all four, because `Object.keys(rest).length > 0` at `+server.ts:153` could never be false.
2. **The fix is at the schema, not the route**, and why: `.optional()` followed by a transform is a contradiction — the transform runs on `undefined` and its output is written back, so the field was mandatory-with-a-default at every one of its three consumers. Two of them compensate downstream; one did not.
3. **Option 2 (route-level null strip) was considered and rejected**, despite being the smaller diff and having an in-repo precedent: it would turn `{"sssNumber": ""}` into a 200-OK silent discard — the exact failure mode `docs/plans/235-reportstoid-cross-tenant.md` §3 rejected on this same route. Test case 4 in `employee-api-gov-ids.test.ts` pins that.
4. **Flagged, not fixed:** whether clearing a statutory ID should be possible at all via `""` is a product question (§4.5 B). This PR preserves current behaviour; it does not endorse it.
5. **Flagged, not fixed:** a wiped gov ID is not recoverable from the audit log — `HISTORY_FIELDS` deliberately excludes PII (`employees.ts:106-107`). Correct per #111; noted so the incident-recovery limitation is on record.
6. **Origin:** `a18536e` (2026-07-27, #191) swapped all three sites to `govIdSchema` and added the compensating strip to the edit form in the same commit, but not to the API route. Single-commit, single-site oversight — not systemic debt.
7. Per repo CLAUDE.md: **no `Co-Authored-By` / co-author trailer.** PR targets `staging`; issues do not auto-close here (merges land on `staging`, not the default branch) — **close #267 by hand after merge.**
8. **Standalone.** Not stacked on and not related to PR #268 (#235/#263/#264/#265/#266).

---

## 8. Numbered checklist

1. Confirm the branch: `git branch --show-current` → `fix/gov-id-patch-wipe-267`, `git status` clean, `git rev-parse HEAD` → `9e39689…`. Branch is already off an updated local `staging`; no new branch needed.
2. **Write the tests first.** Create `tests/unit/employee-api-gov-ids.test.ts` with cases 1-5 from §6.2 (harness copied from `employee-api-compensation.test.ts:13-80`).
3. `pnpm exec vitest run tests/unit/employee-api-gov-ids.test.ts` → **expect cases 1-4 to FAIL and case 5 to pass** (§6.2). If 1-4 do not all fail, the reproduction is wrong; stop and re-derive before touching source.
4. Append the `describe` block with cases 1-4 from §6.1 to `tests/unit/gov-ids.test.ts`; add `z` and `govIdSchema` to its imports. Run it → **expect case 1 to FAIL**, cases 2-4 to pass.
5. `src/lib/utils/gov-ids.ts:129-145` — apply Step 1: the doc comment, `.transform((v) => (v === undefined ? undefined : v || null))`, and **both** `v === null` → `v == null` changes. _(Step 1)_
6. Re-run steps 3-4's files → **all 9 cases green.**
7. `src/routes/api/v1/employees/[id]/+server.ts:32-33` — extend the contract comment. Comment only; **no logic change, and do not move the `Object.keys(rest).length > 0` guard at `:153`.** _(Step 2)_
8. `employees/new/+page.server.ts` and `employees/[id]/+page.server.ts` — **verify only, no edit.** Confirm the edit form's conditional-spread strip at `:448-459` is still present and untouched. _(Step 3)_
9. `pnpm exec vitest run` on the four files in §6.5's inner loop. `employee-api-compensation.test.ts` and `pay-write-role-context.test.ts` must pass **unmodified** — if either needs a change, the fix altered behaviour it should not have: stop and re-derive.
10. `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`, in that order, all green. `pnpm check` is the real gate on the `string | null | undefined` widening.
11. _(Optional)_ live verification §6.6, all five steps.
12. Commit — concise subject, no co-author trailer. Suggested: `fix(gov-ids): keep an omitted government ID absent instead of null (#267)`.
13. Open the PR `fix/gov-id-patch-wipe-267` → `staging` carrying all eight points from §7. Do **not** base it on or reference PR #268.
14. After merge, close #267 by hand.
