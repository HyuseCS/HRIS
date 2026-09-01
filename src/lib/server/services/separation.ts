import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import type { EmploymentStatus, LoanStatus, SeparationType } from '@prisma/client'
import type { AuditContext } from './types'
import { clearanceTemplateForOrg } from './offboarding'
import { currentCompensation } from './payroll/compensation'
import { sendOffboardingNoticeEmail } from '$lib/server/notifications'
import { requireAnyCapability } from '$lib/server/rbac'
import { D } from './payroll/money'
import { undidOwnFinalize } from './separation-undo-markers'

// Average paid working days per month — used to convert a monthly salary to a
// daily rate for unused-leave conversion. A deliberate, adjustable simplification;
// swap for the DOLE factor (313/12) if payroll policy requires it.
const WORKING_DAYS_PER_MONTH = 22

export interface CreateSeparationInput {
	employeeId: string
	type: SeparationType
	effectiveDate: Date
	reason?: string
}

export async function createSeparation(
	organizationId: string,
	input: CreateSeparationInput,
	ctx: AuditContext
) {
	const employee = await db.employee.findFirst({
		where: { id: input.employeeId, organizationId },
		select: {
			id: true,
			employmentStatus: true,
			firstName: true,
			lastName: true,
			user: { select: { email: true } }
		}
	})
	if (!employee) error(404, 'Employee not found')
	if (employee.employmentStatus === 'OFFBOARDED') error(409, 'Employee is already offboarded')

	const existing = await db.separationRecord.findFirst({
		where: { employeeId: input.employeeId, status: { not: 'FINALIZED' } },
		select: { id: true }
	})
	if (existing) error(409, 'An open separation case already exists for this employee')

	// Seed the case's clearance items from the org's editable offboarding checklist (#192),
	// falling back to the built-in defaults when none are configured.
	const clearance = await clearanceTemplateForOrg(organizationId)

	// One transaction: a failed audit write must not leave an opened separation case
	// standing unrecorded.
	const record = await db.$transaction(async (tx) => {
		const created = await tx.separationRecord.create({
			data: {
				organizationId,
				employeeId: input.employeeId,
				type: input.type,
				effectiveDate: input.effectiveDate,
				reason: input.reason || null,
				clearanceItems: { create: clearance }
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'SeparationRecord',
				entityId: created.id,
				newValue: {
					employeeId: input.employeeId,
					type: input.type,
					effectiveDate: input.effectiveDate
				}
			},
			tx
		)

		return created
	})

	// Email the departing employee a due-diligence / transition-period notice with their
	// effective date and the clearance checklist (#185). Best-effort: a notifier failure
	// must not roll back an opened case.
	try {
		sendOffboardingNoticeEmail(employee.user.email, {
			employeeName: `${employee.firstName} ${employee.lastName}`,
			effectiveDate: input.effectiveDate,
			checklist: clearance
		})
	} catch (e) {
		console.error('[NOTIFY] Failed to email offboarding notice for', record.id, e)
	}

	return record
}

export async function listSeparations(organizationId: string) {
	return db.separationRecord.findMany({
		where: { organizationId },
		orderBy: { createdAt: 'desc' },
		include: {
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
			clearanceItems: { select: { status: true } }
		}
	})
}

export async function getSeparation(id: string, organizationId: string) {
	const record = await db.separationRecord.findFirst({
		where: { id, organizationId },
		include: {
			employee: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					employeeNumber: true,
					jobTitle: true,
					employmentStatus: true,
					department: { select: { name: true } }
				}
			},
			clearanceItems: { orderBy: { area: 'asc' } }
		}
	})
	if (!record) error(404, 'Separation record not found')
	return record
}

export interface ClearanceActorRef {
	status: string
	clearedById: string | null
	// #304/N-1: OPTIONAL on purpose. Making it required would break every caller that feeds this
	// shape a narrower projection, including `setClearanceItem`'s — and it is exactly why the
	// in-transaction re-check below needs a PROJECTION assertion: a narrowed `select` degrades
	// the bar to `clearedById`-only while `pnpm check` stays green.
	previouslyClearedById?: string | null
}

