import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Completeness invariant for the multi-role sweep (#256, reworked in #279).
 *
 * The nav, the route guards and the service layer must all judge authority from the user's FULL
 * role set. #247 converted the services and the nav already read `roles`; anything still reading a
 * singular `.role` means a user with a secondary role is shown a nav entry, 403'd at the guard, and
 * never reaches the service that would have admitted them.
 *
 * Nothing else stops a future site from reintroducing that split — it compiles, and a behavioural
 * test only catches it if someone thinks to give a fixture user two roles. Hence a static scan.
 *
 * #283 removed this scan's original escape clause. The header used to say the split was
 * "unreachable until multi-role assignment ships"; multi-role assignment HAS now shipped
 * (Settings → Roles and its v1 twin both write a set), so every site this scan guards is live
 * rather than latent, and a regression here is a production authority bug rather than a dormant
 * one. Whether the scan still earns its keep now that the state is reachable is a question for a
 * later review — SPEC R3 — not a licence to weaken it. Its patterns and assertions are unchanged.
 *
 * #279 rekeyed this on the **accessor** rather than a list of callee names. The old pattern
 * enumerated five `require*` helpers by hand, which meant it could only ever cover names someone
 * remembered to add — it missed `APPROVER_ROLES.includes(user.role)`, the hand-rolled
 * `ROLE_HIERARCHY[opts.viewerRole]` masking gate, and everything in `src/lib`, since it was rooted
 * at `src/routes` alone. Now it asks the question the other way round: a singular role accessor
 * reaching anything shaped like an authority decision is an offender, whatever the callee is called.
 *
 * `\.\w*[Rr]ole\b` matches `.role`, `.viewerRole`, `.actorRole` — and cannot match `.roles`, since
 * there is no word boundary before the `s`. So the check is idempotent: a converted site stops
 * matching.
 *
 * #282 dropped `User.role` and `AuditLog.actorRole` outright, so the carve-out that used to exempt
 * the audit-log writers' `actorRole: user.role` assignments is gone with the columns — nothing
 * writes either, and the scan now covers every singular role accessor left in the tree.
 */
const SINGULAR_ROLE = String.raw`\.\w*[Rr]ole\b`

const AUTHORITY_PATTERNS = [
	// A guard or predicate call, keyed on the shape of the callee rather than its name.
	new RegExp(String.raw`\b(?:require|can|has|assert)[A-Za-z]*\([^)]*${SINGULAR_ROLE}`),
	// Membership test against a role list, named (`APPROVER_ROLES`) or inline (`['HR_ADMIN', …]`).
	new RegExp(String.raw`\.includes\([^)]*${SINGULAR_ROLE}`),
	// Hand-rolled rank comparison.
	new RegExp(String.raw`ROLE_HIERARCHY\[[^\]]*${SINGULAR_ROLE}`),
	// Direct equality against a role literal — `ctx.actorRole === 'HR_ADMIN'`. The literal is
	// required: comparing two expressions (`newRole !== existing.role`) is change detection, not an
	// authority decision, and flagging it would make the scan noisy enough that someone deletes it.
	// `!==` counts too — a negated gate is the same defect.
	new RegExp(String.raw`${SINGULAR_ROLE}\s*[!=]==\s*'[A-Z][A-Z_]*'`)
]

// Comment lines are skipped: documenting a converted site by quoting its old shape is legitimate,
// and the capability table does exactly that. Only whole-line comments — a trailing one still
// scans, which errs toward flagging.
const isComment = (line: string) => /^\s*(?:\/\/|\/\*|\*)/.test(line)

const isOffender = (line: string) =>
	!isComment(line) && AUTHORITY_PATTERNS.some((re) => re.test(line))

const ROOTS = ['../../src/lib', '../../src/routes'].map((r) => join(import.meta.dirname, r))

describe('authority is judged on the full role set (#279)', () => {
	// A scan that silently matches nothing reads as coverage while providing none. These pin that
	// each pattern still bites, and that the converted multi-role forms stay clean.
	it('flags the shapes it is meant to flag', () => {
		expect(
			[
				`requireCapability(user.role, 'MANAGE_PAYROLL')`,
				`if (!can(locals.user.role, 'VIEW_PAY_ORGWIDE')) error(403)`,
				`APPROVER_ROLES.includes(user.role)`,
				`['HR_ADMIN', 'SUPER_ADMIN'].includes(user.role)`,
				`ROLE_HIERARCHY[opts.viewerRole] < ROLE_HIERARCHY.HR_ADMIN`,
				`const isPrivileged = ctx.actorRole === 'HR_ADMIN' || ctx.actorRole === 'SUPER_ADMIN'`,
				`if (locals.user.role !== 'SUPER_ADMIN') error(403)`
			].filter((line) => !isOffender(line))
		).toEqual([])
	})

	it('leaves the multi-role forms and non-authority uses alone', () => {
		expect(
			[
				`requireAnyCapability(user.roles, 'MANAGE_PAYROLL')`,
				`canAny(user.roles, 'APPROVE_REQUESTS')`,
				`requireAnyCapability(user.roles, 'MANAGE_HR')`,
				`APPROVER_ROLES.some((r) => user.roles.includes(r))`,
				`// replaced APPROVER_ROLES.includes(user.role) here — see #279`,
				` * ROLE_HIERARCHY[opts.viewerRole] was the old masking gate`,
				// Real near-misses in the tree today — none of these is an authority decision, and
				// the patterns must leave all three alone.
				`const updated = await setUserRoles(params.id, user.organizationId, parsed.data.roles, {`,
				`return step.stageKind === 'SUPERVISOR' ? 'Supervisor' : roleLabel(step.role ?? 'APPROVER')`,
				`roles: [input.role]`
			].filter(isOffender)
		).toEqual([])
	})

	it('has no site judging authority on the primary role alone', () => {
		const offenders: string[] = []

		for (const root of ROOTS) {
			for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
				if (!entry.isFile() || !/\.(ts|svelte)$/.test(entry.name)) continue
				const path = join(entry.parentPath, entry.name)
				readFileSync(path, 'utf8')
					.split('\n')
					.forEach((line, i) => {
						if (isOffender(line)) offenders.push(`${path}:${i + 1}`)
					})
			}
		}

		expect(
			offenders,
			`Judge these on the full role set (\`.roles\`):\n${offenders.join('\n')}`
		).toEqual([])
	})
})
