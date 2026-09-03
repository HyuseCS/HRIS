import type { Role } from '@prisma/client'

export interface AuditContext {
	organizationId: string
	actorId: string
	// Every role the actor holds (#133/#134). Required, so a route that forgets to pass the
	// full set is a compile error rather than a silent narrowing (#247, #272, #275).
	actorRoles: Role[]
	ipAddress?: string
	userAgent?: string
}
