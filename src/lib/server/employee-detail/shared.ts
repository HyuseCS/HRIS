export function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		// #247: `proposeIfRequired` decides whether a pay change is written directly or filed for
		// confirmation from the FULL role set — the primary role alone scoped a [MANAGER, HR_ADMIN]
		// user down to MANAGER and routed a change they may make straight through the queue.
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}
