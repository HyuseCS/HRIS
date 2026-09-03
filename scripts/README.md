# Veent HRIS — Discord Time-Tracking Bot

A standalone Discord bot that replaces manual `#in-and-out` messages with **slash commands**
`/in` and `/out`. The command is not a chat message; the bot sends an **HMAC-signed**
request to the HRIS `POST /api/v1/timesheets/log` endpoint (recording a `TimeLog` punch against the
employee linked by `discordId`), then posts a **public announcement** ("🟢 Elena clocked in at 9:00 AM")
so everyone sees who's in and out. The invoker gets a private (ephemeral) acknowledgement.

- **Breaks are not punched.** Members clock in once in the morning and out once in the afternoon;
  the shift's unpaid meal break is deducted automatically when the day is derived
  (`src/lib/server/services/attendance/derive.ts`).
- Each command takes an **optional `time`** (e.g. `/in 9:00`, `/out 5:30pm`) to backfill a forgotten
  punch; omit it and the current time is used. Times are interpreted in Philippine Standard Time.

```text
/in [time]  /out [time]
        │
        ▼
scripts/discord-bot.ts ──HMAC-signed POST──▶ /api/v1/timesheets/log
        │                                          │
  public announcement                       recordPunch() → TimeLog row
  + ephemeral ack                                  │
                              HR: attendance derivation → timesheet/payroll
```

## Prerequisites

