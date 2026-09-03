# PR #7 — CodeRabbit findings

Review of `fix/org-scoping-audit-tx-4-5` at `e754c3d`. Three findings, all verified against
source before planning. Baseline: 31 commits, tree clean, 2113 unit + 4 integration green.

## Verification

| Ref | Claim | Verdict |
|---|---|---|
| C1 | `rejectProposal` read-then-update races `confirmProposal`'s guarded claim | **Valid** |
| C2 | The sweep's parse failure reads as compliant | **Valid** |
| C3 | Aliased `tx` delegates make the class-D assertion toothless | **Partly valid, stated cause wrong** |

### C1 — valid, and pre-existing

`confirmProposal` (`statutory-rates.ts:373`) claims atomically:
`updateMany({ where: { id, organizationId, status: 'PENDING' } })`, then `if (claim.count === 0) error(404)`.

`rejectProposal` (`:418`) reads first, then writes `update({ where: { id: proposalId } })` — no
status guard, no org guard. Under READ COMMITTED a confirm can claim and apply while a reject
whose pre-read saw PENDING then overwrites the row to REJECTED. The rate config is live and the
proposal says rejected. Two racing rejects both succeed and both audit.

**This PR did not introduce it.** The diff only wrapped the existing `findFirst` + unguarded
`update` in a transaction. CodeRabbit did not say this, and it changes the framing: fixing it is
a scope decision, not a regression repair. Fixing anyway — it is a correctness bug in a file this
PR already touches, the safe shape already exists six lines above, and the user asked for
actionable findings to be acted on.

Self-reject is a live path, not a dead one: `confirmProposal:391` documents that self-REJECT
stays allowed by design.

### C2 — valid, one line

`audit-client-sweep.test.ts:82` sets `client: (args(...)[2] ?? '').trim()`, and `:88` filters
`s.client === 'db'`. A splitter miss yields `''`, which is not `'db'`, so the site drops out of
`dbSites` and passes every assertion. A guard whose parse failures read as compliant is the wrong
default.

CodeRabbit is right that argument *omission* is unreachable — `client` is required, so `tsc`
rejects a two-argument call. Parse failure is the only path, which is why this is minor.

### C3 — the residual point is real, the stated reason is not

CodeRabbit says aliasing `tx.actionProposal` to `dbMock.actionProposal` means "the class-D
assertion cannot tell the two clients apart". That is **false**. The class-D assertion at `:367`
asserts the third argument of `writeAuditLog`, which is the `tx` *container* — a genuinely
distinct object. It was empirically shown to fail: wrapping the reveal audit in a transaction
turned it red. Its teeth are not in question.

What is true is narrower and CodeRabbit did not state it: there is no assertion anywhere in the
file that the confirm path's `updateMany` ran on the transaction client. `:339` asserts
`dbMock.actionProposal.updateMany`, and because the delegates are aliased that passes whether the
code used `tx` or `db`. So a regression of the *mutation* to the shared client is unguarded, even
though a regression of the *audit row* is guarded.

Worth closing, because that is the same failure #5 was about. Not because the class-D assertion
is weak.

Note the tradeoff the aliasing was solving: `:223`, `:298`, `:314`, `:328` and `:339` all read
call history off `dbMock.actionProposal`. Giving `tx` a fresh delegate breaks every one of them
unless they are retargeted deliberately.

## Sections

### S1 — guard the reject claim (C1)

`src/lib/server/services/payroll/statutory-rates.ts`, `rejectProposal`.

Replace the unguarded `update` with the same claim shape `confirmProposal` uses: a status- and
org-guarded `updateMany` inside the transaction, `error(404)` when `count === 0`, then
`findUniqueOrThrow` to read the row back for the return value and the audit payload.

The pre-read stays: `oldValue.proposedById` comes from it, and it gives the 404 its normal path.
It is no longer the guard, only the payload source. Say that in a comment so nobody deletes it
as redundant or reinstates it as the check.

Gate: a test that a reject whose claim matches zero rows throws 404 and writes no audit row, and
that the successful path still audits on `tx`.

### S2 — fail the sweep on an unparsed client (C2)

`tests/unit/audit-client-sweep.test.ts`. Treat `''` as a violation, not a pass.

Do not just widen the filter — an empty client and a bare `db` are different failures and should
not report as the same thing. Give the parse failure its own assertion and its own message.

Gate: the assertion must be watched failing. Feed the walker a call it cannot split and confirm
the test goes red naming that site.

### S3 — guard the confirm path's mutation client (C3)

`tests/unit/proposal-queue.test.ts`. Give `tx.actionProposal` its own delegate and retarget the
assertions that belong to it.

Rules:
- An assertion about a call the code makes INSIDE the transaction targets `tx`.
- An assertion about a call OUTSIDE it stays on `dbMock`.
- `.not.toHaveBeenCalled()` assertions must cover BOTH clients, or they weaken rather than
  strengthen: "never updated" means neither client updated.

Read `applyProposedChange` and the confirm action to decide which is which. Do not guess from the
current assertion text.

Leave the other six aliased delegates alone. Only `actionProposal` has an unguarded mutation.

Gate: retarget, then prove it. Point the confirm path's `updateMany` at `db` in the source,
confirm the test goes red, restore.

## Non-goals

- The other 25 pass-through `$transaction` mocks. Unchanged decision; the source scan holds that
  line.
- `payroll-statutory-proposal.test.ts` is itself a `tx === db` file (`:28` says so outright). S1
  needs a test there; converting the whole file is not in scope.
- Any other proposal flow. `action-proposals.ts` has its own confirm/reject pair and was not
  flagged; it is not being audited here.

## Commits

One per section. No `Co-Authored-By`, no attribution footer.

## Gates

`pnpm check` 0 errors, full unit suite, integration tier, both static sweeps. Unit count must
rise from 2113.
