import { session, go } from './lib.mjs'
import fs from 'fs'
import { fileURLToPath } from 'url'
const DIR = fileURLToPath(new URL('..', import.meta.url))
fs.mkdirSync(DIR, { recursive: true })
const pages = [
	['settings-roles', '/settings/roles'],
	['employees', '/employees'],
	['employees-id', '/employees/cmtmavavm001a4l32oqt2o24f'],
	['payroll-periods', '/payroll/periods'],
	['payroll-periods-dialog', '/payroll/periods', true],
	['payroll', '/payroll'],
	['reports-audit-log', '/reports/audit-log']
]
const looks = [
	['employees-new', '/employees/new'],
	['recruitment-id-apply', '/recruitment/jp_seed_demo/apply'],
	['departments', '/departments'],
	['complaints', '/complaints']
]
const metrics = []
const shoot = async (page, name, path, theme, w, dialog) => {
	await go(page, path, theme)
	if (dialog) {
		await page.getByRole('button', { name: 'Open Period', exact: true }).click()
		await page.getByRole('dialog', { name: 'Open a Payroll Period' }).waitFor()
		await page.waitForTimeout(400)
	}
	const m = await page.evaluate(() => {
		const doc = { scrollW: document.documentElement.scrollWidth, vw: innerWidth }
		const panel = document.querySelector('[role="dialog"]')
		let dlg = null
		if (panel) {
			const pr = panel.getBoundingClientRect()
			const kids = [...panel.querySelectorAll('*')].map((e) => e.getBoundingClientRect()).filter((r) => r.width)
			const maxRight = Math.max(...kids.map((r) => r.right))
			const bd = panel.parentElement.getBoundingClientRect()
			dlg = { panelLeft: pr.left, panelRight: pr.right, panelW: pr.width, contentMaxRight: Math.round(maxRight), overflowsPanel: maxRight > pr.right + 0.5, panelScrollW: panel.scrollWidth, panelClientW: panel.clientWidth, backdropTop: bd.top, backdropH: bd.height, vh: innerHeight }
		}
		const clipped = [...document.querySelectorAll('main div.overflow-hidden')].map((c) => ({ c, sw: c.scrollWidth, cw: c.clientWidth, sh: c.scrollHeight, ch: c.clientHeight })).filter((x) => x.sw > x.cw + 1 || x.sh > x.ch + 1).map((x) => `${x.c.className.slice(0, 40)} sw${x.sw}/cw${x.cw} sh${x.sh}/ch${x.ch}`)
		const emptyPag = [...document.querySelectorAll('div[class*="has-[nav]"]')].map((d) => ({ nav: !!d.querySelector('nav'), h: d.getBoundingClientRect().height }))
		return { doc, dlg, clipped, emptyPag }
	})
	const file = `${name}_${theme}_${w}.png`
	await page.screenshot({ path: `${DIR}/${file}`, fullPage: !dialog })
	metrics.push({ file, ...m })
}
for (const [w, h] of [[1440, 900], [390, 844]]) {
	const { browser, page } = await session({ width: w, height: h })
	for (const theme of ['light', 'dark']) for (const [n, p, d] of pages) await shoot(page, n, p, theme, w, d)
	if (w === 1440) for (const [n, p] of looks) await shoot(page, n, p, 'light', w)
	await browser.close()
}
fs.writeFileSync(`${DIR}/shots-metrics.json`, JSON.stringify(metrics, null, 1))
for (const m of metrics) console.log(m.file, JSON.stringify({ over: m.doc.scrollW > m.doc.vw ? m.doc : 0, dlg: m.dlg, clipped: m.clipped, emptyPag: m.emptyPag }))
