// Shared server-side pagination (#64).
//
// Usage in a load function — exactly one count query + one page query:
//   const total = await db.thing.count({ where })
//   const p = paginate(url, total, { param: 'page', pageSize: 10 })
//   const rows = await db.thing.findMany({ where, skip: p.skip, take: p.take })
//   return { rows, pagination: p }
//
// Counting first lets an out-of-range ?page= clamp to the real last page instead
// of serving an empty page.

import type { Cookies } from '@sveltejs/kit'

export interface Pagination {
	/** 1-based current page, clamped to [1, totalPages]. */
	page: number
	pageSize: number
	total: number
	totalPages: number
	/** Prisma skip/take for the page query. */
	skip: number
	take: number
	/** 1-based index of the first/last row on this page (0 when total is 0). */
	start: number
	end: number
	/** Query-string parameter this table paginates on (e.g. `page`, `myPage`). */
	param: string
	/** Human range label, e.g. "21–40 of 137". */
	label: string
}

export interface PaginateOptions {
	/** Query-string param name; give two tables on one page distinct names. */
	param?: string
	pageSize?: number
}

export function paginate(
	url: URL,
	total: number,
	{ param = 'page', pageSize = 10 }: PaginateOptions = {}
): Pagination {
	const totalPages = Math.max(1, Math.ceil(total / pageSize))

	const raw = Number(url.searchParams.get(param))
	const requested = Number.isInteger(raw) && raw >= 1 ? raw : 1
	const page = Math.min(requested, totalPages)

	const skip = (page - 1) * pageSize
	const start = total === 0 ? 0 : skip + 1
	const end = Math.min(skip + pageSize, total)

	return {
		page,
		pageSize,
		total,
		totalPages,
		skip,
		take: pageSize,
		start,
		end,
		param,
		label: `${start}–${end} of ${total}`
	}
}

export interface FitOptions {
	/** Height of one row in CSS px, measured live on the page. */
	rowPx: number
	/** Everything on the page that is not rows, in CSS px: innerHeight minus the scrolling region's clientHeight, plus a sticky/in-region thead if it eats row space. */
	chromePx: number
	/** Used when the cookie is absent or unparsable. */
	fallback?: number
	min?: number
	max?: number
	/** Grid pages: columns for the viewport width; rows-that-fit × cols. Default () => 1. */
	cols?: (vw: number) => number
}

export function fitPageSize(
	cookies: Cookies,
	{ rowPx, chromePx, fallback = 10, min = 5, max = 50, cols = () => 1 }: FitOptions
): number {
	const m = /^(\d+)x(\d+)$/.exec(cookies.get('vp') ?? '')
	if (!m) return fallback

	const vw = Number(m[1])
	const vh = Number(m[2])
	const rows = Math.floor((vh - chromePx) / rowPx)
	return Math.max(min, Math.min(max, rows * cols(vw)))
}
