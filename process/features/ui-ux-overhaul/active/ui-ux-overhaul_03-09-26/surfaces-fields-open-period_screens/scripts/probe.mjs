import { session, go } from './lib.mjs'

const MARKER = 'PROBE open-period 15-09-26'
const START = '2031-02-02'
const END = '2031-02-08'
const log = (...a) => console.log(new Date().toISOString(), ...a)

const { browser, page } = await session()
const posts = []
page.on('request', (r) => {
	if (r.method() === 'POST' && r.url().includes('/open')) posts.push({ url: r.url(), t: Date.now() })
})
const responses = []
page.on('response', async (r) => {
	if (r.request().method() === 'POST' && r.url().includes('/open')) {
		let body = ''
		try {
			body = await r.text()
		} catch {}
		responses.push({ status: r.status(), body: body.slice(0, 400) })
	}
})

await go(page, '/payroll/periods', 'light')
const trigger = page.getByRole('button', { name: 'Open Period', exact: true })
const dialog = page.getByRole('dialog', { name: 'Open a Payroll Period' })
const submit = dialog.getByRole('button', { name: 'Open', exact: true })
const redBlock = () => page.locator('main .border-destructive, main [class*="bg-destructive/10"]').count()
const toasts = () => page.locator('[role="status"][aria-live="polite"] > *').allInnerTexts()

await trigger.click()
await dialog.waitFor()
await page.waitForTimeout(300)
posts.length = 0
await submit.click()
await page.waitForTimeout(800)
const s1 = await page.evaluate(() => {
	const n = document.querySelector('#name')
	return { validationMessage: n.validationMessage, valueMissing: n.validity.valueMissing, focused: document.activeElement === n }
})
log('STEP1 empty name', JSON.stringify({ ...s1, postsToOpen: posts.length, dialogVisible: await dialog.isVisible() }))

await page.locator('#name').fill(MARKER)
await dialog.getByRole('button', { name: 'Custom range' }).click()
await dialog.getByLabel('Start date').fill(START)
await dialog.getByLabel('End date').fill(END)
await page.waitForTimeout(200)
const pre = await page.evaluate(() => ({
	err: document.querySelector('#pp-custom-error')?.textContent ?? null,
	start: document.querySelector('form[action="?/open"] input[name="start"]')?.value,
	end: document.querySelector('form[action="?/open"] input[name="end"]')?.value
}))
log('STEP2 prefill', JSON.stringify(pre))

const month = dialog.getByLabel('Month')
const hasMonth = await month.count()
if (hasMonth) {
	await dialog.getByRole('button', { name: 'First half (1–15)' }).click().catch(() => {})
}
const e4target = (await dialog.getByLabel('Month').count()) ? dialog.getByLabel('Month') : dialog.locator('select').first()
const e4tag = await e4target.evaluate((e) => `${e.tagName}#${e.id}`)
await e4target.click()
await page.waitForTimeout(300)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
log('STEP E4 select popup Escape', JSON.stringify({ select: e4tag, dialogStillOpen: await dialog.isVisible(), focused: await page.evaluate(() => `${document.activeElement?.tagName}#${document.activeElement?.id}`) }))
if (!(await dialog.isVisible())) {
	await trigger.click()
	await dialog.waitFor()
	await page.locator('#name').fill(MARKER)
}
await dialog.getByRole('button', { name: 'Custom range' }).click()
await dialog.getByLabel('Start date').fill(START)
await dialog.getByLabel('End date').fill(END)
await page.waitForTimeout(200)

posts.length = 0
responses.length = 0
const liveSamples = new Set()
const sampler = setInterval(async () => {
	try {
		for (const t of await toasts()) liveSamples.add(t.replace(/\s+/g, ' ').trim())
	} catch {}
}, 150)
await submit.click()
await page.waitForTimeout(4000)
clearInterval(sampler)
log('STEP3 success', JSON.stringify({
	responses,
	posts: posts.length,
	dialogVisible: await dialog.isVisible(),
	toastsSeen4s: [...liveSamples],
	markerRow: await page.locator('main table tr', { hasText: MARKER }).count(),
	redBlock: await redBlock(),
	focusAfterClose: await page.evaluate(() => `${document.activeElement?.tagName} "${document.activeElement?.textContent?.trim().slice(0, 20)}"`), triggerFocused: await trigger.evaluate((e) => e === document.activeElement)
}))

if (await dialog.isVisible()) {
	log('STEP3 NOTE dialog still open after success submit; closing with Escape')
	await page.keyboard.press('Escape')
	await page.waitForTimeout(400)
}
await page.waitForTimeout(6000)
responses.length = 0
await trigger.click()
await dialog.waitFor()
await page.locator('#name').fill(MARKER)
await dialog.getByRole('button', { name: 'Custom range' }).click()
await dialog.getByLabel('Start date').fill(START)
await dialog.getByLabel('End date').fill(END)
await page.waitForTimeout(200)
const dupSamples = new Set()
const s2 = setInterval(async () => {
	try {
		for (const t of await toasts()) dupSamples.add(t.replace(/\s+/g, ' ').trim())
	} catch {}
}, 150)
await submit.click()
await page.waitForTimeout(2500)
clearInterval(s2)
log('STEP4 duplicate', JSON.stringify({
	responses,
	dialogVisible: await dialog.isVisible(),
	toasts: [...dupSamples],
	values: await page.evaluate(() => ({
		name: document.querySelector('#name')?.value,
		start: document.querySelector('form[action="?/open"] input[name="start"]')?.value,
		end: document.querySelector('form[action="?/open"] input[name="end"]')?.value,
		startField: document.querySelector('[role=dialog] input[type=date]')?.value
	})),
	redBlock: await redBlock(),
	markerRows: await page.locator('main table tr', { hasText: MARKER }).count()
}))

await page.keyboard.press('Escape')
await page.waitForTimeout(400)
log('STEP5a Escape', JSON.stringify({ dialogCount: await dialog.count(), triggerFocused: await trigger.evaluate((e) => e === document.activeElement) }))
await trigger.click()
await dialog.waitFor()
const reopenedEmpty = await page.locator('#name').inputValue()
await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
await page.waitForTimeout(400)
log('STEP5b Cancel', JSON.stringify({ reopenedNameValue: reopenedEmpty, dialogCount: await dialog.count(), triggerFocused: await trigger.evaluate((e) => e === document.activeElement) }))

await browser.close()
