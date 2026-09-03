import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { canAny } from '$lib/server/rbac'
import { error } from '@sveltejs/kit'
import bcrypt from 'bcrypt'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ensureLeaveBalances } from './leave'
import { sendDiscordInviteEmail } from '$lib/server/notifications'
import { notify } from './notifications'
import { maskEmployee, MASKED_SALARY, SENSITIVE_FIELDS } from '$lib/utils/format'
import { utcMidnight } from '$lib/utils/pay-periods'
import { isRateBasisAllowed, RATE_BASIS_MISMATCH } from '$lib/utils/rate-basis'
import { employmentTypeAt, EMPLOYMENT_TYPES } from '$lib/utils/employment-type'
import { currentCompensation } from './payroll/compensation'
import { assertNotSelf } from './employee-access'
import { assertMayConfirmProposal, createProposal } from './action-proposals'
import { bandStatus } from './settings/master'
import { D } from './payroll/money'
import type { AuditContext } from './types'
import type {
	EmploymentType,
	EmploymentStatus,
	ProposalDomain,
	RateType,
	Gender,
	Role
} from '@prisma/client'

interface CreateEmployeeInput {
	email: string
	password: string
	role: Role
	firstName: string
	lastName: string
	middleName?: string
	dateOfBirth?: Date
	gender?: Gender
	contactPhone?: string
	contactAddress?: string
	departmentId: string
	jobTitle: string
	employmentType: EmploymentType
	startDate: Date
	basicMonthlySalary: number
	rateType?: RateType
	// Nullable, not just optional: the #191 validators normalise an empty field to null, and
	// Prisma reads null as "no value" for these optional columns.
	sssNumber?: string | null
	philhealthNumber?: string | null
	pagibigNumber?: string | null
	tinNumber?: string | null
	reportsToId?: string
	discordId?: string | null
	workScheduleId?: string | null
	positionId?: string | null
	emergencyContactName?: string
	emergencyContactRelation?: string
	emergencyContactPhone?: string
	bankName?: string
	bankAccountName?: string
	bankAccountNumber?: string | null
	gcashNumber?: string | null
}

interface UpdateEmployeeInput {
	firstName?: string
	lastName?: string
	middleName?: string
	dateOfBirth?: Date
	gender?: Gender
	contactPhone?: string
	contactAddress?: string
	departmentId?: string
	jobTitle?: string
	// #222: employment type is NOT editable here — it is effective-dated (EmployeeEmploymentType) and
	// paired with the rate basis (#189), so it routes through `promoteEmployee`. Kept out of the type
	// for the same reason pay is: no caller can write it onto the Employee row and desync the history
	// or land an illegal HOURLY+REGULAR pairing.
	employmentStatus?: EmploymentStatus
	endDate?: Date
	companyEmail?: string | null
	// #170: pay is NOT editable here — salary/rateType route through `recordCompensationChange` so the
	// effective-dated history stays authoritative for payroll. Kept out of the type so no caller can
	// silently write pay onto the Employee row and have the run ignore it.
	sssNumber?: string | null
	philhealthNumber?: string | null
	pagibigNumber?: string | null
	tinNumber?: string | null
	bankName?: string | null
	bankAccountName?: string | null
	bankAccountNumber?: string | null
	gcashNumber?: string | null
	positionId?: string | null
	reportsToId?: string
	discordId?: string | null
	workScheduleId?: string | null
	branchId?: string | null
	emergencyContactName?: string
	emergencyContactRelation?: string
	emergencyContactPhone?: string
}

// Fields whose changes make up the employment-history timeline (FR-051):
// promotions, salary adjustments, department/position transfers, status changes.
// Everything else (bank/GCash, government IDs, Discord) is intentionally excluded
// so sensitive PII never lands in the audit trail.
const HISTORY_FIELDS = [
	'jobTitle',
	'departmentId',
	'positionId',
	'basicMonthlySalary',
	'rateType',
	'employmentType',
	'employmentStatus',
	'workScheduleId',
	'branchId'
] as const

const HISTORY_LABELS: Record<(typeof HISTORY_FIELDS)[number], string> = {
	jobTitle: 'Job title',
	departmentId: 'Department',
	positionId: 'Position',
	basicMonthlySalary: 'Basic salary',
	rateType: 'Rate basis',
	employmentType: 'Employment type',
	employmentStatus: 'Status',
	workScheduleId: 'Work schedule',
	branchId: 'Branch'
}

interface EmployeeListFilters {
	status?: EmploymentStatus
	// Split the roster into the active workforce and offboarded records (#184): `true`
	// returns only OFFBOARDED, `false` everyone still on the books (ACTIVE / ON_LEAVE),
	// `undefined` leaves the status unfiltered. Ignored when an exact `status` is given.
	offboarded?: boolean
	departmentId?: string
	branchId?: string
	search?: string
	// #234: restrict the roster to a set of ids — a MANAGER sees only their own team and the
	// branches they manage. `undefined` means unrestricted (HR/CEO/Super-Admin); an empty array
	// means "nobody", which is the correct answer for a manager with no reports, not "everybody".
	ids?: string[]
}

// The active roster is everyone still on the books (ACTIVE / ON_LEAVE); the offboarded
// section is exactly OFFBOARDED. Exported for the roster-split test (#184).
export function offboardedFilter(
	offboarded: boolean
): Prisma.EmployeeWhereInput['employmentStatus'] {
	return offboarded ? 'OFFBOARDED' : { not: 'OFFBOARDED' }
}

function employeeListWhere(
	organizationId: string,
	filters?: EmployeeListFilters
): Prisma.EmployeeWhereInput {
	return {
		organizationId,
		...(filters?.ids !== undefined && { id: { in: filters.ids } }),
		...(filters?.status
			? { employmentStatus: filters.status }
			: filters?.offboarded !== undefined && {
					employmentStatus: offboardedFilter(filters.offboarded)
				}),
		...(filters?.departmentId && { departmentId: filters.departmentId }),
		...(filters?.branchId && { branchId: filters.branchId }),
		...(filters?.search && {
			OR: [
				{ firstName: { contains: filters.search, mode: 'insensitive' } },
				{ lastName: { contains: filters.search, mode: 'insensitive' } },
				{ employeeNumber: { contains: filters.search, mode: 'insensitive' } }
			]
		})
	}
}

export async function countEmployees(organizationId: string, filters?: EmployeeListFilters) {
	return db.employee.count({ where: employeeListWhere(organizationId, filters) })
}