// #297/D3: whoever ticked any box on this case may not close it out. A PURE function on purpose —
// approvals.ts:119 (decidedActorIds) is the same shape, and it makes the rule testable with zero
// DB mocks. This repo's documented failure mode is exactly the vacuous mock (all-tests.md, five
// recorded cases), so the ~10 extra lines buy a test that cannot lie.
//
// #304/D-5: the bar keys on the two "cleared by" fields, NOT on status. The ordinary un-clear path
// (`setClearanceItem`, below) still NULLs `clearedById`, so it still un-bars — that is deliberate
// and unchanged. The undo's re-open branch KEEPS `clearedById` and only flips `status`, so a bulk
// re-open cannot launder every #297 bar on the case in one privileged call. The re-open ALSO
// stamps `previouslyClearedById`, which this helper reads, and which `setClearanceItem` never
// writes or clears — that second field is what makes the bar survive an ordinary un-clear (B-2).
export function clearedAnyItem(items: ClearanceActorRef[], actorId: string): boolean {
	// A null-vs-null match must never count, the same way `voidedOwnApproval` refuses one. Every
	// call site passes a non-null `ctx.actorId` today; this is here so a future refactor cannot
	// turn `undefined === undefined` into "everybody is barred".
	if (!actorId) return false
	return items.some((i) => i.clearedById === actorId || i.previouslyClearedById === actorId)
}

// The ONE source of truth for both the server 403 in finalizeSeparation and the greyed-out
// Finalize button on /separations/[id] — computed once so the guard and the button cannot drift.
// Returns the refusal message, or null when the actor may finalize.
//
// Status choice (VALIDATE G4, recorded): the self refusal is 403, NOT offboardEmployee's 400.
// Four self-action bars in this codebase already use 403 (approvals.ts:231,
// employee-access.ts:136, action-proposals.ts:71 and :80) against offboardEmployee's single 400,
// and 403 is what "the request is fine, the ACTOR is refused" means. AC-4.3 asks for consistent
// wording and placement, not a matching status code; offboardEmployee's 400 is a live API
// contract and stays as the deliberate, known outlier.
export async function finalizeBarFor(
	record: { employee: { id: string }; clearanceItems: ClearanceActorRef[] },
	actorId: string
): Promise<string | null> {
	// SCOPED query, not a widened getSeparation select: userId is an identity column and
	// getSeparation's result goes straight to the client. This repo has shipped a select that
	// leaked a field it did not need twice (#111, #290). One extra indexed lookup is the cheaper bug.
	const employee = await db.employee.findUnique({
		where: { id: record.employee.id },
		select: { userId: true }
	})
	// #297/D4: mirrors offboardEmployee (employees.ts:1216) — finalize does the same destructive
	// thing (OFFBOARDED + isActive=false) plus writes off the actor's own loans.
	if (employee?.userId === actorId) {
		return 'You cannot finalize your own separation — ask another admin to do it.'
	}
	// #297/D3.
	if (clearedAnyItem(record.clearanceItems, actorId)) {
		return CLEARER_BAR
	}
	return null
}

// Shared so the pre-flight bar and the re-check inside `finalizeSeparation`'s transaction can
// never word the same refusal two different ways.
export const CLEARER_BAR =
	'You cannot finalize a separation whose clearance items you cleared — ask another HR administrator, or your CEO, to finalize it.'

