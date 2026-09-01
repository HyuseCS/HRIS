import { Prisma } from '@prisma/client'
import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from '../types'

// ─── Company info ─────────────────────────────────────────────────────────────

export async function getCompanyInfo(organizationId: string) {
	const org = await db.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true, address: true, logoUrl: true, discordInviteUrl: true }
	})
	if (!org) error(404, 'Organization not found')
	return org
}

export async function updateCompanyInfo(
	organizationId: string,
	input: {
		name: string
		address?: string | null
		logoUrl?: string | null
		discordInviteUrl?: string | null
	},
	ctx: AuditContext
) {
	// Mutation + audit share a transaction so a failed audit write rolls back the change.
	return await db.$transaction(async (tx) => {
		const updated = await tx.organization.update({
			where: { id: organizationId },
			data: {
				name: input.name.trim(),
				address: input.address ?? null,
				logoUrl: input.logoUrl ?? null,
				discordInviteUrl: input.discordInviteUrl ?? null
			},
			select: { id: true, name: true, address: true, logoUrl: true, discordInviteUrl: true }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Organization',
				entityId: organizationId,
				newValue: { name: updated.name }
			},
			tx
		)
		return updated
	})
}

// ─── Earning / deduction codes ────────────────────────────────────────────────

export async function listPayCodes(organizationId: string) {
	const [earningTypes, deductionTypes] = await Promise.all([
		db.earningType.findMany({ where: { organizationId }, orderBy: { code: 'asc' } }),
		db.deductionType.findMany({ where: { organizationId }, orderBy: { code: 'asc' } })
	])
	return { earningTypes, deductionTypes }
}

export async function createEarningType(
	organizationId: string,
	input: { code: string; label: string; taxable: boolean; multiplier?: number | null },
	ctx: AuditContext
) {
	const code = input.code.trim().toUpperCase()
	const exists = await db.earningType.findFirst({ where: { organizationId, code } })
	if (exists) error(409, `Earning code "${code}" already exists`)
	return await db.$transaction(async (tx) => {
		const created = await tx.earningType.create({
			data: {
				organizationId,
				code,
				label: input.label.trim(),
				taxable: input.taxable,
				multiplier: input.multiplier ?? null
			}
		})
		await writeAuditLog(
			ctx,
			{ action: 'CREATE', entityType: 'EarningType', entityId: created.id, newValue: { code } },
			tx
		)
		return created
	})
}

export async function createDeductionType(
	organizationId: string,
	input: { code: string; label: string; isStatutory: boolean },
	ctx: AuditContext
) {
	const code = input.code.trim().toUpperCase()
	const exists = await db.deductionType.findFirst({ where: { organizationId, code } })
	if (exists) error(409, `Deduction code "${code}" already exists`)
	return await db.$transaction(async (tx) => {
		const created = await tx.deductionType.create({
			data: { organizationId, code, label: input.label.trim(), isStatutory: input.isStatutory }
		})
		await writeAuditLog(
			ctx,
			{ action: 'CREATE', entityType: 'DeductionType', entityId: created.id, newValue: { code } },
			tx
		)
		return created
	})
}

