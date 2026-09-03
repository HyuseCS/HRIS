import { fail, isHttpError } from '@sveltejs/kit'
import { z } from 'zod'
import { requireAnyCapability } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import {
	listInventory,
	listCategories,
	createInventoryItem,
	updateInventoryItem,
	deleteInventoryItem,
	INVENTORY_STATUSES,
	type InventoryInput
} from '$lib/server/services/inventory'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	const organizationId = locals.user!.organizationId

	const filter = {
		search: url.searchParams.get('search') ?? '',
		category: url.searchParams.get('category') ?? '',
		status: url.searchParams.get('status') ?? ''
	}

	const [items, categories, employees] = await Promise.all([
		listInventory(organizationId, filter),
		listCategories(organizationId),
		db.employee.findMany({
			where: { organizationId, employmentStatus: 'ACTIVE' },
			select: { id: true, firstName: true, lastName: true },
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
		})
	])

	return { items, categories, employees, filter }
}

const itemSchema = z.object({
	name: z.string().min(1).max(120),
	category: z.string().max(60).optional(),
	quantity: z.coerce.number().int().min(0).max(1_000_000),
	unit: z.string().max(20).optional(),
	location: z.string().max(120).optional(),
	status: z.enum(INVENTORY_STATUSES),
	assignedToId: z.string().optional(),
	serialNumber: z.string().max(120).optional(),
	// Empty string → undefined so an unset value doesn't coerce to 0.
	value: z
		.union([z.literal(''), z.coerce.number().min(0).max(1_000_000_000)])
		.optional()
		.transform((v) => (v === '' || v === undefined ? null : v)),
	notes: z.string().max(2000).optional()
})

function inputOf(d: z.infer<typeof itemSchema>): InventoryInput {
	return {
		name: d.name,
		category: d.category ?? '',
		quantity: d.quantity,
		unit: d.unit ?? '',
		location: d.location ?? null,
		status: d.status,
		assignedToId: d.assignedToId ?? null,
		serialNumber: d.serialNumber ?? null,
		value: d.value,
		notes: d.notes ?? null
	}
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

async function run(fn: () => Promise<unknown>) {
	try {
		await fn()
		return { success: true }
	} catch (e: unknown) {
		if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
		throw e
	}
}

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const parsed = itemSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) return fail(422, { error: 'Check the item fields and try again.' })
		return run(() =>
			createInventoryItem(
				locals.user!.organizationId,
				inputOf(parsed.data),
				ctxOf(locals, getClientAddress())
			)
		)
	},

	update: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const data = Object.fromEntries(await request.formData())
		const id = data.id as string
		if (!id) return fail(400, { error: 'Missing id' })
		const parsed = itemSchema.safeParse(data)
		if (!parsed.success) return fail(422, { error: 'Check the item fields and try again.' })
		return run(() =>
			updateInventoryItem(
				locals.user!.organizationId,
				id,
				inputOf(parsed.data),
				ctxOf(locals, getClientAddress())
			)
		)
	},

	remove: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const id = (await request.formData()).get('id') as string
		if (!id) return fail(400, { error: 'Missing id' })
		return run(() =>
			deleteInventoryItem(locals.user!.organizationId, id, ctxOf(locals, getClientAddress()))
		)
	}
}
