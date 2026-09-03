import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { MAX_IMPORT_BYTES } from '$lib/server/services/attendance/import'

/**
 * #200 — the gates on the `?/importBacklog` form action.
 *
 * These assert against the `actions` EXPORT, not a copy of the handler body. #290 was shipped on
 * an assertion that read the handler body while the real export was a different function; the
 * export is the only thing SvelteKit calls, so it is the only thing worth asserting on.
 *
 * The service is mocked here on purpose: this file proves the guard runs BEFORE the service, and
 * that a refusal never reaches it at all. What the service then does is
 * `attendance-backlog-import.test.ts`'s job.
 */

const { importBacklogCsv, dbMock } = vi.hoisted(() => ({
	importBacklogCsv: vi.fn().mockResolvedValue({
		applied: 1,
		skippedDuplicate: 0,
		rejected: [],
		punchesWritten: 4
	}),
	dbMock: { employee: { findMany: vi.fn(), findUnique: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
// Keep the real constants (MAX_IMPORT_BYTES is what the action's own cap compares against) and
// stub only the write path.
vi.mock('$lib/server/services/attendance/import', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/services/attendance/import')>()),
	importBacklogCsv
}))

const { actions } = await import('../../src/routes/(app)/attendance/+page.server')

const JOJO = 'org_jojo'
const VEENT = 'org_veent' // not food-service

/** A real `File`, because the action's first check is `file instanceof File`. `text` is spied so
 *  "the body was never read" is directly assertable (E4). */
function csvFile(name: string, body: string, size?: number) {
	const file = new File([body], name, { type: 'text/csv' })
	if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
	vi.spyOn(file, 'text')
	return file
}

const event = (org: string, file: File | null, roles: Role[] = ['HR_ADMIN']) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				if (file) fd.set('backlog', file)
				return fd
			}
		},
		locals: { user: { id: 'user1', organizationId: org, roles } },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

const GOOD =
	'employeeNumber,date,amIn,amOut,pmIn,pmOut\nJJ-001,2026-08-10,08:00,11:00,13:00,17:00\n'

beforeEach(() => vi.clearAllMocks())

describe('B13/B14/B15 — the import action carries both gates', () => {
	it('B13 a role without MANAGE_HR is refused 403 and never reaches the service', async () => {
		await expect(
			actions.importBacklog!(event(JOJO, csvFile('b.csv', GOOD), ['EMPLOYEE']))
		).rejects.toMatchObject({ status: 403 })
		expect(importBacklogCsv).not.toHaveBeenCalled()
	})

	it('B14 HR in a non-food-service org is refused 404 and never reaches the service', async () => {
		// The negative control for criterion 20: for Veent this feature genuinely does not exist,
		// and the `{#if}` around the upload form is cosmetic — a direct POST lands here.
		await expect(
			actions.importBacklog!(event(VEENT, csvFile('b.csv', GOOD)))
		).rejects.toMatchObject({ status: 404 })
		expect(importBacklogCsv).not.toHaveBeenCalled()
	})

	it('B15 HR in a food-service org reaches the service with the session org and the file', async () => {
		const res = await actions.importBacklog!(event(JOJO, csvFile('backlog.csv', GOOD)))
		expect(importBacklogCsv).toHaveBeenCalledTimes(1)
		const [org, file, ctx] = importBacklogCsv.mock.calls[0]
		expect(org).toBe(JOJO)
		expect(file).toMatchObject({ name: 'backlog.csv', text: GOOD })
		expect(ctx).toMatchObject({ organizationId: JOJO, actorId: 'user1' })
		expect(res).toMatchObject({ imported: { applied: 1, punchesWritten: 4 } })
	})

	it('the org is taken from the session, never from the form', async () => {
		const ev = event(JOJO, csvFile('b.csv', GOOD))
		ev.request.formData = async () => {
			const fd = new FormData()
			fd.set('backlog', csvFile('b.csv', GOOD))
			fd.set('organizationId', VEENT)
			return fd
		}
		await actions.importBacklog!(ev)
		expect(importBacklogCsv.mock.calls[0][0]).toBe(JOJO)
	})
})

describe('B16 — the caps bound the work before it happens (E4)', () => {
	it('the documented cap is 2 MB', () => {
		expect(MAX_IMPORT_BYTES).toBe(2 * 1024 * 1024)
	})

	it('refuses an oversize upload with 413 without ever reading the body', async () => {
		// LITERAL 3 MB, not `MAX_IMPORT_BYTES + 1`: a fixture sized off the constant moves both sides
		// of the comparison, so raising the cap would keep this green and prove nothing.
		const file = csvFile('big.csv', GOOD, 3 * 1024 * 1024)
		const res = (await actions.importBacklog!(event(JOJO, file))) as {
			status: number
			data: { error: string }
		}
		expect(res.status).toBe(413)
		expect(res.data.error).toBe('Backlog file exceeds the 2 MB limit')
		// The whole point of E4: the size check must precede `await file.text()`, or the cap is
		// paid for after the memory it exists to save has already been spent.
		expect(file.text).not.toHaveBeenCalled()
		expect(importBacklogCsv).not.toHaveBeenCalled()
	})

	it('refuses a non-.csv upload with 415 without ever reading the body', async () => {
		const file = csvFile('punches.xlsx', GOOD)
		const res = (await actions.importBacklog!(event(JOJO, file))) as {
			status: number
			data: { error: string }
		}
		expect(res.status).toBe(415)
		expect(res.data.error).toBe('Only .csv files are accepted')
		expect(file.text).not.toHaveBeenCalled()
		expect(importBacklogCsv).not.toHaveBeenCalled()
	})

	it('accepts a .CSV in any case', async () => {
		await actions.importBacklog!(event(JOJO, csvFile('BACKLOG.CSV', GOOD)))
		expect(importBacklogCsv).toHaveBeenCalledTimes(1)
	})

	it('refuses an empty or missing file with 400', async () => {
		const missing = (await actions.importBacklog!(event(JOJO, null))) as { status: number }
		expect(missing.status).toBe(400)
		const empty = (await actions.importBacklog!(event(JOJO, csvFile('b.csv', '')))) as {
			status: number
		}
		expect(empty.status).toBe(400)
		expect(importBacklogCsv).not.toHaveBeenCalled()
	})

	it('surfaces a service-thrown 413/415 as a form message rather than a 500', async () => {
		// The action's own caps are the first layer; this pins the `toFail` allow-list widening that
		// carries the SERVICE's refusals (any future caller path) back to the operator.
		importBacklogCsv.mockRejectedValueOnce({
			status: 415,
			body: { message: 'Only .csv files are accepted' }
		})
		const res = (await actions.importBacklog!(event(JOJO, csvFile('b.csv', GOOD)))) as {
			status: number
			data: { error: string }
		}
		expect(res.status).toBe(415)
		expect(res.data.error).toBe('Only .csv files are accepted')
	})
})
