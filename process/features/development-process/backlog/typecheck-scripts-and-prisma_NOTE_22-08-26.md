---
name: note:typecheck-scripts-and-prisma
description: "OPEN — no gate typechecks scripts/** or prisma/**. One site has already shipped broken on that gap (#282); #164 added a documented manual command as a stopgap"
date: 22-08-26
feature: development-process
---

# Known gap — `pnpm check` does not cover `scripts/**` or `prisma/**`

**Status: OPEN.** A stopgap is documented; the real fix is a CI gate.

## The gap

`pnpm check` runs `svelte-check --tsconfig ./tsconfig.json`, which resolves its file set
from the SvelteKit project. `scripts/**` and `prisma/**` are outside it. Verified directly:
`tsc --listFiles | grep -c scripts/backup-documents` returns `0`.

This is not theoretical. In #282 a site inside these directories shipped broken because a
green `pnpm check` was read as proof that everything compiled.

## Why it matters more now

`scripts/` holds every recurring job: `promote-probationary.ts`, `sweep-orphan-uploads.ts`,
the migration scripts, the Discord bot, and since #164 `backup-documents.ts`. None of them
is typechecked by any gate, and they all run unattended against the production database.

## The stopgap (recorded in `scripts/README.md`)

```bash
printf '%s' '{"extends":"./.svelte-kit/tsconfig.json","compilerOptions":{"allowJs":true,"checkJs":true,"esModuleInterop":true,"resolveJsonModule":true,"skipLibCheck":true,"strict":true,"moduleResolution":"bundler"},"include":["scripts/**/*.ts","src/**/*.ts"]}' > tsconfig.scripts.json
pnpm exec svelte-kit sync && pnpm exec tsc --noEmit -p tsconfig.scripts.json
rm tsconfig.scripts.json
```

Note that `pnpm exec tsc --noEmit scripts/<file>.ts` does NOT work: passing a file directly
makes tsc ignore `tsconfig.json` entirely, so every `$lib/...` import reports as unresolved
and the real errors are buried in noise. Anyone who tries the obvious command concludes the
script is broken when it is not.

## The real fix (out of scope for #164)

Commit a permanent `tsconfig.scripts.json`, add `"check:scripts"` to `package.json`, and run
it in CI alongside `pnpm check`.

## Two PRE-EXISTING failures this surfaced

Both were found while verifying #164 and are deliberately NOT fixed there — they are
unrelated to document backup and fixing them would have been out-of-scope drift:

- `scripts/migrate-leave-to-request.ts:80` — passes `actorId` where the writer expects `actor`.
- `src/routes/api/v1/timesheets/log/+server.ts:3` — imports `$env/dynamic/private`, which
  the script-scoped config cannot resolve.
