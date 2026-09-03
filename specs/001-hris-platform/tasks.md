---
description: 'Task list for Veent HRIS Core Platform'
---

# Tasks: Veent HRIS Core Platform

**Input**: Design documents from `specs/001-hris-platform/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Stack**: SvelteKit 2 + Svelte 5 + TypeScript 5 | Prisma 5 + PostgreSQL 16 | Lucia v3 | Tailwind CSS v3 | Vitest + Playwright

> **Note**: Redis was removed — not needed for the current scope. Dashboard and reports query DB directly. Rate limiting (T115) and report caching (T117) are marked skipped.

**Tests**: Vitest unit tests included for payroll statutory computations only (business-critical math). E2E Playwright tests included in polish phase.

**Organization**: Tasks grouped by user story for independent implementation and testing.

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)

---

## Phase 1: Setup

**Purpose**: Initialize the SvelteKit project and install all dependencies.

- [x] T001 Scaffold SvelteKit 2 project with TypeScript template via `npm create svelte@latest` — select TypeScript, ESLint, Prettier
- [x] T002 Install and configure Tailwind CSS v3: run `npx svelte-add@latest tailwindcss`, verify `tailwind.config.ts` and `src/app.css`
- [x] T003 [P] Initialise shadcn-svelte: run `npx shadcn-svelte@latest init`, add Button, Input, Table, Card, Dialog, Badge, Select, Dropdown, Skeleton components
- [x] T004 [P] Install Prisma 5: `npm install prisma @prisma/client`, run `npx prisma init`, set `DATABASE_URL` in `.env`
- [x] T005 [P] Install Lucia v3 and Prisma adapter: `npm install lucia @lucia-auth/adapter-prisma`
- [x] T006 [P] Install Redis client and layerchart: `npm install ioredis layerchart`
- [x] T007 [P] Install Vitest and Svelte Testing Library: `npm install -D vitest @testing-library/svelte @testing-library/jest-dom`, create `vitest.config.ts`
- [x] T008 [P] Install Playwright: `npm install -D @playwright/test`, run `npx playwright install`, create `playwright.config.ts` targeting `http://localhost:5173`
- [x] T009 Configure `@sveltejs/adapter-node` in `svelte.config.js` (replace auto adapter)
- [x] T010 [P] Create `.env.example` with: `DATABASE_URL`, `REDIS_URL`, `LUCIA_SECRET`, `NODE_ENV`, `PORT=3000`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, auth, RBAC, and audit log must be complete before any user story begins.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T011 Write full Prisma schema in `prisma/schema.prisma`: all 15 HR entities (Organization, Department, User, Employee, Timesheet, TimesheetEntry, LeaveType, LeaveBalance, LeaveRequest, PublicHoliday, PayrollConfig, PayrollRun, PayrollEntry, JobPosting, Applicant, ApplicantStageHistory, AuditLog) plus Lucia's `Session` and `Key` models — include all fields, relations, unique constraints, and enums from `data-model.md`
- [x] T012 Run `npx prisma migrate dev --name init` to generate initial migration and apply to dev database — used `prisma db push` instead (advisory lock issue with background processes; functionally equivalent for dev)
- [x] T013 [P] Create `src/lib/server/db.ts`: Prisma client singleton with `globalThis` cache to prevent hot-reload connection exhaustion
- [x] T014 [P] ~~Create `src/lib/server/redis.ts`~~ — **REMOVED**: Redis dependency removed; dashboard queries DB directly via `src/lib/server/services/dashboard.ts`
- [x] T015 Create `src/lib/server/auth.ts`: initialise Lucia with `PrismaAdapter`, configure session cookie name `auth_session`, set `sessionExpiresIn` to 30 days
- [x] T016 Create `src/hooks.server.ts`: read `auth_session` cookie, call `lucia.validateSession()`, set `locals.user` and `locals.session`, call `lucia.createBlankSessionCookie()` on invalid session
- [x] T017 Update `src/app.d.ts`: declare `App.Locals` with `{ user: User | null; session: Session | null }` using Lucia types
- [x] T018 Create `src/lib/server/rbac.ts`: export `requireRole(...roles: Role[])` that reads `locals.user.role`, throws SvelteKit `error(403)` if role not in allowed list; export `isOwner(locals, employeeId)` for ownership checks
- [x] T019 Create `src/lib/server/audit.ts`: export `writeAuditLog(db, entry: AuditLogEntry)` that inserts into `AuditLog` table via a separate Prisma call (outside the caller's transaction)
- [x] T020 Create `src/lib/server/api-error.ts`: export `apiError(status, title, detail)` returning RFC 7807 `application/problem+json` Response object
- [x] T021 [P] Create `src/lib/utils/dates.ts`: `getWeekStart(date)`, `getWeekEnd(date)`, `computeWorkingDays(start, end, holidays)`, `formatDateISO(date)`, `formatDateDisplay(date)`
- [x] T022 [P] Create `src/lib/utils/format.ts`: `formatPHP(amount)` (Philippine Peso formatter), `formatPercent(value)`, `formatHours(decimal)`
- [x] T023 Create login page `src/routes/(auth)/login/+page.svelte`: email + password form with validation feedback, uses shadcn-svelte Card + Input + Button
- [x] T024 Create `src/routes/(auth)/login/+page.server.ts`: form action — find User by email, verify bcrypt password hash, call `lucia.createSession()`, set session cookie, redirect to `/dashboard`; write `LOGIN` / `LOGIN_FAILED` AuditLog entry
- [x] T025 Create `src/routes/(app)/+layout.server.ts`: check `locals.user`, redirect to `/login` if null; pass `user` to layout data
- [x] T026 Create `src/routes/(app)/+layout.svelte`: app shell with role-aware sidebar (employee sees: Dashboard, Timesheets, Leave, Profile, Payslips; manager adds: Approvals, Team; admin adds: Employees, Departments, Payroll, Reports, Recruitment)
- [x] T027 Create `src/routes/+page.server.ts`: redirect authenticated users to `/dashboard`, unauthenticated to `/login`
- [x] T028 Create `src/routes/(auth)/logout/+page.server.ts`: form action — invalidate Lucia session, clear cookie, redirect to `/login`
- [x] T029 Create `prisma/seed.ts`: seed one Organization, one Department ("Engineering"), and one User+Employee per role (super_admin, hr_admin, manager, employee) with known passwords for local testing
- [x] T030 Add `"prisma": { "seed": "ts-node prisma/seed.ts" }` to `package.json` and run `npx prisma db seed`

**Checkpoint**: Auth works — `npm run dev`, navigate to `/`, redirected to `/login`, can log in, sees sidebar, logs out. Foundation ready for all user stories.

---

## Phase 3: User Story 1 — Employee Self-Service Portal (Priority: P1) 🎯 MVP

**Goal**: Employee can log in, submit a weekly timesheet, file a leave request, and view their profile.

**Independent Test**: Log in as seeded employee → submit a timesheet for current week → verify status is `SUBMITTED` → file a 2-day leave request → verify it appears as `PENDING`. No other story required.

- [x] T031 Create `src/lib/server/services/employees.ts`: `getById(db, id)`, `getProfile(db, userId)`, `updateContactDetails(db, id, data, actor)` — includes `writeAuditLog` call on update
- [x] T032 Create `src/lib/server/services/timesheets.ts`: `listByEmployee(db, employeeId, filters)`, `getById(db, id)`, `create(db, employeeId, data)`, `submit(db, id, actor)` — enforces no-duplicate constraint, sets status to `SUBMITTED`
- [x] T033 Create `src/lib/server/services/leave.ts`: `listLeaveTypes(db)`, `getBalances(db, employeeId, year)`, `listRequests(db, employeeId, filters)`, `createRequest(db, employeeId, data)` — validates balance, sets status `PENDING`
- [x] T034 [P] [US1] Create `src/lib/components/timesheets/WeeklyGrid.svelte`: reusable hours-per-day input grid (Mon–Fri), accepts `entries` prop, emits change events, validates 0–24 range per day
- [x] T035 [P] [US1] Create `src/lib/components/leave/BalanceSummary.svelte`: displays leave balance cards (leave type name, allocated, used, remaining) using shadcn-svelte Card
- [x] T036 [P] [US1] Create `src/routes/(app)/timesheets/+page.svelte`: list of employee's timesheets with status badges, link to submit new timesheet
- [x] T037 [US1] Create `src/routes/(app)/timesheets/+page.server.ts`: `load` — fetch own timesheets via `timesheets.listByEmployee`; `action: submit` — call `timesheets.submit()`
- [x] T038 [P] [US1] Create `src/routes/(app)/timesheets/new/+page.svelte`: week picker + WeeklyGrid component, submit button
- [x] T039 [US1] Create `src/routes/(app)/timesheets/new/+page.server.ts`: `load` — resolve current week dates; `action: create` — validate entries with Zod, call `timesheets.create()`, then auto-submit if user confirms; return 409 on duplicate
- [x] T040 [P] [US1] Create `src/routes/(app)/leave/+page.svelte`: leave request list with status, BalanceSummary at top, link to new request
- [x] T041 [US1] Create `src/routes/(app)/leave/+page.server.ts`: `load` — fetch own requests + balances; `action: cancel` — set request to `CANCELLED` (own pending only)
- [x] T042 [P] [US1] Create `src/routes/(app)/leave/new/+page.svelte`: leave type selector, date range picker, reason textarea, balance preview showing impact
- [x] T043 [US1] Create `src/routes/(app)/leave/new/+page.server.ts`: `action: create` — Zod validate, call `leave.createRequest()`, return 422 with `{ remaining, requested }` on balance error
- [x] T044 [P] [US1] Create `src/routes/(app)/profile/+page.svelte`: read-only employment fields + editable contact fields (phone, address), save button
- [x] T045 [US1] Create `src/routes/(app)/profile/+page.server.ts`: `load` — own Employee record; `action: update` — Zod validate, call `employees.updateContactDetails()` (writes AuditLog)
- [x] T046 [P] [US1] Create `src/routes/api/v1/timesheets/+server.ts`: `GET` (list with filters), `POST` (create + submit); enforce ownership via `requireRole` + `isOwner`

**Checkpoint**: Employee self-service is fully functional and independently testable without any other story being complete.

---

## Phase 4: User Story 2 — HR Admin: Employee Lifecycle Management (Priority: P2)

**Goal**: HR Admin can create employees, update records, search, and offboard.

**Independent Test**: Log in as hr_admin → create new employee → verify user receives seeded credentials → update department → offboard → verify account deactivated and record is read-only.

- [x] T047 Extend `src/lib/server/services/employees.ts`: add `list(db, filters, pagination)`, `create(db, data, actor)`, `update(db, id, data, actor)`, `offboard(db, id, endDate, reason, actor)`, `search(db, query)` — all mutation functions call `writeAuditLog`
- [x] T048 Create `src/lib/server/services/departments.ts`: `list(db)`, `create(db, data, actor)`, `update(db, id, data, actor)` — calls `writeAuditLog` on mutations
- [x] T049 [P] [US2] Create `src/lib/components/employees/EmployeeCard.svelte`: compact employee card showing name, number, title, department, status badge — used in list views
- [x] T050 [P] [US2] Create `src/routes/(app)/employees/+page.svelte`: paginated employee list with search bar, department filter, status filter, EmployeeCard grid, "Add Employee" button (HR Admin only)
- [x] T051 [US2] Create `src/routes/(app)/employees/+page.server.ts`: `load` — `requireRole(HR_ADMIN, SUPER_ADMIN, MANAGER)`, call `employees.list()` with filters; MANAGER sees only direct reports
- [x] T052 [P] [US2] Create `src/routes/(app)/employees/new/+page.svelte`: onboarding form — all required Employee + User fields, department selector, reports-to selector
- [x] T053 [US2] Create `src/routes/(app)/employees/new/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)`; `action: create` — Zod validate, call `employees.create()`, auto-generate `EMP-XXXX` number, call `notifications.sendWelcomeEmail()` stub
- [x] T054 [P] [US2] Create `src/routes/(app)/employees/[id]/+page.svelte`: full employee profile — employment details (read-only for non-admin), editable fields for HR Admin, offboard button
- [x] T055 [US2] Create `src/routes/(app)/employees/[id]/+page.server.ts`: `load` — `employees.getById()`, ownership check for EMPLOYEE role; `action: update` — `requireRole(HR_ADMIN, SUPER_ADMIN)`, call `employees.update()`; `action: offboard` — call `employees.offboard()`, deactivate linked User
- [x] T056 [P] [US2] Create `src/routes/(app)/departments/+page.svelte`: department list with create form inline, edit capability
- [x] T057 [US2] Create `src/routes/(app)/departments/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)` for mutations; `load` — `departments.list()`; `action: create`, `action: update`
- [x] T058 [P] [US2] Create `src/routes/api/v1/employees/+server.ts`: `GET` (list, filterable), `POST` (create); role enforcement
- [x] T059 [P] [US2] Create `src/routes/api/v1/employees/[id]/+server.ts`: `GET`, `PATCH` (update), `POST` offboard action
- [x] T060 [P] [US2] Create `src/lib/server/notifications.ts`: stub functions `sendWelcomeEmail(employee, tempPassword)`, `sendTimesheetStatusEmail(employee, status)`, `sendLeaveStatusEmail(employee, status, reason?)` — log to console in v1

**Checkpoint**: HR Admin can complete full employee lifecycle (create → update → offboard) independently of manager approvals and payroll.

---

## Phase 5: User Story 3 — Manager: Timesheet & Leave Approval (Priority: P3)

**Goal**: Manager sees pending approvals from direct reports, approves/rejects with comments, views team attendance.

**Independent Test**: Log in as manager → view approvals queue → approve a seeded SUBMITTED timesheet → verify employee's timesheet status changes to APPROVED → reject a leave request with reason → verify employee sees rejection reason.

- [x] T061 Extend `src/lib/server/services/timesheets.ts`: add `getPendingForManager(db, managerId)`, `approve(db, id, actor)`, `reject(db, id, reason, actor)` — all write AuditLog; `approve` also notifies employee
- [x] T062 Extend `src/lib/server/services/leave.ts`: add `getPendingForManager(db, managerId)`, `approve(db, id, actor)` (deducts LeaveBalance), `reject(db, id, reason, actor)` — the planned `overrideApprove(db, id, note, actor)` writing a `LEAVE_OVERRIDE` AuditLog entry was never built (#295)
- [x] T063 [P] [US3] Create `src/lib/components/approvals/ApprovalCard.svelte`: card showing submitter name, period/dates, hours/days, approve + reject buttons; reject reveals inline reason textarea
- [x] T064 [P] [US3] Create `src/routes/(app)/approvals/+page.svelte`: tabbed layout (Timesheets | Leave), lists ApprovalCards for each pending item, shows count badge per tab
- [x] T065 [US3] Create `src/routes/(app)/approvals/+page.server.ts`: `requireRole(MANAGER, HR_ADMIN, SUPER_ADMIN)`; `load` — call `getPendingForManager` / all pending for admin; `action: approveTimesheet`, `action: rejectTimesheet`, `action: approveLeave`, `action: rejectLeave` (`action: overrideLeave` was never built — #295)
- [x] T066 [P] [US3] Create `src/routes/(app)/team/+page.svelte`: team attendance overview — date range picker, table with employee rows and day columns, colour-coded cells (PRESENT / ABSENT / ON_LEAVE / HOLIDAY)
- [x] T067 [US3] Create `src/routes/(app)/team/+page.server.ts`: `requireRole(MANAGER, HR_ADMIN, SUPER_ADMIN)`; `load` — query approved timesheets + leave requests for team within date range, compute per-day status per employee
- [x] T068 [P] [US3] Create `src/routes/api/v1/timesheets/[id]/+server.ts`: `PATCH` (approve / reject actions) with role enforcement
- [x] T069 [P] [US3] Create `src/routes/api/v1/leave/[id]/+server.ts`: `PATCH` (approve / reject) with role enforcement

**Checkpoint**: Manager can process full approvals queue independently. Employee self-service (US1) and HR employee management (US2) can run in parallel with this story.

---

## Phase 6: User Story 4 — HR Admin: Payroll Processing (Priority: P4)

**Goal**: HR Admin computes a payroll run with PH statutory deductions, reviews flagged employees, approves, and issues payslips employees can view.

**Independent Test**: Log in as hr_admin → compute payroll for current period → verify SSS/PhilHealth/Pag-IBIG/BIR amounts for a PHP 30,000 salary employee → approve run → log in as employee → view itemized payslip.

- [x] T070 Create `src/lib/server/services/payroll/ph-statutory.ts`: `computeSSS(monthlySalary, sssTable)`, `computePhilHealth(monthlySalary, config)`, `computePagIbig(monthlySalary, config)`, `computeBIRWithholding(taxableMonthly, birTable)`, `computeNetPay(gross, sssEe, philhealthEe, pagibigEe, tax)` — all pure functions with no side effects
- [x] T071 Write Vitest unit tests in `tests/unit/ph-statutory.test.ts`: test each function with PHP 15,000, 30,000, and 100,000 monthly salaries; assert expected SSS, PhilHealth, Pag-IBIG, and BIR values; tests MUST fail before T070 is implemented
- [x] T072 Create `src/lib/server/services/payroll/index.ts`: `computePayrollRun(db, organizationId, periodStart, periodEnd)` — load PayrollConfig, iterate active employees, collect approved timesheets, call ph-statutory functions, create PayrollRun + PayrollEntries, flag employees with missing/unapproved timesheets; return run with `warnings[]`
- [x] T073 [P] [US4] Create `src/lib/server/services/payroll/runs.ts`: `listRuns(db, organizationId, filters)`, `getRunWithEntries(db, id)`, `approveRun(db, id, actor, overrideNote?)` — validates overrideNote required when flagged entries exist, writes `PAYROLL_OVERRIDE` AuditLog, triggers payslip visibility
- [x] T074 [P] [US4] Create `src/lib/components/payroll/PayslipDetail.svelte`: itemized payslip component — earnings table (basic pay, gross), deductions table (SSS, PhilHealth, Pag-IBIG, tax, total), net pay highlight
- [x] T075 [P] [US4] Create `src/routes/(app)/payroll/+page.svelte`: payroll runs list with status badges, period dates, total net pay, "Compute New Run" button
- [x] T076 [US4] Create `src/routes/(app)/payroll/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)`; `load` — `listRuns()`; `action: compute` — Zod validate period, call `computePayrollRun()`, redirect to run detail
- [x] T077 [P] [US4] Create `src/routes/(app)/payroll/[id]/+page.svelte`: run detail — summary totals, employee entries table with flagged warning rows, approve button (shows override note textarea when warnings exist)
- [x] T078 [US4] Create `src/routes/(app)/payroll/[id]/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)`; `load` — `getRunWithEntries()`; `action: approve` — Zod validate overrideNote when flags exist, call `approveRun()`; `action: void` — `requireRole(SUPER_ADMIN)` only
- [x] T079 [P] [US4] Create `src/routes/(app)/payroll/config/+page.svelte`: config form — pay frequency, cutoff dates, PhilHealth/Pag-IBIG rate inputs, SSS table JSON editor, BIR table JSON editor
- [x] T080 [US4] Create `src/routes/(app)/payroll/config/+page.server.ts`: `requireRole(SUPER_ADMIN)`; `load` — PayrollConfig; `action: update` — Zod validate, update config, writeAuditLog UPDATE
- [x] T081 [P] [US4] Create `src/routes/(app)/payslips/+page.svelte`: employee's payslip list — period, gross, net per row, link to detail
- [x] T082 [US4] Create `src/routes/(app)/payslips/+page.server.ts`: `load` — fetch own PayrollEntries from APPROVED runs, sorted by period descending
- [x] T083 [P] [US4] Create `src/routes/(app)/payslips/[id]/+page.svelte`: renders PayslipDetail component with data
- [x] T084 [US4] Create `src/routes/(app)/payslips/[id]/+page.server.ts`: `load` — fetch PayrollEntry, ownership check (employee can only see own payslip)
- [x] T085 [P] [US4] Create `src/routes/api/v1/payroll/+server.ts`: `GET` (list runs), `POST` (compute run)
- [x] T086 [P] [US4] Create `src/routes/api/v1/payroll/[id]/+server.ts`: `GET` (run + entries), `POST` (approve / void)
- [x] T087 [P] [US4] Create `src/routes/api/v1/payroll/payslips/[id]/+server.ts`: `GET` itemized payslip JSON with ownership enforcement

**Checkpoint**: Full payroll cycle works end-to-end. Employee can view their payslip. PH statutory calculations verified by unit tests.

---

## Phase 7: User Story 5 — Dashboards & Reports (Priority: P5)

**Goal**: Role-appropriate dashboard on login; HR Admin can generate and export headcount, attendance, payroll cost, and leave utilization reports.

**Independent Test**: Log in as hr_admin → open dashboard → verify headcount and next payroll date are correct → generate headcount report for last 3 months → export CSV → open file and verify columns and data.

- [x] T088 Create `src/lib/server/services/dashboard.ts`: `getEmployeeMetrics(db, userId)`, `getManagerMetrics(db, managerId)`, `getAdminMetrics(db, organizationId)` — each function checks Redis cache (`dashboard:{role}:{id}`, 5-min TTL) before querying DB
- [x] T089 Create `src/lib/server/services/reports.ts`: `generateHeadcount(db, filters)`, `generateAttendance(db, filters)`, `generatePayrollCosts(db, filters)`, `generateLeaveUtilization(db, filters)`, `exportToCSV(data, columns)` — returns structured data objects and CSV string respectively
- [x] T090 [P] [US5] Create `src/lib/components/charts/HeadcountTrend.svelte`: layerchart line chart for headcount over time, accepts `{ period, headcount }[]` prop
- [x] T091 [P] [US5] Create `src/lib/components/charts/PayrollCostBar.svelte`: layerchart bar chart for payroll costs by department, accepts `{ department, totalGross }[]` prop
- [x] T092 [P] [US5] Create `src/routes/(app)/dashboard/+page.svelte`: role-conditional layout — employee panel (timesheet status, leave balance, next payroll), manager panel (pending approvals count, team headcount), admin panel (total headcount, on-leave today, pending approvals, open job postings, charts)
- [x] T093 [US5] Create `src/routes/(app)/dashboard/+page.server.ts`: `load` — call the appropriate `dashboard.*Metrics()` function based on `locals.user.role`
- [x] T094 [P] [US5] Create `src/routes/(app)/reports/+page.svelte`: report type selector cards (Headcount, Attendance, Payroll Costs, Leave Utilization, Audit Log)
- [x] T095 [US5] Create `src/routes/(app)/reports/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)`; `load` — pass available report types to page
- [x] T096 [P] [US5] Create `src/routes/(app)/reports/[type]/+page.svelte`: filter controls (date range, department), data table with pagination, "Export CSV" button
- [x] T097 [US5] Create `src/routes/(app)/reports/[type]/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)`; `load` — call the matching `reports.generate*()` function with filters from URL params
- [x] T098 [P] [US5] Create `src/routes/(app)/reports/audit-log/+page.svelte`: audit log viewer — actor filter, entity type filter, action filter, date range, paginated table
- [x] T099 [US5] Create `src/routes/(app)/reports/audit-log/+page.server.ts`: `requireRole(HR_ADMIN, SUPER_ADMIN)`; `load` — paginated AuditLog query; redact `oldValue`/`newValue` for HR_ADMIN (visible only to SUPER_ADMIN)
- [x] T100 [P] [US5] Create `src/routes/api/v1/reports/[type]/+server.ts`: `GET` JSON report data; `GET ?export=csv` — return CSV with `Content-Disposition: attachment` header
- [x] T101 [P] [US5] Create `src/routes/api/v1/dashboard/+server.ts`: `GET` role-aware metrics JSON (uses same dashboard service functions)

**Checkpoint**: Dashboard shows correct live metrics. All four reports generate and export correctly. Audit log is accessible and read-only.

---

## Phase 8: User Story 6 — Recruitment (Priority: P6)

**Goal**: HR Admin creates job postings, tracks applicants through stages, and converts a hired candidate to an employee.

**Independent Test**: Log in as hr_admin → create an "OPEN" job posting → submit a test application with resume → advance applicant through all stages to HIRED → convert to employee → verify new employee record exists with pre-populated data.

- [x] T102 Create `src/lib/server/services/recruitment.ts`: `listPostings(db, filters)`, `createPosting(db, data, actor)`, `updatePosting(db, id, data, actor)`, `listApplicants(db, postingId, filters)`, `createApplicant(db, postingId, data)`, `advanceStage(db, applicantId, stage, notes, actor)`, `convertToEmployee(db, applicantId, employmentData, actor)` — calls `writeAuditLog` on mutations and `employees.create()` on conversion
- [x] T103 [P] [US6] Create `src/lib/components/recruitment/ApplicantKanban.svelte`: kanban board with columns per stage (Applied, Screening, Interview, Offer, Hired, Rejected), draggable applicant cards (or click-to-advance for simplicity in v1)
- [x] T104 [P] [US6] Create `src/routes/(app)/recruitment/+page.svelte`: job postings list with status badges (DRAFT, OPEN, CLOSED), applicant count per posting, "New Posting" button
- [x] T105 [US6] Create `src/routes/(app)/recruitment/+page.server.ts`: `load` — `listPostings()`; employees see OPEN only, HR Admin sees all; `action: create` — `requireRole(HR_ADMIN, SUPER_ADMIN)`, Zod validate, call `createPosting()`
- [x] T106 [P] [US6] Create `src/routes/(app)/recruitment/[id]/+page.svelte`: posting detail header, ApplicantKanban, "Add Applicant" button, "Close Posting" button
- [x] T107 [US6] Create `src/routes/(app)/recruitment/[id]/+page.server.ts`: `load` — posting + applicants grouped by stage; `action: updateStatus` — `requireRole(HR_ADMIN, SUPER_ADMIN)`, call `updatePosting()`; `action: advanceStage` — call `recruitment.advanceStage()`; `action: convert` — call `convertToEmployee()`, redirect to new employee profile
- [x] T108 [P] [US6] Create `src/routes/(app)/recruitment/[id]/apply/+page.svelte`: public-style application form (name, email, phone, cover letter, resume upload)
- [x] T109 [US6] Create `src/routes/(app)/recruitment/[id]/apply/+page.server.ts`: `action: apply` — parse multipart form, save resume PDF to `static/uploads/{uuid}.pdf` (max 5MB), call `recruitment.createApplicant()`
- [x] T110 [P] [US6] Create `src/routes/api/v1/recruitment/+server.ts`: `GET` postings, `POST` create posting
- [x] T111 [P] [US6] Create `src/routes/api/v1/recruitment/[id]/applicants/+server.ts`: `GET` list applicants, `POST` add applicant, `PATCH` advance stage, `POST /convert` convert to employee

**Checkpoint**: Full recruitment flow works end-to-end. Converted hire creates a valid Employee record that can log in.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, validation, and observability across all stories.

- [x] T112 [P] Create Zod validation schemas in `src/lib/server/schemas/`: `employees.ts`, `timesheets.ts`, `leave.ts`, `payroll.ts`, `recruitment.ts` — each exports request body schemas used across both page actions and API routes
- [x] T113 [P] Add `src/routes/+error.svelte`: user-friendly error page with message and back-link for 403 (access denied), 404 (not found), and 500 (server error) using shadcn-svelte Card
- [x] T114 [P] Add public holiday management: `src/routes/(app)/settings/holidays/+page.svelte` (date picker + name + type form, list of configured holidays) and `+page.server.ts` (`requireRole(HR_ADMIN, SUPER_ADMIN)`; CRUD on PublicHoliday table)
- [x] T115 [P] ~~Redis rate limiting~~ — **SKIPPED**: Redis removed; login brute-force protection deferred to infrastructure layer (reverse proxy / WAF)
- [x] T116 [P] Add loading skeletons to all list pages — added `src/lib/components/ui/Skeleton.svelte` + `TableSkeleton.svelte`; converted employees/timesheets/approvals/payroll list `load` functions to stream the list query and render skeletons via `{#await}`; reports table uses a `$navigating`-based skeleton for the same-route "Generate" submit
- [x] T117 [P] ~~Redis report caching~~ — **SKIPPED**: Redis removed; reports query DB directly (acceptable for current load)
- [x] T118 Security audit — reviewed all `+server.ts`/`+page.server.ts`. Fixed: manager-to-report ownership missing in `reviewTimesheet`/`reviewLeaveRequest` (a MANAGER could approve/reject ANY org member's items — IDOR); `getEmployee` leaked salary + government IDs to MANAGER viewers (now stripped below HR_ADMIN, employee detail UI gated on `canManage`); invalid `REGULAR` enum in recruitment API schema → `FULL_TIME`
- [x] T119 [P] Playwright E2E tests in `tests/e2e/` covering quickstart scenarios: auth/RBAC (`auth.spec.ts`), employee self-service leave + profile (`employee.spec.ts`), timesheet submit → manager approval lifecycle (`timesheet-approval.spec.ts`), HR admin onboarding + dashboard + report + audit log (`admin.spec.ts`). Seed enriched with manager + employee (reports-to) users and leave balances; `global-setup.ts` resets transactional data per run. 11/11 passing

### Additional tasks completed post-plan

- [x] T120 Apply Veent brand dark theme — `src/app.css` (HSL tokens, dark `#111111` bg, red `#CC1515` primary), `src/app.html` (Inter font, `class="dark"`), `tailwind.config.ts`, root `+layout.svelte` (imports app.css)
- [x] T121 Fix `{@const}` placement in `src/lib/components/recruitment/ApplicantKanban.svelte` — was inside `<div>`, must be immediate child of block tag
- [x] T122 Fix `$derived` captured in `$state()` init in `src/routes/(app)/timesheets/new/+page.svelte` — initialize entries as `$state([])`, rely on `$effect` for population
- [x] T123 Add `src/hooks.ts` transport hook to serialize Prisma `Decimal` objects across the server→client boundary — fixes 500 on `/leave`, `/profile`, `/employees`
- [x] T124 Make `prisma/seed.ts` idempotent — `LeaveType` has no `@@unique([organizationId, name])`, so `createMany` duplicated 5 leave types on every re-seed; now only seeds when none exist. Cleaned existing duplicates from the dev DB
- [x] T125 Enrich seed for E2E — added `manager@veent.ph` (MANAGER) and `employee@veent.ph` (EMPLOYEE, reportsTo manager) with leave balances, so approval/self-service flows are testable

---

## Phase 10: HR Module Expansion & Discord Time Tracking

**Scope**: Benefits Administration, Performance Management, Settings & Org Structure, and a
Discord-driven time-tracking integration. This pass delivered the **foundation** (schema,
spec-kit docs, integration code, service layers, route scaffolds); rich page UIs and REST
routes are deferred and enumerated below. `[X]` = done this pass, `[ ]` = follow-up.

### 10.1 Schema & spec-kit artifacts

- [x] T126 Add enums `PunchType`, `PunchSource`, `BenefitPlanType`, `BenefitEnrollmentStatus`, `ReviewCycleStatus`, `ReviewStatus`, `GoalStatus` in `prisma/schema.prisma`
- [x] T127 Add models `TimeLog`, `BenefitPlan`, `BenefitEnrollment`, `ReviewCycle`, `PerformanceReview`, `Goal`, `Position`; add `Employee.discordId` (unique) + `Employee.positionId` + back-relations; `Position ↔ Department` relation; apply via `prisma db push` + `generate`
- [x] T128 [P] Update `data-model.md` (expansion entities + state-machine rows) and `spec.md` (FR-034–FR-046)
- [x] T129 [P] Author contracts `contracts/{benefits,performance,settings,timelog}.md` and extend `contracts/timesheets.md`
- [x] T130 [P] Seed sample data: one `BenefitPlan`, one `ReviewCycle`, a few `Position` rows, and a `discordId` on the demo employee (`prisma/seed.ts`) ([#1](https://github.com/Aguynamedkent7/Veent_HRIS/issues/1))

### 10.2 Discord time tracking

- [x] T131 Manila (UTC+8) helpers in `src/lib/utils/dates.ts` (`manilaDayKey`, `manilaDayStart`, `manilaWeekStart`, `manilaWeekEnd`)
- [x] T132 HMAC sign/verify with replay window in `src/lib/server/hmac.ts`
- [x] T133 `src/lib/server/services/timelog.ts` — `recordPunch`, `listPunches`, `pairPunchesToDailyHours` (pure), `aggregateTimeLogsToTimesheet`
- [x] T134 HMAC-authed `POST src/routes/api/v1/timesheets/log/+server.ts`
- [x] T135 [P] Standalone `scripts/discord-bot.ts` (persistent Clock In/Out buttons) + `scripts/README.md` + `.env.example` + `package.json` `bot` script + `discord.js` dependency
- [x] T136 [P] Unit tests `tests/unit/hmac.test.ts`, `tests/unit/timelog-aggregate.test.ts`
- [x] T137 `GET /api/v1/timesheets/[employeeId]/punches` route (list raw punches; owner/manager/HR) ([#2](https://github.com/Aguynamedkent7/Veent_HRIS/issues/2))
- [x] T138 `POST /api/v1/timesheets/aggregate` route wrapping `aggregateTimeLogsToTimesheet` (HR_ADMIN+) ([#3](https://github.com/Aguynamedkent7/Veent_HRIS/issues/3))
- [x] T139 HR "Time Logs → Timesheet" review UI on `(app)/timesheets` — per-PHT-day punch table with computed hours + warnings, an "Aggregate week" action, inline edit of `TimesheetEntry.hoursWorked`, then Approve via existing flow ([#4](https://github.com/Aguynamedkent7/Veent_HRIS/issues/4))
- [x] T140 [P] Employee read-only punch view + `discordId` field in the employee profile / onboarding forms ([#5](https://github.com/Aguynamedkent7/Veent_HRIS/issues/5))
- [x] T141 [P] Bot production hardening (pm2/systemd unit) and optional slash-command fallback — docs only for now ([#6](https://github.com/Aguynamedkent7/Veent_HRIS/issues/6))
- [x] T142 [P] E2E: signed punch → aggregate → approve happy path (`tests/e2e/`) ([#7](https://github.com/Aguynamedkent7/Veent_HRIS/issues/7))

### 10.3 Benefits Administration

- [x] T143 Service `src/lib/server/services/benefits.ts` (plans + enrollments CRUD, audited)
- [x] T144 Scaffold `(app)/benefits/+page.{server.ts,svelte}` (plan list + create; HR_ADMIN+) and nav entry
- [x] T145 REST routes `src/routes/api/v1/benefits/plans/+server.ts` (+ `[id]`) and `.../enrollments/+server.ts` (+ `[id]`) ([#8](https://github.com/Aguynamedkent7/Veent_HRIS/issues/8))
- [x] T146 Enrollment management UI (enroll employee, change status, coverage level) ([#9](https://github.com/Aguynamedkent7/Veent_HRIS/issues/9))
- [x] T147 [P] Employee "My Benefits" read-only view (`(app)/benefits/me` or profile section) ([#10](https://github.com/Aguynamedkent7/Veent_HRIS/issues/10))
- [x] T148 [P] Optional: fold employee benefit costs into payroll deductions ([#11](https://github.com/Aguynamedkent7/Veent_HRIS/issues/11))

### 10.4 Performance Management

- [x] T149 Service `src/lib/server/services/performance.ts` (cycles, reviews, goals, audited)
- [x] T150 Scaffold `(app)/performance/+page.{server.ts,svelte}` (my goals + reviews; create/update goal) and nav entry
- [x] T151 REST routes under `src/routes/api/v1/performance/` (cycles, reviews, goals) ([#12](https://github.com/Aguynamedkent7/Veent_HRIS/issues/12))
- [x] T152 Review detail page `(app)/performance/reviews/[id]` with self-assessment and manager-review forms + acknowledge step ([#13](https://github.com/Aguynamedkent7/Veent_HRIS/issues/13))
- [x] T153 Cycle management UI for HR (create/activate/close cycles, open reviews for a cycle) ([#14](https://github.com/Aguynamedkent7/Veent_HRIS/issues/14))
- [x] T154 [P] Manager view of direct reports' reviews and goals ([#15](https://github.com/Aguynamedkent7/Veent_HRIS/issues/15))

### 10.5 Settings & Org Structure

- [x] T155 Service `src/lib/server/services/settings/org.ts` (positions, org chart, `setUserRole` with guardrails, audited)
- [x] T156 Scaffold `(app)/settings/org/+page.*` (positions + org list; HR_ADMIN+) and `(app)/settings/roles/+page.*` (role management; SUPER_ADMIN) + nav entries
- [x] T157 REST routes under `src/routes/api/v1/settings/` (positions, org-chart, users/role) ([#16](https://github.com/Aguynamedkent7/Veent_HRIS/issues/16))
- [x] T158 Interactive org-chart visualization (tree with reporting lines) rather than the flat list ([#17](https://github.com/Aguynamedkent7/Veent_HRIS/issues/17))
- [x] T159 [P] Position edit UI + employee ↔ position assignment (in employee detail/onboarding) ([#18](https://github.com/Aguynamedkent7/Veent_HRIS/issues/18))
- [x] T160 [P] Last-super-admin guardrail on role changes; optional per-user permission overrides ([#19](https://github.com/Aguynamedkent7/Veent_HRIS/issues/19))

---

## Phase 11: Full HRIS & Payroll Expansion (HR requirements, FR-047–FR-076)

**Status**: requirements captured (spec.md FR-047–FR-076, data-model "Phase 11 — Proposed Entities").
All items below are **not started**. The large epics (Payroll, Attendance, Requests) each warrant
their own `/speckit-plan` pass before task breakdown — this is a module-level backlog, not final tasks.

### 11.1 Foundations (do first — many epics depend on these)

- [x] T161 Add `Role` values `PAYROLL_OFFICER`, `FINANCE`; extend RBAC + nav gating + role-management UI (FR-073/074) ([#20](https://github.com/Aguynamedkent7/Veent_HRIS/issues/20))
- [x] T162 File uploads: storage strategy + `EmployeeDocument`/supporting-docs (contracts, IDs) (FR-049/056/071/072) ([#21](https://github.com/Aguynamedkent7/Veent_HRIS/issues/21))
- [x] T163 Settings master data: company info, salary structures, work schedules, payroll cutoffs, earnings/deduction codes (FR-075) ([#22](https://github.com/Aguynamedkent7/Veent_HRIS/issues/22))

### 11.2 Employee 201 File (FR-047–FR-051)

- [x] T164 Emergency contacts, bank/GCash details (sensitive, HR-only), document uploads on the employee record ([#23](https://github.com/Aguynamedkent7/Veent_HRIS/issues/23))
- [x] T165 Assign Position + Work Schedule to employees; surface employment history from the audit trail ([#24](https://github.com/Aguynamedkent7/Veent_HRIS/issues/24))

### 11.3 Attendance engine (FR-052–FR-055) — needs a plan pass

- [x] T166 `AttendanceDay` derivation from `TimeLog` + `WorkSchedule` (late/undertime/OT/night-diff/breaks/missing), PHT-aware
- [x] T167 HR attendance-review workflow: flag no-time-in / incomplete, correct, and per-period **lock** before payroll

### 11.4 Requests & multi-stage approvals (FR-056–FR-059) — needs a plan pass

- [x] T168 Generalize `LeaveRequest` → `Request` (7 types) with typed payloads + supporting docs (Employee Kiosk) ([#25](https://github.com/Aguynamedkent7/Veent_HRIS/issues/25))
- [x] T169 Configurable multi-stage routing (`ApprovalStep`: Employee→Supervisor→HR→Payroll) with Approve/Reject/Return; auto-apply approved requests to attendance/payroll ([#26](https://github.com/Aguynamedkent7/Veent_HRIS/issues/26))

### 11.5 Payroll expansion (FR-060–FR-066) — needs a plan pass (largest epic)

- [x] T170 `PayrollPeriod` lifecycle (create→import→review→generate→lock→release) replacing/wrapping `PayrollRun`
- [x] T171 Earnings engine: OT, night diff, holiday pay, rest-day pay, allowances, incentives (`PayrollEarning`)
- [x] T172 Deductions engine: loans + amortization, cash advances (`Loan`/`CashAdvance`/`PayrollDeduction`) atop statutory
- [x] T173 Payslip release gating + immutability on lock (FR-063)
- [x] T174 Payroll Calculator (what-if preview, non-persisting) (FR-066)
- [ ] T175 [P] _(integration, deferred)_ Disbursement: bank-file export / GCash (FR-065) ([#27](https://github.com/Aguynamedkent7/Veent_HRIS/issues/27))

### 11.6 Reports (FR-067)

- [x] T176 Payroll register, payslips, tardiness, overtime, loan summary, government/BIR reports (required layouts) + exports ([#28](https://github.com/Aguynamedkent7/Veent_HRIS/issues/28))

### 11.7 Recruitment & onboarding (FR-068–FR-071)

- [x] T177 Interview scheduling + notes; issue offers; offer→onboarding transition ([#29](https://github.com/Aguynamedkent7/Veent_HRIS/issues/29))
- [x] T178 Onboarding checklist (contract upload, account gen, payroll registration, start attendance) ([#30](https://github.com/Aguynamedkent7/Veent_HRIS/issues/30))
- [ ] T179 [P] _(integration, deferred)_ Publish postings to external job boards (FR-070) ([#31](https://github.com/Aguynamedkent7/Veent_HRIS/issues/31))

### 11.8 Separation (FR-072)

- [x] T180 `SeparationRecord` + clearance checklist + exit docs + final-pay computation + separation report ([#32](https://github.com/Aguynamedkent7/Veent_HRIS/issues/32))

### 11.9 Dashboard & comms (FR-076)

- [x] T181 Add attendance summary + payroll status + employees-currently-on-leave tile to the HR dashboard ([#33](https://github.com/Aguynamedkent7/Veent_HRIS/issues/33))
- [x] T182 [P] Announcements + notifications (`Announcement`/`Notification`) ([#34](https://github.com/Aguynamedkent7/Veent_HRIS/issues/34))

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — **blocks all user stories**
- **US1 (Phase 3)**: Depends on Phase 2; no dependency on US2, US3, US4, US5, US6
- **US2 (Phase 4)**: Depends on Phase 2; no dependency on other stories
- **US3 (Phase 5)**: Depends on Phase 2; requires US1 to have SUBMITTED timesheets/leave available (use seeded data)
- **US4 (Phase 6)**: Depends on Phase 2; requires APPROVED timesheets (US3 or seeded approvals)
- **US5 (Phase 7)**: Depends on Phase 2; best tested after US1–US4 produce operational data
- **US6 (Phase 8)**: Depends on Phase 2 + US2 (`employees.create` is reused in conversion)
- **Polish (Phase 9)**: Depends on all user story phases

### User Story Independence

- **US1 (P1)**: Can start after Phase 2 — no story dependencies
- **US2 (P2)**: Can start after Phase 2 — no story dependencies
- **US3 (P3)**: Can start after Phase 2 — uses seeded timesheets/leave for approval testing
- **US4 (P4)**: Can start after Phase 2 — uses seeded approved timesheets for payroll
- **US5 (P5)**: Can start after Phase 2 — uses seeded data for dashboard/report testing
- **US6 (P6)**: Can start after Phase 2 — conversion calls `employees.create` (implement US2 service first if parallelising)

### Within Each Story

- Service functions before route handlers
- Components (marked [P]) can be built alongside services
- API routes (marked [P]) can be built in parallel with page routes

### Parallel Opportunities

All [P]-marked tasks within a phase can run concurrently (they touch different files). Cross-story [P] tasks can run across phases once the foundational phase is complete.

---

## Implementation Strategy

### MVP First (US1 — Employee Self-Service Only)

1. Complete Phase 1 (Setup)
2. Complete Phase 2 (Foundational) — CRITICAL gate
3. Complete Phase 3 (US1) — T031–T046
4. **STOP AND VALIDATE**: employee logs in, submits timesheet, files leave, views profile
5. Demo / deploy MVP

### Incremental Delivery

1. Setup + Foundational → working auth, RBAC, audit log
2. US1 → employee self-service functional → MVP ✅
3. US2 → HR Admin can manage employees
4. US3 → Manager approvals activate US1 workflows
5. US4 → Payroll unlocked (depends on approved timesheets from US3)
6. US5 → Dashboard and reports operational
7. US6 → Recruitment pipeline
8. Polish → hardening, E2E tests, caching

### Parallel Team Strategy

With multiple developers (after Phase 2 complete):

- Developer A: US1 (Employee Self-Service)
- Developer B: US2 (HR Admin Employee Management)
- Developer C: US6 (Recruitment — independent of US3–US5)
- Once US1+US3 done → Developer D: US4 (Payroll)
- Once data exists → Developer E: US5 (Dashboard/Reports)

---

## Notes

- [P] = different files, no incomplete dependencies — safe to parallelise
- [USN] label maps each task to its user story for traceability
- Tests (T071) MUST be written and FAIL before T070 implementation
- Commit after each phase checkpoint
- `src/lib/server/` files are never bundled to the client (SvelteKit enforces this)
- Never import from `$lib/server/` in `.svelte` files or client-side `+page.ts` files
- Run `npx prisma generate` after any schema change before starting the dev server