export async function setClearanceItem(
	itemId: string,
	organizationId: string,
	cleared: boolean,
	ctx: AuditContext
) {
	const item = await db.clearanceItem.findFirst({
		where: { id: itemId, separation: { organizationId } },
		include: { separation: { select: { id: true, status: true } } }
	})
	if (!item) error(404, 'Clearance item not found')
	if (item.separation.status === 'FINALIZED') error(409, 'Separation is already finalized')

	// #297/D8: an item already cleared by somebody else is theirs. Without this the D3 bar is
	// trivially defeatable — B un-ticks A's item (which NULLs clearedById), re-ticks it, becomes
	// the clearer, and can wipe their own bar the same way. Chosen over a full clearance history
	// table, which the owner declined as too big for now.
	//
	// Covers BOTH directions (re-clear AND un-clear) — owner-confirmed 18-08-26, SPEC AC-9.1 and
	// AC-9.2, with AC-9.4 naming the two-step defeat route this closes. The UI's only path to
	// re-clearing is un-clear-then-clear, so barring only the re-clear would leave the defeat intact.
	// NULL-safe: a legacy CLEARED row with no clearedById stays editable rather than frozen.
	if (item.status === 'CLEARED' && item.clearedById && item.clearedById !== ctx.actorId) {
		error(403, 'This clearance item was already cleared by someone else. Only they can change it.')
	}

	// #304/B-2: NULLs `clearedById` on purpose — the exact opposite of the undo's re-open branch.
	// See `clearedAnyItem`. And NEVER write or clear `previouslyClearedById` here: that field
	// exists precisely because this path is reachable by any MANAGE_HR holder and `clearedById` is
	// therefore not a safe place to keep the #297 bar. Adding it to this data object re-opens the
	// laundering route.
	// One transaction: a failed audit write must not leave a clearance tick standing
	// unrecorded, and it also narrows the count-then-write race on the parent status below.
	await db.$transaction(async (tx) => {
		await tx.clearanceItem.update({
			where: { id: itemId },
			data: {
				status: cleared ? 'CLEARED' : 'PENDING',
				clearedById: cleared ? ctx.actorId : null,
				clearedAt: cleared ? new Date() : null
			}
		})

		// Roll the parent status forward/back so the finalize gate reflects the checklist.
		const remaining = await tx.clearanceItem.count({
			where: { separationId: item.separation.id, status: 'PENDING' }
		})
		// `updateMany` with a status floor, NOT `update`: the FINALIZED check at the top of this
		// function is a read, and a finalize landing between it and here would be silently rolled
		// back to CLEARED/OPEN by this line — leaving a record that says OPEN while still carrying
		// `finalizedAt` and `finalizedById`. A finalized case is closed; the roll-forward skips it.
		await tx.separationRecord.updateMany({
			where: { id: item.separation.id, status: { not: 'FINALIZED' } },
			data: { status: remaining === 0 ? 'CLEARED' : 'OPEN' }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'ClearanceItem',
				entityId: itemId,
				newValue: { status: cleared ? 'CLEARED' : 'PENDING' }
			},
			tx
		)
	})
}

export interface FinalPayLine {
	label: string
	amount: number // positive = pay to employee, negative = deducted/owed
}

export interface FinalPayResult {
	lines: FinalPayLine[]
	total: number
}

// The two write-off line labels are the ONLY link between what `computeFinalPay` stores and what
// `aggregateWriteOff` reads back off an old record. They are persisted in `finalPayBreakdown`, so
// changing a value here silently zeroes the D-4 banner on every record written before the change.
export const LOAN_WRITE_OFF_LABEL = 'Outstanding loan balances'
export const CASH_ADVANCE_WRITE_OFF_LABEL = 'Outstanding cash advances'