export async function listEmployees(
	organizationId: string,
	filters?: EmployeeListFilters,
	pageArgs?: { skip: number; take: number }
) {
	return db.employee.findMany({
		where: employeeListWhere(organizationId, filters),
		// Explicit select, never `include`: the roster is reachable at MANAGER via
		// GET /api/v1/employees, and a bare `include` returns every scalar — salary,
		// government IDs, bank/GCash — defeating the HR-only masking in getEmployee.
		// Display fields only; anything sensitive must stay out of this list.
		select: {
			id: true,
			employeeNumber: true,
			firstName: true,
			lastName: true,
			middleName: true,
			jobTitle: true,
			employmentType: true,
			employmentStatus: true,
			startDate: true,
			// #136: tenure freezes at endDate for offboarded staff.
			endDate: true,
			department: { select: { id: true, name: true } },
			branch: { select: { id: true, name: true } },
			user: { select: { email: true, roles: true, isActive: true } }
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
		...(pageArgs && { skip: pageArgs.skip, take: pageArgs.take })
	})
}

export async function getEmployee(
	id: string,
	organizationId: string,
	opts?: { viewerRoles?: Role[]; isSelf?: boolean }
) {
	const employee = await db.employee.findFirst({
		where: { id, organizationId },
		include: {
			department: true,
			user: { select: { email: true, roles: true, isActive: true, lastLoginAt: true } },
			reportsTo: { select: { id: true, firstName: true, lastName: true } },
			position: { include: { salaryGrade: true } },
			emergencyContacts: { orderBy: { createdAt: 'asc' } }
		}
	})
	if (!employee) error(404, 'Employee not found')

	// ponytail: heal-on-read (#170 Stage 1.5). The effective-dated EmployeeCompensation history is the
	// source of truth; Employee.{basicMonthlySalary,rateType} is a cache. Fetched with a SEPARATE query
	// and kept strictly local — never added to the `include` or the returned object — so raw snapshot
	// figures can't ride the return value past the #111 mask. When the cache is stale (e.g. the first
	// read after a future-dated change's effective date has passed) we correct the column in place and
	// use the healed RAW values below; otherwise nothing is written. No audit — the change was audited
	// when the snapshot was inserted. Single indexed lookup (employeeId), so this is cheap.
	// #222 adds the same heal for the effective-dated employment type, so both histories load
	// concurrently and any stale column is corrected in ONE write.
	const [compHistory, typeHistory] = await Promise.all([
		db.employeeCompensation.findMany({
			where: { employeeId: id },
			select: { basicMonthlySalary: true, rateType: true, effectiveDate: true, changedAt: true }
		}),
		db.employeeEmploymentType.findMany({
			where: { employeeId: id },
			select: { employmentType: true, effectiveDate: true, changedAt: true }
		})
	])
	const asOf = new Date()
	const healed = currentCompensation(compHistory, asOf, {
		basicMonthlySalary: employee.basicMonthlySalary,
		rateType: employee.rateType
	})
	const healedType = employmentTypeAt(typeHistory, asOf, employee.employmentType)
	const stale: Prisma.EmployeeUpdateInput = {}
	if (
		!D(employee.basicMonthlySalary).equals(healed.salary) ||
		employee.rateType !== healed.rateType
	) {
		stale.basicMonthlySalary = healed.salary
		stale.rateType = healed.rateType
		employee.basicMonthlySalary = healed.salary
		employee.rateType = healed.rateType
	}
	if (healedType !== employee.employmentType) {
		stale.employmentType = healedType
		employee.employmentType = healedType
	}
	if (Object.keys(stale).length > 0) await db.employee.update({ where: { id }, data: stale })

	// Internal callers (updateEmployee, offboardEmployee) pass no opts and get the raw record —
	// they need cleartext to diff and never hand it to a client. Every client-facing caller
	// passes opts, so masking is inherited by default: nothing leaks by omission (#111).
	if (!opts) return employee

	// Compensation, government IDs, and disbursement details are HR-only: without MANAGE_HR,
	// and not the record's owner, they come back null. Note MANAGER *does* hold MANAGE_HR —
	// #133 made MANAGER on-branch HR — so a manager does not fall into the masked branch.
	// Self always reaches masking too (own data, decision #2).
	if (!opts.isSelf && opts.viewerRoles && !canAny(opts.viewerRoles, 'MANAGE_HR')) {
		return {
			...employee,
			basicMonthlySalary: null,
			sssNumber: null,
			philhealthNumber: null,
			pagibigNumber: null,
			tinNumber: null,
			bankName: null,
			bankAccountName: null,
			bankAccountNumber: null,
			gcashNumber: null
		}
	}

	// HR / MANAGER / self: masked by default. Full values only via revealEmployeeSensitive.
	return maskEmployee(employee)
}

/**
 * Full sensitive subset (government IDs, salary, disbursement) for one employee — the single
 * path that returns these in cleartext (#111). Writes a VIEW audit entry unless `audit` is
 * false; a self-reveal of one's own record is exempt (decision #2). The role gate lives at the
 * call site (the UI button is cosmetic — Constitution P2).
 */
export async function revealEmployeeSensitive(
	id: string,
	organizationId: string,
	ctx: AuditContext,
	opts: { audit: boolean }
) {
	const employee = await db.employee.findFirst({
		where: { id, organizationId },
		select: {
			id: true,
			sssNumber: true,
			philhealthNumber: true,
			pagibigNumber: true,
			tinNumber: true,
			basicMonthlySalary: true,
			bankName: true,
			bankAccountName: true,
			bankAccountNumber: true,
			gcashNumber: true
		}
	})
	if (!employee) error(404, 'Employee not found')

	// Constitution P1/P4: reading PII is itself an auditable event.
	if (opts.audit) {
		// #5: deliberately NOT transactional — `db`, not a `tx`. This audits a READ, so there is no
		// mutation to roll back with, and a rollback would destroy the record of the PII access.
		await writeAuditLog(
			ctx,
			{
				action: 'VIEW',
				entityType: 'Employee',
				entityId: employee.id,
				newValue: { fields: [...SENSITIVE_FIELDS] }
			},
			db
		)
	}

	return employee
}

/** Employee numbers are `PREFIX-NNN`; NNN is padded to at least this width. */
const NUMBER_WIDTH = 3
/** Attempts to allocate a free number before giving up (only a concurrent create can clash). */
const ALLOCATION_ATTEMPTS = 5

/**
 * Next employee number for an org: the highest numeric suffix already in use, plus one.
 *
 * This used to be `count + 1`, which is not a sequence — it drifts from the numbers actually
 * issued as soon as anyone is deleted, or when rows use different widths. Both were true here,
 * which is how EMP-0013 came to be issued *after* EMP-0014 existed, and then how onboarding
 * started failing outright against the (organizationId, employeeNumber) unique index.
 *
 * Reads through `tx` so the scan and the insert share one transaction. Scoped on
 * Employee.organizationId — the column the unique index actually uses, not
 * `user.organizationId`, which is a separate column that merely agrees today.
 */
async function nextEmployeeNumber(tx: Prisma.TransactionClient, organizationId: string) {
	const org = await tx.organization.findUniqueOrThrow({
		where: { id: organizationId },
		select: { employeeNumberPrefix: true }
	})

	const rows = await tx.employee.findMany({
		where: { organizationId },
		select: { employeeNumber: true }
	})

	// Trailing digits only, so every historical shape reads correctly regardless of prefix or
	// width (EMP-0014 → 14, JJ-004 → 4). Max across all of the org's numbers, not just those
	// sharing the new prefix: conservative, and it cannot collide with an existing number.
	const highest = rows.reduce((max, r) => {
		const n = Number(r.employeeNumber.match(/(\d+)$/)?.[1] ?? NaN)
		return Number.isFinite(n) && n > max ? n : max
	}, 0)

	return `${org.employeeNumberPrefix}-${String(highest + 1).padStart(NUMBER_WIDTH, '0')}`
}

/** True for a unique violation on (organizationId, employeeNumber) specifically. */
function isEmployeeNumberConflict(e: unknown) {
	if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false
	const target = e.meta?.target
	return Array.isArray(target) && target.includes('employeeNumber')
}

/**
 * A reporting line must not cross tenants. Postgres cannot express "reportsTo belongs to the same
 * organization" — the same limitation `branchId` and `positionId` carry — so every writer of
 * `reportsToId` verifies it here (#235, where the check lived on one writer and two others took a
 * forged id as given).
 *
 * `selfId` is the employee being written. Omitted at create time: Prisma generates the row's id at
 * insert, so a new hire cannot be named as its own manager.
 */
async function assertManagerInOrg(reportsToId: string, organizationId: string, selfId?: string) {
	if (reportsToId === selfId) error(400, 'An employee cannot report to themselves.')
	const manager = await db.employee.findFirst({
		where: { id: reportsToId, organizationId },
		select: { id: true }
	})
	if (!manager) error(404, 'Manager not found')
}

export async function createEmployee(
	organizationId: string,
	input: CreateEmployeeInput,
	ctx: AuditContext
) {
	const existingUser = await db.user.findUnique({ where: { email: input.email } })
	if (existingUser) error(409, 'Email already in use')

	// #235: the reporting line comes straight off the request, so verify the manager is in this org
	// before anything is written. Ahead of the hash — a single indexed lookup should not sit behind
	// 300ms of bcrypt on a hire that cannot succeed.
	if (input.reportsToId !== undefined) await assertManagerInOrg(input.reportsToId, organizationId)

	// Hashed once, outside the retry loop — bcrypt at cost 12 is by far the expensive part and
	// the password does not change between attempts.
	const passwordHash = await bcrypt.hash(input.password, 12)

	const employee = await allocateAndCreate(organizationId, input, passwordHash, ctx)

	// On onboarding, invite the new hire to the company Discord server (#186) — only when
	// the org has configured an invite link (currently just Veent). Sent to their working
	// email since company-email provisioning is deferred. Best-effort: never block a hire.
	try {
		const org = await db.organization.findUnique({
			where: { id: organizationId },
			select: { name: true, discordInviteUrl: true }
		})
		if (org?.discordInviteUrl) {
			sendDiscordInviteEmail(input.email, {
				firstName: input.firstName,
				orgName: org.name,
				inviteUrl: org.discordInviteUrl
			})
			await notify(
				employee.userId,
				`You've been invited to the ${org.name} Discord server — check your email.`,
				'/dashboard'
			)
		}
	} catch (e) {
		console.error('[NOTIFY] Failed to send Discord invite for', employee.id, e)
	}

	return employee
}

/**
 * Allocate a number and insert, retrying the whole transaction if a concurrent create took the
 * number first. Only a genuine race can reach a second attempt — the number is read inside the
 * transaction — so a handful of attempts is plenty.
 */
async function allocateAndCreate(
	organizationId: string,
	input: CreateEmployeeInput,
	passwordHash: string,
	ctx: AuditContext
) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await db.$transaction(async (tx: Prisma.TransactionClient) => {
				const employeeNumber = await nextEmployeeNumber(tx, organizationId)
				const user = await tx.user.create({
					data: {
						organizationId,
						email: input.email,
						passwordHash,
						roles: [input.role]
					}
				})

				const created = await tx.employee.create({
					data: {
						userId: user.id,
						organizationId,
						employeeNumber,
						firstName: input.firstName,
						lastName: input.lastName,
						middleName: input.middleName,
						dateOfBirth: input.dateOfBirth,
						gender: input.gender,
						contactPhone: input.contactPhone,
						contactAddress: input.contactAddress,
						departmentId: input.departmentId,
						jobTitle: input.jobTitle,
						employmentType: input.employmentType,
						startDate: input.startDate,
						basicMonthlySalary: input.basicMonthlySalary,
						rateType: input.rateType ?? 'MONTHLY',
						sssNumber: input.sssNumber,
						philhealthNumber: input.philhealthNumber,
						pagibigNumber: input.pagibigNumber,
						tinNumber: input.tinNumber,
						emergencyContactName: input.emergencyContactName,
						emergencyContactRelation: input.emergencyContactRelation,
						emergencyContactPhone: input.emergencyContactPhone,
						bankName: input.bankName,
						bankAccountName: input.bankAccountName,
						bankAccountNumber: input.bankAccountNumber,
						gcashNumber: input.gcashNumber,
						reportsToId: input.reportsToId,
						discordId: input.discordId,
						// #186: company-email provisioning is deferred, so seed it with the hire's working
						// email; HR updates it once the real address exists.
						companyEmail: input.email,
						// Onboarding sets the work schedule (attendance derivation depends on it) and the
						// position; both are optional. Coerce empty string → null (an empty <select> posts
						// "", which is not a valid FK) so we don't hit a foreign-key violation.
						workScheduleId: input.workScheduleId || null,
						positionId: input.positionId || null
					},
					include: { department: true, user: { select: { email: true, roles: true } } }
				})

				// Allocate this year's leave entitlement from the org's leave-type defaults (#137).
				// Inside the transaction so a new hire is never left half-onboarded with no ledger —
				// `assertLeaveBalance` reads a missing row as zero, so that state blocks their first
				// filing outright. Re-run on a retry because the whole transaction is replayed.
				await ensureLeaveBalances(created.id, organizationId, input.startDate.getFullYear(), tx)

				// #170/#171: seed the effective-dated compensation baseline (current comp, effective
				// since the hire date) so the mid-period payroll resolver always has a floor.
				await tx.employeeCompensation.create({
					data: {
						employeeId: created.id,
						basicMonthlySalary: created.basicMonthlySalary,
						rateType: created.rateType,
						effectiveDate: input.startDate,
						changedById: 'system',
						note: 'baseline (hire)'
					}
				})

				// #222: same baseline for the effective-dated employment type.
				await tx.employeeEmploymentType.create({
					data: {
						employeeId: created.id,
						employmentType: created.employmentType,
						effectiveDate: input.startDate,
						changedById: 'system',
						note: 'baseline (hire)'
					}
				})

				// #5: inside the hire transaction — a failed audit write must not leave a new employee
				// standing unrecorded. A retry replays this along with the rest of the closure.
				await writeAuditLog(
					ctx,
					{
						action: 'CREATE',
						entityType: 'Employee',
						// From the created row, not a variable computed up front: a retry changes the number.
						newValue: { employeeNumber: created.employeeNumber, email: input.email },
						entityId: created.id
					},
					tx
				)

				return created
			})
		} catch (e) {
			// Anything that is not a lost race on the number — a duplicate Discord ID, a bad FK —
			// is the caller’s problem and must surface now rather than be retried.
			if (!isEmployeeNumberConflict(e) || attempt >= ALLOCATION_ATTEMPTS) throw e
		}
	}
}

