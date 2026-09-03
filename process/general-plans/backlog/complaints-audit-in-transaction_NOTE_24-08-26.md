---
name: note:complaints-audit-in-transaction
description: "writeAuditLog and notify() run outside the db.$transaction in postComplaintMessage, a partial-write risk (#112 SPEC out-of-scope)"
date: 24-08-26
feature: hr-complaints-112
---

# Known gap — writeAuditLog/notify outside the transaction

`postComplaintMessage` in `src/lib/server/services/complaints/index.ts` calls
`writeAuditLog` and `notify()` **after** the `db.$transaction` that writes the message and
flips the complaint's status, not inside it. `writeAuditLog` already accepts a transaction
client, so it could be moved in.

## The risk

If the process crashes or the connection drops between the transaction commit and the
`writeAuditLog`/`notify` calls, the message and status change persist but the audit trail
entry and the notification are silently lost. For a feature whose SPEC criterion 8 requires
"every open, reply, and resolve action logged", a lost audit row on a real (if rare) failure
window is exactly the kind of gap that undermines that guarantee.

## Fix option

Move both calls inside the same `db.$transaction` callback, passing the transaction client
through to `writeAuditLog`. `notify()` may not support a transaction client — check its
signature first; if it does not, it can stay outside (a lost notification is lower-stakes
than a lost audit row) while `writeAuditLog` moves in.

## Priority

Low. Not asked for by issue #112, not required by any acceptance criterion. SPEC explicitly
listed it as out of scope.