// Snapshot-style final pay: unused paid-leave conversion, minus outstanding loan
// and cash-advance balances. Prorated 13th-month and tax refunds are out of scope
// here (they need YTD payroll) and can be layered on later.
export async function computeFinalPay(
	separationId: string,
	organizationId: string
): Promise<FinalPayResult> {
	const record = await getSeparation(separationId, organizationId)
	const employeeId = record.employee.id

	const [employee, compHistory, leaveBalances, loans, cashAdvances] = await Promise.all([
		db.employee.findUniqueOrThrow({
			where: { id: employeeId },
			select: { basicMonthlySalary: true, rateType: true }
		}),
		// #170 Stage 1.5: final pay reads salary directly (not via getEmployee), so resolve the comp in
		// effect on the separation date from history — a raise effective by then must reach final pay.
		db.employeeCompensation.findMany({
			where: { employeeId },
			select: { basicMonthlySalary: true, rateType: true, effectiveDate: true, changedAt: true }
		}),
		db.leaveBalance.findMany({
			where: { employeeId, year: record.effectiveDate.getFullYear() },
			select: { remaining: true }
		}),
		db.loan.findMany({ where: { employeeId, status: 'ACTIVE' }, select: { balance: true } }),
		db.cashAdvance.findMany({
			where: { employeeId, status: 'ACTIVE' },
			select: { balance: true }
		})
	])

	const comp = currentCompensation(compHistory, record.effectiveDate, {
		basicMonthlySalary: employee.basicMonthlySalary,
		rateType: employee.rateType
	})
	const rate = comp.salary.toNumber()
	// #189: the stored figure means something different per basis (mirror payslip-document.ts). Dividing
	// an hourly/daily rate by the monthly working days would understate the day value 176×/22×.
	const dailyRate =
		comp.rateType === 'HOURLY'
			? rate * 8
			: comp.rateType === 'DAILY'
				? rate
				: rate / WORKING_DAYS_PER_MONTH
	const leaveDays = leaveBalances.reduce((sum, b) => sum + Number(b.remaining), 0)
	const leaveConversion = round2(leaveDays * dailyRate)
	const loanBalance = round2(loans.reduce((sum, l) => sum + Number(l.balance), 0))
	const caBalance = round2(cashAdvances.reduce((sum, c) => sum + Number(c.balance), 0))

	const lines: FinalPayLine[] = [
		{ label: `Unused leave conversion (${leaveDays.toFixed(2)} days)`, amount: leaveConversion },
		{ label: LOAN_WRITE_OFF_LABEL, amount: -loanBalance },
		{ label: CASH_ADVANCE_WRITE_OFF_LABEL, amount: -caBalance }
	]
	const total = round2(lines.reduce((sum, l) => sum + l.amount, 0))
	return { lines, total }
}

/**
 * #304 — everything `finalizeSeparation` is about to overwrite, captured INSIDE its transaction so
 * `undoSeparation` can put it back. A NULL column means the record was finalized before #304
 * shipped, which is the only detector D-4's "partially restored" state needs.
 *
 * Balances are STRINGS (`Decimal.toString()`), never `Number`: JSON has no decimal type, and a
 * float round-trip on a balance is precisely what `payroll/money.ts` exists to prevent
 * (cf. `amortization.ts:33-35`). `endDate` is an ISO string for the same reason — a `Date` is not
 * a valid Prisma `InputJsonValue`.
 */
export interface PreFinalizeState {
	loans: { id: string; balance: string; status: string }[]
	cashAdvances: { id: string; balance: string; status: string }[]
	employee: { employmentStatus: string; endDate: string | null }
	userIds: string[]
	userWasActive: boolean
}

