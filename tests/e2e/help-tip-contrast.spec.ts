import { test, expect, type Locator } from '@playwright/test'
import { login, USERS } from './helpers'

// N7-AC8. The `?` control and the tooltip body both paint on a TRANSPARENT background —
// `rgba(0,0,0,0)` composites to whatever ancestor actually fills, so reading an element's own
// `background-color` measures nothing. `probe` walks the ancestor chain collecting every
// non-zero-alpha background until it reaches an opaque one, then alpha-blends top-down
// (`fg*a + bg*(1-a)`) to get the real backdrop. Contrast is WCAG 2.1: sRGB linearisation,
// then `(L1+0.05)/(L2+0.05)`.

const TIP_LABEL = 'About Separations'
const DESCRIPTION = 'Record resignations and terminations'

type Probe = {
	ratio: number
	borderRatio: number
	fg: string
	border: string
	bg: string
	fgSource: string
	bgSource: string
	chain: string[]
	fontSizePx: number
	fontWeight: number
	isLargeText: boolean
}

async function probe(target: Locator): Promise<Probe> {
	return target.evaluate((el: Element): Probe => {
		const parse = (raw: string) => {
			const m = raw.match(/-?[\d.]+/g)
			if (!m || m.length < 3) return null
			const [r, g, b, a] = m.map(Number)
			return { r, g, b, a: a === undefined ? 1 : a }
		}
		const describe = (n: Element) => {
			const cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/) : []
			return (
				n.tagName.toLowerCase() +
				(n.id ? `#${n.id}` : '') +
				cls
					.slice(0, 3)
					.map((c) => `.${c}`)
					.join('')
			)
		}
		const hex = (c: { r: number; g: number; b: number }) =>
			'#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
		const over = (
			fg: { r: number; g: number; b: number; a: number },
			bg: { r: number; g: number; b: number }
		) => ({
			r: fg.r * fg.a + bg.r * (1 - fg.a),
			g: fg.g * fg.a + bg.g * (1 - fg.a),
			b: fg.b * fg.a + bg.b * (1 - fg.a)
		})
		const lum = (c: { r: number; g: number; b: number }) => {
			const lin = (v: number) => {
				const s = v / 255
				return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
			}
			return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
		}
		const ratio = (
			a: { r: number; g: number; b: number },
			b: { r: number; g: number; b: number }
		) => {
			const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
			return (hi + 0.05) / (lo + 0.05)
		}

		const layers: { from: string; color: { r: number; g: number; b: number; a: number } }[] = []
		let node: Element | null = el
		while (node) {
			const c = parse(getComputedStyle(node).backgroundColor)
			if (c && c.a > 0) {
				layers.push({ from: describe(node), color: c })
				if (c.a >= 1) break
			}
			node = node.parentElement
		}

		let bg = { r: 255, g: 255, b: 255 }
		let bgSource = 'canvas default (no opaque ancestor found)'
		if (layers.length && layers[layers.length - 1].color.a >= 1) {
			const bottom = layers.pop()!
			bg = bottom.color
			bgSource = bottom.from
		}
		for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i].color, bg)

		const cs = getComputedStyle(el)
		let fgRaw = cs.color
		let fgSource = 'color'
		const svg = el.querySelector('svg')
		if (svg) {
			const painted = svg.querySelector('path, circle, rect, line, polygon') ?? svg
			const ps = getComputedStyle(painted)
			if (ps.fill && ps.fill !== 'none') {
				fgRaw = ps.fill
				fgSource = 'svg fill'
			} else if (ps.stroke && ps.stroke !== 'none') {
				fgRaw = ps.stroke
				fgSource = 'svg stroke'
			}
		}
		const fgParsed = parse(fgRaw) ?? { r: 0, g: 0, b: 0, a: 1 }
		const fg = over(fgParsed, bg)
		const borderParsed = parse(cs.borderTopColor) ?? { r: 0, g: 0, b: 0, a: 0 }
		const border = over(borderParsed, bg)

		const fontSizePx = parseFloat(cs.fontSize)
		const fontWeight = Number(cs.fontWeight) || 400
		const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700)

		return {
			ratio: ratio(fg, bg),
			borderRatio: ratio(border, bg),
			fg: hex(fg),
			border: hex(border),
			bg: hex(bg),
			fgSource,
			bgSource,
			chain: layers.map((l) => l.from),
			fontSizePx,
			fontWeight,
			isLargeText
		}
	})
}

