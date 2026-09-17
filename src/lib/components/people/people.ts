import type { AttendanceStatus } from '@prisma/client'

export type PeopleView = 'grid' | 'list'

export const PEOPLE_PAGE_SIZE: Record<PeopleView, number> = { grid: 15, list: 12 }

export interface Person {
	id: string
	firstName: string
	lastName: string
	jobTitle: string
	employeeNumber: string
	companyEmail: string | null
	employmentStatus: string
	unit: string | null
	todayStatus?: AttendanceStatus | null
}

export function parseView(raw: string | null): { view: PeopleView; pageSize: number } {
	const view: PeopleView = raw === 'list' ? 'list' : 'grid'
	return { view, pageSize: PEOPLE_PAGE_SIZE[view] }
}

const segmenter = new Intl.Segmenter()

function firstLetter(name: string): string {
	const first = segmenter.segment(name.trim())[Symbol.iterator]().next().value
	return first ? first.segment.toLocaleUpperCase() : ''
}

export function initials(firstName: string, lastName: string): string {
	return firstLetter(firstName) + firstLetter(lastName) || '?'
}
