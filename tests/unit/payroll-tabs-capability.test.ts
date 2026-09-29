import { describe, it, expect } from 'vitest'
import type { Role } from '@prisma/client'
import { canAny } from '$lib/rbac'
import { activePayrollTab, payrollTabCapabilities, payrollTabs } from '$lib/payroll-tabs'

/**
 * The payroll sub-nav must never show a role a tab whose page will 403 it, and must never hide a
 * tab from a role that can open the page — the second is the same reach regression as the first,
 * seen from the other side.
 *
 * The five booleans come from `payrollTabCapabilities`, the SAME function
 * `payroll/+layout.server.ts` calls, applied to the real role table — so neither a `rbac.ts`
 * change nor a predicate that drifts off the route it mirrors can slip past this file.
 */
const capsFor = (...roles: Role[]) => payrollTabCapabilities(roles)

const labels = (...roles: Role[]) => payrollTabs(capsFor(...roles)).map((t) => t.label)

describe('payroll tab visibility per role', () => {
	it('shows all seven tabs to SUPER_ADMIN', () => {
		expect(labels('SUPER_ADMIN')).toEqual([
			'Runs',
			'Periods',
			'Config',
			'Statutory Rates',
			'Earnings & Deductions',
			'Salary Grades',
			'Calculator'
		])
	})

	it('shows all seven tabs to the CEO', () => {
		expect(labels('CEO')).toEqual([
			'Runs',
			'Periods',
			'Config',
			'Statutory Rates',
			'Earnings & Deductions',
			'Salary Grades',
			'Calculator'
		])
	})

	it('hides Config, Statutory Rates and the pay masters from a PAYROLL_OFFICER', () => {
		// Holds MANAGE_PAYROLL, but neither ADMINISTER_SYSTEM nor either statutory capability — and
		// not MANAGE_HR, which the two pay-master pages enforce on load. This role clears the payroll
		// layout's 403 and would 403 on /payroll/pay-codes, so the tabs must not offer them.
		expect(canAny(['PAYROLL_OFFICER'], 'MANAGE_HR')).toBe(false)
		expect(labels('PAYROLL_OFFICER')).toEqual(['Runs', 'Periods', 'Calculator'])
	})

	it('gives a MANAGER the pay masters it lost when the settings Payroll group was removed', () => {
		// The reachability half of that removal: MANAGER holds MANAGE_HR and MANAGE_PAYROLL, so both
		// pages stay reachable — from here now, instead of from the settings hub.
		expect(labels('MANAGER')).toEqual([
			'Runs',
			'Periods',
			'Earnings & Deductions',
			'Salary Grades',
			'Calculator'
		])
	})

	it('shows Statutory Rates to an HR_ADMIN who holds PROPOSE_STATUTORY_RATES only', () => {
		// The statutory page's own gate is MANAGE || PROPOSE. Filtering on MANAGE alone would hide
		// a page every HR Admin can legitimately open and file a rate proposal from.
		expect(canAny(['HR_ADMIN'], 'MANAGE_STATUTORY_RATES')).toBe(false)
		expect(canAny(['HR_ADMIN'], 'PROPOSE_STATUTORY_RATES')).toBe(true)
		expect(labels('HR_ADMIN')).toEqual([
			'Runs',
			'Periods',
			'Statutory Rates',
			'Earnings & Deductions',
			'Salary Grades',
			'Calculator'
		])
	})

	it('shows the Runs tab, and only that, to a sign-off-only VERIFIER', () => {
		// `payroll/+page.server.ts` 403s only when neither canManage nor canSignOff, so a Verifier
		// reaches the run list (#134). Every other payroll page is requirePayrollManage on load.
		expect(labels('VERIFIER')).toEqual(['Runs'])
	})

	it('shows an EMPLOYEE nothing — the layout 403s before any tab renders', () => {
		const caps = capsFor('EMPLOYEE')
		expect(caps.canManage || caps.canSignOff).toBe(false) // the layout's own 403 condition
		expect(labels('EMPLOYEE')).toEqual([])
	})

	it('unions the tabs of a multi-role user', () => {
		expect(labels('VERIFIER', 'HR_ADMIN')).toEqual([
			'Runs',
			'Periods',
			'Statutory Rates',
			'Earnings & Deductions',
			'Salary Grades',
			'Calculator'
		])
	})
})

describe('activePayrollTab', () => {
	const tabs = payrollTabs(capsFor('SUPER_ADMIN'))

	it('marks the deepest matching tab, not the /payroll prefix every tab shares', () => {
		expect(activePayrollTab(tabs, '/payroll/periods')).toBe('/payroll/periods')
		expect(activePayrollTab(tabs, '/payroll/statutory-rates')).toBe('/payroll/statutory-rates')
		expect(activePayrollTab(tabs, '/payroll/calculator')).toBe('/payroll/calculator')
		expect(activePayrollTab(tabs, '/payroll/pay-codes')).toBe('/payroll/pay-codes')
		expect(activePayrollTab(tabs, '/payroll/salary-grades')).toBe('/payroll/salary-grades')
	})

	it('marks Runs on the list and on a run detail page', () => {
		expect(activePayrollTab(tabs, '/payroll')).toBe('/payroll')
		expect(activePayrollTab(tabs, '/payroll/clx123')).toBe('/payroll')
	})

	it('marks nothing outside payroll', () => {
		expect(activePayrollTab(tabs, '/dashboard')).toBeNull()
	})
})
