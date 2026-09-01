import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import type { AuditContext } from './types'

interface EmergencyContactInput {
	name: string
	relationship: string
	phone: string
}

// Confirms the employee belongs to the actor's organization before mutating.
async function assertEmployeeInOrg(employeeId: string, organizationId: string) {
	const employee = await db.employee.findFirst({
		where: { id: employeeId, organizationId },
		select: { id: true }
	})
	if (!employee) error(404, 'Employee not found')
}

export async function addEmergencyContact(
	employeeId: string,
	organizationId: string,
	input: EmergencyContactInput,
	ctx: AuditContext
) {
	await assertEmployeeInOrg(employeeId, organizationId)

	const contact = await db.emergencyContact.create({
		data: {
			employeeId,
			name: input.name,
			relationship: input.relationship,
			phone: input.phone
		}
	})

	await writeAuditLog(ctx, {
		action: 'CREATE',
		entityType: 'EmergencyContact',
		entityId: contact.id,
		newValue: { employeeId, name: input.name, relationship: input.relationship }
	})

	return contact
}

export async function deleteEmergencyContact(
	contactId: string,
	organizationId: string,
	ctx: AuditContext
) {
	const contact = await db.emergencyContact.findFirst({
		where: { id: contactId, employee: { organizationId } }
	})
	if (!contact) error(404, 'Emergency contact not found')

	await db.emergencyContact.delete({ where: { id: contactId } })

	await writeAuditLog(ctx, {
		action: 'DELETE',
		entityType: 'EmergencyContact',
		entityId: contactId,
		oldValue: { employeeId: contact.employeeId, name: contact.name }
	})
}
