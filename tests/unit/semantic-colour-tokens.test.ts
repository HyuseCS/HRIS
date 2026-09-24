import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src/app.css'), 'utf8')
const tailwind = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf8')

function block(start: RegExp): string {
	const match = start.exec(css)
	if (!match) return ''
	const end = css.indexOf('}', match.index)
	return css.slice(match.index, end)
}

const themes = {
	light: block(/^\s*:root \{/m),
	dark: block(/^\s*\.dark \{/m)
}

type Hsl = [number, number, number]

function token(text: string, name: string): Hsl | undefined {
	const m = new RegExp(`^\\s*--${name}:\\s*(\\d+) (\\d+)% (\\d+(?:\\.\\d+)?)%;`, 'm').exec(text)
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}

function hslToRgb([h, s, l]: Hsl): [number, number, number] {
	const sat = s / 100
	const light = l / 100
	const k = (n: number) => (n + h / 30) % 12
	const a = sat * Math.min(light, 1 - light)
	const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
	return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number]
}

const channel = (c: number) => {
	const s = c / 255
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const luminance = ([r, g, b]: [number, number, number]) =>
	0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
const contrast = (a: [number, number, number], b: [number, number, number]) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

const NAMES = ['success', 'success-foreground', 'warning', 'warning-foreground'] as const

describe('semantic colour tokens (src/app.css + tailwind.config.ts)', () => {
	for (const [name, text] of Object.entries(themes)) {
		describe(name, () => {
			it('should parse --destructive with the token regex', () => {
				expect(token(text, 'destructive')).toBeDefined()
			})

			for (const t of NAMES) {
				it(`should define --${t}`, () => {
					expect(token(text, t)).toBeDefined()
				})
			}

			for (const fill of ['success', 'warning', 'destructive'] as const) {
				it(`should keep ${fill}-foreground at 4.5:1 or more on ${fill}`, () => {
					const bg = token(text, fill)
					const fg = token(text, `${fill}-foreground`)
					expect(bg).toBeDefined()
					expect(fg).toBeDefined()
					expect(contrast(hslToRgb(bg as Hsl), hslToRgb(fg as Hsl))).toBeGreaterThanOrEqual(4.5)
				})
			}
		})
	}

	it('should map success and warning in tailwind the same way as destructive', () => {
		expect(tailwind).toContain(`'hsl(var(--destructive))'`)
		for (const t of NAMES) expect(tailwind).toContain(`'hsl(var(--${t}))'`)
	})
})
