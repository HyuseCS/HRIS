import { describe, it, expect } from 'vitest'
import { initials, parseView } from '$lib/components/people/people'

describe('initials', () => {
	it('takes the first letter of each name, upper-cased', () => {
		expect(initials('maria', 'santos')).toBe('MS')
	})

	it('ignores surrounding whitespace', () => {
		expect(initials('  Ana ', '\tReyes')).toBe('AR')
	})

	it('keeps a non-ASCII first letter whole', () => {
		expect(initials('Ñino', 'Élan')).toBe('ÑÉ')
		expect(initials('élise', 'Ong')).toBe('ÉO')
		expect(initials('𝒜da', 'Lim')).toBe('𝒜L')
	})

	it('uses what it has when one name is blank', () => {
		expect(initials('Jose', '   ')).toBe('J')
	})

	it('falls back to ? when both names are blank', () => {
		expect(initials('', ' ')).toBe('?')
	})
})

describe('parseView', () => {
	it('defaults to the grid of 15', () => {
		expect(parseView(null)).toEqual({ view: 'grid', pageSize: 15 })
	})

	it('reads list as 12 per page', () => {
		expect(parseView('list')).toEqual({ view: 'list', pageSize: 12 })
	})

	it('treats anything else as the grid', () => {
		for (const raw of ['', 'LIST', 'table', 'grid ']) {
			expect(parseView(raw)).toEqual({ view: 'grid', pageSize: 15 })
		}
	})
})
