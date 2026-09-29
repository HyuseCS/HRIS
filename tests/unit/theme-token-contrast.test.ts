import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src/app.css'), 'utf8')

const TOKENS = [
	'background',
	'card',
	'muted',
	'border',
	'input',
	'foreground',
	'muted-foreground'
] as const
type Token = (typeof TOKENS)[number]

function block(start: RegExp): string {
	const match = start.exec(css)
	if (!match) return ''
	const end = css.indexOf('}', match.index)
	return css.slice(match.index, end)
}

function parseGrays(text: string): Partial<Record<Token, number>> {
	const out: Partial<Record<Token, number>> = {}
	for (const token of TOKENS) {
		const m = new RegExp(`^\\s*--${token}:\\s*0 0% (\\d+(?:\\.\\d+)?)%;`, 'm').exec(text)
		if (m) out[token] = Number(m[1])
	}
	return out
}

const themes = {
	light: parseGrays(block(/^\s*:root \{/m)),
	dark: parseGrays(block(/^\s*\.dark \{/m))
}

const to8bit = (l: number) => Math.round((l / 100) * 255)
const luminance = (c: number) => {
	const s = c / 255
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const contrast = (a: number, b: number) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
	return (hi + 0.05) / (lo + 0.05)
}

describe('theme token contrast (src/app.css)', () => {
	it('should parse a decimal token value such as 0 0% 98.5%', () => {
		expect(parseGrays('\t--card: 0 0% 98.5%;').card).toBe(98.5)
	})

	for (const [name, t] of Object.entries(themes)) {
		describe(name, () => {
			const c = (token: Token) => to8bit(t[token] as number)

			it('should find all seven gray tokens in the block', () => {
				expect(Object.keys(t).sort()).toEqual([...TOKENS].sort())
			})

			it(`should keep the ${name} --input edge at 3:1 or more against card and background`, () => {
				expect(contrast(c('input'), c('card'))).toBeGreaterThanOrEqual(3)
				expect(contrast(c('input'), c('background'))).toBeGreaterThanOrEqual(3)
			})

			for (const text of ['foreground', 'muted-foreground'] as const) {
				for (const surface of ['card', 'background', 'muted'] as const) {
					it(`should keep ${text} at 4.5:1 or more on ${surface}`, () => {
						expect(contrast(c(text), c(surface))).toBeGreaterThanOrEqual(4.5)
					})
				}
			}

			it('should keep muted-foreground at 4.5:1 or more on muted/50 over card', () => {
				const composite = Math.round((c('muted') + c('card')) / 2)
				expect(contrast(c('muted-foreground'), composite)).toBeGreaterThanOrEqual(4.5)
			})

			it('should make the card lighter than the background', () => {
				expect(t.card as number).toBeGreaterThan(t.background as number)
			})
		})
	}

	it('should fill .input with bg-background and not bg-input', () => {
		const apply = /\.input \{\s*@apply ([^;]+);/.exec(css)?.[1] ?? ''
		expect(apply).toContain('bg-background')
		expect(apply).not.toMatch(/\bbg-input\b/)
	})
})