export async function updateEmployee(
	id: string,
	organizationId: string,
	input: UpdateEmployeeInput,
	ctx: AuditContext
) {
	const existing = await getEmployee(id, organizationId)

	// Separation of duties: contact details ARE self-serviceable — `/profile`'s update action routes
	// here and sends only name/contact/birthdate — but employment terms are HR's to set, so nobody
	// sets their own. Field-scoped rather than a blanket self-block for exactly that reason.
	if (
		input.jobTitle !== undefined ||
		input.departmentId !== undefined ||
		input.employmentStatus !== undefined ||
		input.endDate !== undefined
	) {
		assertNotSelf(ctx.actorId, existing)
	}

	// A branch change is a store transfer. Postgres can't express "the branch belongs to the
	// same org", so verify it here — a forged id from another tenant must not cross over.
	// Re-saving an employee who already sits on a closed branch is allowed: the picker keeps
	// their current branch selectable, and blocking it would fail every unrelated edit on
	// that 201 file.
	if (input.branchId && input.branchId !== existing.branchId) {
		const branch = await db.branch.findFirst({
			where: { id: input.branchId, organizationId },
			select: { id: true, status: true }
		})
		if (!branch) error(404, 'Branch not found')
		if (branch.status === 'CLOSED') error(400, 'That branch is closed — choose an open branch.')
	}

	// #235: same reason as the branch above — a reporting line must stay inside the tenant, and
	// `data: input` writes this column straight through (the v1 PATCH accepts it). Skipped when
	// unchanged, for the same reason the branch check is: re-saving a 201 file whose manager
	// predates this check must not fail every unrelated edit on it.
	if (input.reportsToId !== undefined && input.reportsToId !== existing.reportsToId) {
		await assertManagerInOrg(input.reportsToId, organizationId, id)
	}

	// One transaction (#5): a failed audit write must not leave an edit standing unrecorded. The
	// `before` snapshot the diff reads is taken inside it too — `existing` above is read through
	// `getEmployee`, several queries and a heal-on-read write earlier, so a concurrent edit could
	// make this row's oldValue describe a state this call never overwrote. Only the READ moves;
	// `existing` still feeds the guards above, which must run before a transaction is opened.
	return await db.$transaction(async (tx) => {
		const before = await tx.employee.findUniqueOrThrow({ where: { id } })

		const updated = await tx.employee.update({
			where: { id },
			data: input,
			include: { department: true, user: { select: { email: true, roles: true } } }
		})

		// Curated audit diff: before/after values for the employment-history fields
		// only, plus the names (not values) of any other changed fields. This powers
		// the history timeline (FR-051) and keeps sensitive PII out of the audit log.
		const norm = (v: unknown) =>
			v == null ? null : typeof v === 'object' && 'toString' in v ? (v as object).toString() : v
		const oldValue: Record<string, unknown> = {}
		const newValue: Record<string, unknown> = {}
		const otherChanged: string[] = []
		for (const key of Object.keys(input) as (keyof UpdateEmployeeInput)[]) {
			const beforeValue = norm((before as Record<string, unknown>)[key])
			const after = norm((updated as Record<string, unknown>)[key])
			if (String(beforeValue) === String(after)) continue
			if ((HISTORY_FIELDS as readonly string[]).includes(key)) {
				oldValue[key] = beforeValue
				newValue[key] = after
			} else {
				otherChanged.push(key)
			}
		}

		// Only record an audit entry when something actually changed.
		if (Object.keys(newValue).length > 0 || otherChanged.length > 0) {
			if (otherChanged.length > 0) newValue._otherFields = otherChanged
			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: 'Employee',
					entityId: id,
					oldValue,
					newValue
				},
				tx
			)
		}

		return updated
	})
}

