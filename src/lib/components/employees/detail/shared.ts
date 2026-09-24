import type { PageData, ActionData } from '../../../../routes/(app)/employees/[id]/$types'
import type { submitFeedback } from '$lib/utils/submit-feedback.svelte'

export type EmployeeDetailData = PageData
export type EmployeeDetailForm = ActionData
export type Revealed = NonNullable<ActionData>['revealed'] | null
export type History = PageData['history']
export type FeedbackGuard = ReturnType<typeof submitFeedback>

export const LIST_RENDER_CAP = 25
