---
name: report:api-v1-raw-error-message-leak
description: 'Four raw e.message forwards survive in the api/v1 JSON endpoints — out of phase 04 scope, tracked here'
date: 03-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: '04'
---

# api/v1 raw `e.message` leak — tracked, not fixed

Raised as **C4** by the phase 04 validate contract. Phase 04 S4 removed all 13 raw `e.message`
arms from the **form actions**, and its gate
(`grep -rn "e\.message" src/routes | grep "fail("`) now returns 0. That gate is narrowed to
`fail(` on purpose, so it does not see these four.

## The four sites

| File | Lines |
|---|---|
| `src/routes/api/v1/leave/[id]/+server.ts` | 64, 65 |
| `src/routes/api/v1/timesheets/[id]/+server.ts` | 60, 61 |

All four have the same shape:

```ts
if (e instanceof Error) {
	const status = (e as { status?: number }).status
	if (status === 404) return apiError(404, e.message)
	if (status === 400) return apiError(400, e.message)
}
throw e
```

## Why it is lower risk than the form-action arms were

These are gated on `status === 404 || status === 400`, which only a typed `error(4xx, msg)` throw
carries. A Prisma failure has no `status`, so it falls through to `throw e` and now reaches the
phase 04 `handleError` hook, which returns the friendly string. So the worst case here is a
service's own 4xx wording reaching an API client — not a database dump.

## Why it is still worth fixing

`(e as { status?: number }).status` is a structural guess, not `isHttpError(e)`. Any thrown object
that happens to carry `status: 400` — including a `fetch` Response wrapper or a third-party
library error — forwards its raw `message` to the client. The rest of the codebase settled on
`isHttpError`; these two files did not.

## Proposed fix (small)

Replace the structural check with `isHttpError(e)` in both files and read `e.body.message`, exactly
as `$lib/server/form-fail.ts` already does for form actions. Roughly 8 lines across 2 files, plus a
unit test asserting a non-HttpError with a planted `status` does NOT have its message forwarded.

## Scope note

Out of phase 04's blast radius: phase 04 claims form-action return shapes, not the `api/v1` JSON
surface. Changing an API error body is a public-contract change and wants its own gate.