const round = (n: number) => Math.round(n * 100) / 100

test.describe('N7-AC8 — HelpTip contrast against composited backgrounds', () => {
	test('the ? control and the tooltip text meet their floors in light and dark', async ({
		page
	}) => {
		await login(page, USERS.hr)

		const seen: Record<string, { control: Probe; tip: Probe }> = {}

		for (const theme of ['light', 'dark'] as const) {
			await page.evaluate((t) => localStorage.setItem('theme', t), theme)
			await page.goto('/separations', { waitUntil: 'domcontentloaded' })
			await expect(page.locator('html')).toHaveClass(theme)

			const button = page.getByRole('button', { name: TIP_LABEL, exact: true })
			const tip = page.getByRole('tooltip')
			await expect(button).toHaveCount(1)
			await button.focus()
			await expect(tip).toHaveCSS('opacity', '1')
			await expect(tip).toContainText(DESCRIPTION)

			const control = await probe(button)
			const tipProbe = await probe(tip)
			seen[theme] = { control, tip: tipProbe }

			const tipFloor = tipProbe.isLargeText ? 3 : 4.5
			console.log(
				`[N7-AC8] ${theme} · ? control  ${round(control.ratio)}:1  (fg ${control.fg} via ${control.fgSource}` +
					` on ${control.bg} from ${control.bgSource}; floor 3:1 — WCAG 1.4.11 non-text)` +
					`  [border ${round(control.borderRatio)}:1 ${control.border}]`
			)
			console.log(
				`[N7-AC8] ${theme} · tooltip    ${round(tipProbe.ratio)}:1  (fg ${tipProbe.fg} via ${tipProbe.fgSource}` +
					` on ${tipProbe.bg} from ${tipProbe.bgSource}; ${tipProbe.fontSizePx}px/${tipProbe.fontWeight} →` +
					` ${tipProbe.isLargeText ? 'large' : 'normal'} text, floor ${tipFloor}:1 — WCAG 1.4.3)`
			)

			expect(
				control.ratio,
				`? control contrast in ${theme} (${control.fg} on ${control.bg}) must clear 3:1`
			).toBeGreaterThanOrEqual(3)
			expect(
				tipProbe.ratio,
				`tooltip text contrast in ${theme} (${tipProbe.fg} on ${tipProbe.bg}) must clear ${tipFloor}:1`
			).toBeGreaterThanOrEqual(tipFloor)
		}

		expect(seen.light.control.bg, 'light and dark must composite to different backdrops').not.toBe(
			seen.dark.control.bg
		)
		expect(
			seen.light.tip.bg,
			'light and dark must composite to different tooltip backdrops'
		).not.toBe(seen.dark.tip.bg)
	})

	test('negative control — a forced low-contrast colour is measured as failing', async ({
		page
	}) => {
		await login(page, USERS.hr)
		await page.evaluate(() => localStorage.setItem('theme', 'light'))
		await page.goto('/separations', { waitUntil: 'domcontentloaded' })
		await expect(page.locator('html')).toHaveClass('light')

		const button = page.getByRole('button', { name: TIP_LABEL, exact: true })
		const tip = page.getByRole('tooltip')
		await button.focus()
		await expect(tip).toHaveCSS('opacity', '1')

		await page.addStyleTag({
			content: `[aria-label="${TIP_LABEL}"] { color: rgb(226,226,226) !important; }
				[role="tooltip"] { color: rgb(232,232,232) !important; }`
		})

		const control = await probe(button)
		const tipProbe = await probe(tip)
		console.log(
			`[N7-AC8 negative control] ? ${round(control.ratio)}:1, tooltip ${round(tipProbe.ratio)}:1`
		)
		expect(control.ratio, 'the probe reports a real failure for the ? control').toBeLessThan(3)
		expect(tipProbe.ratio, 'the probe reports a real failure for the tooltip').toBeLessThan(4.5)
	})
})
