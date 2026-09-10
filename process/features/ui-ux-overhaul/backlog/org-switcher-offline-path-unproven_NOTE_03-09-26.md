---
name: note:org-switcher-offline-path-unproven
description: "The org-switcher's new catch arm is built but its offline/throw path cannot be provoked reliably locally"
date: 03-09-26
feature: ui-ux-overhaul
---

# The org-switcher `catch` arm is unproven

**Source.** Phase 04 validate-contract, Known-Gap (CONDITIONAL) row: "Offline org-switch `catch`
path — cannot be provoked reliably locally."

## What was built (phase 04, S5 item 36 / S6 item 52)

`src/routes/(app)/+layout.svelte`, `switchOrg()` had `try { … } finally { switchingOrg = false }`
with **no `catch`**. A `fetch` that threw — offline, DNS failure, the dev server restarting
mid-click — cleared the busy flag and said nothing at all. The menu stayed open on the old org and
the user had no way to tell the switch had failed.

It now has:

```ts
} catch {
    addToast('Could not switch organization.', { kind: 'error' })
} finally {
    switchingOrg = false
}
```

The `!res.ok` branch already toasted; it was upgraded to `kind: 'error'` at the same time, since
phase 04 makes the error variant real.

## Why it is unproven

`fetch` only rejects on a NETWORK failure, not on an HTTP error status. To reach this arm a test
has to genuinely break the transport:

- Killing the dev server mid-request is a race — the click has to land inside a window of a few
  hundred milliseconds.
- Chrome DevTools offline mode does provoke it, but only under a browser session driven by hand.
- A unit test cannot reach it: the code is inside a `.svelte` component's event handler, and the
  repo's vitest environment is `node` with no DOM (see the `component-test-dom-environment` note).

Neither a Fully-Automated nor a repeatable Hybrid gate exists for it today, so it is recorded as a
named residual rather than pretended-proven.

## What building this looks like

Cheapest credible option, in order:

1. **Playwright route interception.** `page.route('**/api/v1/session/switch-org', r => r.abort())`
   aborts the request at the transport layer, which IS what makes `fetch` reject. One spec:
   abort, click the other org, assert the error toast; positive control = the same click without
   the abort, asserting the org actually switches. This is the real fix and it is small — it
   needs the toast locator helper described in
   `e2e-flakiness-blocks-feedback-regression_NOTE_03-09-26.md`.
2. **Component test.** Blocked on the DOM-environment gap above; not worth unblocking for one arm.

Until (1) exists, treat the `catch` as reviewed-but-undriven: the code is three lines and reads
correctly, but no evidence says it fires.
