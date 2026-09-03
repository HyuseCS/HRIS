import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

// #283 / AC-3: the role picker assigns a SET. The seeded two-hat account
// (verifier.approver@veent.ph = VERIFIER + APPROVER) is the only multi-role row in the
// seed, so it is the one row that can catch a picker that silently keeps a single role.
//
// Both branches of the row are asserted, because they are two renderings of the same
// fact and drifting them is the failure mode: the dialog's checkboxes must BOTH be
// checked, and the table's read-only pills (all a caller without MANAGE_USER_ROLES ever
// sees) must list the same two roles.
//
// The picker now lives in a dialog rather than inline in the row, so every assertion on
// it is scoped to that dialog — a `roles` input found in the table would itself be a bug.

const TWO_HAT = USERS.twoHat.email

test('the picker prefills every held role, and the table lists the same set', async ({
	browser
}) => {
	// Two logins in separate contexts (CEO for the editable branch, Super Admin for the
	// read-only one) — the same cost the payroll chain spec pays.
	test.slow()

	// --- Editable branch: the CEO holds MANAGE_USER_ROLES, so the row offers Edit roles.
	const ceoCtx = await browser.newContext()
	const ceoPage = await ceoCtx.newPage()
	await login(ceoPage, USERS.ceo)
	await ceoPage.goto('/settings/roles', { waitUntil: 'domcontentloaded' })

	const twoHatRow = ceoPage.locator('tr', { hasText: TWO_HAT })
	// The cell is a read display: pills, and no control of any kind.
	await expect(twoHatRow.getByText('Verifier', { exact: true })).toBeVisible()
	await expect(twoHatRow.getByText('Approver', { exact: true })).toBeVisible()
	await expect(twoHatRow.locator('input[name="roles"]')).toHaveCount(0)

	const trigger = twoHatRow.getByRole('button', { name: 'Edit roles' })
	await trigger.click()

	const dialog = ceoPage.getByRole('dialog', { name: 'Edit roles' })
	await expect(dialog).toBeVisible()
	// Both, not one: a picker that collapsed the set would still render one checked box. Reading
	// the inputs rather than the pill styling — the checkbox IS what gets posted.
	await expect(dialog.locator('input[name="roles"]:checked')).toHaveCount(2)
	await expect(dialog.locator('input[name="roles"][value="VERIFIER"]')).toBeChecked()
	await expect(dialog.locator('input[name="roles"][value="APPROVER"]')).toBeChecked()
	// The summary states the count, so nobody has to count checkboxes.
	await expect(dialog.getByText('2 roles', { exact: true })).toBeVisible()

	// The separation-of-duties note is ADVISORY. This user is exactly the overlap it describes
	// (VERIFY_REQUESTS × APPROVE_SIGNOFF), so it must show — and it must not disable the save.
	const sod = dialog.getByText(/verify and approve the same request/)
	await expect(sod).toBeVisible()
	const save = dialog.getByRole('button', { name: 'Save roles' })
	// Disabled right now only because nothing changed yet. Dirty the selection without removing
	// either sign-off hat: the note stays, and Save becomes available anyway.
	await expect(save).toBeDisabled()
	// Locate the option by the value it posts, not by its text: `hasText` is a case-insensitive
	// substring match, and "employee" appears inside three other roles' descriptions.
	await dialog.locator('label:has(input[value="EMPLOYEE"])').click()
	await expect(sod).toBeVisible()
	await expect(save).toBeEnabled()

	// Escape abandons it — and focus goes back to the control that opened it, not to the top
	// of the document.
	await ceoPage.keyboard.press('Escape')
	await expect(dialog).toHaveCount(0)
	await expect(trigger).toBeFocused()
	// The abandoned selection must not leak into the table behind the dialog.
	await expect(twoHatRow.getByText('Employee', { exact: true })).toHaveCount(0)

	// The CEO's own row cannot be edited (no self-role-change), so it offers no control at all —
	// but it still renders its roles.
	const ownRow = ceoPage.locator('tr', { hasText: USERS.ceo.email })
	await expect(ownRow.getByText('CEO', { exact: true })).toBeVisible()
	await expect(ownRow.getByRole('button', { name: 'Edit roles' })).toHaveCount(0)
	await ceoCtx.close()

	// --- Read-only branch for the SAME user: the Super Admin manages account status but not
	// roles, so no row offers editing. This is where the two renderings must agree.
	const adminCtx = await browser.newContext()
	const adminPage = await adminCtx.newPage()
	await login(adminPage, USERS.admin)
	await adminPage.goto('/settings/roles', { waitUntil: 'domcontentloaded' })

	const twoHatReadOnly = adminPage.locator('tr', { hasText: TWO_HAT })
	await expect(twoHatReadOnly.getByRole('button', { name: 'Edit roles' })).toHaveCount(0)
	// Same two roles, same labels as the dialog — a row must not appear to hold different roles
	// depending on who is looking at it.
	await expect(twoHatReadOnly.getByText('Verifier', { exact: true })).toBeVisible()
	await expect(twoHatReadOnly.getByText('Approver', { exact: true })).toBeVisible()
	await adminCtx.close()
})