1. A Discord application + bot ([Developer Portal](https://discord.com/developers/applications)).
   - Copy the **bot token** → `DISCORD_BOT_TOKEN`.
   - Invite the bot with the `bot` **and `applications.commands`** scopes and **Send Messages** permission.
   - No privileged intents are required (the bot only uses `Guilds`).
   - Slash commands register automatically to every server the bot has joined (instant).
2. Each employee's Discord user id stored on their HRIS profile (`Employee.discordId`).
   Set it via HR (**Employees → employee → Discord ID**) or `prisma studio`. Get a user's id in
   Discord with Developer Mode → right-click user → Copy User ID.

## Configuration

Add to `.env` (see `.env.example`):

```dotenv
TIMELOG_API_SECRET="<same random secret the HRIS uses>"
DISCORD_BOT_TOKEN="<bot token>"
HRIS_API_URL="http://localhost:5173"   # or your deployed HRIS URL
```

`TIMELOG_API_SECRET` **must be identical** in the HRIS environment and the bot
environment — it is the shared key used to sign and verify every punch.

## Running

```bash
pnpm bot
```

On startup the bot registers `/in` and `/out` to every server it has joined. Members type
`/in` (optionally `/in 9:00` to backfill), get a private confirmation, and the bot posts the public
announcement. `pnpm bot` is fine for local development, but for production run it under a process
manager so it restarts on crash and on server reboot — see **Production deployment** below.

## Production deployment

The bot is a single long-lived process. It holds one Discord gateway connection and makes outbound
HMAC-signed HTTP calls to the HRIS — it does **not** listen on any port, so there is nothing to
reverse-proxy. Production hardening is therefore just: keep it running, restart it on failure, start
it on boot, and rotate its logs. Either pm2 or systemd below does this; pick one.

Run the bot from the repo root with the same `.env` used by `pnpm bot`. Ensure `tsx` is installed
(it is a dev dependency; on a production box run `pnpm install` or install `tsx` globally).

### Option A — pm2

Good if you already manage other Node processes with pm2. Create `ecosystem.config.cjs` in the repo
root:

```js
module.exports = {
	apps: [
		{
			name: 'veent-hris-bot',
			script: 'pnpm',
			args: 'bot',
			cwd: '/opt/veent-hris', // absolute path to the repo on the server
			autorestart: true,
			max_restarts: 10,
			restart_delay: 5000, // back off 5s between restarts to avoid Discord rate limits
			env: { NODE_ENV: 'production' }
		}
	]
}
```

```bash
pm2 start ecosystem.config.cjs
pm2 save                     # persist the process list
pm2 startup                  # print the command to enable pm2 on boot — run what it prints
pm2 logs veent-hris-bot      # tail logs
```

pm2 captures stdout/stderr and rotates logs if you add the `pm2-logrotate` module
(`pm2 install pm2-logrotate`).

### Option B — systemd (no pm2 dependency)

Preferred if you want the bot supervised by the OS with no extra runtime. Create
`/etc/systemd/system/veent-hris-bot.service`:

```ini
[Unit]
Description=Veent HRIS Discord time-tracking bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=veent
WorkingDirectory=/opt/veent-hris
EnvironmentFile=/opt/veent-hris/.env
ExecStart=/usr/bin/pnpm bot
Restart=on-failure
RestartSec=5
# Discord rate-limits reconnect storms; cap restart attempts per window.
StartLimitIntervalSec=60
StartLimitBurst=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now veent-hris-bot   # start now + on boot
sudo systemctl status veent-hris-bot
journalctl -u veent-hris-bot -f              # tail logs (rotated by journald)
```

Notes:

- `EnvironmentFile` reads the same `.env` (`DISCORD_BOT_TOKEN`, `HRIS_API_URL`, `TIMELOG_API_SECRET`).
  Keep it `chmod 600` and owned by the service user — it holds the bot token and HMAC secret.
- If `pnpm` is not on the system `PATH` for the service user, use the absolute path in `ExecStart`
  (`which pnpm`), or `ExecStart=/usr/bin/node /path/to/tsx scripts/discord-bot.ts`.
- After a code update, `sudo systemctl restart veent-hris-bot` (pm2: `pm2 restart veent-hris-bot`).

### Health & recovery

- On boot the bot re-registers `/in` and `/out` in every guild — restarting is always safe and
  idempotent, no manual re-registration needed. Discord drops any command the bot no longer
  registers, so a retired command (e.g. the old `/break`) disappears on the next restart.
- A wrong or revoked `DISCORD_BOT_TOKEN` makes login fail immediately; the process exits and the
  supervisor keeps retrying. Check the logs — do **not** raise `max_restarts` to mask a bad token.
- The bot is stateless: every punch is derived from the member's last `TimeLog` by the HRIS, so a
  restart never loses or double-counts punches.

## Fallback when the bot is down

Punching is a convenience layer over `TimeLog`; attendance is never blocked by the bot being offline.
If the bot is unavailable (deploy in progress, token issue, Discord outage), record time via either:

- **HRIS timesheet review UI** — HR can add or edit punches directly on the timesheet review page,
  then aggregate and approve as usual. This is the normal correction path for a missed or wrong punch.
- **Backfill after recovery** — once the bot is back, members can supply the forgotten time inline:
  `/in 9:00`, `/out 5:30pm`. The optional `time` argument writes the punch at the intended PHT time
  rather than "now", so a bot outage during the day can be reconciled without HR intervention.

Because a member's state is read from their last punch on the HRIS side, these fallback edits and
later slash commands stay consistent with each other automatically.

## Security model

- Every request is signed: `HMAC-SHA256(key=TIMELOG_API_SECRET, msg=`\``${timestamp}.${rawBody}`\``)`,
  sent as `x-hris-signature` with the unix `x-hris-timestamp`.
- The endpoint recomputes the signature over the raw body and rejects it unless it
  matches **and** the timestamp is within ±5 minutes (replay protection).
- The bot never trusts client-supplied identity beyond the Discord user id; the HRIS
  maps that id → employee and refuses unknown/inactive accounts.

## Troubleshooting

| Symptom                                                         | Cause / fix                                                                |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `⚠️ Could not record your punch: No active employee is linked…` | Set `Employee.discordId` for that member.                                  |
| `Invalid or missing signature` (401)                            | `TIMELOG_API_SECRET` differs between bot and HRIS, or clock skew > 5 min.  |
| Slash commands not showing                                      | Bot invited without the `applications.commands` scope — re-invite with it. |
| Announcement not posted                                         | Bot lacks **Send Messages** permission in that channel.                    |
| `Couldn't read the time`                                        | Use a form like `9:00`, `13:30`, or `1:30pm`.                              |

---

# Scheduled jobs (droplet crontab)

The app has **no scheduler** — nothing inside SvelteKit runs on a timer. Recurring jobs are
one-shot scripts under `scripts/`, invoked by cron on the droplet.

`scripts/` is baked into the production image and `tsx` survives `pnpm prune --prod`, so any
script here runs in prod unchanged.

> **These crontab entries live outside the repo.** `deploy.yml` does `git reset --hard
origin/main`, which will **not** create them — they must be installed once, by hand, on the
> droplet (`crontab -e`). They are recorded here so they are recoverable if the box is rebuilt.

## Automatic regularization — `promote-probationary.ts`

PH probation caps at 6 months. This flips ACTIVE `PROBATIONARY` employees to `REGULAR` once
6 whole calendar months of service have elapsed, writes the same audit entry a manual HR
promotion would (so it shows in the 201 file's Employment History), and notifies that org's HR.
Since #222 it goes through `promoteEmployee`, effective on the day probation actually ended —
so a cron that missed a few nights backdates correctly instead of dating the change to the sweep.

```text
0 1 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/promote-probationary.ts >> /var/log/veent-regularize.log 2>&1
```

Runs 01:00 droplet time. `docker compose run --rm` costs no idle RAM on the 512MB droplet — the
same pattern the compose header documents for seeding.

Dry run first when testing (lists who _would_ be promoted, writes nothing):

```bash
docker compose run --rm app pnpm exec tsx scripts/promote-probationary.ts --dry-run
```

Idempotent — the query only matches `PROBATIONARY`, so re-running the same night is a no-op.
It requires the seeded `system@veent.ph` user (`AuditLog.actorId` is a non-nullable FK, so an
automated actor is mandatory); the script exits 1 with a clear message if it is missing.

## Automatic document backup — `backup-documents.ts`

Document **bytes** live only on local disk under `UPLOAD_DIR` — never in Postgres — so
`pg_dump` backs up every document row and none of the files (#164). This copies every
`EmployeeDocument` and `RequestDocument` file to a second destination, writes a
`manifest.json` describing each one (employee, category, label, original filename, MIME,
size, upload date, SHA-256), records the outcome as a `BackupRun`, prunes to the org's
retention setting, and notifies that org's `ADMINISTER_SYSTEM` holders when a run is not
clean.

Schedule and retention are per organization and edited in the app at **Settings → Document
Backup**. This cron entry only _offers_ the script a chance to run each night; the script
exits doing nothing when the org's interval has not elapsed.

```text
30 2 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts >> /var/log/veent-backup.log 2>&1
```

Runs 02:30 droplet time — after the 01:00 regularization sweep, so the two never contend for
the 512MB box. `docker compose run --rm` costs no idle RAM.

**`BACKUP_DIR` and `UPLOAD_DIR` must both be mounted volumes** (see `docker-compose.yml`).
A `--rm` container's own filesystem is discarded when it exits, so a backup written to an
unmounted path is deleted the moment the script finishes.

Dry run first when testing (lists what _would_ be copied, writes nothing anywhere):

```bash
docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts --dry-run
```

Force a run outside the configured interval (still honours the lock and retention):

```bash
docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts --force
```

Locally, in **fish** — `VAR=value cmd` is bash-only syntax and fails in fish, so prefix with
`env`. `dotenv-cli` does not override an already-set variable, so the `env` prefix wins over
any `BACKUP_DIR` line in `.env.dev`:

```
env BACKUP_DIR=$PWD/backups pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --dry-run
```

Concurrency-safe: each org is held under a session-level advisory lock for the duration, so a
run that overruns into the next night makes the next invocation skip that org rather than copy
the same files twice. The lock uses the two-argument form
`pg_try_advisory_lock(164, hashtext(key))`, which is a **different namespace** from the
single-`bigint` form `timesheets.ts` and `payroll/index.ts` block on — sharing it would let a
minutes-long backup stall a payroll write on a hash collision.

Refuses to start at all if `BACKUP_DIR` is inside `UPLOAD_DIR` (or vice versa) — that
configuration makes each night's backup include the previous night's. The refusal happens
before the first organization is touched, so a misconfigured box writes nothing at all.

It warns when `BACKUP_DIR` and `UPLOAD_DIR` share a filesystem. On the droplet `pgdata`,
`uploads` and `backups` are all named volumes on one disk, so an unpruned backup tree can fill
the disk Postgres writes to. Keep `retentionCount` low until backups live on separate storage.

Unlike `promote-probationary.ts`, this writes **no** `AuditLog` entry and therefore does **not**
need the seeded `system@veent.ph` user. The `BackupRun` row is the durable record and is richer
than an audit entry (counts, bytes, manifest checksum, sanitized reason). Editing the backup
config in the app _is_ audited, with the real actor.

Exits 1 if any org's run failed, so a failure is visible in `/var/log/veent-backup.log` and in
cron mail even before anyone opens the app.

**Restore is not implemented** (out of scope for #164). Until it is, restoring means: copy
`files/` back under `UPLOAD_DIR` preserving relative paths, and reconcile the rows using
`manifest.json`, whose `path` field is always `files/` + the row's `storageKey`.

## Automatic review cycles — `generate-review-cycles.ts`

Performance evaluation runs on a per-organization cadence (#178). There is no manual "create
cycle" screen any more — this script creates the next `ReviewCycle` as `ACTIVE`, opens a
`PerformanceReview` for every active employee that has both an assigned template and a
manager, snapshots that template onto each review, and notifies each employee with a link to
their review.

Cadence (interval in months, due days, on/off) is per organization and edited in the app at
**Settings → Performance**. This cron entry only _offers_ the script a chance to generate each
night; the script exits doing nothing when the org's interval has not elapsed. An org with no
config row uses the defaults and is never written to by this script.

```text
0 2 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/generate-review-cycles.ts >> /var/log/veent-review-cycles.log 2>&1
```

> **`deploy.yml` does NOT create this crontab entry.** As stated for this file as a whole, the
> deploy does `git reset --hard origin/main` and never touches the droplet's crontab. This
> line must be installed once, by hand, with `crontab -e`. If it is missing, no review cycle
> is ever generated and nothing in the app complains — the only symptom is an empty cycle list.

Runs 02:00 droplet time, **daily** even though a cycle is due only every couple of months, so
a cadence boundary is never missed by more than a day. It sits between the 01:00 regularization
sweep and the 02:30 document backup, so the three never contend for the 512MB box.

Dry run first when testing (lists the cycle and reviews it _would_ create, writes nothing):

```bash
docker compose run --rm app pnpm exec tsx scripts/generate-review-cycles.ts --dry-run
```

Force a run outside the configured cadence:

```bash
docker compose run --rm app pnpm exec tsx scripts/generate-review-cycles.ts --force
```

Idempotent at the **database**, not by the script's own care:
`ReviewCycle @@unique([organizationId, startDate, endDate])` makes a second create for the same
period raise `P2002`, which the script reports as "already generated — skipped" rather than as
a failure. There is deliberately **no advisory lock** — generation fires at most once every
`intervalMonths` from one crontab line, and the unique constraint plus a single transaction
turns any genuine overlap into that caught `P2002` instead of a duplicate row. A lock would add
the connection-pinning trap `backup-documents.ts` has to live with, for a race that cannot
produce a bad row.

All month arithmetic lives in `src/lib/server/performance/cycle-plan.ts`, never in the script:
"is a cycle due?" is answered on a **Manila** basis (a wall-clock business question) and "what
are the period's dates?" on a **UTC month-stepping** basis (the day-of-month must survive the
step). The two disagree on purpose — see the file's header.

Like `promote-probationary.ts` and unlike `backup-documents.ts`, it writes an `AuditLog` entry
and therefore requires the seeded `system@veent.ph` user (`AuditLog.actorId` is a non-nullable
FK); the script exits 1 with a clear message if it is missing. A cycle appearing in HR's list
with no actor would be unexplainable.

Employees who get no review are **reported, never silent**: the run prints each one with its
reasons (`no-template-assigned`, `no-manager`, `template-invalid`), and the same list is
recomputed on demand in the app.

Exits 1 if any org failed, so a failure is visible in `/var/log/veent-review-cycles.log` and in
cron mail before anyone opens the app.

## Review reminders — `send-review-reminders.ts`

Nudges the people who still owe something on an open performance review (#178). It never
creates a cycle — `generate-review-cycles.ts` does that — it only looks at reviews that are
already open and asks the pure planner
(`src/lib/server/performance/reminder-plan.ts`) which of four kinds applies:

| Kind           | When                                            | Who is nudged              | Channels           |
| -------------- | ----------------------------------------------- | -------------------------- | ------------------ |
| `opened`       | the review is open and not yet near its due day | employee                   | in-app + **email** |
| `due-soon`     | within 3 days of the due day                    | evaluator                  | in-app only        |
| `overdue`      | past the due day                                | employee **and** evaluator | in-app + **email** |
| `awaiting-ack` | completed, employee has not acknowledged        | employee                   | in-app only        |

The due day is the org's `dueDays` (Settings → Performance, default 14) counted from the day
the review opened, compared on the **Manila** calendar — a wall-clock business question, so a
UTC comparison would be up to 8 hours wrong. All of that lives in the planner; the script
itself does no date arithmetic.

**At most one reminder per review per run**, the most urgent, and never the same kind twice in
a row: `PerformanceReview.lastReminderKind` is compared before sending. Escalation still
fires — `due-soon` followed by `overdue` is a different kind.

```text
0 */6 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/send-review-reminders.ts >> /var/log/veent-review-reminders.log 2>&1
```

> **`deploy.yml` does NOT create this crontab entry.** As stated for this file as a whole, the
> deploy does `git reset --hard origin/main` and never touches the droplet's crontab. This
> line must be installed once, by hand, with `crontab -e`. If it is missing, no reminder is
> ever sent and nothing in the app complains — the only symptom is a review nobody chases.

Runs every six hours, unlike the once-nightly jobs: "due soon" and "overdue" are questions
about real time, so the answer changes during the day.

Dry run first when testing (prints every reminder it _would_ send, writes nothing and sends
nothing):

```bash
docker compose run --rm app pnpm exec tsx scripts/send-review-reminders.ts --dry-run
```

Locally:

```bash
pnpm exec dotenv -e .env.dev -- tsx scripts/send-review-reminders.ts --dry-run
```

Unlike `promote-probationary.ts` and `generate-review-cycles.ts`, it writes **no** `AuditLog`
entry and therefore does **not** need the seeded `system@veent.ph` user. A reminder is not a
domain mutation, and the `lastReminderAt` / `lastReminderKind` columns are the durable record.

There is deliberately **no advisory lock**. Overlap needs two runs alive at once, and the
de-duplication columns turn a genuine overlap into at worst one duplicate notification —
harmless, versus the connection-pinning trap a session lock would add
(`src/lib/server/backup/plan.ts`). Revisit if the job ever runs longer than a minute.

Exits 1 if any org failed, so a failure is visible in `/var/log/veent-review-reminders.log`
and in cron mail before anyone opens the app.

## Outbound email — the six `SMTP_*` variables

Every `send*` in `src/lib/server/notifications.ts` — welcome, Discord invite, timesheet
status, leave status, interview scheduled, offboarding notice, review reminder — delivers
through the single seam in `src/lib/server/mailer.ts`.

| Variable      | Default     | Meaning                                                        |
| ------------- | ----------- | -------------------------------------------------------------- |
| `SMTP_HOST`   | _none_      | Mail host. **Absent = unconfigured**; nothing else is read.    |
| `SMTP_PORT`   | `587`       | `587` = STARTTLS, `465` = implicit TLS.                        |
| `SMTP_SECURE` | `false`     | Set `true` only with port 465.                                 |
| `SMTP_USER`   | _none_      | Auth user. Omit with `SMTP_PASS` for an unauthenticated relay. |
| `SMTP_PASS`   | _none_      | Auth password. **Never commit a real value.**                  |
| `SMTP_FROM`   | `SMTP_USER` | Envelope/From address.                                         |

Locally they live in `.env.dev` (**there is no `.env`**), which is git-ignored; the committed
placeholders are in `.env.dev.example` and `.env.prod.example`. On the droplet they go in the
production env file the compose stack reads.

**Unconfigured is the normal case, not an error.** With no `SMTP_HOST` every send logs

```text
[NOTIFY] (no SMTP_HOST — not sent) <so***@example.com>: Performance review open — Aug–Sep 2026
```

and returns. The recipient's local part is masked; the domain and the subject are kept, because
those are the diagnostic. `deliver` is a synchronous `void` function and **never throws**:
delivery is fire-and-forget, so a mail outage can never fail the HTTP request that triggered it.
A real send that fails is logged as `[NOTIFY] delivery failed: <reason>` and nothing else
happens.

### Type-checking scripts

`pnpm check` does **not** cover `scripts/**` or `prisma/**` — one site has already shipped
broken on that assumption (#282). Nothing in this directory is typechecked by the standard
gate. To check it by hand:

```bash
printf '%s' '{"extends":"./.svelte-kit/tsconfig.json","compilerOptions":{"allowJs":true,"checkJs":true,"esModuleInterop":true,"resolveJsonModule":true,"skipLibCheck":true,"strict":true,"moduleResolution":"bundler"},"include":["scripts/**/*.ts","src/**/*.ts"]}' > tsconfig.scripts.json
pnpm exec svelte-kit sync && pnpm exec tsc --noEmit -p tsconfig.scripts.json
rm tsconfig.scripts.json
```

`pnpm exec tsc --noEmit scripts/<file>.ts` on its own does **not** work: passing a file
directly makes tsc ignore `tsconfig.json`, so every `$lib/...` import fails to resolve and the
errors are noise. The config above is required.
