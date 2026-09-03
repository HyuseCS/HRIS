/**
 * The clearance areas that sign an offboarding step off (#306), with their display labels.
 * Client-safe by design: the Settings editor and the separation case page both render these,
 * and a `$lib/server/*` import from a `.svelte` file is a build error.
 */

import type { ClearanceArea } from '@prisma/client'

export const CLEARANCE_AREA_OPTIONS = [
	['IT', 'IT'],
	['HR', 'HR'],
	['ADMIN', 'Admin'],
	['FINANCE', 'Finance'],
	['IMMEDIATE_SUPERVISOR', 'Immediate Supervisor']
] as const satisfies readonly (readonly [ClearanceArea, string])[]

/** The bare values, for `z.enum` — so adding an enum member can't leave a validator behind. */
export const CLEARANCE_AREAS = CLEARANCE_AREA_OPTIONS.map(([value]) => value) as unknown as [
	ClearanceArea,
	...ClearanceArea[]
]

export const CLEARANCE_AREA_LABELS = Object.fromEntries(CLEARANCE_AREA_OPTIONS) as Record<
	ClearanceArea,
	string
>
