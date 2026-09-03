import type { AuditAction, Prisma, Role } from '@prisma/client'

interface AuditContext {
	organizationId: string
	actorId: string
	actorRoles: Role[]
	ipAddress?: string
	userAgent?: string
}

interface AuditPayload {
	action: AuditAction
	entityType: string
	entityId: string
	oldValue?: Record<string, unknown>
	newValue?: Record<string, unknown>
}

// `client` is required. Pass the enclosing $transaction's `tx` so the audit row commits or
// rolls back atomically with the mutation it records. Passing the shared `db` is the
// deliberate exception, for the few sites auditing a read or a failure with no mutation.
export async function writeAuditLog(
	ctx: AuditContext,
	payload: AuditPayload,
	client: Prisma.TransactionClient
): Promise<void> {
	await client.auditLog.create({
		data: {
			organizationId: ctx.organizationId,
			actorId: ctx.actorId,
			actorRoles: ctx.actorRoles,
			action: payload.action,
			entityType: payload.entityType,
			entityId: payload.entityId,
			oldValue: payload.oldValue ? (payload.oldValue as object) : undefined,
			newValue: payload.newValue ? (payload.newValue as object) : undefined,
			ipAddress: ctx.ipAddress,
			userAgent: ctx.userAgent
		}
	})
}