/**
 * What the pay writers return. `proposalId` is set only when the change was FILED rather than
 * applied (#224 Part 2 / #243) — callers that report success must surface that, or an unconfirmed
 * change reads as a saved one.
 */
export interface PayWriteResult {
	notice?: string
	proposalId?: string
}

export const AWAITING_CONFIRMATION =
	'Submitted for confirmation — this change takes effect once another authorized person confirms it.'

/**
 * Options only the proposal-confirm path passes.
 *
 * `confirmTx` is the claim's transaction client, and its presence carries BOTH meanings: write on
 * that client (Prisma has no nested interactive transactions, and `confirmProposal` runs `apply`
 * inside the claim so a failed apply rolls the claim back to PENDING), and skip the propose branch
 * below (re-proposing an already-confirmed change would loop forever). Deliberately one field
 * rather than a client plus a boolean: the two can never drift apart, and no caller can skip the
 * separation-of-duties routing without actually being inside `confirmProposal`'s transaction.
 *
 * Same shape as `writeAuditLog(ctx, payload, client = db)`: an optional client that defaults to the
 * global `db`, so the direct path is byte-identical to what it did before.
 */
export interface ProposalWriteOpts {
	confirmTx?: Prisma.TransactionClient
}

/**
 * Separation of duties for the two writers that move pay (#224 Part 2, #243).
 *
 * Returns the "awaiting confirmation" result when this actor may not make this change alone, having
 * filed a PENDING proposal; `null` when they may, and the caller writes as it always has.
 *
 * Two shapes route here, and `createProposal` re-derives which from initiator vs target so the
 * confirmer requirement can't be understated:
 *   - the actor IS the target — self-dealing, needs `APPROVE_FINANCE` to confirm;
 *   - the actor lacks `ADMINISTER_HR_ORGWIDE` — i.e. a MANAGER, who passes the route's own
 *     `requireAnyCapability('MANAGE_HR')` gate, since MANAGE_HR holds MANAGER (#243).
 *
 * Keyed on the narrower capability, for exactly that reason. And in the service rather than the
 * route, so the form action and its v1 API twin are covered by one check.
 */
async function proposeIfRequired(
	organizationId: string,
	employee: { id: string; userId: string },
	domain: ProposalDomain,
	payload: unknown,
	ctx: AuditContext
): Promise<PayWriteResult | null> {
	if (employee.userId !== ctx.actorId && canAny(ctx.actorRoles, 'ADMINISTER_HR_ORGWIDE'))
		return null

	const proposal = await createProposal(
		organizationId,
		{ targetEmployeeId: employee.id, targetUserId: employee.userId, domain, payload },
		ctx
	)
	return { notice: AWAITING_CONFIRMATION, proposalId: proposal.id }
}

