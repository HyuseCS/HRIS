---
name: report:n5-inventory-design
description: "Two design directions (list + grid) for /inventory — replace the 9-control inline-edit table with a clickable row that opens one edit modal"
date: 18-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "N5"
---

# N5 — /inventory: row opens a modal

## TL;DR

The sideways scroll is real and measured: the table needs **~1438 px** of width and the page gives it
**942 px at 1280** and **324 px at 390**. Both directions fix it the same way — `table-fixed` + `truncate`
so no cell can force a minimum width, and nine editors move off the row into one modal.

- **List** — a 6-column fixed table at ≥ sm, stacked cards below sm.
- **Grid** — the same card at every width, 1 / 2 / 3 columns.
- The card markup is **shared**: the list direction already needs it for < sm. So shipping the grid
  as well costs one `{#if}` branch, one view toggle, and one `url.searchParams.get('view')` line.
- **One edit modal serves both.** It is rendered once, outside the view branch, driven by `editingId`.
- **Zero new components.** Zero changes to the three server actions.
- The clickable element is a real `<button>` stretched over the row with `after:absolute after:inset-0` —
  the pattern this repo already ships at `src/lib/components/people/EmployeeTable.svelte:29,35`.
- **Recommendation: ship both, with the /team toggle.** The grid is nearly free and HR scanning a
  laptop registry wants columns; HR on a phone wants cards.

