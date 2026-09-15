import { session, go, installHelpers } from './lib.mjs'

const EMP = 'cmtmavavm001a4l32oqt2o24f'
const REQ = 'cmtmoggmv004hyt54sjptvza8'
const RUN = 'cmtmd2obl000711xpmqijsxm7'
const rows = []
const rec = (theme, page, check, value, target, pass) => rows.push({ theme, page, check, value, target, pass })

const { browser, page } = await session()

for (const theme of ['light', 'dark']) {
	await go(page, '/settings/roles', theme)
	const roles = await page.evaluate(() => {
		const { effBg, ratio, hex, edge, token, same } = window.__m
		const input = document.querySelector('#roles-q')
		const container = input.closest('div.overflow-hidden.rounded-lg.border.bg-card')
		const body = effBg(document.body)
		const cont = effBg(container)
		const e = edge(input)
		const thead = container.querySelector('thead')
		const th = thead.querySelector('th')
		const thColor = window.__m.parse(getComputedStyle(th).color)
		const pag = container.querySelector('div[class*="has-[nav]"]')
		return {
			selector: { found: !!container, containsTable: !!container?.querySelector('table'), containsForm: !!container?.querySelector('form'), inputId: input.id, tag: container.tagName },
			body: hex(body), card: hex(cont), cardIsToken: same(cont, token('bg-card')), bodyIsToken: same(body, token('bg-background')),
			edge: hex(e), edgeIsInputToken: same(e, token('bg-input')),
			inputCard: ratio(e, cont), inputBody: ratio(e, body), cardBody: ratio(cont, body),
			mutedOnHeader: ratio(thColor, effBg(thead)), thColor: hex(thColor), thead: hex(effBg(thead)),
			containerBorder: getComputedStyle(container).borderTopWidth,
			pagination: pag ? { hasNav: !!pag.querySelector('nav'), borderTop: getComputedStyle(pag).borderTopWidth, height: pag.getBoundingClientRect().height } : null
		}
	})
	rec(theme, '/settings/roles', 'body colour', roles.body, 'differs between themes', null)
	rec(theme, '/settings/roles', 'selector control: container holds #roles-q, form and table', JSON.stringify(roles.selector), 'found', roles.selector.found && roles.selector.containsTable && roles.selector.containsForm)
	rec(theme, '/settings/roles', 'container fill == --card token', `${roles.card} (${roles.cardIsToken})`, 'bg-card', roles.cardIsToken)
	rec(theme, '/settings/roles', 'container border-top-width', roles.containerBorder, '1px', roles.containerBorder === '1px')
	rec(theme, '/settings/roles', '#roles-q border == --input', `${roles.edge} (${roles.edgeIsInputToken})`, '--input', roles.edgeIsInputToken)
	rec(theme, '/settings/roles', 'input edge vs container', roles.inputCard, theme === 'light' ? '>=3 (plan 3.47)' : '>=3 (plan 3.34)', roles.inputCard >= 3)
	rec(theme, '/settings/roles', 'input edge vs body', roles.inputBody, theme === 'light' ? '>=3 (plan 3.15)' : '>=3 (plan 3.76)', roles.inputBody >= 3)
	rec(theme, '/settings/roles', 'container vs body', roles.cardBody, theme === 'light' ? 'info (plan 1.10)' : 'info (plan 1.12)', null)
	rec(theme, '/settings/roles', `muted <th> ${roles.thColor} on thead ${roles.thead} (bg-muted/50 over card)`, roles.mutedOnHeader, theme === 'light' ? '>=4.5 (plan 5.12)' : '>=4.5 (plan 5.04)', roles.mutedOnHeader >= 4.5)
	rec(theme, '/settings/roles', 'pagination wrapper', JSON.stringify(roles.pagination), 'border-top 1px if nav, else 0 height', roles.pagination ? (roles.pagination.hasNav ? roles.pagination.borderTop === '1px' : roles.pagination.height === 0) : null)

	await go(page, `/employees/${EMP}`, theme)
	const emp = await page.evaluate(() => {
		const { effBg, ratio, hex, edge, token, same, parse } = window.__m
		const upd = document.querySelector('form[action="?/update"]')
		const off = document.querySelector('form[action="?/offboard"]')
		const comp = document.querySelector('form[action="?/changeCompensation"]')
		const sec = [...document.querySelectorAll('div.rounded-lg.border.bg-card')].find((d) => d.tagName !== 'FORM')
		const card = token('bg-card')
		const field = upd?.querySelector('input:not([type=hidden]), select')
		const destr = token('bg-destructive/50')
		return {
			updFound: !!upd, updHeading: upd?.querySelector('h2')?.textContent.trim(),
			upd: upd ? hex(parse(getComputedStyle(upd).backgroundColor)) : null, updIsCard: upd ? same(parse(getComputedStyle(upd).backgroundColor), card) : null,
			sec: sec ? hex(parse(getComputedStyle(sec).backgroundColor)) : null, secIsCard: sec ? same(parse(getComputedStyle(sec).backgroundColor), card) : null,
			comp: comp ? same(parse(getComputedStyle(comp).backgroundColor), card) : 'absent',
			offFound: !!off, offBg: off ? getComputedStyle(off).backgroundColor : null,
			offBorder: off ? getComputedStyle(off).borderTopColor : null, destr: `${destr.r},${destr.g},${destr.b},${destr.a}`,
			fieldTag: field ? `${field.tagName}#${field.id}` : null, fieldEdge: field ? ratio(edge(field), effBg(upd)) : null
		}
	})
	rec(theme, `/employees/[id]`, `Update Profile form (h2 "${emp.updHeading}") fill == card`, `${emp.upd} (${emp.updIsCard})`, 'bg-card', emp.updIsCard)
	rec(theme, `/employees/[id]`, 'neighbouring bg-card section fill', `${emp.sec} (${emp.secIsCard})`, 'bg-card', emp.secIsCard)
	rec(theme, `/employees/[id]`, 'Change Salary form fill == card', String(emp.comp), 'bg-card or absent', emp.comp === true || emp.comp === 'absent')
	rec(theme, `/employees/[id]`, 'Offboard form background', `${emp.offFound ? emp.offBg : 'absent'}`, 'transparent', emp.offFound ? /rgba\(0, 0, 0, 0\)/.test(emp.offBg) : null)
	rec(theme, `/employees/[id]`, 'Offboard border colour', `${emp.offBorder} (token destructive/50 ${emp.destr})`, 'destructive/50', null)
	rec(theme, `/employees/[id]`, `field ${emp.fieldTag} edge vs Update Profile card`, emp.fieldEdge, '>=3', emp.fieldEdge >= 3)

	await go(page, '/employees', theme)
	const emps = await page.evaluate(() => {
		const { effBg, ratio, hex, token, same, parse } = window.__m
		const p = document.querySelector('main p.max-w-2xl.text-sm.text-muted-foreground')
		const cont = document.querySelector('main div.overflow-hidden.rounded-lg.border.bg-card')
		const tw = cont?.querySelector('table')?.parentElement
		const pag = cont?.querySelector('div[class*="has-[nav]"]')
		return {
			pText: p?.textContent.trim().slice(0, 40), pRatio: p ? ratio(parse(getComputedStyle(p).color), effBg(p)) : null,
			cont: !!cont, contForm: !!cont?.querySelector('form'), contTable: !!cont?.querySelector('table'),
			contBorder: cont ? getComputedStyle(cont).borderTopWidth : null, contCard: cont ? same(parse(getComputedStyle(cont).backgroundColor), token('bg-card')) : null,
			twBorder: tw ? getComputedStyle(tw).borderTopWidth + '/' + getComputedStyle(tw).borderLeftWidth : null,
			pag: pag ? { hasNav: !!pag.querySelector('nav'), borderTop: getComputedStyle(pag).borderTopWidth, h: pag.getBoundingClientRect().height } : null
		}
	})
	rec(theme, '/employees', `PageHeader description "${emps.pText}" on body`, emps.pRatio, theme === 'light' ? '>=4.5 (plan 4.82)' : '>=4.5 (plan 5.93)', emps.pRatio >= 4.5)
	rec(theme, '/employees', 'LIST-SHAPE container holds form+table, 1px, bg-card', JSON.stringify({ c: emps.cont, f: emps.contForm, t: emps.contTable, b: emps.contBorder, card: emps.contCard }), 'all true, 1px', emps.cont && emps.contForm && emps.contTable && emps.contBorder === '1px' && emps.contCard)
	rec(theme, '/employees', 'table wrapper own border', emps.twBorder, '0px/0px', emps.twBorder === '0px/0px')
	rec(theme, '/employees', 'pagination wrapper', JSON.stringify(emps.pag), 'border-top 1px if nav, else 0 height', emps.pag ? (emps.pag.hasNav ? emps.pag.borderTop === '1px' : emps.pag.h === 0) : null)

	for (const [path, label] of [['/team', '/team'], ['/leave/balances', '/leave/balances'], ['/reports/audit-log', '/reports/audit-log']]) {
		await go(page, path, theme)
		const r = await page.evaluate(() => {
			const { token, same, parse } = window.__m
			const cont = document.querySelector('main div.overflow-hidden.rounded-lg.border.bg-card')
			const form = cont?.querySelector('form')
			const table = cont?.querySelector('table')
			const tw = table?.parentElement
			const pag = cont?.querySelector('div[class*="has-[nav]"]')
			return {
				c: !!cont, form: !!form, table: !!table, empty: !table && !!cont?.querySelector('.bg-muted\\/50, .bg-muted\\/30'),
				b: cont ? getComputedStyle(cont).borderTopWidth : null, card: cont ? same(parse(getComputedStyle(cont).backgroundColor), token('bg-card')) : null,
				twRadius: tw ? getComputedStyle(tw).borderTopLeftRadius + ' ' + getComputedStyle(tw).borderLeftWidth : null,
				pag: pag ? { hasNav: !!pag.querySelector('nav'), borderTop: getComputedStyle(pag).borderTopWidth, h: pag.getBoundingClientRect().height } : null
			}
		})
		rec(theme, label, 'LIST-SHAPE container', JSON.stringify(r), 'container with form + table/empty, 1px, bg-card', r.c && r.form && (r.table || r.empty) && r.b === '1px' && r.card)
	}

	await go(page, '/payroll', theme)
	const pr = await page.evaluate(() => {
		const { token, same, parse } = window.__m
		const card = token('bg-card')
		const f = document.querySelector('form[action="?/create"]')
		const t = document.querySelector('main table')?.parentElement
		return { f: f ? same(parse(getComputedStyle(f).backgroundColor), card) : null, t: t ? same(parse(getComputedStyle(t).backgroundColor), card) : 'no table' }
	})
	rec(theme, '/payroll', 'create form + runs table wrapper fill == card', JSON.stringify(pr), 'true/true', pr.f === true && pr.t === true)

	await go(page, `/payroll/${RUN}`, theme)
	const chainRun = await page.evaluate(() => {
		const { token, same, parse, hex } = window.__m
		const card = token('bg-card')
		const lis = [...document.querySelectorAll('ol > li.flex.items-start.gap-3.rounded-lg.border.p-3')]
		return lis.map((li) => ({ bg: hex(window.__m.effBg(li)), card: same(parse(getComputedStyle(li).backgroundColor), card), active: li.className.includes('border-primary/50'), text: li.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) }))
	})
	rec(theme, `/payroll/[id] approval chain (E2)`, 'inactive <li> fill == card', JSON.stringify(chainRun), 'every inactive li card', chainRun.length ? chainRun.filter((x) => !x.active).every((x) => x.card) : null)

	await go(page, `/requests/${REQ}`, theme)
	const chainReq = await page.evaluate(() => {
		const { token, same, parse, hex } = window.__m
		const card = token('bg-card')
		const lis = [...document.querySelectorAll('ol > li.flex.items-start.gap-3.rounded-lg.border')]
		const dashed = [...document.querySelectorAll('li.border-dashed')]
		return { lis: lis.map((li) => ({ bg: hex(window.__m.effBg(li)), card: same(parse(getComputedStyle(li).backgroundColor), card), active: li.className.includes('border-primary/50'), text: li.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) })), dashed: dashed.length }
	})
	rec(theme, `/requests/[id] approval chain (E2)`, 'every <li> in the chain <ol> (origin + inactive) fill == card', JSON.stringify(chainReq.lis), 'every inactive li card', chainReq.lis.length ? chainReq.lis.filter((x) => !x.active).every((x) => x.card) : null)
	rec(theme, `/requests/[id]`, 'dashed <li> count on page (AC-S9.1)', chainReq.dashed, 'needs a request with a removed document', null)

	await go(page, '/payroll/periods', theme)
	const per = await page.evaluate(() => {
		const { token, same, parse } = window.__m
		const t = document.querySelector('main table')?.parentElement
		return { t: t ? same(parse(getComputedStyle(t).backgroundColor), token('bg-card')) : null, cls: t?.className }
	})
	rec(theme, '/payroll/periods', `table wrapper fill == card (${per.cls})`, String(per.t), 'bg-card', per.t)
	await page.getByRole('button', { name: 'Open Period', exact: true }).click()
	const dlg = page.getByRole('dialog', { name: 'Open a Payroll Period' })
	await dlg.waitFor()
	await page.waitForTimeout(400)
	const d = await page.evaluate(() => {
		const { effBg, ratio, hex, edge, token, same, parse } = window.__m
		const panel = document.querySelector('[role="dialog"][aria-labelledby="open-period-title"]')
		const backdrop = panel.parentElement
		const name = panel.querySelector('#name')
		const r = backdrop.getBoundingClientRect()
		const hit = document.elementFromPoint(5, 12)
		return {
			panelCard: same(parse(getComputedStyle(panel).backgroundColor), token('bg-card')),
			nameEdge: ratio(edge(name), effBg(panel)), nameBorderIsInput: same(edge(name), token('bg-input')),
			backdrop: { top: r.top, left: r.left, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, marginTop: getComputedStyle(backdrop).marginTop, parentIsBody: backdrop.parentElement === document.body || !backdrop.parentElement.closest('.space-y-6') },
			hitAt5x12IsBackdrop: hit === backdrop
		}
	})
	rec(theme, '/payroll/periods dialog', 'panel fill == card', String(d.panelCard), 'bg-card', d.panelCard)
	rec(theme, '/payroll/periods dialog', '#name edge vs dialog panel', d.nameEdge, '>=3', d.nameEdge >= 3)
	rec(theme, '/payroll/periods dialog', '#name border == --input', String(d.nameBorderIsInput), '--input', d.nameBorderIsInput)
	rec(theme, '/payroll/periods dialog (E1)', 'backdrop rect', JSON.stringify(d.backdrop), 'top 0, left 0, full viewport, margin-top 0px', d.backdrop.top === 0 && d.backdrop.left === 0 && d.backdrop.w === d.backdrop.vw && d.backdrop.h === d.backdrop.vh && d.backdrop.marginTop === '0px')
	rec(theme, '/payroll/periods dialog (E1)', 'elementFromPoint(5,12) is backdrop', String(d.hitAt5x12IsBackdrop), 'true', d.hitAt5x12IsBackdrop)
	await page.keyboard.press('Escape')

	await go(page, '/payslips', theme)
	const ps = await page.evaluate(() => {
		const w = document.querySelector('main div.hidden.overflow-x-auto.rounded-lg.border.bg-card') || document.querySelector('main div.rounded-lg.border.bg-card')
		return w ? { cls: w.className, bw: getComputedStyle(w).borderTopWidth, shadow: getComputedStyle(w).boxShadow, table: !!w.querySelector('table') } : null
	})
	rec(theme, '/payslips', 'shared Table wrapper', JSON.stringify(ps), 'border 1px, box-shadow none', ps ? ps.bw === '1px' && ps.shadow === 'none' : null)

	await go(page, '/profile', theme)
	const pf = await page.evaluate(() => {
		const { token, same, parse, hex } = window.__m
		const i = document.querySelector('input.input')
		const c = parse(getComputedStyle(i).backgroundColor)
		return { id: i?.id, bg: hex(c), isBackground: same(c, token('bg-background')), isInput: same(c, token('bg-input')) }
	})
	rec(theme, '/profile', `.input #${pf.id} fill`, JSON.stringify(pf), '== --background, != --input', pf.isBackground && !pf.isInput)

	await go(page, '/attendance', theme)
	const seg = await page.evaluate(() => {
		const el = document.querySelector('main div.inline-flex.rounded-lg.border.p-1')
		if (!el) return null
		const before = getComputedStyle(el).backgroundColor
		el.classList.add('bg-card')
		const injected = getComputedStyle(el).backgroundColor
		el.classList.remove('bg-card')
		return { links: el.querySelectorAll('a').length, before, injected, card: getComputedStyle(Object.assign(document.body.appendChild(document.createElement('div')), { className: 'bg-card' })).backgroundColor }
	})
	rec(theme, '/attendance', 'segmented control background (AC-S7.1)', seg ? seg.before : 'not found', 'rgba(0, 0, 0, 0)', seg ? seg.before === 'rgba(0, 0, 0, 0)' : null)
	rec(theme, '/attendance', 'selector control: inject bg-card onto the same element', seg ? `${seg.injected} (card ${seg.card})` : 'n/a', 'reads the card colour', seg ? seg.injected === seg.card : null)

	await go(page, `/employees/${EMP}`, theme)
	const offSel = await page.evaluate(() => {
		const el = document.querySelector('form[action="?/offboard"]')
		if (!el) return null
		el.classList.add('bg-card')
		const v = getComputedStyle(el).backgroundColor
		el.classList.remove('bg-card')
		return { v, after: getComputedStyle(el).backgroundColor }
	})
	rec(theme, '/employees/[id]', 'selector control: inject bg-card onto Offboard form', JSON.stringify(offSel), 'reads card, then transparent again', offSel ? offSel.v !== 'rgba(0, 0, 0, 0)' && offSel.after === 'rgba(0, 0, 0, 0)' : null)

	const mm = await page.evaluate(() => {
		const { effBg, ratio, parse } = window.__m
		const d = document.createElement('div')
		d.className = 'bg-muted text-muted-foreground'
		d.textContent = 'x'
		document.querySelector('main').appendChild(d)
		const r = ratio(parse(getComputedStyle(d).color), effBg(d))
		const bgParsed = getComputedStyle(d).backgroundColor
		d.remove()
		return { r, bgParsed }
	})
	rec(theme, 'injected div', `muted-foreground on muted (${mm.bgParsed})`, mm.r, theme === 'light' ? '>=4.5 (plan 4.90)' : '>=4.5 (plan 4.80)', mm.r >= 4.5)

	for (const f of ['holidays', 'org', 'org-chart', 'schedules', 'posting-approvers']) {
		await go(page, `/settings/${f}`, theme)
		const s = await page.evaluate(() => {
			const { token, same, parse } = window.__m
			const els = [...document.querySelectorAll('main .rounded-lg.border, main .rounded-md.border')].filter((e) => !['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SPAN'].includes(e.tagName) && !e.classList.contains('border-input'))
			const card = token('bg-card')
			return els.map((e) => ({ tag: e.tagName, cls: e.className.slice(0, 50), card: same(window.__m.effBg(e), card), own: getComputedStyle(e).backgroundColor }))
		})
		const top = s.filter((x) => x.own !== 'rgba(0, 0, 0, 0)' || !x.card)
		rec(theme, `/settings/${f}`, 'bordered boxes: fill resolves to card', `${s.filter((x) => x.card).length}/${s.length} card; not card: ${JSON.stringify(s.filter((x) => !x.card))}`, 'all card', s.length ? s.every((x) => x.card) : null)
	}
}

await browser.close()
console.log(JSON.stringify(rows, null, 1))