// Finalize: requires all clearance items CLEARED. Snapshots final pay, marks the
// employee OFFBOARDED (endDate = effectiveDate), and deactivates their login.
export async function finalizeSeparation(id: string, organizationId: string, ctx: AuditContext) {
	const record = await getSeparation(id, organizationId)
	if (record.status === 'FINALIZED') error(409, 'Separation is already finalized')

	// #297/D3+D4, ABOVE the pending-items check on purpose: pending-items implicitly says "go clear
	// the rest", but under D3 every item this actor clears deepens their own bar. Same reasoning as
	// approvals.ts:636-639 — the specific refusal stays above the generic one.
	const bar = await finalizeBarFor(record, ctx.actorId)
	if (bar) error(403, bar)

	const pending = record.clearanceItems.filter((i) => i.status !== 'CLEARED').length
	if (pending > 0) error(409, `Cannot finalize — ${pending} clearance item(s) still pending`)

	const finalPay = await computeFinalPay(id, organizationId)

	await db.$transaction(async (tx) => {
		// #297: re-read the clearance rows here. `finalizeBarFor` ran before this transaction
		// opened, so a tick landing in that window would otherwise let an actor finalize a case
		// they had just become a clearer of. The pre-flight bar still runs first — it is what
		// produces the message the UI shows; this is the one that cannot be raced.
		const live = await tx.clearanceItem.findMany({
			where: { separationId: id },
			// #304/N-1: `previouslyClearedById` MUST be selected. `clearedAnyItem` reads it, the
			// field is optional on ClearanceActorRef, so dropping it here silently degrades this
			// half of the bar to `clearedById`-only with `pnpm check` still green. The pre-flight
			// bar is safe — it gets `getSeparation`'s bare `clearanceItems` include, which carries
			// the whole row — but this re-check exists ONLY for the race the pre-flight cannot
			// cover, so it is the half that must not be narrower.
			select: { status: true, clearedById: true, previouslyClearedById: true }
		})
		if (clearedAnyItem(live, ctx.actorId)) error(403, CLEARER_BAR)

		// #304: read every row this transaction is about to overwrite, BEFORE it overwrites it.
		// The snapshot rides in the compare-and-set claim below, so the reads have to precede the
		// claim. A finalize that LOSES the race still reads here, but its claim comes back
		// `count: 0` and it throws — so a loser never WRITES a snapshot, which is the property
		// that actually matters.
		const priorLoans = await tx.loan.findMany({
			where: { employeeId: record.employee.id, status: 'ACTIVE' },
			select: { id: true, balance: true, status: true }
		})
		const priorAdvances = await tx.cashAdvance.findMany({
			where: { employeeId: record.employee.id, status: 'ACTIVE' },
			select: { id: true, balance: true, status: true }
		})
		// `getSeparation` already carries `employmentStatus`, but not `endDate`, and widening its
		// select would ship one more column to the client (#111, #290). One scoped read instead.
		const priorEmployee = await tx.employee.findUniqueOrThrow({
			where: { id: record.employee.id },
			select: { employmentStatus: true, endDate: true }
		})
		const priorUsers = await tx.user.findMany({
			where: { employee: { id: record.employee.id } },
			select: { id: true, isActive: true }
		})
		const preFinalizeState: PreFinalizeState = {
			loans: priorLoans.map((l) => ({ id: l.id, balance: l.balance.toString(), status: l.status })),
			cashAdvances: priorAdvances.map((c) => ({
				id: c.id,
				balance: c.balance.toString(),
				status: c.status
			})),
			employee: {
				employmentStatus: priorEmployee.employmentStatus,
				endDate: priorEmployee.endDate ? priorEmployee.endDate.toISOString() : null
			},
			userIds: priorUsers.map((u) => u.id),
			// The login the undo may re-enable. `some`, not `[0]`: an employee with no user row at
			// all must restore as "was not active", never as `undefined`.
			userWasActive: priorUsers.some((u) => u.isActive)
		}

		// Status-guarded update: the check above is only preliminary — a concurrent
		// finalize between it and here would otherwise double-snapshot.
		const updated = await tx.separationRecord.updateMany({
			where: { id, status: { not: 'FINALIZED' } },
			data: {
				status: 'FINALIZED',
				finalPayAmount: new Prisma.Decimal(finalPay.total),
				finalPayBreakdown: finalPay as unknown as Prisma.InputJsonValue,
				finalizedAt: new Date(),
				finalizedById: ctx.actorId,
				preFinalizeState: preFinalizeState as unknown as Prisma.InputJsonValue
			}
		})
		if (updated.count === 0) error(409, 'Separation is already finalized')

		// The outstanding balances were offset against final pay above — settle them
		// so they don't linger as ACTIVE receivables on an offboarded employee.
		await tx.loan.updateMany({
			where: { employeeId: record.employee.id, status: 'ACTIVE' },
			data: { balance: 0, status: 'PAID' }
		})
		await tx.cashAdvance.updateMany({
			where: { employeeId: record.employee.id, status: 'ACTIVE' },
			data: { balance: 0, status: 'PAID' }
		})

		await tx.employee.update({
			where: { id: record.employee.id },
			data: { employmentStatus: 'OFFBOARDED', endDate: record.effectiveDate }
		})
		await tx.user.updateMany({
			where: { employee: { id: record.employee.id } },
			data: { isActive: false }
		})

		// #304/SPEC §3c: INSIDE the transaction, with `tx` as the third argument, so the trail
		// commits or rolls back with the money it records. `writeAuditLog` has always taken a
		// transaction client (`audit.ts:22-26`); finalize simply never passed one. `oldValue`
		// names the state this call destroys, so the trail is recoverable even for a record whose
		// snapshot column predates #304.
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'SeparationRecord',
				entityId: id,
				oldValue: {
					status: record.status,
					employmentStatus: preFinalizeState.employee.employmentStatus,
					endDate: preFinalizeState.employee.endDate,
					activeLoanCount: priorLoans.length,
					activeAdvanceCount: priorAdvances.length
				},
				newValue: { status: 'FINALIZED', finalPayAmount: finalPay.total }
			},
			tx
		)
	})

	return finalPay
}