// Codes are referenced by historical payroll rows, so we deactivate rather than delete.
export async function toggleEarningType(organizationId: string, id: string, ctx: AuditContext) {
	const et = await db.earningType.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!et) error(404, 'Earning code not found')
	return await db.$transaction(async (tx) => {
		const updated = await tx.earningType.update({ where: { id }, data: { isActive: !et.isActive } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'EarningType',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}

export async function toggleDeductionType(organizationId: string, id: string, ctx: AuditContext) {
	const dt = await db.deductionType.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!dt) error(404, 'Deduction code not found')
	return await db.$transaction(async (tx) => {
		const updated = await tx.deductionType.update({
			where: { id },
			data: { isActive: !dt.isActive }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'DeductionType',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}

// ─── Salary grades / bands ────────────────────────────────────────────────────

// Where a salary sits relative to a grade band. Pure — safe to unit-test.
export function bandStatus(salary: number, min: number, max: number): 'below' | 'within' | 'above' {
	if (salary < min) return 'below'
	if (salary > max) return 'above'
	return 'within'
}

export async function listSalaryGrades(organizationId: string) {
	return db.salaryGrade.findMany({ where: { organizationId }, orderBy: { minSalary: 'asc' } })
}

export async function listPositionsWithGrades(organizationId: string) {
	return db.position.findMany({
		where: { organizationId },
		select: { id: true, title: true, salaryGradeId: true },
		orderBy: { title: 'asc' }
	})
}

export async function createSalaryGrade(
	organizationId: string,
	input: { name: string; minSalary: number; midSalary: number; maxSalary: number },
	ctx: AuditContext
) {
	const name = input.name.trim()
	if (!(input.minSalary <= input.midSalary && input.midSalary <= input.maxSalary)) {
		error(400, 'Salaries must satisfy min ≤ mid ≤ max')
	}
	const exists = await db.salaryGrade.findFirst({ where: { organizationId, name } })
	if (exists) error(409, `Grade "${name}" already exists`)
	return await db.$transaction(async (tx) => {
		const created = await tx.salaryGrade.create({
			data: {
				organizationId,
				name,
				minSalary: input.minSalary,
				midSalary: input.midSalary,
				maxSalary: input.maxSalary
			}
		})
		await writeAuditLog(
			ctx,
			{ action: 'CREATE', entityType: 'SalaryGrade', entityId: created.id, newValue: { name } },
			tx
		)
		return created
	})
}

export async function toggleSalaryGrade(organizationId: string, id: string, ctx: AuditContext) {
	const g = await db.salaryGrade.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!g) error(404, 'Grade not found')
	return await db.$transaction(async (tx) => {
		const updated = await tx.salaryGrade.update({ where: { id }, data: { isActive: !g.isActive } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'SalaryGrade',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}

// Assign (or clear, with null) a position's grade.
export async function assignPositionGrade(
	organizationId: string,
	positionId: string,
	salaryGradeId: string | null,
	ctx: AuditContext
) {
	const pos = await db.position.findFirst({
		where: { id: positionId, organizationId },
		select: { id: true }
	})
	if (!pos) error(404, 'Position not found')
	if (salaryGradeId) {
		const grade = await db.salaryGrade.findFirst({
			where: { id: salaryGradeId, organizationId },
			select: { id: true }
		})
		if (!grade) error(404, 'Grade not found')
	}
	return await db.$transaction(async (tx) => {
		const updated = await tx.position.update({
			where: { id: positionId },
			data: { salaryGradeId }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Position',
				entityId: positionId,
				newValue: { salaryGradeId }
			},
			tx
		)
		return updated
	})
}

// ─── Leave types ──────────────────────────────────────────────────────────────

export interface LeaveTypeInput {
	name: string
	isPaid: boolean
	defaultDaysPerYear: number
	allowCarryOver: boolean
	maxCarryOverDays: number | null
	// Whole calendar months of service required before this type may be filed (#137).
	minMonthsOfService: number
}

export async function listLeaveTypes(organizationId: string) {
	return db.leaveType.findMany({
		where: { organizationId },
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
	})
}

/** Validate + normalise a leave-type payload. Carry-over cap only applies when carry-over is on. */
function normalizeLeaveType(input: LeaveTypeInput) {
	const name = input.name.trim()
	if (!name) error(400, 'Name is required')
	if (input.defaultDaysPerYear < 0) error(400, 'Default days per year cannot be negative')
	const maxCarryOverDays = input.allowCarryOver ? (input.maxCarryOverDays ?? 0) : null
	if (maxCarryOverDays != null && maxCarryOverDays < 0)
		error(400, 'Max carry-over days cannot be negative')
	const minMonthsOfService = Math.trunc(input.minMonthsOfService ?? 0)
	if (minMonthsOfService < 0) error(400, 'Minimum months of service cannot be negative')
	return {
		name,
		isPaid: input.isPaid,
		defaultDaysPerYear: input.defaultDaysPerYear,
		allowCarryOver: input.allowCarryOver,
		maxCarryOverDays,
		minMonthsOfService
	}
}

export async function createLeaveType(
	organizationId: string,
	input: LeaveTypeInput,
	ctx: AuditContext
) {
	const data = normalizeLeaveType(input)
	const exists = await db.leaveType.findFirst({ where: { organizationId, name: data.name } })
	if (exists) error(409, `Leave type "${data.name}" already exists`)
	try {
		// Mutation + audit share a transaction so a failed audit write rolls back the leave type.
		return await db.$transaction(async (tx) => {
			const created = await tx.leaveType.create({ data: { organizationId, ...data } })
			await writeAuditLog(
				ctx,
				{
					action: 'CREATE',
					entityType: 'LeaveType',
					entityId: created.id,
					newValue: { name: data.name }
				},
				tx
			)
			return created
		})
	} catch (e) {
		// A concurrent insert can slip past the findFirst check; the DB unique constraint is the
		// backstop, surfaced as the same 409 rather than an unhandled 500.
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, `Leave type "${data.name}" already exists`)
		throw e
	}
}

export async function updateLeaveType(
	organizationId: string,
	id: string,
	input: LeaveTypeInput,
	ctx: AuditContext
) {
	const existing = await db.leaveType.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Leave type not found')
	const data = normalizeLeaveType(input)
	const dupe = await db.leaveType.findFirst({
		where: { organizationId, name: data.name, id: { not: id } }
	})
	if (dupe) error(409, `Leave type "${data.name}" already exists`)
	try {
		return await db.$transaction(async (tx) => {
			const updated = await tx.leaveType.update({ where: { id }, data })
			await writeAuditLog(
				ctx,
				{ action: 'UPDATE', entityType: 'LeaveType', entityId: id, newValue: { name: data.name } },
				tx
			)
			return updated
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, `Leave type "${data.name}" already exists`)
		throw e
	}
}

/** Soft delete: leave types are referenced by balances/requests, so we toggle active, not delete. */
export async function toggleLeaveType(organizationId: string, id: string, ctx: AuditContext) {
	const lt = await db.leaveType.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!lt) error(404, 'Leave type not found')
	return db.$transaction(async (tx) => {
		const updated = await tx.leaveType.update({ where: { id }, data: { isActive: !lt.isActive } })
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'LeaveType',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}
