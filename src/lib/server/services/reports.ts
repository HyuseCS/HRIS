import { db } from '$lib/server/db'

// ─── Legacy helpers (kept for existing reports page) ─────────────────────────

export async function getHeadcountByDepartment(organizationId: string) {
	return db.department.findMany({
		where: { organizationId },
		include: {
			_count: {
				select: {
					employees: {
						where: { employmentStatus: 'ACTIVE' }
					}
				}
			}
		},
		orderBy: { name: 'asc' }
	})
}

export async function getLeaveUtilizationReport(organizationId: string, year: number) {
	return db.leaveBalance.findMany({
		where: {
			year,
			employee: { organizationId, employmentStatus: 'ACTIVE' }
		},
		include: {
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } },
			leaveType: { select: { name: true } }
		},
		orderBy: [{ employee: { lastName: 'asc' } }, { leaveType: { name: 'asc' } }]
	})
}

export async function getPayrollSummaryReport(organizationId: string, year: number) {
	return db.payrollRun.findMany({
		where: {
			organizationId,
			status: 'APPROVED',
			periodStart: { gte: new Date(`${year}-01-01`) },
			periodEnd: { lte: new Date(`${year}-12-31`) }
		},
		select: {
			id: true,
			periodStart: true,
			periodEnd: true,
			totalGross: true,
			totalDeductions: true,
			totalNet: true,
			hasOverride: true
		},
		orderBy: { periodStart: 'asc' }
	})
}

export async function getAttritionReport(organizationId: string, year: number) {
	const [hired, offboarded] = await Promise.all([
		db.employee.count({
			where: {
				organizationId,
				startDate: {
					gte: new Date(`${year}-01-01`),
					lte: new Date(`${year}-12-31`)
				}
			}
		}),
		db.employee.count({
			where: {
				organizationId,
				employmentStatus: 'OFFBOARDED',
				endDate: {
					gte: new Date(`${year}-01-01`),
					lte: new Date(`${year}-12-31`)
				}
			}
		})
	])

	return { year, hired, offboarded }
}

// ─── Filter Options ───────────────────────────────────────────────────────────

interface DateRangeFilter {
	startDate: Date
	endDate: Date
	departmentId?: string
}

// ─── generateHeadcount ────────────────────────────────────────────────────────
// Returns monthly headcount snapshots (active employees at end of each month)
// within the given date range, optionally filtered by department.

export async function generateHeadcount(
	organizationId: string,
	{ startDate, endDate, departmentId }: DateRangeFilter
) {
	const where = {
		organizationId,
		startDate: { lte: endDate },
		OR: [{ endDate: null }, { endDate: { gte: startDate } }],
		...(departmentId ? { departmentId } : {})
	}

	const employees = await db.employee.findMany({
		where,
		select: {
			id: true,
			startDate: true,
			endDate: true,
			employmentStatus: true,
			department: { select: { name: true } }
		}
	})

	// Build monthly periods
	const periods: { period: string; headcount: number; department: string }[] = []
	const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
	const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)

	while (cursor <= endMonth) {
		const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
		const label = cursor.toLocaleDateString('en-PH', { year: 'numeric', month: 'short' })

		const active = employees.filter((e) => {
			const started = e.startDate <= monthEnd
			const notEnded = !e.endDate || e.endDate >= cursor
			return started && notEnded
		})

		if (departmentId) {
			periods.push({ period: label, headcount: active.length, department: departmentId })
		} else {
			// Group by department
			const byDept: Record<string, number> = {}
			for (const e of active) {
				const deptName = e.department.name
				byDept[deptName] = (byDept[deptName] ?? 0) + 1
			}
			if (Object.keys(byDept).length === 0) {
				periods.push({ period: label, headcount: 0, department: 'All' })
			} else {
				for (const [dept, count] of Object.entries(byDept)) {
					periods.push({ period: label, headcount: count, department: dept })
				}
			}
		}

		cursor.setMonth(cursor.getMonth() + 1)
	}

	return periods
}

// ─── generateAttendance ───────────────────────────────────────────────────────

