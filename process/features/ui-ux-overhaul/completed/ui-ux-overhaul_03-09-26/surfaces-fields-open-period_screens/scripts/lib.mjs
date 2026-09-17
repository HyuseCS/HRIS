import { chromium } from '@playwright/test'

export const BASE = 'http://localhost:4173'

export async function session(viewport = { width: 1528, height: 900 }) {
	const browser = await chromium.launch()
	const ctx = await browser.newContext({ viewport, baseURL: BASE })
	const res = await ctx.request.post('/api/v1/_dev/login-as', { data: { email: 'admin@veent.ph' } })
	if (!res.ok()) throw new Error('login-as ' + res.status())
	const page = await ctx.newPage()
	return { browser, ctx, page }
}

export async function setTheme(page, theme) {
	await page.evaluate((t) => localStorage.setItem('theme', t), theme)
	await page.reload({ waitUntil: 'networkidle' })
	await page.evaluate(() => document.fonts.ready)
	const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
	if (dark !== (theme === 'dark')) throw new Error('theme did not apply: ' + theme)
}

export async function go(page, path, theme) {
	await page.goto(path, { waitUntil: 'networkidle' })
	await page.evaluate((t) => localStorage.setItem('theme', t), theme)
	await page.reload({ waitUntil: 'networkidle' })
	await page.evaluate(() => document.fonts.ready)
	await page.waitForTimeout(300)
	await installHelpers(page)
}

export async function installHelpers(page) {
	await page.evaluate(() => {
		const parse = (s) => {
			const m = s.match(/rgba?\(([^)]+)\)/)
			if (!m) return null
			const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
			return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
		}
		const over = (top, bot) => ({
			r: top.r * top.a + bot.r * (1 - top.a),
			g: top.g * top.a + bot.g * (1 - top.a),
			b: top.b * top.a + bot.b * (1 - top.a),
			a: 1
		})
		const effBg = (el) => {
			const layers = []
			let n = el
			while (n && n.nodeType === 1) {
				const c = parse(getComputedStyle(n).backgroundColor)
				if (c && c.a > 0) {
					layers.push(c)
					if (c.a >= 1) break
				}
				n = n.parentElement
			}
			let acc = { r: 255, g: 255, b: 255, a: 1 }
			if (layers.length && layers[layers.length - 1].a >= 1) acc = layers.pop()
			for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc)
			return acc
		}
		const lum = (c) => {
			const f = (v) => {
				const s = Math.round(v) / 255
				return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
			}
			return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
		}
		const ratio = (a, b) => {
			const x = lum(a),
				y = lum(b)
			return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2)
		}
		const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
		const edge = (el) => {
			const cs = getComputedStyle(el)
			const b = parse(cs.borderTopColor)
			const bg = effBg(el.parentElement)
			return b.a < 1 ? over(b, bg) : b
		}
		const token = (cls) => {
			const d = document.createElement('div')
			d.className = cls
			document.body.appendChild(d)
			const c = parse(getComputedStyle(d).backgroundColor)
			d.remove()
			return c
		}
		const same = (a, b) => Math.abs(a.r - b.r) < 1 && Math.abs(a.g - b.g) < 1 && Math.abs(a.b - b.b) < 1
		window.__m = { parse, effBg, ratio, hex, edge, token, same, over }
	})
}
