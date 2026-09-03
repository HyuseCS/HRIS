// The single delivery point behind every send* in src/lib/server/notifications.ts (#178,
// plan items 159-161).
//
// UNCONFIGURED IS THE NORMAL CASE, not an error: with no SMTP_HOST this logs the same
// [NOTIFY] line the stubs logged before and returns. It MUST NEVER THROW — a mail outage
// must not fail the HTTP request that triggered it.
//
// Deliberately returns `void`, not a Promise. Every send* in notifications.ts is a
// synchronous void function called WITHOUT `await`; making them async would change call
// sites across onboarding, timesheets, leave, recruitment and offboarding for no benefit.
// Delivery is therefore fire-and-forget: a failure is logged, never surfaced.
//
// Environment (all six live in .env.dev locally — THERE IS NO .env — and in the droplet's
// environment in production; see scripts/README.md § "Outbound email"):
//
//   SMTP_HOST    mail host. ABSENT = unconfigured = console fallback. Nothing else is read.
//   SMTP_PORT    default 587
//   SMTP_SECURE  "true" for implicit TLS (port 465); default false (STARTTLS on 587)
//   SMTP_USER    auth user; omit together with SMTP_PASS for an unauthenticated relay
//   SMTP_PASS    auth password — NEVER commit a real value anywhere
//   SMTP_FROM    envelope/From address; defaults to SMTP_USER
//
// The transport is built LAZILY, on the first configured send, and nodemailer is imported
// dynamically so an unconfigured deployment never loads it at all.

import type { Transporter } from 'nodemailer'

let transporter: Transporter | null = null

async function getTransport(host: string): Promise<Transporter> {
	if (transporter) return transporter
	const { createTransport } = await import('nodemailer')
	const user = process.env.SMTP_USER
	const pass = process.env.SMTP_PASS
	transporter = createTransport({
		host,
		port: Number(process.env.SMTP_PORT || 587),
		secure: process.env.SMTP_SECURE === 'true',
		auth: user && pass ? { user, pass } : undefined
	})
	return transporter
}

// Keep the domain and the subject — that is the diagnostic the header above justifies — but
// not the local part: docker-compose sets no `logging:` block, so these lines sit unrotated.
const mask = (to: string) => to.replace(/^[^@]+/, (l) => l.slice(0, 2) + '***')

/**
 * Deliver one plain-text message. Never throws, never returns a promise.
 *
 * Unconfigured (no `SMTP_HOST`) logs and returns — that is the supported default state,
 * not a failure, so it is logged at `console.log` and not `console.error`.
 */
export function deliver(to: string, subject: string, body: string): void {
	const host = process.env.SMTP_HOST
	if (!host) {
		console.log(`[NOTIFY] (no SMTP_HOST — not sent) <${mask(to)}>: ${subject}`)
		return
	}
	// Fire-and-forget. The catch is the whole point: a mail outage must not fail the request.
	getTransport(host)
		.then((t) =>
			t.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, to, subject, text: body })
		)
		.then(() => console.log(`[NOTIFY] sent <${mask(to)}>: ${subject}`))
		.catch((e) => console.error('[NOTIFY] delivery failed:', (e as Error).message))
}
