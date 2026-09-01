import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import type { OnboardingItemKind, Prisma } from '@prisma/client'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from './types'

// ─── Onboarding checklist (#116) ────────────────────────────────────────────────
//
// HR configures an org-scoped, ordered checklist in Settings. DERIVED items are
// auto-checked from the employee's own 201-file record via a fixed `derivedKey` (the
// "done" logic below stays code-owned — fully-custom derived conditions are deferred).
// MANUAL items are ticked off by HR and stored per employee in OnboardingCompletion.
// An org that has never configured a checklist falls back to the built-in derived
// defaults, so the 201 file behaves exactly as it did before this feature.

// The employee fields the derived predicates read — callers select exactly these.
export type OnboardingEmployee = {
	positionId: string | null
	workScheduleId: string | null
	// `string` covers the masked sentinel (#111): the "done" check is presence-only (`!= null`),
	// so a masked salary satisfies it without ever being read as a number.
	basicMonthlySalary: Prisma.Decimal | number | string | null
	bankName: string | null
	bankAccountName: string | null
	bankAccountNumber: string | null
	gcashNumber: string | null
	sssNumber: string | null
	philhealthNumber: string | null
	pagibigNumber: string | null
	tinNumber: string | null
	user?: { isActive: boolean } | null
}

type DerivedDef = {
	key: string
	label: string
	hint: string
	done: (emp: OnboardingEmployee, docCategories: Set<string>) => boolean
}

// Built-in derivable conditions. This order is the default order for a fresh org; HR can
// reorder/relabel/disable them and add MANUAL items on top.
export const DERIVED_STEPS: DerivedDef[] = [
	{
		key: 'account',
		label: 'Company account created',
		hint: 'A login is generated with the employee record.',
		done: (e) => !!e.user?.isActive
	},
	{
		key: 'position',
		label: 'Position assigned',
		hint: 'Set “Position” in Update Profile.',
		done: (e) => !!e.positionId
	},
	{
		key: 'schedule',
		// The org default schedule applies when none is explicitly assigned, so a schedule
		// is always in effect and attendance always tracks — this always reads as done.
		label: 'Work schedule assigned',
		hint: 'Set “Work Schedule” — this starts attendance tracking.',
		done: () => true
	},
	{
		key: 'salary',
		label: 'Compensation set',
		hint: 'Set “Basic Monthly Salary”.',
		// Presence, not magnitude: salary is required at hire and reaches this derivation masked
		// (#111) as a non-numeric sentinel, so score it on non-null rather than a numeric compare.
		done: (e) => e.basicMonthlySalary != null
	},
	{
		key: 'disbursement',
		label: 'Payroll disbursement registered',
		hint: 'Add bank or GCash details under Disbursement.',
		done: (e) => !!((e.bankName && e.bankAccountName && e.bankAccountNumber) || e.gcashNumber)
	},
	{
		key: 'govids',
		label: 'Government IDs on file',
		hint: 'SSS, PhilHealth, Pag-IBIG, and TIN.',
		done: (e) => !!(e.sssNumber && e.philhealthNumber && e.pagibigNumber && e.tinNumber)
	},
	{
		key: 'contract',
		label: 'Signed contract uploaded',
		hint: 'Upload a “Contract” document.',
		done: (_e, docs) => docs.has('CONTRACT')
	}
]

export const DERIVED_KEYS = DERIVED_STEPS.map((s) => s.key)
const DERIVED_BY_KEY = new Map(DERIVED_STEPS.map((s) => [s.key, s]))

export type OnboardingStepView = {
	id: string
	kind: OnboardingItemKind
	label: string
	hint: string
	done: boolean
	// MANUAL items expose a checkbox on the 201 card; DERIVED ones are read-only.
	manual: boolean
}

// The shape the merge needs from a checklist row — a subset of OnboardingChecklistItem so
// the pure function is easy to unit-test without the full Prisma type.
export type ChecklistItemLike = {
	id: string
	kind: OnboardingItemKind
	derivedKey: string | null
	label: string
	hint: string
}

/**
 * Pure merge: turn the configured checklist rows (already ordered + active) plus the set
 * of completed manual-item ids into the view the 201 card renders. When `items` is empty
 * the built-in derived defaults are used, so an unconfigured org still gets the original
 * checklist. Exported for direct unit testing.
 */