/**
 * Record an effective-dated compensation change (#170). Inserts an EmployeeCompensation snapshot,
 * then re-derives the current cache — `Employee.{basicMonthlySalary, rateType}` = the snapshot with
 * the latest effectiveDate ≤ today — so a correction backdated below a later change never moves it.
 * `basicMonthlySalary`/`rateType` are HISTORY_FIELDS, so the 201 timeline picks the change up.
 *
 * Future-dating is allowed: the cache is re-derived as the snapshot with the latest effectiveDate ≤
 * today and healed on read (getEmployee), so a future row stays dormant until its date arrives — no
 * scheduler needed. A change backdated into an APPROVED run returns a non-fatal notice — the frozen-run guard makes it
 * structurally safe (approved numbers are never recomputed), but it must not be silent.
 */
export async function recordCompensationChange(
	id: string,
	organizationId: string,
	input: { basicMonthlySalary?: number; rateType?: RateType; effectiveDate: Date; note?: string },
	ctx: AuditContext,
	opts?: ProposalWriteOpts
): Promise<PayWriteResult> {
	const employee = await getEmployee(id, organizationId)

	// "Unchanged" is judged against the comp in effect on the effective date, not the current cache —
	// otherwise a valid backdated correction whose value happens to equal today's figure is rejected.
	// An empty salary/rateType carries whatever was in effect then (the reveal-to-edit form prefills
	// current, which for the default today-dated change is the same figure).
	const currentSalary = Number(employee.basicMonthlySalary)
	const history = await db.employeeCompensation.findMany({
		where: { employeeId: id },
		select: { basicMonthlySalary: true, rateType: true, effectiveDate: true, changedAt: true }
	})
	const atEff = currentCompensation(history, input.effectiveDate, {
		basicMonthlySalary: currentSalary,
		rateType: employee.rateType
	})
	const basicMonthlySalary = input.basicMonthlySalary ?? atEff.salary.toNumber()
	const rateType = input.rateType ?? atEff.rateType
	if (basicMonthlySalary === atEff.salary.toNumber() && rateType === atEff.rateType) {
		error(400, 'No change to record — enter a new salary or pay type.')
	}

	// A wrong pairing is a 176× payroll error (rate-basis.ts), so enforce it server-side even though
	// the form filters the dropdown — the same guard the create form applies.
	if (!isRateBasisAllowed(rateType, employee.employmentType)) error(400, RATE_BASIS_MISMATCH)

	// Lower bound only: effectiveDate ≥ hire date (UTC-midnight). Future-dating is allowed (#170 Stage
	// 1.5) — no scheduler needed: the insert below leaves the current cache untouched (its re-derivation
	// is "max effectiveDate ≤ today"), and getEmployee heals the cache the first time it is read on or
	// after the effective date.
	const eff = utcMidnight(input.effectiveDate)
	const today = utcMidnight(new Date())
	const hired = utcMidnight(employee.startDate)
	if (eff.getTime() < hired.getTime()) error(400, 'Effective date cannot be before the hire date.')

	// Non-fatal notice when backdating into a frozen (APPROVED) run — those are never recomputed.
	const frozen = await db.payrollRun.findFirst({
		where: {
			organizationId,
			status: 'APPROVED',
			periodStart: { lte: eff },
			periodEnd: { gte: eff }
		},
		select: { id: true }
	})
	const notice = frozen
		? `Backdated to ${eff.toISOString().slice(0, 10)}. Approved runs are not recalculated; applies to current and future open periods.`
		: undefined

	// #224 Part 2 / #243. Placed after validation and before the first write: the initiator gets the
	// same immediate 400s they always did rather than discovering them when someone else confirms,
	// and nothing has landed yet, so filing instead of writing leaves the record untouched. Storing
	// `input` verbatim — not the values resolved above — keeps the proposal meaning what was typed,
	// so confirming re-runs every check on the state as it stands then.
	if (!opts?.confirmTx) {
		const proposed = await proposeIfRequired(organizationId, employee, 'COMPENSATION', input, ctx)
		if (proposed) return proposed
	}

	const write = async (tx: Prisma.TransactionClient) => {
		// The audit's "before" is re-derived from a tx-scoped read, not from `atEff` above: that one
		// was read before this transaction opened, so two concurrent changes to the same employee
		// would both log the same prior pay — one of them a value it never replaced. Read before the
		// insert, or the new snapshot is itself in the history.
		const before = currentCompensation(
			await tx.employeeCompensation.findMany({
				where: { employeeId: id },
				select: { basicMonthlySalary: true, rateType: true, effectiveDate: true, changedAt: true }
			}),
			input.effectiveDate,
			{ basicMonthlySalary: currentSalary, rateType: employee.rateType }
		)
		const current = await insertCompensationSnapshot(
			tx,
			id,
			{ basicMonthlySalary, rateType, effectiveDate: eff, note: input.note },
			ctx.actorId,
			today
		)
		if (current) {
			await tx.employee.update({
				where: { id },
				data: { basicMonthlySalary: current.basicMonthlySalary, rateType: current.rateType }
			})
		}
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Employee',
				entityId: id,
				oldValue: { basicMonthlySalary: before.salary.toNumber(), rateType: before.rateType },
				newValue: { basicMonthlySalary, rateType, effectiveDate: eff }
			},
			tx
		)
	}
	// Join the confirm transaction when applying a proposal; own it otherwise (Prisma has no nested
	// interactive transactions, and the claim must roll back with a failed apply).
	await (opts?.confirmTx ? write(opts.confirmTx) : db.$transaction(write))

	return { notice }
}

/**
 * Insert a compensation snapshot and re-derive the current cache — the snapshot with the max
 * effectiveDate ≤ today (same-day tiebreak by changedAt), so a correction backdated below a later
 * change leaves the cache put. Returns that row (null only if every snapshot is future-dated); the
 * caller writes it onto the Employee row, which lets `promoteEmployee` fold it into its single update.
 * Shared by `recordCompensationChange` (#170) and `promoteEmployee` (#222) so both write identically.
 */
async function insertCompensationSnapshot(
	tx: Prisma.TransactionClient,
	employeeId: string,
	snap: { basicMonthlySalary: number; rateType: RateType; effectiveDate: Date; note?: string },
	changedById: string,
	today: Date
) {
	await tx.employeeCompensation.create({ data: { employeeId, ...snap, changedById } })
	return tx.employeeCompensation.findFirst({
		where: { employeeId, effectiveDate: { lte: today } },
		orderBy: [{ effectiveDate: 'desc' }, { changedAt: 'desc' }]
	})
}

/** The employment-type twin of `insertCompensationSnapshot` (#222) — same re-derivation rule. */
async function insertEmploymentTypeSnapshot(
	tx: Prisma.TransactionClient,
	employeeId: string,
	snap: { employmentType: EmploymentType; effectiveDate: Date; note?: string },
	changedById: string,
	today: Date
) {
	await tx.employeeEmploymentType.create({ data: { employeeId, ...snap, changedById } })
	return tx.employeeEmploymentType.findFirst({
		where: { employeeId, effectiveDate: { lte: today } },
		orderBy: [{ effectiveDate: 'desc' }, { changedAt: 'desc' }]
	})
}