One build trap, flagged loud, in [§10](#10-the-one-trap-that-will-bite).

---

## 0. Measured current state

Numbers I derived, not estimated.

**Table minimum width** (`src/routes/(app)/inventory/+page.svelte:193-194`, `min-w-max`):

| Source | Width |
|---|---|
| Nine control widths `w-40 w-32 w-20 w-16 w-32 w-28 w-40 w-28 w-24` (lines 220, 229, 239, 247, 256, 259, 269, 288, 299) | 160+128+80+64+128+112+160+112+96 = **1040 px** |
| 11 cells × `px-3` (12 px each side) | **264 px** |
| Save cell button (`px-3` + "Save" ≈ 38 px) | **~62 px** |
| Delete cell button (`px-3` + "Delete" ≈ 48 px) | **~72 px** |
| **Total** | **≈ 1438 px** |

**Available content width** (`src/routes/(app)/+layout.svelte:650-651` → `lg:pl-60` = 240 px, `lg:p-8` = 32 px
each side, `p-4` = 16 px each side below lg; section `p-4` at `+page.svelte:186` = 16 px each side, +2 px border):

| Viewport | Main width | Inside the section | Overflow |
|---|---|---|---|
| 1920 | 1920 − 240 − 64 = 1616 | **1582 px** | fits, by 144 px |
| 1280 | 1280 − 240 − 64 = 976 | **942 px** | **−496 px → scrolls** |
| 390 | 390 − 32 = 358 | **324 px** | **−1114 px → scrolls** |

So the owner is right, and 1280 — the Playwright default and a normal laptop — is already broken.

**Other facts read, not assumed:**

- `itemSchema` (`+page.server.ts:46-61`) reads exactly: `name category quantity unit location status
  assignedToId serialNumber value notes`. `update` additionally reads `id` (line 114). A modal form
  posting those same names needs **no server change**.
- `notes` is in the schema and in the Add form (line 168) but has **no table column** — it is already
  invisible on the list today.
- The inactive-assignee guard at lines 276-280 runs **once per row**. In the modal it runs **once**.
- `Dialog` `scroll` is the only thing that adds `max-h-[90vh]` (`Dialog.svelte:149`). Without it the
  panel has no height ceiling.
- `Dialog` focus restore already exists (`Dialog.svelte:83-88`): it captures `document.activeElement`
  on open and calls `trigger?.focus()` on close.
- `ConfirmDialog` is hard-wired to `zIndex={60}` (`ConfirmDialog.svelte:34`). The repo's precedent for a
  dialog that contains a `ConfirmButton` is `TimesheetModal.svelte:305` — it passes `zIndex={50}`.
- `<h2>` is mandatory: `Dialog`'s `title` renders nothing (`Dialog.svelte:10-11`), and
  `SeparationCreateDialog.svelte:37` supplies its own.
- `Items ({data.items.length})` at line 187 counts the **page slice**, not the set. On page 1 of 3 it
  says 20. Adjacent one-line fix, noted in [§11](#11-cost).

---

## 1. Shared foundation (both directions)

### 1.1 The clickable element

**Not** `role="button"` on a `<tr>`. Two reasons, both concrete:

1. Inside a `<table>` the `<tr>` must expose `role="row"`. Overriding it to `button` deletes the row
   from the table's accessibility tree, and every cell loses its column association.
2. `Table.svelte:92-93` hand-rolls `(e.key === 'Enter' || e.key === ' ') && onRowClick(row)` with no
   `preventDefault()` on Space — so Space fires the action *and* scrolls the page.

Instead, one real `<button type="button">` in the name cell, stretched over the whole row:

```svelte
<tr
	class="relative transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
	data-name={item.name}
>
	<td class="px-4 py-2">
		<button
			type="button"
			onclick={() => (editingId = item.id)}
			class="block w-full min-w-0 cursor-pointer text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
		>
			<span class="sr-only">Edit </span>
			<span class="block truncate font-medium text-foreground">{item.name}</span>
			{#if item.serialNumber}
				<span class="block truncate text-xs tabular-nums text-muted-foreground">{item.serialNumber}</span>
			{/if}
		</button>
	</td>
	…
</tr>
```

This is `EmployeeTable.svelte:29,35` with `<a href>` swapped for `<button type="button">` and
`has-[a:focus-visible]` swapped for `has-[button:focus-visible]`. Nothing invented.

### 1.2 The edit modal

Rendered **once**, outside the view branch, so list and grid share it verbatim.

```svelte
<script lang="ts">
	let editingId = $state<string | null>(null)
	const editing = $derived(data.items.find((i) => i.id === editingId) ?? null)
	let listEl = $state<HTMLElement>()

	const save = submitFeedback({
		inner: () => async ({ update, result }) => {
			await update({ reset: false })
			if (result.type === 'success') editingId = null
		}
	})

	const afterDelete: SubmitFunction = () => async ({ update, result }) => {
		await update({ reset: false })
		if (result.type === 'success') {
			editingId = null
			listEl?.focus()
		}
	}
</script>

{#if editing}
	<Dialog
		open
		onclose={() => (editingId = null)}
		labelledBy="inv-edit-title"
		size="wide"
		scroll
		zIndex={50}
	>
		<div class="flex items-start justify-between gap-3 pb-4">
			<div class="min-w-0">
				<h2 id="inv-edit-title" class="truncate text-lg font-semibold">Edit {editing.name}</h2>
				<p class="mt-0.5 text-xs text-muted-foreground">
					Added {formatShortDate(editing.createdAt)}
				</p>
			</div>
			<ConfirmButton
				action="?/remove"
				title="Delete item?"
				message="This permanently removes {editing.name} from the registry."
				triggerLabel="Delete"
				triggerClass="btn-row-danger shrink-0"
				submit={afterDelete}
			>
				<input type="hidden" name="id" value={editing.id} />
			</ConfirmButton>
		</div>

		<form
			method="POST"
			action="?/update"
			use:enhance={save.enhance}
			class="flex min-h-0 flex-1 flex-col"
		>
			<input type="hidden" name="id" value={editing.id} />

			<div class="min-h-0 flex-1 overflow-y-auto border-t pt-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="grid gap-1.5 sm:col-span-2">
						<label for="i-name" class="text-sm font-medium"
							>Name <span class="text-red-500" aria-hidden="true">*</span></label
						>
						<input id="i-name" name="name" value={editing.name} required maxlength="120" class={inputClass} />
					</div>

					<div class="grid gap-1.5">
						<label for="i-category" class="text-sm font-medium">Category</label>
						<input id="i-category" name="category" list="categories" value={editing.category} maxlength="60" class={inputClass} />
					</div>

					<div class="grid grid-cols-[1fr_6rem] gap-3">
						<div class="grid gap-1.5">
							<label for="i-qty" class="text-sm font-medium">Quantity</label>
							<input id="i-qty" name="quantity" type="number" min="0" value={editing.quantity} class="{inputClass} text-right tabular-nums" />
						</div>
						<div class="grid gap-1.5">
							<label for="i-unit" class="text-sm font-medium">Unit</label>
							<input id="i-unit" name="unit" value={editing.unit} maxlength="20" class={inputClass} />
						</div>
					</div>

					<div class="grid gap-1.5">
						<label for="i-location" class="text-sm font-medium">Location</label>
						<input id="i-location" name="location" value={editing.location ?? ''} maxlength="120" class={inputClass} />
					</div>

					<div class="grid gap-1.5">
						<label for="i-serial" class="text-sm font-medium">Serial / tag</label>
						<input id="i-serial" name="serialNumber" value={editing.serialNumber ?? ''} maxlength="120" class="{inputClass} tabular-nums" />
					</div>

					<div class="grid gap-1.5">
						<label for="i-status" class="text-sm font-medium">Status</label>
						<select id="i-status" name="status" aria-describedby="i-status-hint" class={inputClass}>
							{#each Object.entries(INVENTORY_STATUS_LABELS) as [val, label] (val)}
								<option value={val} selected={editing.status === val}>{label}</option>
							{/each}
						</select>
						<p id="i-status-hint" class="text-xs text-muted-foreground">
							Assigned needs an employee below. Any other status clears the holder.
						</p>
					</div>

					<div class="grid gap-1.5">
						<label for="i-assigned" class="text-sm font-medium">Assigned to</label>
						<select id="i-assigned" name="assignedToId" class={inputClass}>
							<option value="">— unassigned —</option>
							{#each data.employees as e (e.id)}
								<option value={e.id} selected={editing.assignedToId === e.id}>{empName(e)}</option>
							{/each}
							{#if editing.assignedTo && !data.employees.some((e) => e.id === editing.assignedToId)}
								<option value={editing.assignedToId} selected
									>{empName(editing.assignedTo)} — no longer active</option
								>
							{/if}
						</select>
					</div>

					<div class="grid gap-1.5">
						<label for="i-value" class="text-sm font-medium">Value (₱)</label>
						<input id="i-value" name="value" type="number" min="0" step="0.01" value={editing.value == null ? '' : Number(editing.value)} class="{inputClass} text-right tabular-nums" />
					</div>

					<div class="grid gap-1.5 sm:col-span-2">
						<label for="i-notes" class="text-sm font-medium">Notes</label>
						<textarea id="i-notes" name="notes" rows="2" maxlength="2000" class="rounded-md border border-input bg-background px-3 py-2 text-sm">{editing.notes ?? ''}</textarea>
					</div>
				</div>
			</div>

			<div class="mt-4 flex items-center justify-end gap-2 border-t pt-4">
				<button
					type="button"
					onclick={() => (editingId = null)}
					class="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent">Cancel</button
				>
				<button
					type="submit"
					disabled={save.busy}
					class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{save.busy ? 'Saving…' : 'Save'}</button
				>
			</div>
		</form>
	</Dialog>
{/if}
```

`inputClass` is the existing constant at `+page.svelte:22-23` — unchanged, reused.

**Every field name matches `itemSchema` exactly. The server is untouched.**

### 1.3 Where Delete sits, and why it is in the header

The owner's ruling is Delete-inside-the-modal, two sibling forms, no nesting, no `form=` trick. That
constrains the layout in one specific way most people miss:

- The Save button must be **inside** the edit `<form>` (no `form=` attribute).
- The fields must be inside the same form.
- Therefore the edit form spans from the first field to the Save button.
- `ConfirmButton` renders **its own `<form class="contents">`** (`ConfirmButton.svelte:91`). Putting it
  on the Save row would nest a form inside a form — invalid HTML.

So Delete goes on the **modal header row**, opposite the `<h2>`, as a true sibling of the edit form.
It stays permanently visible because `scroll` puts the header outside the scrolling body.

> Fallback if the owner dislikes a header-row Delete: a `border-t` strip below the Save row holding
> only the ConfirmButton. Also valid and non-nested; costs ~56 px of modal height and puts the
> destructive action last in tab order, which is arguably safer. One-line swap either way.

`zIndex={50}` is required, not stylistic: `ConfirmDialog` is fixed at 60 and must paint above its
parent. `TimesheetModal.svelte:305` sets the same value for the same reason.

### 1.4 The inactive-assignee guard — how it survives

Verbatim, minus the duplication. Today's guard (`+page.svelte:276-280`) re-runs `data.employees.some(...)`
for every rendered row — 20 linear scans per page. In the modal it runs for the one open item.

The logic is unchanged: if the item names an assignee who is not in the ACTIVE employee list
(`+page.server.ts:31-34` filters `employmentStatus: 'ACTIVE'`), an extra `<option>` carrying that id is
appended and pre-selected, so submitting without touching the field re-posts the same id and the
assignment is not silently dropped.

One improvement over today: the option label gains **`— no longer active`**, so HR can see why the
holder is not in the main list. Today it is indistinguishable from an active employee.

`{@const}` is not needed anywhere in the modal — it is outside any `{#each}` — which also removes a
`{@const}`-placement hazard that exists in the current row (line 212).

### 1.5 Dialog `size` and `scroll` — the no-overflow argument

**`size="wide"` (`max-w-lg` / `sm:max-w-2xl` / `lg:max-w-4xl`), `scroll` set.**

Height, measured against the actual control sizes in the sketch (`h-9` = 36 px control, `text-sm`
label = 20 px, `gap-1.5` = 6 px, `gap-4` grid gap = 16 px):

| Viewport | Field columns | Field rows | Body height | + header 68 + footer 68 + `p-6` 48 | Verdict |
|---|---|---|---|---|---|
| 390 | 1 | 10 (notes 2 rows, status hint +18) | ≈ 10 × 78 + 18 + 26 = **824 px** | **≈ 1008 px** | far past any phone |
| 1280 | 2 | 6 | ≈ 6 × 78 + 18 + 26 = **512 px** | **≈ 696 px** | past a 720 px viewport minus chrome |
| 1920 | 2 | 6 | **512 px** | **≈ 696 px** | fits a tall screen only |

Without `scroll` the panel has **no `max-height` at all** (`Dialog.svelte:149`) and the backdrop's
`items-center` centres an over-tall panel so both ends are clipped off-screen — the Save button
becomes unreachable. The owner's standing rule is *modals must not overflow at any size*, and their
own measured `innerHeight` with docked DevTools has been as low as **314 px**. `scroll` is mandatory.

With `scroll`: panel gets `flex max-h-[90vh] flex-col overflow-hidden`, the form gets
`flex min-h-0 flex-1 flex-col`, the field grid gets `min-h-0 flex-1 overflow-y-auto`. The header, the
Delete button and the Save/Cancel row are always on screen; only the fields scroll. This is
`RequestCreateDialog.svelte:98,104,108` copied exactly.

Why `wide` and not `lg`: at `lg` (512 px) the `sm:grid-cols-2` field grid gives 236 px columns, which
truncates employee names in the assignee select. `wide` gives 2xl/4xl above `sm` — the two-column form
reads at 1280 and 1920, and collapses to one column below `sm` where `max-w-lg` is already capped by
the backdrop's `p-4` to 358 px at 390.

### 1.6 The keyboard and focus story (both directions)

| Step | What happens | Where it comes from |
|---|---|---|
| Reach the row | Tab lands on the row's `<button type="button">`. It is the only focusable thing in the row. | native |
| Accessible name | `"Edit MacBook Pro 14"` — the `sr-only` "Edit " prefix plus the item name. Serial is inside the same button, so a screen reader reads `"Edit MacBook Pro 14 C02XL0FTJGH5"`. | `<span class="sr-only">` |
| Activate | **Enter and Space both fire**, and Space does not scroll. | native `<button>` — this is the entire reason it is not a `<tr role="button">` |
| Visible focus | The whole row outlines, not just the text: `has-[button:focus-visible]:outline-2 -outline-offset-2 outline-ring`. `outline-ring` is the `--ring` token, so it is correct in light and dark. | `EmployeeTable.svelte:29` |
| Modal opens | `Dialog`'s `$effect` captures the row button as `trigger` and focuses `panelEl`. Screen reader announces the dialog by `aria-labelledby="inv-edit-title"` → "Edit MacBook Pro 14, dialog". | `Dialog.svelte:83-88,158` |
| First Tab | Panel → Delete → Name field → … → Cancel → Save → wraps to Delete. | `Dialog.svelte:104-133` |
| `initialFocus` | Left at the default `'panel'`. Do **not** autofocus the Name field — `Dialog.svelte:28` documents that panel-focus and a self-focusing control race each other. | `Dialog.svelte:58` |
| Escape | Closes. `stopPropagation` prevents a nested ConfirmDialog's Escape from also closing the parent. | `Dialog.svelte:105-109` |
| Backdrop click / Cancel | Closes. | `Dialog.svelte:141` |
| Close → focus returns | `trigger?.focus()` puts focus back on the exact row button. The `{#each … (item.id)}` key means a successful save reuses the same DOM node, so the restore lands correctly. | `Dialog.svelte:87` |
| **Close after DELETE** | The row is gone, so `trigger?.focus()` targets a detached node and focus falls to `<body>`. **This is a real hole and must be built.** The `afterDelete` handler in §1.2 focuses `listEl` — the `<section tabindex="-1" bind:this={listEl}>` wrapper — so a keyboard reader resumes at the list, not the top of the page. | new, required |

The delete-focus hole is the one accessibility item that does not come free. It is 3 lines and it is
in the sketch.

---

## 2. Direction A — **Registry List**

> One row per item, six fixed columns, nothing editable until you open it.

### 2.1 Fields on the row vs in the modal

| Field | On the row | Justification |
|---|---|---|
| **Name** | yes — the click target | the identity of the record |
| **Serial / tag** | yes — second line under the name, `text-xs` muted, `truncate` | it is the *other* identity of an asset; HR matches a physical sticker to a row. Stacking it costs zero horizontal width. |
| **Category** | yes, ≥ md | the filter's primary axis (`+page.server.ts:22`) — you must see what you filtered by |
| **Quantity + Unit** | yes, merged into one right-aligned `tabular-nums` cell: `12 pc` | two columns for one quantity is the single worst offender in the current 1438 px; `w-20 + w-16 + 48 px padding` = 144 px for four characters |
| **Location** | yes, ≥ xl | searchable and scan-worthy, but the first thing to drop when width runs out |
| **Status** | yes, always — `<Badge domain="inventory">` | the second filter axis, and the only field with a colour signal |
| **Assigned to** | yes, ≥ lg, `truncate` | "who has it" is the question an asset registry exists to answer |
| **Value** | yes, ≥ xl, right, `tabular-nums`, `formatCurrency` | a column of money only works when it is a column; below xl it goes to the modal |
| **Notes** | **modal only** | already has no column today (`+page.svelte:197-207` lists nine, none is notes) — nothing is lost |

The status `<Badge>` replaces a `w-28` select + a badge that was `hidden sm:inline` (lines 259-266) —
i.e. today's row shows *both* an editor and a badge for the same value.

### 2.2 Markup

**Wrapper** — replaces `+page.svelte:186-345`:

```svelte
<section
	bind:this={listEl}
	tabindex="-1"
	class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card focus:outline-none"
>
	<div class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
		<h2 class="font-semibold">Items</h2>
		<p class="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
			{data.pagination.total} {data.pagination.total === 1 ? 'item' : 'items'}
		</p>
		<div class="ml-auto flex items-center gap-3">
			<div role="group" aria-label="View" class="inline-flex rounded-md border p-0.5">
				{#each views as v (v.value)}
					<a
						href={inventoryHref(v.value)}
						aria-current={data.view === v.value ? 'page' : undefined}
						class="rounded px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {data.view ===
						v.value
							? 'bg-muted text-foreground'
							: 'text-muted-foreground hover:text-foreground'}">{v.label}</a
					>
				{/each}
			</div>
			<button
				type="button"
				onclick={() => (creating = true)}
				class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>Add item</button
			>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if data.items.length === 0}
			<EmptyState
				variant={data.filter.search || data.filter.category || data.filter.status
					? 'no-results'
					: 'empty'}
				title={data.filter.search || data.filter.category || data.filter.status
					? 'No items match these filters'
					: 'No items in the registry yet'}
			>
				{#snippet action()}
					<a href="/inventory" class="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
						>Clear filters</a
					>
				{/snippet}
			</EmptyState>
		{:else if data.view === 'grid'}
			{@render cardGrid()}
		{:else}
			{@render itemTable()}
			<div class="sm:hidden">{@render cardGrid()}</div>
		{/if}
	</div>

	<div class="has-[nav]:border-t has-[nav]:px-4 has-[nav]:py-3">
		<Pagination meta={data.pagination} />
	</div>
</section>
```

The wrapper is `/team`'s shell (`team/+page.svelte:39-108`) with the toolbar contents swapped. `Container.svelte`
is the same shape but its toolbar is `justify-between` only and its body has fixed `p-4`, which would
pad the table edges — so the plain div, matching `/team`, is the closer precedent.

**The row** — `table-fixed` is load-bearing:

```svelte
{#snippet itemTable()}
	<table class="hidden w-full table-fixed text-sm sm:table">
		<caption class="sr-only">Inventory items. Select an item to edit it.</caption>
		<thead class="sticky top-0 z-10 border-b bg-muted/50 backdrop-blur">
			<tr>
				<th scope="col" class="{th} w-[38%] md:w-[26%]">Item</th>
				<th scope="col" class="{th} hidden md:table-cell">Category</th>
				<th scope="col" class="{th} w-20 text-right">Qty</th>
				<th scope="col" class="{th} hidden xl:table-cell">Location</th>
				<th scope="col" class="{th} w-28">Status</th>
				<th scope="col" class="{th} hidden lg:table-cell">Assigned to</th>
				<th scope="col" class="{th} hidden w-28 text-right xl:table-cell">Value</th>
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each data.items as item (item.id)}
				<tr
					class="relative h-12 transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
					data-name={item.name}
				>
					<td class="px-4 py-1.5">
						<button
							type="button"
							onclick={() => (editingId = item.id)}
							class="block w-full min-w-0 cursor-pointer text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
						>
							<span class="sr-only">Edit </span>
							<span class="block truncate font-medium text-foreground">{item.name}</span>
							{#if item.serialNumber}
								<span class="block truncate text-xs tabular-nums text-muted-foreground"
									>{item.serialNumber}</span
								>
							{/if}
						</button>
					</td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground md:table-cell">{item.category}</td>
					<td class="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
						{item.quantity}<span class="text-muted-foreground"> {item.unit}</span>
					</td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground xl:table-cell"
						>{item.location ?? '—'}</td
					>
					<td class="px-4 py-1.5"><Badge status={item.status} domain="inventory" /></td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground lg:table-cell">
						{item.assignedTo ? empName(item.assignedTo) : '—'}
					</td>
					<td class="hidden whitespace-nowrap px-4 py-1.5 text-right tabular-nums xl:table-cell">
						{item.value == null ? '—' : formatCurrency(Number(item.value))}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}
```

`const th = 'px-4 py-2 text-left text-xs font-medium text-muted-foreground'` — lifted from
`EmployeeTable.svelte:12`.

**Why this cannot scroll sideways:** `table-fixed` makes the browser size columns from the `<th>`
widths and the container, ignoring cell content entirely. Every text cell carries `truncate`. There is
no `min-w-max`, no fixed-width input, and no `overflow-x-auto` — so there is nothing left that can
push past the container. Removing the scroll wrapper is deliberate: keeping it would hide a
regression rather than prevent one.

**The card** (shared with the grid direction, and used below `sm` here):

```svelte
{#snippet itemCard(item: Item)}
	<li
		class="relative rounded-lg border bg-card transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
		data-name={item.name}
	>
		<button
			type="button"
			onclick={() => (editingId = item.id)}
			class="flex w-full min-w-0 cursor-pointer flex-col gap-2 p-3 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
		>
			<span class="sr-only">Edit </span>
			<span class="flex min-w-0 items-start justify-between gap-2">
				<span class="min-w-0">
					<span class="block truncate font-medium text-foreground">{item.name}</span>
					<span class="block truncate text-xs text-muted-foreground">
						{item.category}{#if item.serialNumber}<span class="tabular-nums"> · {item.serialNumber}</span>{/if}
					</span>
				</span>
				<span class="shrink-0"><Badge status={item.status} domain="inventory" /></span>
			</span>

			<span class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span class="tabular-nums text-foreground">{item.quantity} {item.unit}</span>
				{#if item.location}<span class="min-w-0 truncate">{item.location}</span>{/if}
				{#if item.value != null}
					<span class="ml-auto shrink-0 tabular-nums text-foreground"
						>{formatCurrency(Number(item.value))}</span
					>
				{/if}
			</span>

			<span class="flex min-w-0 items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
				<span class="shrink-0">Holder</span>
				<span aria-hidden="true">·</span>
				<span class="min-w-0 truncate text-foreground"
					>{item.assignedTo ? empName(item.assignedTo) : 'Unassigned'}</span
				>
			</span>
		</button>
	</li>
{/snippet}

{#snippet cardGrid()}
	<ul class="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each data.items as item (item.id)}{@render itemCard(item)}{/each}
	</ul>
{/snippet}
```

Note the card's inner elements are all `<span>`, not `<div>`/`<p>` — a `<button>` may only contain
phrasing content. This is the detail most card-as-button implementations get wrong, and it is why
`Table.svelte:119-121` refused to make its mobile cards clickable.

### 2.3 ASCII

**1920 — 1582 px inside the panel, 7 columns**

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Inventory                                                                                      │
│ Track company assets, equipment and supplies — quantity, location, status, and who holds each.  │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [🔍 Name, serial, category, location ]  Category[All ▾]  Status[All ▾]  [Filter] [Clear]        │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Items   47 items                                        [ Grid | List ]        [ + Add item ]   │
├──────────────────────┬──────────────┬──────┬───────────────┬─────────┬──────────────┬──────────┤
│ ITEM                 │ CATEGORY     │  QTY │ LOCATION      │ STATUS  │ ASSIGNED TO  │    VALUE │
├──────────────────────┼──────────────┼──────┼───────────────┼─────────┼──────────────┼──────────┤
│ MacBook Pro 14       │ Laptop       │ 1 pc │ Main office   │ ●Assign │ Reyes, Ana   │ ₱112,000 │
│ C02XL0FTJGH5         │              │      │               │         │              │          │
│ Office Chair         │ Furniture    │12 pc │ Main office   │ ●In sto │ —            │   ₱4,500 │
│ Projector (old)      │ AV           │ 1 pc │ Storage       │ ●Retire │ —            │        — │
│ ▓▓▓ focused row shows a 2px ring on the WHOLE row ▓▓▓                                          │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1–20 of 47                                     ← Previous   Page 1 of 3   Next →        │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**1280 — 942 px, Location and Value drop (`xl:table-cell`), 5 columns**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [🔍 search ]  Category[All ▾]  Status[All ▾]  [Filter] [Clear]            │
├──────────────────────────────────────────────────────────────────────────┤
│ Items   47 items                       [ Grid | List ]    [ + Add item ]  │
├───────────────────────┬──────────────┬──────┬──────────┬─────────────────┤
│ ITEM                  │ CATEGORY     │  QTY │ STATUS   │ ASSIGNED TO     │
├───────────────────────┼──────────────┼──────┼──────────┼─────────────────┤
│ MacBook Pro 14        │ Laptop       │ 1 pc │ ●Assigned│ Reyes, Ana      │
│ C02XL0FTJGH5          │              │      │          │                 │
│ Office Chair          │ Furniture    │12 pc │ ●In stock│ —               │
│ Projector (old)       │ AV           │ 1 pc │ ●Retired │ —               │
├──────────────────────────────────────────────────────────────────────────┤
│ Showing 1–20 of 47              ← Previous   Page 1 of 3   Next →         │
└──────────────────────────────────────────────────────────────────────────┘
        no sideways scrollbar — table-fixed + truncate
```

**390 — 324 px, the table is `hidden` and the cards render**

```
┌──────────────────────────────┐
│ Inventory                    │
│ Track company assets, …      │
├──────────────────────────────┤
│ [🔍 Name, serial, category ] │
│ Category [ All            ▾] │
│ Status   [ All            ▾] │
│ [ Filter ]  [ Clear ]        │
├──────────────────────────────┤
│ Items  47 items              │
│ [ Grid | List ] [+ Add item] │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ MacBook Pro 14  ●Assigned│ │
│ │ Laptop · C02XL0FTJGH5    │ │
│ │ 1 pc  Main off.  ₱112,000│ │
│ │ ─────────────────────────│ │
│ │ Holder · Reyes, Ana      │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Office Chair    ●In stock│ │
│ │ Furniture                │ │
│ │ 12 pc  Main off.  ₱4,500 │ │
│ │ ─────────────────────────│ │
│ │ Holder · Unassigned      │ │
│ └──────────────────────────┘ │
├──────────────────────────────┤
│ ← Prev  Page 1 of 3  Next →  │
└──────────────────────────────┘
      whole card is one button
```

**The modal at 390 (`scroll` active)**

```
        ┌──────────────────────────────┐  ← max-h-[90vh]
        │ Edit MacBook Pro 14  [Delete]│  ← header, never scrolls
        │ Added 12 Mar 2026            │
        ├──────────────────────────────┤
        │ Name *                     ▲ │
        │ [ MacBook Pro 14           ] │
        │ Category                     │
        │ [ Laptop                   ] │  scrolls
        │ Quantity        Unit         │
        │ [      1 ]      [ pc      ]  │
        │ Location                     │
        │ [ Main office              ] │
        │ Serial / tag                 │
        │ [ C02XL0FTJGH5             ] │
        │ Status                     ▼ │
        ├──────────────────────────────┤
        │             [Cancel] [ Save ]│  ← footer, never scrolls
        └──────────────────────────────┘
```

---

## 3. Direction B — **Asset Board**

> The same item as a card, at every width — 3 up on desktop, 2 up on tablet, 1 up on phone.

### 3.1 Fields on the card vs in the modal

Same card as §2.2, which is the point. Per card: **Name, Serial, Category, Status badge, Qty · Unit,
Location, Value, Assigned to** — eight of the ten fields, one more than the list shows at 1920,
because a card has two dimensions to spend instead of one.

Modal only: **Notes** (2000 chars — it cannot live on a card without either truncating to
uselessness or making cards different heights).

The trade is direction, not content: a card shows more *per item* and far fewer *items per screen*.
At 1920 the list shows ~20 rows in the viewport; the grid shows ~9 cards.

### 3.2 Markup

`{@render cardGrid()}` from §2.2, verbatim. Breakpoints: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
`sm:grid-cols-2` rather than `/team`'s `sm:grid-cols-2 lg:grid-cols-3` (`team/+page.svelte:97`) because
an inventory card carries a currency column and a holder line that `/team`'s does not — at `lg`
(976 px content) three columns give 310 px each and the value/location row starts wrapping.

### 3.3 ASCII

**1920 — 3 columns**

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Items   47 items                                       [ Grid | List ]        [ + Add item ]    │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐          │
│ │ MacBook Pro 14  ●Assigned│ │ Office Chair    ●In stock│ │ Projector (old)  ●Retired│          │
│ │ Laptop · C02XL0FTJGH5    │ │ Furniture                │ │ AV · PRJ-2014-03         │          │
│ │ 1 pc  Main office ₱112,000│ │ 12 pc Main office  ₱4,500│ │ 1 pc  Storage          — │          │
│ │ ─────────────────────────│ │ ─────────────────────────│ │ ─────────────────────────│          │
│ │ Holder · Reyes, Ana      │ │ Holder · Unassigned      │ │ Holder · Unassigned      │          │
│ └──────────────────────────┘ └──────────────────────────┘ └──────────────────────────┘          │
│ ┌──────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────────┐          │
│ │ Dell U2723QE    ●Assigned│ │ HDMI cable 3m   ●In stock│ │ Ergo keyboard   ●Assigned│          │
│ …                                                                                               │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 1–20 of 47                                     ← Previous   Page 1 of 3   Next →        │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**1280 — 2 columns** (`xl` = 1280 viewport, but content is 976 px → `sm:grid-cols-2` wins)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Items  47 items                        [ Grid | List ]    [ + Add item ]  │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────┐ ┌───────────────────────────────┐       │
│ │ MacBook Pro 14       ●Assigned│ │ Office Chair         ●In stock│       │
│ │ Laptop · C02XL0FTJGH5         │ │ Furniture                     │       │
│ │ 1 pc   Main office    ₱112,000│ │ 12 pc  Main office      ₱4,500│       │
│ │ ──────────────────────────────│ │ ──────────────────────────────│       │
│ │ Holder · Reyes, Ana           │ │ Holder · Unassigned           │       │
│ └───────────────────────────────┘ └───────────────────────────────┘       │
├──────────────────────────────────────────────────────────────────────────┤
│ Showing 1–20 of 47              ← Previous   Page 1 of 3   Next →         │
└──────────────────────────────────────────────────────────────────────────┘
```

**390 — 1 column.** Identical to the list direction's 390 view (§2.3). At this width the two
directions render the same DOM.

### 3.4 Everything else

Keyboard, focus, the modal, the inactive-assignee guard, `size`/`scroll` — **all identical to §1**.
The only difference between the directions is which snippet the `{#if data.view}` renders.

---

## 4. Yes, they share one modal

Both directions call `editingId = item.id`. The `<Dialog>` block in §1.2 is rendered **once**, as a
sibling of the `<section>`, outside the view branch. It reads `editing` from `data.items` by id, so it
does not care which shape was clicked.

This is the ponytail answer to "do we need a new component": **no**. A shared component would only be
justified if the modal were duplicated per branch. It is not. Keeping it inline in `+page.svelte` also
keeps `data.employees`, `data.categories` and `INVENTORY_STATUS_LABELS` in scope without prop drilling.

If a later task needs the same editor on `/employees/[id]` (assets held by one person), extract it
*then*.

---

## 5. What happens to the "Add an item" `<details>` form

**Delete it. Lines 84-179 (96 lines) go away.** The Dialog becomes create-or-edit:

```svelte
let editingId = $state<string | null>(null)
let creating = $state(false)
const editing = $derived(data.items.find((i) => i.id === editingId) ?? null)
const dialogOpen = $derived(creating || editing !== null)
```

- Heading: `{creating ? 'Add an item' : `Edit ${editing.name}`}`
- Action: `action={creating ? '?/create' : '?/update'}`
- The `<input type="hidden" name="id">` and the Delete button render only `{#if !creating}`
- Every `value={...}` becomes `value={editing?.name ?? ''}` (quantity defaults to `1`, matching line 123)
- Submit label: `{creating ? 'Create item' : 'Save'}` — **not** "Add item", so it does not collide with
  the toolbar trigger's accessible name

Why, when keeping the `<details>` would be the shorter diff: after this rework the page would otherwise
carry **two independent forms over the same ten fields**. Add an eleventh field and you edit both, and
the two drift — which is exactly how `notes` ended up in the Add form and absent from the row. The
merged dialog is the shorter file *and* the fewer places to be wrong.

`<datalist id="categories">` (lines 181-183) stays where it is — the modal's category input references it
by id and a `<datalist>` works from anywhere in the document.

The GET filter form (lines 43-81) is untouched, as instructed.

---

## 6. What happens to the footer hint

Lines 340-343 say:

> Edit a row's fields and press **Save**. Setting status to **Assigned** requires choosing an employee.

Both halves are wrong or misplaced after this change.

- **First sentence: delete.** There are no row fields and no Save on the row. The interaction is
  self-describing — the row has `cursor-pointer`, a hover tint, a focus ring, and an accessible name
  that literally begins with "Edit". A caption is not needed; a `<caption class="sr-only">Inventory items.
  Select an item to edit it.</caption>` on the table covers the screen-reader case (already in §2.2).
- **Second sentence: move into the modal**, directly under the Status select, as
  `<p id="i-status-hint" class="text-xs text-muted-foreground">` wired by `aria-describedby="i-status-hint"`.
  A constraint stated 500 px away from the control it constrains is a footnote; stated under the
  control and announced with it, it is a field hint. Wording tightened to state both halves of the
  service-layer invariant (`services/inventory.ts:63-68`), which the current sentence only states one
  half of:

  > Assigned needs an employee below. Any other status clears the holder.

---

## 7. Dialog size and scroll

Covered in full in **§1.5**. Summary: `size="wide"`, `scroll` set, `zIndex={50}`.

---

## 8. Comparison

| | **A — Registry List** | **B — Asset Board** |
|---|---|---|
| Items visible at 1920 | ~20 rows | ~9 cards |
| Fields visible at 1920 | 8 (name, serial, category, qty, unit, location, status, holder, value) | 8 |
| Fields visible at 1280 | 6 | 8 |
| Compare two items' values | easy — a single aligned `tabular-nums` column | hard — the eye zig-zags |
| Find one item by name | easy — a single left-aligned column | medium — scan a 2-D field |
| Reads the filter result at a glance | strong (status column) | strong (badge, top-right of each card) |
| 390 behaviour | falls back to B's cards | native |
| Touch target | 48 px row (`h-12`) | ~112 px card |
| New markup if the other already exists | the `<table>` snippet, ~45 lines | the card snippet, ~35 lines — **already required by A for < sm** |
| Sideways scroll risk | zero (`table-fixed` + `truncate`) | zero (no table) |
| Matches the owner's words | **exactly** — "just making it into a list" | the alternative they asked to see |

---

## 9. Recommendation

**Ship both, with the `/team` toggle, and default to List.**

The reasoning is a cost argument, not a taste one: Direction A **already has to build the card** for
widths below `sm` — a seven-column table at 324 px is the problem we are fixing, not a solution. Once
the card exists, Direction B is:

1. a `view` param in `load` (1 line),
2. a `role="group"` toggle in the toolbar (11 lines, copied from `team/+page.svelte:60-71`),
3. `{:else if data.view === 'grid'}` (1 line).

Roughly 15 lines for a second full view. That is an unusually good trade and it is the same trade
`/team` already took.

Default to **List** because it is what the owner asked for, because an asset registry's core questions
("what do we have 12 of", "who has the MacBooks", "what is this worth") are column-comparison
questions, and because the filter bar above it is column-shaped.

---

## 10. The one trap that will bite

**`update()` resets the form, and the dialog must survive a failed save.**

The e2e at `tests/e2e/inventory.spec.ts:43-50` deliberately saves an invalid state (`ASSIGNED` with no
employee), expects the error, then fixes it and saves again. In the modal that sequence requires:

1. The dialog **stays open** on `fail()`. It does — `editingId` is client state and `update()` does not
   touch it. Free.
2. The user's unsaved edits **survive** the re-render. **Not free.** `update()` defaults to
   `reset: true`, which resets the form element to its HTML default values. The ASSIGNED selection is
   wiped, the user then picks an employee, saves, and it persists with the **old** status — and the test
   passes for the wrong reason (this repo has that exact failure recorded twice already).

The fix is in the §1.2 sketch and is two parts:

```ts
const save = submitFeedback({
	inner: () => async ({ update, result }) => {
		await update({ reset: false })
		if (result.type === 'success') editingId = null
	}
})
```

- `reset: false` keeps the DOM values.
- Returning a callback from `inner` makes `submitFeedback` skip its own `o.update()`
  (`submit-feedback.svelte.ts:70,82,90` — `if (!after) await o.update()`) while still firing the toast.
- `editing` is `$derived` from `data.items` **by id**, not a captured object, so after `invalidateAll`
  it points at fresh server data instead of a stale snapshot.

**Verify this live before calling the task done:** open an item, change Status to Assigned, Save, see
the error, and confirm the Status select still reads Assigned. If it has reverted, `reset: false` is
not wired.

---

## 11. Cost

### Files touched

| File | Change |
|---|---|
| `src/routes/(app)/inventory/+page.svelte` | rewritten below the filter form. −96 (`<details>`), −152 (table+rows), +~230 (toolbar, table snippet, card snippet, modal). Net roughly **−20 lines**. |
| `src/routes/(app)/inventory/+page.server.ts` | **+2 lines only**: `view: url.searchParams.get('view') === 'grid' ? 'grid' : 'list'` into `filter`/return. **Actions and `itemSchema` untouched.** |
| `tests/e2e/inventory.spec.ts` | rewritten, see below |

### New components

**None.** Reused: `Dialog`, `ConfirmButton`, `Badge`, `Pagination`, `SearchInput`, `EmptyState`,
`PageHeader`, `submitFeedback`. `Container.svelte` and `Table.svelte` are deliberately **not** used —
`Table.svelte`'s `onRowClick` puts `role="button"` on a `<tr>` (`Table.svelte:88-96`), which is the
accessibility defect this design exists to avoid, and its mobile cards are explicitly non-clickable
(`Table.svelte:119-121`).

### e2e — line by line

**Line 10** — the helper. Cards and rows both carry `data-name` and CSS hides one of them, so an
element-name selector would double-count.

```ts
// was: page.locator(`tr[data-name="${name}"]`)
const row = (page: import('@playwright/test').Page, name: string) =>
	page.locator(`[data-name="${name}"]:visible`)
```

Lines 18, 19, 25, 26, 29 keep working unchanged against this helper (Playwright's default 1280×720
viewport renders the table branch).

**Line 38-39** — the `<details>` is gone.

```ts
// was: await page.getByText('Add an item').click()
//      await page.locator('#a-name').fill('E2E Monitor')
//      await page.getByRole('button', { name: 'Add item' }).click()
await page.getByRole('button', { name: 'Add item' }).click()
const create = page.getByRole('dialog', { name: 'Add an item' })
await create.locator('#i-name').fill('E2E Monitor')
await create.getByRole('button', { name: 'Create item' }).click()
```

**Lines 43-44** — no inline row controls.

```ts
// was: await row(page, 'E2E Monitor').locator('select[name="status"]').selectOption('ASSIGNED')
//      await row(page, 'E2E Monitor').getByRole('button', { name: 'Save' }).click()
await row(page, 'E2E Monitor').click()
const dlg = page.getByRole('dialog', { name: /^Edit E2E Monitor$/ })
await dlg.locator('select[name="status"]').selectOption('ASSIGNED')
await dlg.getByRole('button', { name: 'Save' }).click()
```

**Lines 48-49** — the dialog is still open from the failed save. Add the assertion that proves it
(this is the §10 trap, made into a test):

```ts
// was: await row(page, 'E2E Monitor').locator('select[name="assignedToId"]').selectOption({ index: 1 })
//      await row(page, 'E2E Monitor').getByRole('button', { name: 'Save' }).click()
await expect(dlg.locator('select[name="status"]')).toHaveValue('ASSIGNED')  // reset:false guard
await dlg.locator('select[name="assignedToId"]').selectOption({ index: 1 })
await dlg.getByRole('button', { name: 'Save' }).click()
await expect(dlg).toHaveCount(0)                                            // closes on success
```

**Lines 53-54** — Delete moved into the modal. `ConfirmDialog` is `role="alertdialog"`
(`ConfirmDialog.svelte:34`) so line 54 still disambiguates correctly.

```ts
// was: await row(page, 'E2E Monitor').getByRole('button', { name: 'Delete' }).click()
await row(page, 'E2E Monitor').click()
await page.getByRole('dialog', { name: /^Edit E2E Monitor$/ })
	.getByRole('button', { name: 'Delete' }).click()
await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()   // unchanged
await expect(row(page, 'E2E Monitor')).toHaveCount(0)                                 // unchanged
```

**New, worth adding** (the whole point of the rework, and cheap):

```ts
test('has no sideways scroll at 390', async ({ page }) => {
	await login(page, USERS.admin)
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	)
	expect(overflow).toBe(0)
})
```

### Adjacent one-liner

`Items ({data.items.length})` at line 187 reports the page slice (max 20), not the registry. The
toolbar sketch in §2.2 uses `data.pagination.total`. Same fix either way, one line.

---

## 12. Honest downsides

**Both directions**

- **Editing 20 items is now 20 modals.** Today an HR user can tab across a row, fix three cells, hit
  Save, and move on; a bulk correction pass ("everything in Storage is now Retired") becomes
  open-change-save-close × N. Nothing here mitigates that. If bulk editing turns out to be a real
  workflow, it wants row checkboxes and a bulk-status action — a separate, larger piece of work, not a
  variation on this one.
- **One extra click to see Notes.** Notes are invisible today too, so this is not a regression, but it
  is also not the fix.
- **Two representations to keep in sync.** The row/card and the modal both render the same item. Add a
  field and you decide twice where it goes. Smaller than today's two-forms problem, not zero.
- **`table-fixed` truncates.** A long location or an employee with a long surname gets an ellipsis
  instead of wrapping. That is the deliberate trade for never scrolling sideways. Mitigation, if the
  owner wants it: a `title={...}` attribute on the truncating cells, as `EmployeeTable.svelte:34,50`
  already does.
- **Delete moved and got quieter.** It went from a visible per-row button to two clicks inside a
  modal. Safer, and slower on purpose. If HR deletes items often they will notice.
- **Focus after delete is hand-wired.** §1.6. It works, but it is the one bit of this design that is
  not inherited from an existing component, so it is the one bit that can silently rot.

**List only**

- Location and Value vanish between 1280 and 1920. A user on a 1366 laptop never sees the value column
  and may not know it exists. The modal is the only place it lives for them.

**Grid only**

- ~9 items per screen at 1920 versus ~20. On a 200-item registry that is a lot of scrolling, and
  server pagination is fixed at 20 (`+page.server.ts:40`), so the grid shows less than one page of
  data in a viewport at desktop widths — the pagination control does more work than it should.
- Comparing values across items is genuinely worse. A finance-shaped question ("what are our five most
  expensive assets") is a list question.

---

## 13. Open questions for the owner

1. **Delete placement in the modal** — header row, opposite the title (my proposal, no height cost), or
   its own strip below Save (last in tab order, +56 px)? Either is one line to swap.
2. **Merge "Add an item" into the same modal** (my recommendation, removes 96 lines and the two-forms
   drift) or keep the `<details>` form as-is (shorter diff today)?
3. **Both views with a toggle, or List only?** Both costs ~15 extra lines because the card is required
   regardless. I recommend both, defaulting to List.
4. `PageHeader`'s description at lines 33-36 is untouched per the brief — confirmed handled by N7.
