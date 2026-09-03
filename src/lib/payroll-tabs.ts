/**
 * The payroll sub-nav's tab list.
 *
 * Kept in a plain module rather than the layout component so it is unit-testable without
 * rendering — `vitest.config.ts` runs `environment: 'node'`, so nothing here can mount a
 * component. Mirrors the existing `Badge.svelte` + `badge.ts` split.
 *
 * Each tab is filtered on the capability its OWN destination enforces on load, read from
 * `payroll/+layout.server.ts`. A tab a role cannot open is hidden (never disabled-with-reason):
 * a visible tab that 403s advertises a page that is not yours.
 */

import type { Role } from '@prisma/client'
import { canAny } from '$lib/rbac'

export type PayrollTabCapabilities = {
	/** MANAGE_PAYROLL */
	canManage: boolean
	/** VERIFY_REQUESTS || APPROVE_FINANCE */
	canSignOff: boolean
	/** ADMINISTER_SYSTEM */
	canAdministerSystem: boolean
	/** MANAGE_STATUTORY_RATES || PROPOSE_STATUTORY_RATES */
	canSeeStatutoryRates: boolean
}

export type PayrollTab = { label: string; href: string }

/**
 * The four predicates, in ONE place. `payroll/+layout.server.ts` calls this and returns the result
 * to the layout; the unit gate calls the same function, so a predicate that drifts away from the
 * route it mirrors cannot pass the gate by drifting in both files at once.
 */
export function payrollTabCapabilities(roles: Role[]): PayrollTabCapabilities {
	return {
		canManage: canAny(roles, 'MANAGE_PAYROLL'),
		// Payroll sign-off is finance: Verifier verifies, CEO / Super Admin approve (#174).
		canSignOff: canAny(roles, 'VERIFY_REQUESTS') || canAny(roles, 'APPROVE_FINANCE'),
		// `payroll/config/+page.server.ts` — requireAnyCapability(ADMINISTER_SYSTEM)
		canAdministerSystem: canAny(roles, 'ADMINISTER_SYSTEM'),
		// `payroll/statutory-rates/+page.server.ts` — MANAGE_STATUTORY_RATES || PROPOSE_STATUTORY_RATES.
		// PROPOSE is HR Admin's; filtering on MANAGE alone would hide a page every HR Admin can open.
		canSeeStatutoryRates:
			canAny(roles, 'MANAGE_STATUTORY_RATES') || canAny(roles, 'PROPOSE_STATUTORY_RATES')
	}
}

export function payrollTabs(caps: PayrollTabCapabilities): PayrollTab[] {
	const tabs: PayrollTab[] = []
	// `payroll/+page.server.ts` gates the LOAD on `!canManage && !canSignOff`; its
	// `requirePayrollManage` calls guard the create/compute ACTIONS, not the load. A sign-off-only
	// Verifier opens the run list to find a COMPUTED run and sign it off (#134), and gets a
	// read-only view because `canManage` gates the controls inside the page.
	if (caps.canManage || caps.canSignOff) tabs.push({ label: 'Runs', href: '/payroll' })
	if (caps.canManage) tabs.push({ label: 'Periods', href: '/payroll/periods' })
	if (caps.canAdministerSystem) tabs.push({ label: 'Config', href: '/payroll/config' })
	if (caps.canSeeStatutoryRates)
		tabs.push({ label: 'Statutory Rates', href: '/payroll/statutory-rates' })
	if (caps.canManage) tabs.push({ label: 'Calculator', href: '/payroll/calculator' })
	return tabs
}

/**
 * Which tab owns the current path, by longest matching prefix — `/payroll` is a prefix of every
 * other tab, so a plain `startsWith` would light Runs on every payroll page. A run detail page
 * (`/payroll/{id}`) matches only `/payroll` and correctly lights Runs.
 */
export function activePayrollTab(tabs: PayrollTab[], pathname: string): string | null {
	const matches = tabs.filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
	if (!matches.length) return null
	return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a)).href
}