export function buildOnboardingSteps(
	items: ChecklistItemLike[],
	completedItemIds: Set<string>,
	emp: OnboardingEmployee,
	docCategories: Iterable<string>
) {
	const docSet = docCategories instanceof Set ? docCategories : new Set(docCategories)

	const source: ChecklistItemLike[] = items.length
		? items
		: DERIVED_STEPS.map((s) => ({
				id: `default:${s.key}`,
				kind: 'DERIVED' as const,
				derivedKey: s.key,
				label: s.label,
				hint: s.hint
			}))

	const steps: OnboardingStepView[] = source.map((it) => {
		if (it.kind === 'MANUAL') {
			return {
				id: it.id,
				kind: 'MANUAL',
				label: it.label,
				hint: it.hint,
				done: completedItemIds.has(it.id),
				manual: true
			}
		}
		// DERIVED: run the code-owned predicate for its key (unknown key → not done).
		const def = it.derivedKey ? DERIVED_BY_KEY.get(it.derivedKey) : undefined
		return {
			id: it.id,
			kind: 'DERIVED',
			label: it.label,
			hint: it.hint,
			done: def ? def.done(emp, docSet) : false,
			manual: false
		}
	})

	const doneCount = steps.filter((s) => s.done).length
	return {
		steps,
		doneCount,
		total: steps.length,
		complete: steps.length > 0 && doneCount === steps.length
	}
}

/** The employee's onboarding view: reads the org config + this employee's manual state. */
export async function getEmployeeOnboarding(
	organizationId: string,
	emp: OnboardingEmployee & { id: string },
	docCategories: string[]
) {
	const [items, completions] = await Promise.all([
		db.onboardingChecklistItem.findMany({
			where: { organizationId, isActive: true },
			orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
		}),
		db.onboardingCompletion.findMany({
			where: { employeeId: emp.id },
			select: { itemId: true }
		})
	])
	const completed = new Set(completions.map((c) => c.itemId))
	return buildOnboardingSteps(items, completed, emp, docCategories)
}

// ─── Settings CRUD ──────────────────────────────────────────────────────────────

export async function listChecklistItems(organizationId: string) {
	return db.onboardingChecklistItem.findMany({
		where: { organizationId },
		orderBy: [{ order: 'asc' }, { createdAt: 'asc' }]
	})
}

/**
 * Materialize the default derived checklist the first time an org opens the editor, so HR
 * has the familiar steps to reorder/toggle. Idempotent — a no-op once any row exists, and
 * `skipDuplicates` guards the [organizationId, derivedKey] unique constraint under races.
 */
export async function ensureSeeded(organizationId: string) {
	const count = await db.onboardingChecklistItem.count({ where: { organizationId } })
	if (count > 0) return
	await db.onboardingChecklistItem.createMany({
		data: DERIVED_STEPS.map((s, i) => ({
			organizationId,
			kind: 'DERIVED' as const,
			derivedKey: s.key,
			label: s.label,
			hint: s.hint,
			order: i,
			isActive: true
		})),
		skipDuplicates: true
	})
}

export interface ManualItemInput {
	label: string
	hint: string
}

export async function addManualItem(
	organizationId: string,
	input: ManualItemInput,
	ctx: AuditContext
) {
	const label = input.label.trim()
	if (!label) error(400, 'Label is required')
	const max = await db.onboardingChecklistItem.aggregate({
		where: { organizationId },
		_max: { order: true }
	})
	const order = (max._max.order ?? -1) + 1
	return db.$transaction(async (tx) => {
		const created = await tx.onboardingChecklistItem.create({
			data: {
				organizationId,
				kind: 'MANUAL',
				derivedKey: null,
				label,
				hint: input.hint.trim(),
				order
			}
		})
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'OnboardingChecklistItem',
				entityId: created.id,
				newValue: { label, kind: 'MANUAL' }
			},
			tx
		)
		return created
	})
}

/** Label + hint are the only editable fields — kind and derivedKey are fixed at creation. */
export async function updateItem(
	organizationId: string,
	id: string,
	input: ManualItemInput,
	ctx: AuditContext
) {
	const existing = await db.onboardingChecklistItem.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Checklist item not found')
	const label = input.label.trim()
	if (!label) error(400, 'Label is required')
	return db.$transaction(async (tx) => {
		const updated = await tx.onboardingChecklistItem.update({
			where: { id },
			data: { label, hint: input.hint.trim() }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'OnboardingChecklistItem',
				entityId: id,
				newValue: { label }
			},
			tx
		)
		return updated
	})
}