/**
 * The aggregate that D-4's "partially restored" banner names, read back off the surviving
 * `finalPayBreakdown`. Returns null — NOT 0 — when the breakdown is missing or malformed, so the
 * UI can say "amount unknown" instead of asserting a peso figure it does not have. Records
 * finalized long before #304 are trusted, not verified (plan §CANNOT-Prove #4).
 *
 * Exported because the D-4 banner has to survive a page reload, so `load` derives the figure from
 * the same surviving `finalPayBreakdown` rather than from the undo action's return — and it must
 * not duplicate these two label strings to do it.
 */
export function aggregateWriteOff(breakdown: unknown): number | null {
	const lines = (breakdown as FinalPayResult | null)?.lines
	if (!Array.isArray(lines)) return null
	// Both lines are stored NEGATIVE (they are offsets against final pay); the banner shows the
	// absolute sum.
	return lines.reduce((sum, line) => {
		if (line?.label !== LOAN_WRITE_OFF_LABEL && line?.label !== CASH_ADVANCE_WRITE_OFF_LABEL)
			return sum
		return sum + (typeof line.amount === 'number' ? Math.abs(line.amount) : 0)
	}, 0)
}

/**
 * #304 — undo a finalized separation. Shaped exactly like the payroll void (`payroll/runs.ts:95`):
 * capability in the SERVICE, precondition refusal, one transaction opening with a compare-and-set
 * claim, the reversal, and the audit entry inside it.
 *
 * Returns to `CLEARED` when the clearance items are kept, and to `OPEN` when they are re-opened
 * (B-4): a re-opened case has ZERO cleared items, so calling it `CLEARED` would be a lie the list
 * badge and the detail page both render.
 */