/**
 * Rejection when a promotion carries no actual change. Exported because the API PATCH swallows
 * exactly this one (resending the current values is a no-op, not a failure) — matching on the
 * constant means a reworded message can't silently turn no-ops back into 400s.
 */
export const NO_CHANGE_MESSAGE = 'No change to record — edit at least one field.'
export const NO_CHANGE_STATUS = 400

export interface PromoteEmployeeInput {
	effectiveDate: Date
	positionId?: string | null
	jobTitle?: string
	reportsToId?: string
	employmentType?: EmploymentType
	basicMonthlySalary?: number
	rateType?: RateType
	note?: string
}

/**
 * Promote an employee (#222) — one atomic, audited career event covering position, title, reporting
 * line, employment type and pay, instead of the field-by-field edits that used to scatter across
 * several audit entries (and therefore several rows in the 201 timeline).
 *
 * Everything is optional; at least one field must actually change. Pay and employment type are
 * recorded as effective-dated snapshots (the same writers `recordCompensationChange` uses), so a
 * promotion dated ahead stays dormant until its date and needs no scheduler. The rest are plain
 * columns, written in the same transaction as the snapshots and ONE audit entry — so the timeline
 * renders "Position, Job title, Employment type, Basic salary" as a single event.
 *
 * Guards: the rate-basis pairing is checked against the RESULTING state (#189 — a PART_TIME/HOURLY
 * hire promoted to REGULAR must move to a monthly or daily rate in the same call, which no split
 * across two writers can validate); position and manager are re-checked to be in this org; an
 * out-of-band salary comes back as a non-fatal notice (HR's call, not a block).
 */
export async function promoteEmployee(
	id: string,
	organizationId: string,
	input: PromoteEmployeeInput,
	ctx: AuditContext,
	opts?: ProposalWriteOpts
): Promise<PayWriteResult> {
	const employee = await getEmployee(id, organizationId)

	const eff = utcMidnight(input.effectiveDate)
	const today = utcMidnight(new Date())

	// Pay is judged against the comp in effect on the effective date, not today's cache — the same
	// rule `recordCompensationChange` applies, so a backdated promotion compares like with like.
	const compHistory = await db.employeeCompensation.findMany({
		where: { employeeId: id },
		select: { basicMonthlySalary: true, rateType: true, effectiveDate: true, changedAt: true }
	})
	const atEff = currentCompensation(compHistory, eff, {
		basicMonthlySalary: Number(employee.basicMonthlySalary),
		rateType: employee.rateType
	})
	const typeHistory = await db.employeeEmploymentType.findMany({
		where: { employeeId: id },
		select: { employmentType: true, effectiveDate: true, changedAt: true }
	})
	const typeAtEff = employmentTypeAt(typeHistory, eff, employee.employmentType)

	const basicMonthlySalary = input.basicMonthlySalary ?? atEff.salary.toNumber()
	const rateType = input.rateType ?? atEff.rateType
	const employmentType = input.employmentType ?? typeAtEff
	const payChanged = basicMonthlySalary !== atEff.salary.toNumber() || rateType !== atEff.rateType
	const typeChanged = employmentType !== typeAtEff

	// The pairing must hold on the resulting state, which is exactly why this writer exists: an
	// employment-type change can invalidate a rate basis set long ago, and vice versa.
	if (!isRateBasisAllowed(rateType, employmentType)) error(400, RATE_BASIS_MISMATCH)

	// Plain columns. `undefined` means "not part of this promotion"; positionId accepts null (clear).
	const columns: { positionId?: string | null; jobTitle?: string; reportsToId?: string } = {}
	if (input.positionId !== undefined && input.positionId !== employee.positionId) {
		if (input.positionId) {
			// Postgres can't express "the position belongs to the same org" — a forged id from another
			// tenant must not cross over (the same check `updateEmployee` runs for a branch).
			const position = await db.position.findFirst({
				where: { id: input.positionId, organizationId },
				select: { id: true }
			})
			if (!position) error(404, 'Position not found')
		}
		columns.positionId = input.positionId
	}
	if (input.jobTitle !== undefined && input.jobTitle !== employee.jobTitle) {
		columns.jobTitle = input.jobTitle
	}
	if (input.reportsToId !== undefined && input.reportsToId !== employee.reportsToId) {
		await assertManagerInOrg(input.reportsToId, organizationId, id)
		columns.reportsToId = input.reportsToId
	}

	if (!payChanged && !typeChanged && Object.keys(columns).length === 0) {
		error(NO_CHANGE_STATUS, NO_CHANGE_MESSAGE)
	}

	// Two bounds on the effective date. They bind different subsets of the promotion, so they are
	// kept together and each says which.
	//
	// LOWER (#266) — a date below the hire date is nonsense for anything that RECORDS it: pay and
	// employment type are effective-dated snapshots by construction (`recordCompensationChange`
	// applies the same floor for that reason, :761-767), and positionId/jobTitle are HISTORY_FIELDS,
	// so `getEmploymentHistory` renders the date back on the 201 timeline (:1310-1319). It binds
	// nothing about the reporting line: `reportsToId` is deliberately NOT a HISTORY_FIELD (see the
	// audit block below), so a reporting-line-only change emits no timeline event and surfaces the
	// date nowhere, and as a plain column it applies the moment this saves regardless of the date.
	// Running unconditionally, the floor therefore refused a legitimate edit outright — a hire whose
	// startDate is still in the future could not be re-pointed at a different manager through
	// `?/promote`, or (after #263) through the v1 PATCH, since both pass today's date.
	if (
		(payChanged ||
			typeChanged ||
			columns.positionId !== undefined ||
			columns.jobTitle !== undefined) &&
		eff.getTime() < utcMidnight(employee.startDate).getTime()
	) {
		error(400, 'Effective date cannot be before the hire date.')
	}

	// UPPER — only pay and employment type are effective-dated; position, title and the reporting
	// line are plain columns that would apply the moment this is saved. Rather than quietly applying
	// half a promotion early, a future-dated one must be pay/type-only.
	if (eff.getTime() > today.getTime() && Object.keys(columns).length > 0) {
		error(
			400,
			'A future-dated promotion can only change pay and employment type. Position, job title and reporting line apply immediately — record those on or after the effective date.'
		)
	}

	const messages: string[] = []

	// Band check (T163): monthly bands only, so an hourly/daily rate is never scored against one.
	// Warn, never block — out-of-band pay is a legitimate HR decision.
	const targetPositionId =
		columns.positionId !== undefined ? columns.positionId : employee.positionId
	if (rateType === 'MONTHLY' && targetPositionId) {
		const grade = await db.position
			.findFirst({ where: { id: targetPositionId }, select: { salaryGrade: true } })
			.then((p) => p?.salaryGrade ?? null)
		if (grade) {
			const status = bandStatus(
				basicMonthlySalary,
				Number(grade.minSalary),
				Number(grade.maxSalary)
			)
			if (status !== 'within') {
				messages.push(
					`Heads up: the new salary is ${status} the ${grade.name} band (${Number(grade.minSalary).toLocaleString()}–${Number(grade.maxSalary).toLocaleString()}). Recorded anyway.`
				)
			}
		}
	}

	// Same non-fatal notice `recordCompensationChange` gives when pay is backdated into a frozen
	// (APPROVED) run — those are never recomputed, so the raise silently misses that period.
	if (payChanged && eff.getTime() < today.getTime()) {
		const frozen = await db.payrollRun.findFirst({
			where: {
				organizationId,
				status: 'APPROVED',
				periodStart: { lte: eff },
				periodEnd: { gte: eff }
			},
			select: { id: true }
		})
		if (frozen) {
			messages.push(
				`Backdated to ${eff.toISOString().slice(0, 10)}. Approved runs are not recalculated; applies to current and future open periods.`
			)
		}
	}

	const notice = messages.length ? messages.join(' ') : undefined

	// #224 Part 2 / #243 — same routing, same placement, as `recordCompensationChange`.
	if (!opts?.confirmTx) {
		const proposed = await proposeIfRequired(organizationId, employee, 'PROMOTION', input, ctx)
		if (proposed) return proposed
	}

	const write = async (tx: Prisma.TransactionClient) => {
		const data: Prisma.EmployeeUpdateInput = { ...columns }

		if (payChanged) {
			const current = await insertCompensationSnapshot(
				tx,
				id,
				{ basicMonthlySalary, rateType, effectiveDate: eff, note: input.note ?? 'promotion' },
				ctx.actorId,
				today
			)
			if (current) {
				data.basicMonthlySalary = current.basicMonthlySalary
				data.rateType = current.rateType
			}
		}
		if (typeChanged) {
			const current = await insertEmploymentTypeSnapshot(
				tx,
				id,
				{ employmentType, effectiveDate: eff, note: input.note ?? 'promotion' },
				ctx.actorId,
				today
			)
			if (current) data.employmentType = current.employmentType
		}

		if (Object.keys(data).length > 0) await tx.employee.update({ where: { id }, data })

		// ONE audit entry across every changed history field — this is what makes the 201 timeline
		// render a promotion as a single event rather than N scattered edits.
		const oldValue: Record<string, unknown> = {}
		const newValue: Record<string, unknown> = { effectiveDate: eff }
		if (columns.positionId !== undefined) {
			oldValue.positionId = employee.positionId
			newValue.positionId = columns.positionId
		}
		if (columns.jobTitle !== undefined) {
			oldValue.jobTitle = employee.jobTitle
			newValue.jobTitle = columns.jobTitle
		}
		if (typeChanged) {
			oldValue.employmentType = typeAtEff
			newValue.employmentType = employmentType
		}
		if (payChanged) {
			oldValue.basicMonthlySalary = atEff.salary.toNumber()
			oldValue.rateType = atEff.rateType
			newValue.basicMonthlySalary = basicMonthlySalary
			newValue.rateType = rateType
		}
		// reportsToId is not a HISTORY_FIELD (the timeline shows employment terms, not the org chart),
		// so it rides along as a named-only change like every other non-history edit.
		if (columns.reportsToId !== undefined) newValue._otherFields = ['reportsToId']

		await writeAuditLog(
			ctx,
			{ action: 'UPDATE', entityType: 'Employee', entityId: id, oldValue, newValue },
			tx
		)
	}
	await (opts?.confirmTx ? write(opts.confirmTx) : db.$transaction(write))

	return { notice }
}

