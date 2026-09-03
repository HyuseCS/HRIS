import { Lucia } from 'lucia'
import { PrismaAdapter } from '@lucia-auth/adapter-prisma'
import { db } from './db'
import type { Role } from '@prisma/client'

const adapter = new PrismaAdapter(db.session, db.user)

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: process.env.NODE_ENV === 'production'
		}
	},
	getUserAttributes(attributes) {
		return {
			email: attributes.email,
			// The full multi-role set (#133) is the only identity the app reads (#282). The
			// migration script guarantees it is never empty before `User.role` is dropped.
			roles: attributes.roles,
			organizationId: attributes.organizationId,
			isActive: attributes.isActive
		}
	},
	getSessionAttributes(attributes) {
		return {
			currentOrgId: attributes.currentOrgId
		}
	}
})

declare module 'lucia' {
	interface Register {
		Lucia: typeof lucia
		DatabaseUserAttributes: {
			email: string
			roles: Role[]
			organizationId: string
			isActive: boolean
		}
		DatabaseSessionAttributes: {
			currentOrgId: string | null
		}
	}
}