export async function undoSeparation(
	id: string,
	organizationId: string,
	reopenClearance: boolean,
	ctx: AuditContext
) {
	// D-2, FIRST LINE, in the service — mirroring `voidRun`. A break-glass door whose guard lives
	// only in its route is a door the next caller walks around; that drift is a recorded failure
	// mode in this repo.
	requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')

	const record = await db.separationRecord.findFirst({
		where: { id, organizationId },
		select: {
			id: true,
			employeeId: true,
			status: true,
			finalizedAt: true,
			finalizedById: true,
			finalPayBreakdown: true,
			preFinalizeState: true
		}
	})
	if (!record) error(404, 'Separation record not found')
	if (record.status !== 'FINALIZED') error(400, 'Separation is not finalized')

	// D-4: the ONLY detector needed. A record finalized before #304 shipped has no snapshot, so its
	// money cannot be restored and the UI must say so.
	const snapshot = (record.preFinalizeState as PreFinalizeState | null) ?? null
	const partial = snapshot === null
	const nextStatus = reopenClearance ? 'OPEN' : 'CLEARED'
	const writeOff = partial ? aggregateWriteOff(record.finalPayBreakdown) : null

	await db.$transaction(async (tx) => {
		// Compare-and-set. The status read above is only preliminary: two concurrent undos would
		// both pass it and both credit the balances back.
		const claimed = await tx.separationRecord.updateMany({
			where: { id, status: 'FINALIZED' },
			data: {
				status: nextStatus,
				finalPayAmount: null,
				finalizedAt: null,
				finalizedById: null
				// `finalPayBreakdown` is deliberately KEPT: on a pre-#304 record it is the only
				// surviving evidence of the aggregate write-off, which D-4's banner reads.
				//
				// `preFinalizeState` is deliberately NOT nulled (B-1). Nulling it destroyed the one
				// thing telling a fully-restored record apart from a pre-#304 one, so the banner
				// called every restored record "partially restored" on reload — a money lie. It also
				// bought nothing: a later re-finalize overwrites the column anyway. Do not "tidy up"
				// this stale-looking column.
			}
		})
		if (claimed.count === 0) error(400, 'Separation is not finalized')

		if (snapshot) {
			// Conditional restore in the spirit of `amortization.ts:52-62` but deliberately
			// STRICTER, and NOT the same idiom (I-1): amortization conditions on the balance it just
			// read in-transaction; this conditions on the constant post-finalize state, which
			// additionally catches a row that was never zeroed at all. Do NOT "correct" this back to
			// the amortization form.
			for (const loan of snapshot.loans) {
				const res = await tx.loan.updateMany({
					where: { id: loan.id, balance: 0, status: 'PAID' },
					// D(), never Number(): the balance is a decimal string on purpose.
					data: { balance: D(loan.balance), status: loan.status as LoanStatus }
				})
				if (res.count === 0) {
					error(409, 'A loan balance changed since finalizing — nothing was reversed, retry')
				}
			}
			for (const advance of snapshot.cashAdvances) {
				const res = await tx.cashAdvance.updateMany({
					where: { id: advance.id, balance: 0, status: 'PAID' },
					data: { balance: D(advance.balance), status: advance.status as LoanStatus }
				})
				if (res.count === 0) {
					error(
						409,
						'A cash-advance balance changed since finalizing — nothing was reversed, retry'
					)
				}
			}
		}

		// I-3 — a BLIND update where the money above is compare-and-set, and that asymmetry is
		// deliberate. Money moves through a dozen ordinary payroll paths between finalize and undo,
		// so it must be guarded. `employmentStatus` cannot: its only two writers in src/ are this
		// file and employees.ts, and the v1 API refuses it. Guarding it would buy a failure mode
		// without buying safety.
		await tx.employee.update({
			where: { id: record.employeeId },
			data: snapshot
				? {
						employmentStatus: snapshot.employee.employmentStatus as EmploymentStatus,
						endDate: snapshot.employee.endDate ? new Date(snapshot.employee.endDate) : null
					}
				: // ACTIVE is the honest default for a pre-#304 record: ON_LEAVE is recoverable by a
					// human, an OFFBOARDED ghost is not. Recorded in the audit as restoredStatusAssumed.
					{ employmentStatus: 'ACTIVE', endDate: null }
		})

		// B-5: this is NOT the only writer that can set `isActive: true` — `setUserActive`
		// (settings/org.ts) already is one, CEO-only behind MANAGE_USER_ROLES. The undo keeps its
		// OWN write rather than calling it, because `setUserActive` opens its own serializable
		// transaction and audits outside it: calling it from here would nest an independent
		// transaction, and the login would commit even if the money restore then rolled back. The
		// cost is that no `User`-entity audit row is written, which is why the login before/after is
		// folded into the SEPARATION_UNDO payload below.
		// One expression, read twice: the write below and the audit's `newValue.userIsActive` must
		// never disagree. A snapshot that says the login was ALREADY disabled before finalizing
		// leaves it disabled, and the audit has to say so.
		const reactivateLogin = !snapshot || snapshot.userWasActive
		if (reactivateLogin) {
			await tx.user.updateMany({
				where: { employee: { id: record.employeeId } },
				data: { isActive: true }
			})
		}

		// Read once, used twice: the stamp loop below needs `clearedById` per item, and the audit's
		// oldValue needs the clearer set even when the items are being kept.
		const items = await tx.clearanceItem.findMany({
			where: { separationId: id },
			select: { id: true, clearedById: true }
		})

		if (reopenClearance) {
			// Prisma cannot copy one column into another in a single `updateMany`, so this is a
			// small in-transaction loop. THE ONLY PLACE IN THE CODEBASE THAT WRITES
			// `previouslyClearedById` (B-2 option (b)). It must run BEFORE the re-open below.
			for (const item of items) {
				if (!item.clearedById) continue
				await tx.clearanceItem.update({
					where: { id: item.id },
					data: { previouslyClearedById: item.clearedById }
				})
			}
			await tx.clearanceItem.updateMany({
				where: { separationId: id },
				// `clearedById` is NOT in this data object, and that omission IS the guard (D-5),
				// not an oversight. Keeping it is what stops a bulk re-open laundering every #297
				// bar on the case in one privileged call. Do not "complete" this object.
				data: { status: 'PENDING' }
			})
		}

		await writeAuditLog(
			ctx,
			{
				action: 'SEPARATION_UNDO',
				entityType: 'SeparationRecord',
				entityId: id,
				oldValue: {
					status: 'FINALIZED',
					finalizedAt: record.finalizedAt ? record.finalizedAt.toISOString() : null,
					finalizedById: record.finalizedById,
					clearedByIds: items.map((i) => i.clearedById).filter((v) => v !== null),
					loans: snapshot?.loans ?? null,
					cashAdvances: snapshot?.cashAdvances ?? null,
					employmentStatus: snapshot?.employee.employmentStatus ?? null,
					// B-5's mitigation, and it is required not optional: the undo writes no
					// `User`-entity audit row, so anyone auditing `User.isActive` history has to
					// search SEPARATION_UNDO rows too.
					userIsActive: false
				},
				newValue: {
					status: nextStatus,
					userIsActive: reactivateLogin,
					reopenedClearance: reopenClearance,
					partiallyRestored: partial,
					// The employmentStatus restore on a pre-#304 record is an ASSUMPTION. Flagged so
					// a human can find and correct it.
					...(partial && { restoredStatusAssumed: true }),
					// Conditional-spread (D-3): ABSENT on an ordinary undo, never present-and-false.
					...(undidOwnFinalize(ctx.actorId, record) && { sameActorAsFinalizer: true })
				}
			},
			tx
		)
	})

	return { partial, status: nextStatus, writeOff }
}