/**
 * Union of both writers' inputs — the promotion input is a superset of the compensation one.
 *
 * `.strict()` so the two cannot drift apart silently: a field added to `PromoteEmployeeInput` and
 * not to this schema would otherwise be stripped at apply time, and the proposal would apply a
 * QUIETER change than the one that was reviewed. Strict turns that into a 400 that rolls the claim
 * back and leaves the row PENDING — loud, and recoverable.
 */
export const proposalPayloadSchema = z
	.object({
		effectiveDate: z.coerce.date(),
		basicMonthlySalary: z.number().optional(),
		rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
		employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
		positionId: z.string().nullable().optional(),
		jobTitle: z.string().optional(),
		reportsToId: z.string().optional(),
		note: z.string().optional()
	})
	.strict()

/**
 * The `apply` callback for `confirmProposal` — re-enters the writer that filed the proposal, on the
 * claim's transaction client and with the propose branch bypassed.
 *
 * Re-entering the writer rather than replaying a stored diff is the point: every guard the writer
 * has (no-change, rate-basis pairing, hire-date floor, org-scoped position and manager, frozen-run
 * notice) re-runs against the state as it stands NOW, so a payload that went stale while the
 * proposal sat pending throws — and because this runs inside the claim, the claim rolls back and
 * the proposal is still PENDING rather than burnt.
 *
 * The audit row names the confirmer, not the initiator: they are the one who caused the write. The
 * initiator is on record in the proposal's own CREATE entry.
 */
export async function applyProposedChange(
	organizationId: string,
	proposal: { targetEmployeeId: string; domain: ProposalDomain; payload: unknown },
	tx: Prisma.TransactionClient,
	ctx: AuditContext
): Promise<void> {
	// The payload is `Json` read back as `unknown`, so dates arrive as ISO strings — parse rather
	// than cast, or `utcMidnight` would silently receive a string.
	const payload = proposalPayloadSchema.parse(proposal.payload)

	if (proposal.domain === 'COMPENSATION') {
		const { basicMonthlySalary, rateType, effectiveDate, note } = payload
		await recordCompensationChange(
			proposal.targetEmployeeId,
			organizationId,
			{ basicMonthlySalary, rateType, effectiveDate, note },
			ctx,
			{ confirmTx: tx }
		)
	} else if (proposal.domain === 'PROMOTION') {
		await promoteEmployee(proposal.targetEmployeeId, organizationId, payload, ctx, {
			confirmTx: tx
		})
	} else {
		// Named, not a catch-all: a third ProposalDomain routed here by default would be applied as a
		// promotion — the wrong writer, on a pay record, silently. Throwing keeps a new domain
		// unconfirmable until someone wires it up deliberately.
		error(400, `Unsupported proposal domain: ${proposal.domain}`)
	}
}

/**
 * The salary figures behind a pending proposal, in cleartext, for a confirmer who is about to
 * decide it (#111's audited reveal, applied to the queue).
 *
 * Lives here rather than in `action-proposals.ts` because it goes through
 * `revealEmployeeSensitive` — the one path that returns these values — and because employees.ts
 * already imports action-proposals.ts, so the reverse would be a cycle.
 *
 * Authority is the authority to DECIDE the row, asserted before anything is read: if you cannot
 * act on it you cannot read its figure. A reveal that audited and then refused would already have
 * read the data.
 */