export async function generateAttendance(
	organizationId: string,
	{ startDate, endDate, departmentId }: DateRangeFilter
) {
	const timesheets = await db.timesheet.findMany({
		where: {
			periodStart: { gte: startDate },
			periodEnd: { lte: endDate },
			employee: {
				organizationId,
				...(departmentId ? { departmentId } : {})
			}
		},
		select: {
			id: true,
			periodStart: true,
			periodEnd: true,
			totalHours: true,
			status: true,
			employee: {
				select: {
					firstName: true,
					lastName: true,
					employeeNumber: true
				}
			}
		},
		orderBy: [{ employee: { lastName: 'asc' } }, { periodStart: 'asc' }]
	})

	return timesheets.map((t) => ({
		Employee: `${t.employee.lastName}, ${t.employee.firstName} (${t.employee.employeeNumber})`,
		Period: `${t.periodStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${t.periodEnd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`,
		TotalHours: Number(t.totalHours),
		Status: t.status
	}))
}

// ─── generatePayrollCosts ─────────────────────────────────────────────────────

export async function generatePayrollCosts(
	organizationId: string,
	{ startDate, endDate }: { startDate: Date; endDate: Date },
	// #249: same allow-list contract as `generatePayrollRegister` (`null` = every employee).
	// No per-employee row leaves this function, but every figure in it is built from `run.entries`,
	// so unfiltered it hands a manager the organization's payroll cost broken out by department —
	// the aggregate form of the leak `getRunWithEntries` had to close after its entry filter landed.
	// Filtered on the include rather than the top-level where, because the rows come from entries.
	visibleEmployeeIds: string[] | null
) {
	const runs = await db.payrollRun.findMany({
		where: {
			organizationId,
			periodStart: { gte: startDate },
			periodEnd: { lte: endDate }
		},
		select: {
			periodStart: true,
			periodEnd: true,
			totalGross: true,
			totalNet: true,
			entries: {
				...(visibleEmployeeIds != null && {
					where: { employeeId: { in: visibleEmployeeIds } }
				}),
				select: {
					grossPay: true,
					netPay: true,
					employee: {
						select: {
							department: { select: { name: true } }
						}
					}
				}
			}
		},
		orderBy: { periodStart: 'asc' }
	})

	// Flatten: one row per department per run
	const rows: {
		Period: string
		Department: string
		TotalGross: number
		TotalNet: number
		HeadCount: number
	}[] = []

	for (const run of runs) {
		const period = `${run.periodStart.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – ${run.periodEnd.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
		const byDept: Record<string, { gross: number; net: number; count: number }> = {}

		for (const entry of run.entries) {
			const dept = entry.employee.department.name
			if (!byDept[dept]) byDept[dept] = { gross: 0, net: 0, count: 0 }
			byDept[dept].gross += Number(entry.grossPay)
			byDept[dept].net += Number(entry.netPay)
			byDept[dept].count += 1
		}

		for (const [dept, totals] of Object.entries(byDept)) {
			rows.push({
				Period: period,
				Department: dept,
				TotalGross: totals.gross,
				TotalNet: totals.net,
				HeadCount: totals.count
			})
		}
	}

	return rows
}

// ─── generateLeaveUtilization ─────────────────────────────────────────────────

export async function generateLeaveUtilization(
	organizationId: string,
	{ startDate, endDate }: { startDate: Date; endDate: Date }
) {
	// Leave is now a Request of type LEAVE; totalDays and leaveTypeId live in payload.
	const requests = await db.request.findMany({
		where: {
			type: 'LEAVE',
			status: 'APPROVED',
			dateFrom: { gte: startDate },
			dateTo: { lte: endDate },
			employee: { organizationId }
		},
		select: { payload: true, employeeId: true }
	})

	const typeIds = [
		...new Set(
			requests
				.map((r) => (r.payload as { leaveTypeId?: string })?.leaveTypeId)
				.filter(Boolean) as string[]
		)
	]
	const types = typeIds.length
		? await db.leaveType.findMany({
				where: { id: { in: typeIds } },
				select: { id: true, name: true }
			})
		: []
	const typeNames = new Map(types.map((t) => [t.id, t.name]))

	// Group by leave type
	const byType: Record<string, { totalDays: number; employees: Set<string> }> = {}
	for (const req of requests) {
		const payload = (req.payload ?? {}) as { leaveTypeId?: string; totalDays?: number }
		const name = (payload.leaveTypeId && typeNames.get(payload.leaveTypeId)) || '—'
		if (!byType[name]) byType[name] = { totalDays: 0, employees: new Set() }
		byType[name].totalDays += Number(payload.totalDays ?? 0)
		byType[name].employees.add(req.employeeId)
	}

	return Object.entries(byType).map(([name, data]) => ({
		LeaveType: name,
		TotalDaysUsed: data.totalDays,
		EmployeeCount: data.employees.size
	}))
}

// ─── generatePayrollRegister ──────────────────────────────────────────────────
// One row per payroll entry in the range: gross, itemized statutory, other
// deductions (loans/cash advances/tardiness), and net — the standard payroll register.

export async function generatePayrollRegister(
	organizationId: string,
	{ startDate, endDate }: { startDate: Date; endDate: Date },
	// #249: `null` = every employee. VIEW_PAYROLL_REPORTS holds MANAGER (#133), so this report
	// handed a branch manager the whole organization's gross, statutory and net — the same leak as
	// the run-detail page, on the reporting surface. Callers pass the allow-list from
	// `listVisiblePayEmployeeIds` so the register and the run agree on who a manager's team is.
	//
	// Required rather than optional, here and on the four reports below: this one was scoped first
	// and the others kept the old two-argument shape, which compiled fine and shipped unscoped.
	// A missing allow-list is now a type error instead of a silent disclosure.
	visibleEmployeeIds: string[] | null
) {
	const entries = await db.payrollEntry.findMany({
		where: {
			payrollRun: { organizationId, periodStart: { gte: startDate }, periodEnd: { lte: endDate } },
			...(visibleEmployeeIds != null && { employeeId: { in: visibleEmployeeIds } })
		},
		select: {
			grossPay: true,
			sssEe: true,
			philhealthEe: true,
			pagibigEe: true,
			withholdingTax: true,
			totalDeductions: true,
			netPay: true,
			payrollRun: { select: { periodStart: true, periodEnd: true } },
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } }
		},
		orderBy: [{ payrollRun: { periodStart: 'asc' } }, { employee: { lastName: 'asc' } }]
	})

	const fmt = (d: Date) =>
		d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
	return entries.map((e) => {
		const statutory =
			Number(e.sssEe) + Number(e.philhealthEe) + Number(e.pagibigEe) + Number(e.withholdingTax)
		const other = Math.round((Number(e.totalDeductions) - statutory) * 100) / 100
		return {
			Employee: `${e.employee.lastName}, ${e.employee.firstName} (${e.employee.employeeNumber})`,
			Period: `${fmt(e.payrollRun.periodStart)} – ${fmt(e.payrollRun.periodEnd)}`,
			Gross: Number(e.grossPay),
			SSS: Number(e.sssEe),
			PhilHealth: Number(e.philhealthEe),
			PagIBIG: Number(e.pagibigEe),
			Tax: Number(e.withholdingTax),
			OtherDeductions: other,
			Net: Number(e.netPay)
		}
	})
}

// ─── generateTardiness ────────────────────────────────────────────────────────
// Late / undertime per employee over the period, from derived AttendanceDay rows.

export async function generateTardiness(
	organizationId: string,
	{ startDate, endDate, departmentId }: DateRangeFilter
) {
	const days = await db.attendanceDay.findMany({
		where: {
			date: { gte: startDate, lte: endDate },
			employee: { organizationId, ...(departmentId ? { departmentId } : {}) }
		},
		select: {
			lateMinutes: true,
			undertimeMinutes: true,
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } }
		}
	})

	const byEmp = new Map<string, { name: string; lateDays: number; late: number; under: number }>()
	for (const d of days) {
		const key = d.employee.employeeNumber
		const row = byEmp.get(key) ?? {
			name: `${d.employee.lastName}, ${d.employee.firstName} (${key})`,
			lateDays: 0,
			late: 0,
			under: 0
		}
		if (d.lateMinutes > 0) row.lateDays += 1
		row.late += d.lateMinutes
		row.under += d.undertimeMinutes
		byEmp.set(key, row)
	}

	return [...byEmp.values()]
		.filter((r) => r.late > 0 || r.under > 0)
		.sort((a, b) => b.late - a.late)
		.map((r) => ({
			Employee: r.name,
			LateDays: r.lateDays,
			LateMinutes: r.late,
			UndertimeMinutes: r.under
		}))
}

// ─── generateOvertime ─────────────────────────────────────────────────────────
// Paid OT (gated on approval), raw worked OT, and night-diff hours per employee.

export async function generateOvertime(
	organizationId: string,
	{ startDate, endDate, departmentId }: DateRangeFilter
) {
	const days = await db.attendanceDay.findMany({
		where: {
			date: { gte: startDate, lte: endDate },
			employee: { organizationId, ...(departmentId ? { departmentId } : {}) }
		},
		select: {
			overtimeHours: true,
			rawOvertimeHours: true,
			nightDiffHours: true,
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } }
		}
	})

	const byEmp = new Map<string, { name: string; ot: number; raw: number; night: number }>()
	for (const d of days) {
		const key = d.employee.employeeNumber
		const row = byEmp.get(key) ?? {
			name: `${d.employee.lastName}, ${d.employee.firstName} (${key})`,
			ot: 0,
			raw: 0,
			night: 0
		}
		row.ot += Number(d.overtimeHours)
		row.raw += Number(d.rawOvertimeHours)
		row.night += Number(d.nightDiffHours)
		byEmp.set(key, row)
	}

	return [...byEmp.values()]
		.filter((r) => r.raw > 0 || r.night > 0)
		.sort((a, b) => b.ot - a.ot)
		.map((r) => ({
			Employee: r.name,
			OvertimeHours: Math.round(r.ot * 100) / 100,
			RawOvertimeHours: Math.round(r.raw * 100) / 100,
			NightDiffHours: Math.round(r.night * 100) / 100
		}))
}

// ─── generateLoanSummary ──────────────────────────────────────────────────────
// Outstanding loans per employee (defaults to active; date range is ignored).

export async function generateLoanSummary(
	organizationId: string,
	_range: DateRangeFilter,
	// #249: same allow-list contract as `generatePayrollRegister` (`null` = every employee).
	// A loan's principal, balance and installment are that employee's pay data, and MANAGER reaches
	// this report through VIEW_PAYROLL_REPORTS just as it reaches the register. The filter hangs off
	// `Loan.employeeId` — this is the one payroll report that does not query `PayrollEntry`.
	visibleEmployeeIds: string[] | null
) {
	const loans = await db.loan.findMany({
		where: {
			employee: { organizationId },
			status: 'ACTIVE',
			...(visibleEmployeeIds != null && { employeeId: { in: visibleEmployeeIds } })
		},
		select: {
			principal: true,
			balance: true,
			installment: true,
			status: true,
			employee: { select: { firstName: true, lastName: true, employeeNumber: true } }
		},
		orderBy: { balance: 'desc' }
	})

	return loans.map((l) => ({
		Employee: `${l.employee.lastName}, ${l.employee.firstName} (${l.employee.employeeNumber})`,
		Principal: Number(l.principal),
		Balance: Number(l.balance),
		Installment: Number(l.installment),
		Status: l.status
	}))
}

// ─── generateGovernmentRemittance ─────────────────────────────────────────────
// Employee + employer statutory contributions across the period, for SSS/PhilHealth/
// Pag-IBIG remittance and BIR withholding totals.

export async function generateGovernmentRemittance(
	organizationId: string,
	{ startDate, endDate }: { startDate: Date; endDate: Date },
	// #249: same allow-list contract as `generatePayrollRegister`. Aggregate-only output, but the
	// aggregate IS the organization's statutory bill, and the employer shares scale with total
	// payroll — so unfiltered it discloses org-wide cost to a scoped manager. The roles that actually
	// file remittances (PAYROLL_OFFICER, FINANCE, HR_ADMIN, CEO) pass `null` and see the whole org.
	visibleEmployeeIds: string[] | null
) {
	const entries = await db.payrollEntry.findMany({
		where: {
			payrollRun: { organizationId, periodStart: { gte: startDate }, periodEnd: { lte: endDate } },
			...(visibleEmployeeIds != null && { employeeId: { in: visibleEmployeeIds } })
		},
		select: {
			sssEe: true,
			sssEr: true,
			philhealthEe: true,
			philhealthEr: true,
			pagibigEe: true,
			pagibigEr: true,
			withholdingTax: true
		}
	})

	const sum = (pick: (e: (typeof entries)[number]) => number) =>
		entries.reduce((s, e) => s + pick(e), 0)
	const round = (n: number) => Math.round(n * 100) / 100
	const row = (contribution: string, ee: number, er: number) => ({
		Contribution: contribution,
		EmployeeShare: round(ee),
		EmployerShare: round(er),
		Total: round(ee + er)
	})

	return [
		row(
			'SSS',
			sum((e) => Number(e.sssEe)),
			sum((e) => Number(e.sssEr))
		),
		row(
			'PhilHealth',
			sum((e) => Number(e.philhealthEe)),
			sum((e) => Number(e.philhealthEr))
		),
		row(
			'Pag-IBIG',
			sum((e) => Number(e.pagibigEe)),
			sum((e) => Number(e.pagibigEr))
		),
		row(
			'Withholding Tax (BIR)',
			sum((e) => Number(e.withholdingTax)),
			0
		)
	]
}

// ─── generateBIRWithholding ───────────────────────────────────────────────────
// Per-employee gross and tax withheld over the period (alphalist-style).

export async function generateBIRWithholding(
	organizationId: string,
	{ startDate, endDate }: { startDate: Date; endDate: Date },
	// #249: same allow-list contract as `generatePayrollRegister`. This is the register's own data
	// under another heading — per-employee gross and tax withheld — plus the TIN, so it leaked a
	// government ID alongside the pay. Same query shape as the register, same filter.
	visibleEmployeeIds: string[] | null
) {
	const entries = await db.payrollEntry.findMany({
		where: {
			payrollRun: { organizationId, periodStart: { gte: startDate }, periodEnd: { lte: endDate } },
			...(visibleEmployeeIds != null && { employeeId: { in: visibleEmployeeIds } })
		},
		select: {
			grossPay: true,
			withholdingTax: true,
			employee: {
				select: { firstName: true, lastName: true, employeeNumber: true, tinNumber: true }
			}
		}
	})

	const byEmp = new Map<string, { name: string; tin: string; gross: number; tax: number }>()
	for (const e of entries) {
		const key = e.employee.employeeNumber
		const row = byEmp.get(key) ?? {
			name: `${e.employee.lastName}, ${e.employee.firstName} (${key})`,
			tin: e.employee.tinNumber ?? '—',
			gross: 0,
			tax: 0
		}
		row.gross += Number(e.grossPay)
		row.tax += Number(e.withholdingTax)
		byEmp.set(key, row)
	}

	return [...byEmp.values()]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((r) => ({
			Employee: r.name,
			TIN: r.tin,
			Gross: Math.round(r.gross * 100) / 100,
			TaxWithheld: Math.round(r.tax * 100) / 100
		}))
}

// ─── exportToCSV ──────────────────────────────────────────────────────────────

// Cells whose first character triggers spreadsheet formula evaluation. Prefixed
// with `\t` before quoting so Excel/Sheets renders them as text rather than
// executing `=HYPERLINK(...)`, `+cmd|'…'`, `-2+cmd`, `@cell`, etc. (#98).
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function exportToCSV(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) return ''

	const headers = Object.keys(rows[0])
	const escape = (val: unknown): string => {
		let str = val === null || val === undefined ? '' : String(val)
		// Formula-injection defense: prepend a tab so spreadsheets treat the cell
		// as text. The tab is stripped on paste-back but is inert as a formula
		// trigger. Applied before quoting so the neutralizer lives inside the
		// quoted body when quoting kicks in.
		if (FORMULA_PREFIX.test(str)) {
			str = `\t${str}`
		}
		if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\t')) {
			return `"${str.replace(/"/g, '""')}"`
		}
		return str
	}

	const lines = [
		headers.join(','),
		...rows.map((row) => headers.map((h) => escape(row[h])).join(','))
	]

	return lines.join('\r\n')
}