// Separation report rows for the Reports module / CSV export.
export async function generateSeparationReport(
	organizationId: string,
	range: { startDate: Date; endDate: Date }
) {
	const records = await db.separationRecord.findMany({
		where: {
			organizationId,
			effectiveDate: { gte: range.startDate, lte: range.endDate }
		},
		orderBy: { effectiveDate: 'desc' },
		include: {
			employee: {
				select: {
					firstName: true,
					lastName: true,
					employeeNumber: true,
					department: { select: { name: true } }
				}
			},
			clearanceItems: { select: { status: true } }
		}
	})

	// TitleCase keys: the report table renders row[column] and the CSV export uses
	// the keys as headers, matching the other report generators.
	return records.map((r) => {
		const cleared = r.clearanceItems.filter((c) => c.status === 'CLEARED').length
		return {
			EmployeeNumber: r.employee.employeeNumber,
			Employee: `${r.employee.lastName}, ${r.employee.firstName}`,
			Department: r.employee.department?.name ?? '',
			Type: r.type,
			EffectiveDate: r.effectiveDate.toISOString().slice(0, 10),
			Status: r.status,
			Clearance: `${cleared}/${r.clearanceItems.length}`,
			FinalPay: r.finalPayAmount ? Number(r.finalPayAmount).toFixed(2) : ''
		}
	})
}

function round2(n: number) {
	return Math.round(n * 100) / 100
}
