import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'

vi.mock('$app/forms', () => ({ enhance: () => ({}) }))

const Page = (await import('../../src/routes/(app)/employees/new/+page.svelte')).default

const data = {
	departments: [],
	employees: [],
	positions: [],
	workSchedules: [],
	organizationId: 'org1'
}

const renderPage = (form: unknown) =>
	render(Page, { props: { data, form } as never }).body.replace(/<!--[\s\S]*?-->/g, '')

const FIELDS: [string, string][] = [
	['firstName', 'First Name'],
	['lastName', 'Last Name'],
	['middleName', 'Middle Name'],
	['contactPhone', 'Phone'],
	['contactAddress', 'Address'],
	['email', 'Email'],
	['password', 'Password'],
	['role', 'Role'],
	['discordId', 'Discord ID'],
	['departmentId', 'Department'],
	['jobTitle', 'Job Title'],
	['employmentType', 'Employment Type'],
	['startDate', 'Start Date'],
	['rateType', 'Rate Basis'],
	['basicMonthlySalary', 'Basic Monthly Salary (PHP)'],
	['reportsToId', 'Reports To'],
	['positionId', 'Position'],
	['workScheduleId', 'Work Schedule'],
	['sssNumber', 'SSS Number'],
	['philhealthNumber', 'PhilHealth Number'],
	['pagibigNumber', 'Pag-IBIG Number'],
	['tinNumber', 'TIN Number'],
	['emergencyContactName', 'Contact Name'],
	['emergencyContactRelation', 'Relationship'],
	['emergencyContactPhone', 'Contact Phone'],
	['bankName', 'Bank'],
	['bankAccountName', 'Account Name'],
	['bankAccountNumber', 'Account Number'],
	['gcashNumber', 'GCash Number']
]

const controlTag = (html: string, id: string) =>
	html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${id}"[^>]*>`))?.[0]

describe('employees/new fields', () => {
	it('a. keeps every label for, id, name and label text', () => {
		const html = renderPage(null)
		expect(html.match(/<label for="/g)).toHaveLength(FIELDS.length)
		for (const [id, text] of FIELDS) {
			const label = html.match(new RegExp(`<label for="${id}"[^>]*>([\\s\\S]*?)</label>`))
			expect(label, id).not.toBeNull()
			expect(label![1].replace(/<[^>]+>/g, ''), id).toContain(text)
			expect(controlTag(html, id), id).toBeDefined()
			expect(html, id).toContain(`name="${id}"`)
		}
	})

	it('b. links each field error to its control', () => {
		const html = renderPage({
			fieldErrors: { firstName: ['Required'], sssNumber: ['Bad'], contactPhone: ['Invalid phone'] },
			values: {}
		})
		expect(controlTag(html, 'firstName')).toContain('aria-describedby="firstName-error"')
		expect(html).toContain('<p id="firstName-error"')

		const phone = controlTag(html, 'contactPhone')
		expect(phone).toContain('aria-describedby="contactPhone-error"')
		expect(phone).toContain('aria-invalid="true"')
		expect(html).toMatch(/<p id="contactPhone-error"[^>]*>Invalid phone<\/p>/)

		expect(html).toMatch(/<details[^>]*\bopen/)

		const sssClass = html.match(/<p id="sssNumber-error" class="([^"]*)"/)?.[1]
		expect(sssClass).toContain('text-destructive')
		expect(sssClass).not.toContain('text-red-400')
	})

	it('c. sets no error wiring without a form result', () => {
		const html = renderPage(null)
		expect(html).not.toMatch(/aria-describedby="[^"]*-error/)
		expect(html).not.toContain('aria-invalid')
	})
})