export async function toggleItem(organizationId: string, id: string, ctx: AuditContext) {
	const existing = await db.onboardingChecklistItem.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!existing) error(404, 'Checklist item not found')
	return db.$transaction(async (tx) => {
		const updated = await tx.onboardingChecklistItem.update({
			where: { id },
			data: { isActive: !existing.isActive }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'OnboardingChecklistItem',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}

/**
 * DERIVED items map to code and can only be hidden (toggled off), not deleted. MANUAL
 * items can be removed; their per-employee completions cascade (onDelete: Cascade).
 */
export async function deleteItem(organizationId: string, id: string, ctx: AuditContext) {
	const existing = await db.onboardingChecklistItem.findFirst({
		where: { id, organizationId },
		select: { id: true, kind: true }
	})
	if (!existing) error(404, 'Checklist item not found')
	if (existing.kind === 'DERIVED')
		error(400, 'Derived items can be hidden but not deleted — toggle it off instead.')
	return db.$transaction(async (tx) => {
		await tx.onboardingChecklistItem.delete({ where: { id } })
		await writeAuditLog(
			ctx,
			{ action: 'DELETE', entityType: 'OnboardingChecklistItem', entityId: id },
			tx
		)
	})
}

/** Persist a new ordering. `orderedIds` must be exactly the org's items, once each. */
export async function reorderItems(
	organizationId: string,
	orderedIds: string[],
	ctx: AuditContext
) {
	const items = await db.onboardingChecklistItem.findMany({
		where: { organizationId },
		select: { id: true }
	})
	const owned = new Set(items.map((i) => i.id))
	if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id)))
		error(400, 'Invalid reorder payload')
	// One transaction: a failed audit write must not leave a reordering standing unrecorded.
	// Sequential updates rather than the batched array form, which has no `tx` to hand the
	// audit — the list is one org's checklist, so the count is small.
	await db.$transaction(async (tx) => {
		for (const [i, id] of orderedIds.entries()) {
			await tx.onboardingChecklistItem.update({ where: { id }, data: { order: i } })
		}

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'OnboardingChecklistItem',
				entityId: 'reorder',
				newValue: { order: orderedIds }
			},
			tx
		)
	})
}

/** Move one item up or down one slot. A no-op at the list edge. */
export async function moveItem(
	organizationId: string,
	id: string,
	direction: 'up' | 'down',
	ctx: AuditContext
) {
	const items = await db.onboardingChecklistItem.findMany({
		where: { organizationId },
		orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
		select: { id: true }
	})
	const idx = items.findIndex((i) => i.id === id)
	if (idx === -1) error(404, 'Checklist item not found')
	const swapWith = direction === 'up' ? idx - 1 : idx + 1
	if (swapWith < 0 || swapWith >= items.length) return // already at the edge
	const ordered = items.map((i) => i.id)
	;[ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]]
	await reorderItems(organizationId, ordered, ctx)
}

/** HR ticks a MANUAL item on/off for one employee. Idempotent per (item, employee). */
export async function setManualCompletion(
	organizationId: string,
	itemId: string,
	employeeId: string,
	done: boolean,
	ctx: AuditContext
) {
	const item = await db.onboardingChecklistItem.findFirst({
		where: { id: itemId, organizationId },
		select: { kind: true }
	})
	if (!item) error(404, 'Checklist item not found')
	if (item.kind !== 'MANUAL') error(400, 'Only manual items can be checked off')
	const emp = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true }
	})
	if (!emp) error(404, 'Employee not found')

	if (done) {
		await db.onboardingCompletion.upsert({
			where: { itemId_employeeId: { itemId, employeeId } },
			create: { itemId, employeeId, completedById: ctx.actorId },
			update: {}
		})
	} else {
		await db.onboardingCompletion.deleteMany({ where: { itemId, employeeId } })
	}
	await writeAuditLog(ctx, {
		action: 'UPDATE',
		entityType: 'OnboardingCompletion',
		entityId: employeeId,
		newValue: { itemId, done }
	})
}
