import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { createRawSnippet } from 'svelte'
import Field from '../../src/lib/components/ui/Field.svelte'

type Attrs = {
	id: string
	'aria-invalid': true | undefined
	'aria-describedby': string | undefined
}

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')

function renderField(props: Record<string, unknown>) {
	let captured: Attrs | undefined
	const children = createRawSnippet((a: () => Attrs) => ({
		render: () => {
			captured = a()
			const attrs = Object.entries(captured)
				.filter(([, v]) => v !== undefined)
				.map(([k, v]) => `${k}="${v}"`)
				.join(' ')
			return `<input ${attrs} />`
		}
	}))
	const { body } = render(Field, { props: { label: 'First Name', ...props, children } })
	return { html: strip(body), attrs: captured }
}

describe('Field', () => {
	it('a. links the label to the given id', () => {
		const { html } = renderField({ id: 'firstName' })
		expect(html).toContain('<label for="firstName"')
		expect(html).toContain('<input id="firstName"')
	})

	it('b. generates one id shared by the label and the control', () => {
		const { html } = renderField({})
		const labelFor = html.match(/<label for="([^"]+)"/)?.[1]
		const inputId = html.match(/<input id="([^"]+)"/)?.[1]
		expect(labelFor).toBeTruthy()
		expect(inputId).toBe(labelFor)
	})

	it('c. renders the error and hands aria-invalid and aria-describedby to the control', () => {
		const { html, attrs } = renderField({ id: 'firstName', error: 'Required' })
		expect(html).toMatch(/<p id="firstName-error" class="[^"]*text-destructive[^"]*">Required<\/p>/)
		expect(attrs).toEqual({
			id: 'firstName',
			'aria-invalid': true,
			'aria-describedby': 'firstName-error'
		})
	})

	it('d. sets no aria-invalid or aria-describedby without an error or hint', () => {
		const { html, attrs } = renderField({ id: 'firstName' })
		expect(attrs?.['aria-invalid']).toBeUndefined()
		expect(attrs?.['aria-describedby']).toBeUndefined()
		expect(html).not.toContain('-error')
	})

	it('e. describes the control by the hint and the error', () => {
		const { html } = renderField({ id: 'firstName', hint: 'Legal name', error: 'Required' })
		expect(html).toContain('aria-describedby="firstName-hint firstName-error"')
		expect(html).toContain('<p id="firstName-hint" class="mt-1 text-xs text-muted-foreground">')
	})

	it('f. keeps one space before the required marker', () => {
		const { html } = renderField({ id: 'firstName', required: true })
		expect(html).toContain('First Name <span class="text-destructive">*</span>')
	})

	it('g. compact size styles the wrapper and the label', () => {
		const { html } = renderField({ id: 'firstName', size: 'compact' })
		expect(html).toContain('<div class="grid gap-1">')
		expect(html).toMatch(/<label for="firstName" class="[^"]*text-xs[^"]*"/)
	})

	it('h. renders the suffix inside the label after one space', () => {
		const suffix = createRawSnippet(() => ({
			render: () => '<span class="text-muted-foreground">(optional)</span>'
		}))
		const { html } = renderField({ id: 'note', label: 'Note', suffix })
		expect(html).toMatch(
			/<label for="note"[^>]*>Note <span class="text-muted-foreground">\(optional\)<\/span><\/label>/
		)
	})
})