export async function revealProposalAmount(
	organizationId: string,
	proposalId: string,
	ctx: AuditContext
): Promise<{ current: number | null; proposed: number | null }> {
	const proposal = await assertMayConfirmProposal(organizationId, proposalId, ctx)
	const employee = await revealEmployeeSensitive(proposal.targetEmployeeId, organizationId, ctx, {
		audit: true
	})
	// The proposal is only as good as its payload; an unreadable one still has to be rejectable,
	// so a parse failure reveals the current figure and no proposed one rather than 500ing.
	const parsed = proposalPayloadSchema.safeParse(proposal.payload)
	return {
		// A number, matching `proposed` — this is a form-action payload, and the two figures are
		// rendered side by side, so returning one as a Prisma.Decimal makes the client coerce.
		current: employee.basicMonthlySalary?.toNumber() ?? null,
		proposed: parsed.success ? (parsed.data.basicMonthlySalary ?? null) : null
	}
}

export async function offboardEmployee(
	id: string,
	organizationId: string,
	endDate: Date,
	ctx: AuditContext
) {
	const target = await getEmployee(id, organizationId)

	// Refuse self-offboarding: the transaction below deactivates the target's
	// user account, so an admin offboarding their own record would be locked out
	// on their next request (hooks.server.ts redirects inactive users to /login).
	// Guarding here covers both the form action and the v1 API in one place.
	if (target.userId === ctx.actorId) {
		error(400, 'You cannot offboard your own employee record — ask another admin to do it.')
	}

	// One transaction: a failed audit write must not leave an offboarding standing unrecorded.
	const employee = await db.$transaction(async (tx) => {
		const updated = await tx.employee.update({
			where: { id },
			data: { employmentStatus: 'OFFBOARDED', endDate }
		})
		await tx.user.updateMany({
			where: { employee: { id } },
			data: { isActive: false }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Employee',
				entityId: id,
				newValue: { employmentStatus: 'OFFBOARDED', endDate }
			},
			tx
		)

		return updated
	})

	return employee
}

export interface EmploymentHistoryChange {
	label: string
	from: string
	to: string
}
export interface EmploymentHistoryEvent {
	id: string
	date: Date
	actorEmail: string | null
	type: 'HIRED' | 'CHANGE'
	changes: EmploymentHistoryChange[]
	/** #170: when a compensation change takes effect (present only on comp-change events). */
	effectiveDate?: string
}

// Surface an employee's employment history (FR-051) from the audit trail:
// hiring, promotions, salary adjustments, department/position transfers, and
// status changes — derived by diffing the HISTORY_FIELDS on each audit entry.
// #290: salary figures are masked by default and released only through the audited ?/reveal,
// matching how the current basic monthly salary is handled (#111). Pass { unmask: true } only
// from that action — it is what writes the VIEW audit row covering both surfaces.
export async function getEmploymentHistory(
	employeeId: string,
	organizationId: string,
	opts: { unmask?: boolean } = {}
): Promise<EmploymentHistoryEvent[]> {
	const logs = await db.auditLog.findMany({
		where: {
			organizationId,
			entityType: 'Employee',
			entityId: employeeId,
			action: { in: ['CREATE', 'UPDATE'] }
		},
		orderBy: { createdAt: 'desc' },
		include: { actor: { select: { email: true } } }
	})

	// Resolve foreign-key ids to human-readable names for display.
	const [departments, positions, schedules, branches] = await Promise.all([
		db.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
		db.position.findMany({ where: { organizationId }, select: { id: true, title: true } }),
		db.workSchedule.findMany({ where: { organizationId }, select: { id: true, name: true } }),
		db.branch.findMany({ where: { organizationId }, select: { id: true, name: true } })
	])
	const deptMap = new Map(departments.map((d) => [d.id, d.name]))
	const posMap = new Map(positions.map((p) => [p.id, p.title]))
	const schedMap = new Map(schedules.map((s) => [s.id, s.name]))
	const branchMap = new Map(branches.map((b) => [b.id, b.name]))
	const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

	// #290: do NOT mask in here, however tidy it looks. display() feeds the `from === to`
	// equality check below, so a mask here makes both sides of every salary change compare
	// equal — the change is dropped, and when salary is the only surviving change the whole
	// timeline event (date, actor and all) is dropped with it. Mask after the check instead.
	const display = (field: string, raw: unknown): string => {
		if (raw == null || raw === '') return '—'
		const v = String(raw)
		if (field === 'departmentId') return deptMap.get(v) ?? '(removed)'
		if (field === 'positionId') return posMap.get(v) ?? '(removed)'
		if (field === 'branchId') return branchMap.get(v) ?? '(removed)'
		if (field === 'workScheduleId') return schedMap.get(v) ?? 'Default schedule'
		if (field === 'basicMonthlySalary') return money.format(Number(raw))
		// The figure's basis (#120) — 'Monthly salary' / 'Hourly rate', not the raw enum.
		if (field === 'rateType') return v === 'HOURLY' ? 'Hourly rate' : 'Monthly salary'
		if (field === 'employmentType' || field === 'employmentStatus') return v.replace(/_/g, ' ')
		return v
	}

	const events: EmploymentHistoryEvent[] = []
	for (const log of logs) {
		if (log.action === 'CREATE') {
			events.push({
				id: log.id,
				date: log.createdAt,
				actorEmail: log.actor?.email ?? null,
				type: 'HIRED',
				changes: []
			})
			continue
		}
		const oldValue = (log.oldValue ?? {}) as Record<string, unknown>
		const newValue = (log.newValue ?? {}) as Record<string, unknown>
		const changes: EmploymentHistoryChange[] = []
		for (const field of HISTORY_FIELDS) {
			if (!(field in newValue)) continue
			const from = display(field, oldValue[field])
			const to = display(field, newValue[field])
			if (from === to) continue
			// #290: mask AFTER the equality check — masking inside display() makes every salary
			// change compare equal, dropping the change and (when salary is the only surviving
			// field) the whole event. '—' passes through: absence hides nothing.
			const mask = (s: string) =>
				field === 'basicMonthlySalary' && !opts.unmask && s !== '—' ? MASKED_SALARY : s
			changes.push({ label: HISTORY_LABELS[field], from: mask(from), to: mask(to) })
		}
		if (changes.length > 0) {
			// #170: a comp change carries the effective date in newValue — surface it so the timeline
			// can distinguish "recorded on" from "effective from" (a backdated raise differs).
			const eff = newValue.effectiveDate
			events.push({
				id: log.id,
				date: log.createdAt,
				actorEmail: log.actor?.email ?? null,
				type: 'CHANGE',
				changes,
				...(eff ? { effectiveDate: String(eff) } : {})
			})
		}
	}
	return events
}
