# Orchestrator spot-checks (verified directly, 2026-09-01)

## Class D — all four CONFIRMED, evidence stronger than research stated
- `login/+page.server.ts:73` LOGIN_FAILED — NO database mutation exists. Only `recordFailure(rateKey)`,
  in-memory rate limiting. Nothing to roll back. Definitively D.
- `login/+page.server.ts:99` LOGIN — `cookies.set(sessionCookie...)` happens BEFORE the `Promise.all`.
  The login already succeeded. Definitively D.
  **Pre-existing oddity to note in the PR, not fix:** the `Promise.all` pairs the `lastLoginAt` update
  with the audit write, so either failing gives the user an error while they hold a valid session cookie.
  Unchanged by #5.
- `reports/audit-log/+page.server.ts:141` — audits a READ, comment states the invariant. D.
- `employees.ts:332` — audits a READ of PII, gated on `opts.audit`. No mutation. D.
  Note: `employees.ts:314` is ALSO a #4 site in the same function region (`revealEmployeeSensitive`).
  Covered by D7 sequencing.

## Array-form (Tier 2) — all five CONFIRMED, plus three traps research did not name
- `supervisors.ts:75` — `deleteMany` + conditional spread `createMany`. The spread must survive the
  conversion to interactive form.
- `complaints/index.ts:145` — two plain creates/updates. Cleanest of the five.
- **`employees.ts:1220` — the return value is DESTRUCTURED: `const [employee] = await db.$transaction([...])`.**
  Converting to `async (tx) => {...}` must return the employee explicitly or the caller breaks.
  This is the one array-form site that is not a pure mechanical swap.
- **`onboarding.ts:357` and `offboarding.ts:211` are `.map()`-GENERATED arrays** of N `update` calls
  (a checklist reorder). Interactive form turns one batched round-trip into N sequential awaits inside
  a transaction. Correct but slower. N is small (checklist length), so acceptable — but the executing
  agent must not be surprised, and must not "optimise" it back to the array form.
