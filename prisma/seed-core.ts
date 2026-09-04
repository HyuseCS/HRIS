import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { DEFAULT_STATUTORY_RATE_CONFIG } from '../src/lib/server/services/payroll/ph-statutory'

// Shared seed logic. `seedProd` is the minimal production baseline (orgs, org-level
// config, and the three admin accounts). `seedE2E` layers the demo roster the
// Playwright suite logs in as on top. Neither runs on import — the thin runners in
// seed.ts / seed-e2e.ts instantiate the client and invoke these.

// Cross-org memberships (#131): every user gets one membership mirroring their primary org.
// Idempotent; safe to re-run after adding more users (e.g. seedE2E calls it again once the
// demo roster exists). The `roles` half is gone — every writer now seeds `roles` directly (#282).
async function backfillMemberships(db: PrismaClient) {
	const allUsers = await db.user.findMany({
		select: { id: true, organizationId: true }
	})
	for (const u of allUsers) {
		await db.userOrganization.upsert({
			where: { userId_organizationId: { userId: u.id, organizationId: u.organizationId } },
			update: {},
			create: { userId: u.id, organizationId: u.organizationId }
		})
	}
}

// Next free employee number in an org, e.g. EMP-003 → EMP-004. Scans existing rows rather
// than hard-coding, so a profile added to an org that already carries hand-numbered demo
// rows (or older data where the numbering drifted) never trips the unique
// (organizationId, employeeNumber) constraint.
async function nextEmployeeNumber(db: PrismaClient, organizationId: string, prefix = 'EMP') {
	const rows = await db.employee.findMany({
		where: { organizationId },
		select: { employeeNumber: true }
	})
	// Ignore the reserved 900+ band (fixed numbers for exec/sign-off accounts) so those never
	// push the roster's next free number into a value another fixed account already claims.
	const max = rows.reduce((m, r) => {
		const n = parseInt(r.employeeNumber.replace(/\D/g, ''), 10)
		return Number.isNaN(n) || n >= 900 ? m : Math.max(m, n)
	}, 0)
	return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// Give a login account an Employee record if it has none. Several accounts historically had
// no profile — the CEO, the sign-off Verifier/Approver, and HR (whose seeded EMP-002 collided
// with the demo Manager on drifted data, so its create silently failed). Without a profile the
// Profile page has nothing to load and bounces to the dashboard (#profile). Keyed on userId so
// it is idempotent; `number` pins a fixed value for non-roster accounts (kept clear of the
// demo range), otherwise the next free number is used so a fresh DB still gets tidy sequencing.
async function ensureEmployeeProfile(
	db: PrismaClient,
	user: { id: string; organizationId: string },
	data: {
		firstName: string
		lastName: string
		jobTitle: string
		departmentId: string
		number?: string
		basicMonthlySalary?: number
	}
) {
	const existing = await db.employee.findUnique({
		where: { userId: user.id },
		select: { id: true }
	})
	if (existing) return existing
	return db.employee.create({
		data: {
			userId: user.id,
			organizationId: user.organizationId,
			employeeNumber: data.number ?? (await nextEmployeeNumber(db, user.organizationId)),
			firstName: data.firstName,
			lastName: data.lastName,
			departmentId: data.departmentId,
			jobTitle: data.jobTitle,
			employmentType: 'REGULAR',
			startDate: new Date('2025-01-01'),
			basicMonthlySalary: data.basicMonthlySalary ?? 30000,
			rateType: 'MONTHLY'
		}
	})
}

// Standard PH leave policy (#137): VL/SL/SIL at 5 days each. Every tenant gets the same
// set — without leave types an org has nothing to allocate, so its whole roster is locked
// out of filing leave (which is how JoJo and Sweetleaf shipped before this).
async function seedLeaveTypes(db: PrismaClient, organizationId: string) {
	// The base set is only written when the org has none, so re-seeding never overwrites
	// allocations HR has since tuned in Settings → Leave Types.
	const existing = await db.leaveType.count({ where: { organizationId } })
	if (existing === 0) {
		await db.leaveType.createMany({
			data: [
				{
					organizationId,
					name: 'Vacation Leave',
					isPaid: true,
					defaultDaysPerYear: 5,
					allowCarryOver: true,
					maxCarryOverDays: 5
				},
				{ organizationId, name: 'Sick Leave', isPaid: true, defaultDaysPerYear: 5 },
				{ organizationId, name: 'Emergency Leave', isPaid: true, defaultDaysPerYear: 3 },
				{ organizationId, name: 'Maternity Leave', isPaid: true, defaultDaysPerYear: 105 },
				{ organizationId, name: 'Paternity Leave', isPaid: true, defaultDaysPerYear: 7 }
			]
		})
	}

	// SIL is upserted outside that guard on purpose: orgs seeded before #137 already have
	// leave types, so the block above skips them entirely and they would never gain the
	// statutory entitlement. minMonthsOfService: 12 is the Labor Code 1-year rule, and is
	// what the filing gate in services/requests/leave.ts reads.
	await db.leaveType.upsert({
		where: { organizationId_name: { organizationId, name: 'Service Incentive Leave' } },
		update: { minMonthsOfService: 12 },
		create: {
			organizationId,
			name: 'Service Incentive Leave',
			isPaid: true,
			defaultDaysPerYear: 5,
			minMonthsOfService: 12
		}
	})
}

// Company departments per organization (#181). Idempotent via the (organizationId, name)
// unique key; a node's `children` are seeded as sub-departments beneath it through the
// self-referential hierarchy. Appending a department never disturbs existing employee
// assignments — an existing department just upserts to itself.
type DeptSeed = { name: string; children?: string[] }

async function ensureDepartments(db: PrismaClient, organizationId: string, tree: DeptSeed[]) {
	for (const node of tree) {
		const parent = await db.department.upsert({
			where: { organizationId_name: { organizationId, name: node.name } },
			update: {},
			create: { organizationId, name: node.name }
		})
		for (const child of node.children ?? []) {
			await db.department.upsert({
				where: { organizationId_name: { organizationId, name: child } },
				update: { parentDepartmentId: parent.id },
				create: { organizationId, name: child, parentDepartmentId: parent.id }
			})
		}
	}
}

// Allocate the current year's entitlement to everyone in the org who is missing it (#137).
// Mirrors ensureLeaveBalances() in services/leave.ts, which does the same at onboarding —
// a missing row is read as a zero balance, so an unallocated employee cannot file at all.
// Idempotent: existing rows are left untouched, so re-seeding never resets a used balance.
async function seedLeaveBalances(db: PrismaClient, organizationId: string) {
	const year = new Date().getFullYear()
	const [types, employees] = await Promise.all([
		db.leaveType.findMany({
			where: { organizationId, isActive: true },
			select: { id: true, defaultDaysPerYear: true }
		}),
		db.employee.findMany({
			where: { organizationId },
			select: { id: true, leaveBalances: { where: { year }, select: { leaveTypeId: true } } }
		})
	])

	const rows = employees.flatMap((e) => {
		const have = new Set(e.leaveBalances.map((b) => b.leaveTypeId))
		return types
			.filter((lt) => !have.has(lt.id))
			.map((lt) => ({
				employeeId: e.id,
				leaveTypeId: lt.id,
				year,
				allocated: lt.defaultDaysPerYear,
				used: 0,
				remaining: lt.defaultDaysPerYear
			}))
	})
	if (rows.length) await db.leaveBalance.createMany({ data: rows, skipDuplicates: true })
}

// Food-service tenant (#140): an "Operations" department, a "Head of Operations" Manager
// (that tenant's HR), sign-off accounts, a few crew reporting to the Manager, and the
// tenant's physical stores. Used by the cross-org tenancy E2E — "Head of Operations" exists
// in JoJo Potato / Sweetleaf but not Veent, which cleanly proves an org switch.
//
// NOTE: "branch" here means a STORE (the Branch model), never the tenant — this function was
// called seedBranchOrg when the word still meant the tenant itself.
async function seedFoodServiceOrg(
	db: PrismaClient,
	tenant: { id: string; slug: string; empPrefix: string },
	crew: { first: string; last: string; title: string }[],
	// The tenant's physical stores. Fixed ids keep the upsert idempotent.
	stores: { id: string; name: string; address: string; status?: 'OPEN' | 'CLOSED' }[]
) {
	const branchDept = await db.department.upsert({
		where: { organizationId_name: { organizationId: tenant.id, name: 'Operations' } },
		update: {},
		create: { organizationId: tenant.id, name: 'Operations' }
	})
	const mgrHash = await bcrypt.hash('Manager@1234', 12)
	const mgrUser = await db.user.upsert({
		where: { email: `manager@${tenant.slug}.ph` },
		update: { roles: ['MANAGER'] },
		create: {
			organizationId: tenant.id,
			email: `manager@${tenant.slug}.ph`,
			passwordHash: mgrHash,
			roles: ['MANAGER']
		}
	})
	const mgrEmployee = await db.employee.upsert({
		where: { userId: mgrUser.id },
		update: {},
		create: {
			userId: mgrUser.id,
			organizationId: tenant.id,
			employeeNumber: `${tenant.empPrefix}-001`,
			firstName: 'Head',
			lastName: 'of Operations',
			departmentId: branchDept.id,
			jobTitle: 'Head of Operations',
			employmentType: 'REGULAR',
			startDate: new Date('2025-01-15'),
			basicMonthlySalary: 40000,
			rateType: 'MONTHLY'
		}
	})

	// Branch sign-off accounts (#134) so the maker → verifier → approver chain works within
	// this org, not just Veent. Each also gets a profile (fixed high number, clear of the crew
	// roster) so its Profile page resolves instead of bouncing to the dashboard (#profile).
	for (const [role, pw, first, last, num] of [
		['VERIFIER', 'Verifier@1234', 'Vera', 'Verifier', '901'],
		['APPROVER', 'Approver@1234', 'Arno', 'Approver', '902']
	] as const) {
		const email = `${role.toLowerCase()}@${tenant.slug}.ph`
		const h = await bcrypt.hash(pw, 12)
		const signoffUser = await db.user.upsert({
			where: { email },
			update: { roles: [role] },
			create: { organizationId: tenant.id, email, passwordHash: h, roles: [role] }
		})
		await ensureEmployeeProfile(db, signoffUser, {
			firstName: first,
			lastName: last,
			jobTitle: `Sign-off ${role === 'VERIFIER' ? 'Verifier' : 'Approver'}`,
			departmentId: branchDept.id,
			number: `${tenant.empPrefix}-${num}`
		})
	}

	let n = 2
	for (const c of crew) {
		const email = `${c.first.toLowerCase()}@${tenant.slug}.ph`
		const uHash = await bcrypt.hash('Employee@1234', 12)
		const u = await db.user.upsert({
			where: { email },
			update: {},
			create: { organizationId: tenant.id, email, passwordHash: uHash, roles: ['EMPLOYEE'] }
		})
		await db.employee.upsert({
			where: { userId: u.id },
			update: { reportsToId: mgrEmployee.id },
			create: {
				userId: u.id,
				organizationId: tenant.id,
				employeeNumber: `${tenant.empPrefix}-00${n}`,
				firstName: c.first,
				lastName: c.last,
				departmentId: branchDept.id,
				jobTitle: c.title,
				employmentType: 'REGULAR',
				startDate: new Date('2025-03-01'),
				basicMonthlySalary: 18000,
				rateType: 'MONTHLY',
				reportsToId: mgrEmployee.id
			}
		})
		n++
	}

	// Branches: the tenant's physical stores. The Head of Operations manages the first one
	// (and is assigned to it); the crew are spread across the OPEN stores round-robin, with
	// the last one deliberately left unassigned so the "unassigned" count has something to show.
	const created: { id: string; status: string }[] = []
	for (const st of stores) {
		const row = await db.branch.upsert({
			where: { id: st.id },
			update: {},
			create: {
				id: st.id,
				organizationId: tenant.id,
				name: st.name,
				address: st.address,
				status: st.status ?? 'OPEN'
			}
		})
		created.push({ id: row.id, status: row.status })
	}

	const open = created.filter((b) => b.status === 'OPEN')
	if (open.length) {
		await db.branch.update({ where: { id: open[0].id }, data: { managerId: mgrEmployee.id } })
		await db.employee.update({ where: { id: mgrEmployee.id }, data: { branchId: open[0].id } })

		const roster = await db.employee.findMany({
			where: { organizationId: tenant.id, reportsToId: mgrEmployee.id },
			select: { id: true },
			orderBy: { employeeNumber: 'asc' }
		})
		// Leave the last crew member unassigned.
		for (let i = 0; i < roster.length - 1; i++) {
			await db.employee.update({
				where: { id: roster[i].id },
				data: { branchId: open[i % open.length].id }
			})
		}
	}

	// After the roster exists, so the whole crew gets this year's entitlement.
	await seedLeaveBalances(db, tenant.id)
}

/**
 * Minimal production seed: the three tenants, org-level configuration, and the three
 * administrative accounts (CEO, Super Admin, HR Admin). No demo employees, timesheets,
 * leave balances, or time-log punches. Returns refs the E2E layer builds on.
 */
export async function seedProd(db: PrismaClient) {
	const org = await db.organization.upsert({
		where: { id: 'org_seed' },
		// Per-org branding (#135/#139): logo + brand colour. Veent keeps the red palette.
		update: { name: 'Veent', logoUrl: '/veent-logo.png', themePrimary: '0 79% 45%' },
		create: {
			id: 'org_seed',
			name: 'Veent',
			logoUrl: '/veent-logo.png',
			themePrimary: '0 79% 45%',
			address: 'Makati City, Metro Manila, Philippines'
		}
	})

	// Three-org rollout (#131). The primary tenant above keeps id `org_seed` for
	// backwards-compat; JoJo Potato and Sweetleaf are the two additional food-service tenants.
	await db.organization.upsert({
		where: { id: 'org_jojo' },
		// employeeNumberPrefix is in `update` too, so a re-seed corrects an existing database
		// that took the 'EMP' column default when the column was added.
		update: {
			name: 'JoJo Potato',
			logoUrl: '/jojo-logo.png',
			themePrimary: '32 95% 44%', // amber
			address: 'Quezon City, Metro Manila, Philippines',
			employeeNumberPrefix: 'JJ'
		},
		create: {
			id: 'org_jojo',
			name: 'JoJo Potato',
			logoUrl: '/jojo-logo.png',
			themePrimary: '32 95% 44%',
			address: 'Quezon City, Metro Manila, Philippines',
			employeeNumberPrefix: 'JJ'
		}
	})
	await db.organization.upsert({
		where: { id: 'org_sweetleaf' },
		update: {
			name: 'Sweetleaf',
			logoUrl: '/sweetleaf-logo.png',
			themePrimary: '142 71% 42%', // green
			address: 'Pasig City, Metro Manila, Philippines',
			employeeNumberPrefix: 'SL'
		},
		create: {
			id: 'org_sweetleaf',
			name: 'Sweetleaf',
			logoUrl: '/sweetleaf-logo.png',
			themePrimary: '142 71% 42%',
			address: 'Pasig City, Metro Manila, Philippines',
			employeeNumberPrefix: 'SL'
		}
	})

	// Company departments per organization (#181). Veent runs on HR, sales and engineering;
	// the food-service tenants group their back office under Admin (Finance, Accounting,
	// Marketing). The demo Operations department (seedFoodServiceOrg) is left untouched.
	await ensureDepartments(db, 'org_seed', [
		{ name: 'Human Resources' },
		{ name: 'Sales & Business Development' },
		{ name: 'Software Developers' }
	])
	for (const foodOrgId of ['org_jojo', 'org_sweetleaf']) {
		await ensureDepartments(db, foodOrgId, [
			{ name: 'Admin', children: ['Finance', 'Accounting', 'Marketing'] }
		])
	}

	// Human Resources (seeded just above) is the home department for Veent's admin accounts.
	const dept = await db.department.upsert({
		where: { organizationId_name: { organizationId: org.id, name: 'Human Resources' } },
		update: {},
		create: { organizationId: org.id, name: 'Human Resources' }
	})

	// Default work schedule: Mon–Fri 8:00 AM – 5:00 PM PHT with a 1-hour unpaid lunch (8 paid
	// hours). Onboarding assigns this so a new hire has an explicit schedule that attendance
	// derivation reads (480 = 08:00, 1020 = 17:00, in PHT minutes-from-midnight).
	const defaultSchedule = await db.workSchedule.upsert({
		where: { id: 'ws_default_seed' },
		update: { name: 'Default (8 AM – 5 PM)', isDefault: true },
		create: {
			id: 'ws_default_seed',
			organizationId: org.id,
			name: 'Default (8 AM – 5 PM)',
			isDefault: true
		}
	})
	for (const weekday of [1, 2, 3, 4, 5]) {
		await db.workScheduleDay.upsert({
			where: { scheduleId_weekday: { scheduleId: defaultSchedule.id, weekday } },
			update: { startMinutes: 480, endMinutes: 1020, breakMinutes: 60 },
			create: {
				scheduleId: defaultSchedule.id,
				weekday,
				startMinutes: 480,
				endMinutes: 1020,
				breakMinutes: 60
			}
		})
	}

	// --- Super Admin (HR system administrator) ---
	const adminHash = await bcrypt.hash('Admin@1234', 12)
	const superAdmin = await db.user.upsert({
		where: { email: 'admin@veent.ph' },
		update: {},
		create: {
			organizationId: org.id,
			email: 'admin@veent.ph',
			passwordHash: adminHash,
			roles: ['SUPER_ADMIN']
		}
	})
	await db.employee.upsert({
		where: { userId: superAdmin.id },
		update: {},
		create: {
			userId: superAdmin.id,
			organizationId: org.id,
			employeeNumber: 'EMP-001',
			firstName: 'System',
			lastName: 'Admin',
			departmentId: dept.id,
			jobTitle: 'HR System Administrator',
			employmentType: 'REGULAR',
			startDate: new Date('2025-01-01'),
			basicMonthlySalary: 50000,
			rateType: 'MONTHLY'
		}
	})

	// CEO (#132): the exclusive role-changer, member of all three tenants. Its authority is
	// cross-org via memberships; it also gets an Employee profile below (#6).
	const ceoHash = await bcrypt.hash('Ceo@1234', 12)
	const ceo = await db.user.upsert({
		where: { email: 'ceo@veent.ph' },
		update: { roles: ['CEO'] },
		create: {
			organizationId: org.id,
			email: 'ceo@veent.ph',
			passwordHash: ceoHash,
			roles: ['CEO']
		}
	})
	for (const orgId of ['org_seed', 'org_jojo', 'org_sweetleaf']) {
		await db.userOrganization.upsert({
			where: { userId_organizationId: { userId: ceo.id, organizationId: orgId } },
			update: {},
			create: { userId: ceo.id, organizationId: orgId }
		})
	}
	// The CEO gets a profile in its home org so the Profile page resolves (the page scopes the
	// lookup to the active org, so it cleanly guards back to the dashboard in the other tenants).
	// A fixed high number keeps it clear of the demo roster's EMP-001..004.
	await ensureEmployeeProfile(db, ceo, {
		firstName: 'Cielo',
		lastName: 'Executive',
		jobTitle: 'Chief Executive Officer',
		departmentId: dept.id,
		number: 'EMP-900',
		basicMonthlySalary: 150000
	})

	// --- System actor (#136) ---
	// AuditLog.actorId is a non-nullable FK to User, so an
	// automated job (the nightly regularization sweep) cannot write its audit row without a
	// real user. This is that user — and it must never be able to log in:
	//   • the password hash is of a random secret nobody holds, so bcrypt can never match, and
	//   • isActive: false, which hooks.server.ts turns into an account_disabled redirect.
	// HR_ADMIN (not SUPER_ADMIN) because regularization is an HR act and a service account
	// should carry the least privilege that reads correctly in the audit trail.
	const systemHash = await bcrypt.hash(`system-no-login-${crypto.randomUUID()}`, 12)
	await db.user.upsert({
		where: { email: 'system@veent.ph' },
		update: { roles: ['HR_ADMIN'], isActive: false },
		create: {
			organizationId: org.id,
			email: 'system@veent.ph',
			passwordHash: systemHash,
			roles: ['HR_ADMIN'],
			isActive: false
		}
	})

	// --- HR Admin (HR-level access) ---
	const hrHash = await bcrypt.hash('Hr@1234', 12)
	const hrUser = await db.user.upsert({
		where: { email: 'hr@veent.ph' },
		update: { roles: ['HR_ADMIN'] },
		create: {
			organizationId: org.id,
			email: 'hr@veent.ph',
			passwordHash: hrHash,
			roles: ['HR_ADMIN']
		}
	})
	// Next free number, not a hard-coded EMP-002: on drifted data the demo Manager already
	// holds EMP-002, and the old fixed create collided and left HR with no profile at all.
	await ensureEmployeeProfile(db, hrUser, {
		firstName: 'Hannah',
		lastName: 'HR',
		jobTitle: 'HR Administrator',
		departmentId: dept.id,
		basicMonthlySalary: 45000
	})

	// Leave types are org-level configuration, so every tenant gets the standard PH set —
	// not just Veent (#137). An org with no leave types has nothing to allocate, so its
	// entire roster is locked out of filing leave.
	for (const orgId of ['org_seed', 'org_jojo', 'org_sweetleaf']) {
		await seedLeaveTypes(db, orgId)
	}

	await db.payrollConfig.upsert({
		where: { organizationId: org.id },
		update: {},
		create: {
			organizationId: org.id,
			payFrequency: 'SEMI_MONTHLY',
			firstCutoff: 15,
			secondCutoff: 30,
			sssTable: {},
			birTaxTable: {}
		}
	})

	// #220: StatutoryRateConfig is the authoritative source of statutory figures. Seed each org's
	// row to the current PH legal values (the same constants the engine falls back to when a row is
	// missing), so a fresh install starts on today's numbers and HR/CEO edit from a real baseline.
	for (const orgId of ['org_seed', 'org_jojo', 'org_sweetleaf']) {
		await db.statutoryRateConfig.upsert({
			where: { organizationId: orgId },
			update: {},
			create: { organizationId: orgId, ...DEFAULT_STATUTORY_RATE_CONFIG }
		})
	}

	// --- Payroll expansion config: earning/deduction codes + premium rate rule (DOLE defaults) ---
	const earningTypes = [
		{ code: 'BASIC', label: 'Basic pay', taxable: true, multiplier: 1.0 },
		{ code: 'OT', label: 'Overtime', taxable: true, multiplier: 1.25 },
		{ code: 'NIGHT_DIFF', label: 'Night differential', taxable: true, multiplier: 0.1 },
		{ code: 'REST_DAY', label: 'Rest day', taxable: true, multiplier: 1.3 },
		{ code: 'REG_HOLIDAY', label: 'Regular holiday', taxable: true, multiplier: 2.0 },
		{ code: 'SPECIAL_HOLIDAY', label: 'Special holiday', taxable: true, multiplier: 1.3 },
		{ code: 'ALLOWANCE', label: 'Allowances', taxable: false, multiplier: null },
		{ code: 'INCENTIVE', label: 'Incentives', taxable: true, multiplier: null }
	]
	for (const et of earningTypes) {
		await db.earningType.upsert({
			where: { organizationId_code: { organizationId: org.id, code: et.code } },
			update: {},
			create: { organizationId: org.id, ...et }
		})
	}

	const deductionTypes = [
		{ code: 'SSS_EE', label: 'SSS', isStatutory: true },
		{ code: 'PHILHEALTH_EE', label: 'PhilHealth', isStatutory: true },
		{ code: 'PAGIBIG_EE', label: 'Pag-IBIG', isStatutory: true },
		{ code: 'TAX', label: 'Withholding tax', isStatutory: true },
		{ code: 'TARDINESS', label: 'Tardiness/undertime', isStatutory: false },
		{ code: 'LOAN', label: 'Loan', isStatutory: false },
		{ code: 'CASH_ADVANCE', label: 'Cash advance', isStatutory: false }
	]
	for (const dt of deductionTypes) {
		await db.deductionType.upsert({
			where: { organizationId_code: { organizationId: org.id, code: dt.code } },
			update: {},
			create: { organizationId: org.id, ...dt }
		})
	}

	await db.payRateRule.upsert({
		where: { organizationId: org.id },
		update: {},
		create: { organizationId: org.id } // schema defaults = DOLE rates
	})

	// --- Benefit plan (one sample; fixed id keeps upsert idempotent) ---
	await db.benefitPlan.upsert({
		where: { id: 'benefit_seed_hmo' },
		update: {},
		create: {
			id: 'benefit_seed_hmo',
			organizationId: org.id,
			name: 'Maxicare HMO — Basic',
			type: 'HMO',
			provider: 'Maxicare',
			description: 'Standard HMO coverage for regular employees.',
			employeeCost: 0,
			employerCost: 1500
		}
	})

	// --- Review cycle (one sample; fixed id keeps upsert idempotent) ---
	const year = new Date().getFullYear()
	await db.reviewCycle.upsert({
		where: { id: 'review_cycle_seed' },
		update: {},
		create: {
			id: 'review_cycle_seed',
			organizationId: org.id,
			name: `H1 ${year} Performance Review`,
			startDate: new Date(`${year}-01-01`),
			endDate: new Date(`${year}-06-30`),
			status: 'ACTIVE'
		}
	})

	// --- Positions catalog (unique on organizationId+title, so upsert is idempotent) ---
	const positions = [
		{ title: 'HR System Administrator', level: 5 },
		{ title: 'HR Administrator', level: 4 }
	]
	for (const p of positions) {
		await db.position.upsert({
			where: { organizationId_title: { organizationId: org.id, title: p.title } },
			update: {},
			create: { organizationId: org.id, departmentId: dept.id, ...p }
		})
	}

	await backfillMemberships(db)

	// Last, so it covers every employee this seed created. Also backfills orgs that predate
	// #137: onboarding allocates balances now, but employees hired before it have none, and
	// a missing row is read as a zero balance that blocks them from filing at all.
	await seedLeaveBalances(db, org.id)

	return { org, dept }
}

/**
 * E2E / local-dev seed: the production baseline plus the demo roster the Playwright suite
 * logs in as (manager, employee, verifier, approver), the employee's reporting line, and
 * current-year leave balances. Still no timesheets or time-log punches — global-setup
 * pins the employee's discordId and manages punches/timesheets per run.
 */
export async function seedE2E(db: PrismaClient) {
	const { org, dept } = await seedProd(db)

	// Verifier + Approver (#134): pure sign-off accounts for the maker→verifier→approver
	// chain. No Employee record — they only check and approve, never file requests.
	const verifierHash = await bcrypt.hash('Verifier@1234', 12)
	const verifierUser = await db.user.upsert({
		where: { email: 'verifier@veent.ph' },
		update: { roles: ['VERIFIER'] },
		create: {
			organizationId: org.id,
			email: 'verifier@veent.ph',
			passwordHash: verifierHash,
			roles: ['VERIFIER']
		}
	})
	const approverHash = await bcrypt.hash('Approver@1234', 12)
	const approverUser = await db.user.upsert({
		where: { email: 'approver@veent.ph' },
		update: { roles: ['APPROVER'] },
		create: {
			organizationId: org.id,
			email: 'approver@veent.ph',
			passwordHash: approverHash,
			roles: ['APPROVER']
		}
	})
	// Profiles so the sign-off accounts can open their own Profile page (#profile). Fixed high
	// numbers keep them clear of the demo roster (EMP-001..004).
	await ensureEmployeeProfile(db, verifierUser, {
		firstName: 'Vince',
		lastName: 'Verifier',
		jobTitle: 'Sign-off Verifier',
		departmentId: dept.id,
		number: 'EMP-901'
	})
	await ensureEmployeeProfile(db, approverUser, {
		firstName: 'Apple',
		lastName: 'Approver',
		jobTitle: 'Sign-off Approver',
		departmentId: dept.id,
		number: 'EMP-902'
	})

	// #283: the one two-hat account in the whole seed — every other row stays single-role.
	// The separation-of-duties E2E needs a user who holds BOTH sign-off roles, and creating
	// one through the UI as a precondition would make the SoD spec depend on the role-picker
	// spec passing first. E2E-only on purpose: this is a deliberately over-privileged account.
	const twoHatHash = await bcrypt.hash('TwoHat@1234', 12)
	const twoHatUser = await db.user.upsert({
		where: { email: 'verifier.approver@veent.ph' },
		update: { roles: ['VERIFIER', 'APPROVER'] },
		create: {
			organizationId: org.id,
			email: 'verifier.approver@veent.ph',
			passwordHash: twoHatHash,
			roles: ['VERIFIER', 'APPROVER']
		}
	})
	await ensureEmployeeProfile(db, twoHatUser, {
		firstName: 'Tina',
		lastName: 'Twohat',
		jobTitle: 'Sign-off Verifier & Approver',
		departmentId: dept.id,
		number: 'EMP-903'
	})

	// --- Manager (direct supervisor; approves the employee's timesheets in the E2E suite) ---
	const managerHash = await bcrypt.hash('Manager@1234', 12)
	const managerUser = await db.user.upsert({
		where: { email: 'manager@veent.ph' },
		update: {},
		create: {
			organizationId: org.id,
			email: 'manager@veent.ph',
			passwordHash: managerHash,
			roles: ['MANAGER']
		}
	})
	const managerEmployee = await db.employee.upsert({
		where: { userId: managerUser.id },
		update: {},
		create: {
			userId: managerUser.id,
			organizationId: org.id,
			employeeNumber: 'EMP-003',
			firstName: 'Maria',
			lastName: 'Manager',
			departmentId: dept.id,
			jobTitle: 'People Operations Manager',
			employmentType: 'REGULAR',
			startDate: new Date('2025-01-15'),
			basicMonthlySalary: 45000,
			rateType: 'MONTHLY'
		}
	})

	// --- Regular employee reporting to the manager. Required by the E2E suite:
	// global-setup pins a known discordId and resets this employee's punches/leave. ---
	const employeeHash = await bcrypt.hash('Employee@1234', 12)
	const employeeUser = await db.user.upsert({
		where: { email: 'employee@veent.ph' },
		update: {},
		create: {
			organizationId: org.id,
			email: 'employee@veent.ph',
			passwordHash: employeeHash,
			roles: ['EMPLOYEE']
		}
	})
	await db.employee.upsert({
		where: { userId: employeeUser.id },
		update: { reportsToId: managerEmployee.id, discordId: '123456789012345678' },
		create: {
			userId: employeeUser.id,
			organizationId: org.id,
			employeeNumber: 'EMP-004',
			firstName: 'Elena',
			lastName: 'Employee',
			departmentId: dept.id,
			jobTitle: 'Software Engineer',
			employmentType: 'REGULAR',
			startDate: new Date('2025-02-01'),
			basicMonthlySalary: 30000,
			rateType: 'MONTHLY',
			reportsToId: managerEmployee.id,
			discordId: '123456789012345678'
		}
	})

	// Payroll Officer + Finance: the two back-office accounts the dev login switcher offers.
	// Same shape as the sign-off pair above — single role, roles re-asserted on update so a
	// drifted row is corrected, and an employee profile so their Profile page resolves.
	//
	// Seeded AFTER the roster accounts on purpose. No fixed employee number, and the block must
	// stay below manager (EMP-003) and employee (EMP-004), which hardcode theirs: on a fresh DB
	// only EMP-001/002 exist earlier, so auto-assigning here would take 003/004 and the later
	// upserts would die on the unique index. CI caught exactly that; a populated dev DB hides it.
	//
	// The 900 band is NOT reserved either: the app's `nextEmployeeNumber` issues
	// highest+1, so once EMP-903 exists every employee the app or the E2E suite creates
	// continues from 904. A hardcoded number here collides with that residue on the
	// (organizationId, employeeNumber) unique index — on 04-09-26 EMP-904 and EMP-905 were both
	// held by e2e fixtures. Omitting `number` lets ensureEmployeeProfile take the next free one.
	const payrollHash = await bcrypt.hash('Payroll@1234', 12)
	const payrollUser = await db.user.upsert({
		where: { email: 'payroll@veent.ph' },
		update: { roles: ['PAYROLL_OFFICER'] },
		create: {
			organizationId: org.id,
			email: 'payroll@veent.ph',
			passwordHash: payrollHash,
			roles: ['PAYROLL_OFFICER']
		}
	})
	await ensureEmployeeProfile(db, payrollUser, {
		firstName: 'Paolo',
		lastName: 'Payroll',
		jobTitle: 'Payroll Officer',
		departmentId: dept.id
	})
	const financeHash = await bcrypt.hash('Finance@1234', 12)
	const financeUser = await db.user.upsert({
		where: { email: 'finance@veent.ph' },
		update: { roles: ['FINANCE'] },
		create: {
			organizationId: org.id,
			email: 'finance@veent.ph',
			passwordHash: financeHash,
			roles: ['FINANCE']
		}
	})
	await ensureEmployeeProfile(db, financeUser, {
		firstName: 'Fiona',
		lastName: 'Finance',
		jobTitle: 'Finance Officer',
		departmentId: dept.id
	})

	// --- Leave balances (current year) so leave-filing E2E validates. Org-wide rather than
	// just Elena (#137): HR and the Manager file leave in the request specs too, and a
	// missing balance row reads as zero, which would block them. ---
	await seedLeaveBalances(db, org.id)

	// Onboarding checklist (#116): the derived defaults + one manual example for Veent so
	// the Settings editor and the 201-file manual toggles are populated. Keys must match
	// DERIVED_STEPS in src/lib/server/services/onboarding.ts.
	const existingOnboarding = await db.onboardingChecklistItem.count({
		where: { organizationId: org.id }
	})
	if (existingOnboarding === 0) {
		const derivedSteps = [
			{
				derivedKey: 'account',
				label: 'Company account created',
				hint: 'A login is generated with the employee record.'
			},
			{
				derivedKey: 'position',
				label: 'Position assigned',
				hint: 'Set “Position” in Update Profile.'
			},
			{
				derivedKey: 'schedule',
				label: 'Work schedule assigned',
				hint: 'Set “Work Schedule” — this starts attendance tracking.'
			},
			{ derivedKey: 'salary', label: 'Compensation set', hint: 'Set “Basic Monthly Salary”.' },
			{
				derivedKey: 'disbursement',
				label: 'Payroll disbursement registered',
				hint: 'Add bank or GCash details under Disbursement.'
			},
			{
				derivedKey: 'govids',
				label: 'Government IDs on file',
				hint: 'SSS, PhilHealth, Pag-IBIG, and TIN.'
			},
			{
				derivedKey: 'contract',
				label: 'Signed contract uploaded',
				hint: 'Upload a “Contract” document.'
			}
		]
		await db.onboardingChecklistItem.createMany({
			data: [
				...derivedSteps.map((d, i) => ({
					organizationId: org.id,
					kind: 'DERIVED' as const,
					derivedKey: d.derivedKey,
					label: d.label,
					hint: d.hint,
					order: i
				})),
				{
					organizationId: org.id,
					kind: 'MANUAL' as const,
					label: 'Orientation completed',
					hint: 'New-hire orientation attended.',
					order: derivedSteps.length
				}
			]
		})
	}

	// Job boards (#117): common PH boards for the recruitment publish-tracking checklist.
	await db.jobBoard.createMany({
		data: ['JobStreet', 'Indeed', 'LinkedIn', 'Facebook', 'Company Website', 'Referral'].map(
			(name) => ({ organizationId: org.id, name })
		),
		skipDuplicates: true
	})

	// A demo open posting so the recruitment board-tracking checklist has something to act on.
	await db.jobPosting.upsert({
		where: { id: 'jp_seed_demo' },
		update: {},
		create: {
			id: 'jp_seed_demo',
			organizationId: org.id,
			departmentId: dept.id,
			title: 'Software Engineer',
			description: 'Seed posting for the recruitment demo.',
			status: 'OPEN',
			postedAt: new Date('2026-06-01'),
			createdById: managerUser.id
		}
	})

	// Inventory (#114): a few demo assets so the registry isn't empty. Idempotent by id.
	await db.inventoryItem.upsert({
		where: { id: 'inv_seed_1' },
		update: {},
		create: {
			id: 'inv_seed_1',
			organizationId: org.id,
			name: 'MacBook Pro 14"',
			category: 'Laptop',
			quantity: 1,
			unit: 'pc',
			location: 'Main office',
			status: 'IN_STOCK',
			serialNumber: 'C02-DEMO-001',
			value: 120000
		}
	})
	await db.inventoryItem.upsert({
		where: { id: 'inv_seed_2' },
		update: {},
		create: {
			id: 'inv_seed_2',
			organizationId: org.id,
			name: 'Office Chair',
			category: 'Furniture',
			quantity: 12,
			unit: 'pcs',
			location: 'Main office',
			status: 'IN_STOCK',
			value: 4500
		}
	})
	await db.inventoryItem.upsert({
		where: { id: 'inv_seed_3' },
		update: {},
		create: {
			id: 'inv_seed_3',
			organizationId: org.id,
			name: 'Projector (old)',
			category: 'AV Equipment',
			quantity: 1,
			unit: 'pc',
			location: 'Storage',
			status: 'RETIRED'
		}
	})

	// Food-service tenants (#140): JoJo Potato and Sweetleaf each get a "Head of Operations"
	// Manager + crew, and their physical stores. The cross-org tenancy E2E switches the CEO
	// into JoJo and asserts this roster; the Branches E2E asserts these stores.
	await seedFoodServiceOrg(
		db,
		{ id: 'org_jojo', slug: 'jojo', empPrefix: 'JJ' },
		[
			{ first: 'Benjie', last: 'Fryer', title: 'Fry Cook' },
			{ first: 'Carla', last: 'Server', title: 'Service Crew' },
			{ first: 'Dino', last: 'Cashier', title: 'Cashier' }
		],
		[
			{
				id: 'br_jojo_smdowntown',
				name: 'SM CDO Downtown Premier',
				address: 'Ground Floor, SM CDO Downtown Premier, Claro M. Recto Ave., Cagayan de Oro'
			},
			{
				id: 'br_jojo_centrio',
				name: 'Centrio Ayala Mall',
				address: '2F Centrio Ayala Mall, Corrales cor. CM Recto Ave., Cagayan de Oro'
			},
			{
				id: 'br_jojo_limketkai',
				name: 'Limketkai Center',
				address: 'Limketkai Center, Lapasan, Cagayan de Oro',
				status: 'CLOSED'
			}
		]
	)
	await seedFoodServiceOrg(
		db,
		{ id: 'org_sweetleaf', slug: 'sweetleaf', empPrefix: 'SL' },
		[
			{ first: 'Ella', last: 'Barista', title: 'Barista' },
			{ first: 'Fritz', last: 'Baker', title: 'Baker' }
		],
		[
			{
				id: 'br_sl_smuptown',
				name: 'SM CDO Uptown',
				address:
					'Upper Ground Floor, SM City CDO Uptown, Masterson Ave., Upper Balulang, Cagayan de Oro'
			},
			{
				id: 'br_sl_gaisano',
				name: 'Gaisano Mall of CDO',
				address: 'Gaisano City Mall, Corrales Ave. cor. Yacapin St., Cagayan de Oro'
			},
			{
				id: 'br_sl_ororama',
				name: 'Ororama Megacenter',
				address: 'Ororama Megacenter, Cogon, Cagayan de Oro',
				status: 'CLOSED'
			}
		]
	)

	// Cover the demo roster just added (seedProd already ran this for the admin accounts).
	await backfillMemberships(db)
}
