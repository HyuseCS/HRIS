---
name: report:n3-hire-form-design
description: "Three named full-width layout directions for /employees/new, with the inner-grid math, markup and costs"
date: 18-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: owner-click-pass
---

# /employees/new — full-width directions

## TL;DR

The owner is right that the page should be full width. The plain two-column version they
were shown is **arithmetically broken on every laptop** — not a taste problem, a maths
problem (see "The cliff" below). Three directions follow. I recommend **C — Companion
Rail**: it is the only one where no field grid is ever made narrower, it makes server
errors findable on a 29-field form, and it retires the duplicate Cancel. One file changes
in all three. No e2e test breaks in any of them, subject to one trap named in §Cost.

---

## Measured shell constants (not estimates)

Read from source, not guessed:

| Fact | Where |
|---|---|
| Sidebar steals 240px at `lg`+ (`lg:pl-60`) | `src/routes/(app)/+layout.svelte:650` |
| Main padding 16px below `lg`, 32px at `lg`+ (`p-4 pt-20 lg:p-8 lg:pt-8`) | `src/routes/(app)/+layout.svelte:651` |
| Page is capped at 768px today (`mx-auto max-w-3xl`) | `src/routes/(app)/employees/new/+page.svelte:78` |
| Tailwind v3 default screens, no custom breakpoints, **no container-queries plugin** | `tailwind.config.ts` (whole file), `package.json` |

So the real content width is:

```
content(v) = v − 240 − 64    for v ≥ 1024
content(v) = v − 32          for v <  1024
```

| Viewport | Content width |
|---|---|
| 390 | 358 |
| 768 | 736 |
| **1024** | **720** |
| 1280 | 976 |
| 1440 | 1136 |
| 1536 | 1232 |
| 1920 | 1616 |

### The cliff (correcting the brief)

The brief assumed an outer `lg:grid-cols-2` gives ~512px columns at 1024. It does not —
the sidebar appears at exactly the same breakpoint. Real numbers with `gap-6` (24px):

| Viewport | Content | Each of 2 columns |
|---|---|---|
| 1024 | 720 | **348** |
| 1280 | 976 | **476** |
| 1440 | 1136 | **556** |
| 1536 | 1232 | **604** |
| 1920 | 1616 | 796 |

A column only reaches the `sm` breakpoint (640px) when content ≥ 1304px, i.e. **viewport
≥ 1608px**. So a naive outer two-column would run `sm:grid-cols-3` inside a 348px box from
1024 all the way to ~1608. Note also that content gets *narrower* going 768 → 1024 (736 →
720) because the sidebar arrives. **Every breakpoint decision below is made on content
width, never on viewport.**

Second measured fact the brief did not have: the `float-left` legend at
`+page.svelte:101-102` (`float-left … w-full` plus `[&>legend+*]:clear-left`) exists
because `<legend>` and a grid sibling do not compose — the browser's special legend box
breaks a grid `<fieldset>`. Any direction that puts the legend *beside* the fields has to
work with that float, and a grid container does **not** flow around a float, so it needs
an explicit matching margin. This is priced into Direction A.

### Shared rulings (apply to all three)

1. **Line 78 wrapper** `mx-auto max-w-3xl` → `space-y-6`. No replacement max-width.
   Structure controls line length, not a cap.
2. **The disclosure never shares a row.** `<details>` (line 411) is the tallest block on
   the page *and* it toggles. In all three directions it spans the full width with nothing
   beside it, so "what happens to the column next to it when it opens" has one answer: no
   such column exists. Its `open={optionalHasError}` behaviour (line 56) is untouched in
   all three.
3. **Duplicate Cancel**: delete the bottom one (line 579). Keep the PageHeader `back()`
   one (lines 80-82) — on a create page the header control *is* the escape hatch, and the
   owner's own title-row rule allows exactly one control there.
4. **Summary string frozen**: `Complete later — 12 optional fields` (line 413) stays
   byte-identical. `tests/e2e/admin.spec.ts:128,159` clicks it by text.
5. Tokens only — `bg-card`, `border`, `border-input`, `text-muted-foreground`,
   `bg-destructive/10`, `text-destructive`, `bg-primary`. All are theme-paired in
   `src/app.css`. No raw hex anywhere below.

---

# Direction A — Section Rail

**One line:** each fieldset keeps its own full-width field grid; the *legend* moves out to
a 192px rail on the left, so the page reads as a labelled ledger and the fields get the
whole remaining width.

## Layout

One column of fieldsets, full bleed. Inside each fieldset, at `xl` and up, the legend
floats into a fixed 192px left rail and the field grid sits beside it with a matching
`ml-48`. Below `xl` the legend sits above the fields exactly as it does today.

The split is gated at `xl` (1280) because that is the first breakpoint where the fields
column clears 640px: fields = content − 192 = 784 at 1280. At `lg` (720 content) it would
be 528 and `sm:grid-cols-3` would be running in a box too small — so `lg` is wrong, and
`xl` is the earliest correct gate.

| Viewport | Content | Fields column |
|---|---|---|
| 1280 | 976 | 784 |
| 1440 | 1136 | 944 |
| 1920 | 1616 | 1424 |

## Inner grids

The fields column is *wider* than today at every size, so columns are added, not removed.
Extra width goes into more fields per row, never into wider inputs.

| # | Fieldset | line | old grid | new grid | width per field @1280 |
|---|---|---|---|---|---|
| 1 | Personal Information | 103 | `sm:grid-cols-3` | `sm:grid-cols-3` (unchanged) | 245 |
| 2 | Contact Information | 151 | `sm:grid-cols-2` | `sm:grid-cols-3` + `sm:col-span-2` on `contactAddress` | 245 / 514 |
| 3 | Account | 177 | `sm:grid-cols-2` | `sm:grid-cols-2` (unchanged) | 380 |
| 4 | Employment Details | 246 | `sm:grid-cols-2` | `sm:grid-cols-2 xl:grid-cols-3` | 245 |
| 5 | Government IDs | 423 | `sm:grid-cols-2` | `sm:grid-cols-2 xl:grid-cols-4` | 178 |
| 6 | Emergency Contact | 486 | `sm:grid-cols-3` | `sm:grid-cols-3` (unchanged) | 245 |
| 7 | Bank / GCash | 523 | `sm:grid-cols-2` | `sm:grid-cols-2 xl:grid-cols-4` | 178 |

Employment Details has exactly 9 fields, so `xl:grid-cols-3` lands on three clean rows.
Gov IDs and Bank have exactly 4, so `xl:grid-cols-4` is one row each.

## Disclosure

Stays where it is, full width, below Employment Details. Its three inner fieldsets get the
same rail treatment. Nothing beside it.

## Submit row

Becomes a sticky bottom bar, copying the shape already shipped at
`src/routes/(app)/performance/templates/[id]/+page.svelte:431`. The Cancel inside it is
deleted per shared ruling 3, so the bar holds one button.

## Markup

Page wrapper:

```svelte
<div class="space-y-6">
	<PageHeader title="Onboard New Employee">
		{#snippet back()}
			<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
		{/snippet}
	</PageHeader>
```

Personal Information (grid unchanged, rail added):

```svelte
<fieldset
	class="rounded-lg border bg-card p-6 [&>legend+*]:clear-left xl:[&>legend+*]:clear-none"
>
	<legend class="float-left mb-4 w-full font-semibold xl:mb-0 xl:w-48 xl:pr-8">
		Personal Information
	</legend>
	<div class="grid gap-4 sm:grid-cols-3 xl:ml-48">
		<div>
			<label for="firstName" class="text-sm font-medium"
				>First Name <span class="text-destructive">*</span></label
			>
			<input
				id="firstName"
				name="firstName"
				aria-invalid={invalid('firstName')}
				required
				value={form?.values?.firstName ?? ''}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			{#if form?.fieldErrors?.firstName}
				<p class="mt-1 text-xs text-destructive">{form.fieldErrors.firstName[0]}</p>
			{/if}
		</div>
	</div>
</fieldset>
```

`w-48` is 192px and `pr-8` is 32px of that (border-box, set by Tailwind preflight), so the
legend's text column is 160px and the grid's `ml-48` lines up exactly with the float's
right edge. The margin is what holds the rail — the grid container does not wrap the
float.

Employment Details (rail + three columns):

```svelte
<fieldset
	class="rounded-lg border bg-card p-6 [&>legend+*]:clear-left xl:[&>legend+*]:clear-none"
>
	<legend class="float-left mb-4 w-full font-semibold xl:mb-0 xl:w-48 xl:pr-8">
		Employment Details
	</legend>
	<div class="grid gap-4 sm:grid-cols-2 xl:ml-48 xl:grid-cols-3">
		<div>
			<label for="departmentId" class="text-sm font-medium"
				>Department <span class="text-destructive">*</span></label
			>
			<select
				id="departmentId"
				name="departmentId"
				aria-invalid={invalid('departmentId')}
				required
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">Select department…</option>
				{#each data.departments as dept (dept.id)}
					<option value={dept.id}>{dept.name}</option>
				{/each}
			</select>
			{#if form?.fieldErrors?.departmentId}
				<p class="mt-1 text-xs text-destructive">{form.fieldErrors.departmentId[0]}</p>
			{/if}
		</div>
	</div>
</fieldset>
```

Sticky action bar:

```svelte
<div
	class="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8"
>
	<button
		type="submit"
		disabled={create.busy}
		class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
	>
		{create.busy ? 'Creating…' : 'Create Employee'}
	</button>
</div>
```

## ASCII

**1920 (content 1616)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Onboard New Employee                                            [ Cancel ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Required to hire                                                             │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Personal        │ [First Name*]      [Last Name*]       [Middle Name]    │ │
│ │ Information     │                                                        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Contact         │ [Phone]            [Address ─────────────────────────] │ │
│ │ Information     │                                                        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Account         │ [Email*]                    [Password]                 │ │
│ │                 │ [Role*]                     [Discord ID]               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Employment      │ [Department*]   [Job Title*]     [Employment Type*]    │ │
│ │ Details         │ [Start Date*]   [Rate Basis*]    [Monthly Salary*]     │ │
│ │                 │ [Reports To]    [Position]       [Work Schedule]       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ▸ Complete later — 12 optional fields                                    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ (sticky)                                              [ Create Employee ]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**1280 (content 976)** — identical structure, rail still 192px, fields 784. Employment
Details still 3-up (245px each); Gov IDs / Bank 4-up (178px each).

```
┌────────────────────────────────────────────────────────────┐
│ Personal    │ [First Name*]  [Last Name*]  [Middle Name]   │
│ Information │                                              │
└────────────────────────────────────────────────────────────┘
```

**390 (content 358)** — rail off, everything single column, exactly today's shape.

```
┌──────────────────────────┐
│ Onboard New Employee     │
│              [ Cancel ]  │
├──────────────────────────┤
│ Personal Information     │
│ [First Name*]            │
│ [Last Name*]             │
│ [Middle Name]            │
├──────────────────────────┤
│ ▸ Complete later — 12 …  │
├──────────────────────────┤
│ (sticky) [Create Employee]│
└──────────────────────────┘
```

## Reading order and tab order

Identical, and identical to today: First → Last → Middle → Phone → Address → Email →
Password → Role → Discord → Department → Job Title → Employment Type → Start Date → Rate
Basis → Salary → Reports To → Position → Work Schedule → disclosure summary → (when open)
SSS → PhilHealth → Pag-IBIG → TIN → Emergency ×3 → Bank ×4 → Create Employee. The rail is
the `<legend>` itself, so it is the group's accessible name and is not a separate tab
stop. **Zero a11y delta.**

## Cost

- Files touched: `src/routes/(app)/employees/new/+page.svelte` only.
- ~14 class strings edited, 1 line deleted (579), 0 new components, 0 new deps.
- `tests/e2e/admin.spec.ts`: **no break.** All locators are `getByLabel`,
  `locator('select[name=…]')`, `getByRole('button', { name: 'Create Employee' })` and
  `getByText('Complete later — 12 optional fields')`. None of those reads a wrapper class.

## Downsides (honest)

- The rail is 192px of white space on every fieldset. On Contact Information (two fields)
  the rail is taller-looking than the content it labels — the ledger reads a bit empty
  there.
- The float + `ml-48` pairing is brittle: change one of the two numbers and the rail
  silently misaligns. There is no compiler check for it.
- It does not read as "two column" in the sense the owner said. They may look at it and
  say the fields still sit in one river.
- It invites description copy under each legend (that is what the pattern is for) and
  there is none today. Writing it is a separate copy decision, not mine to make.

---

# Direction B — Two Tracks

**One line:** the owner's literal ask, done correctly — two fixed tracks assigned by
meaning (who they are / how they are employed), with every inner grid collapsed while the
split is on.

## Layout

At `xl` and up, a two-column grid with `items-start`. Left track: Personal Information,
Contact Information, Account. Right track: Employment Details. The tracks are **explicit
divs, not auto-flow**, so the assignment is a design decision rather than whatever the
grid algorithm does with seven ragged boxes.

Track width = (content − 32) / 2:

| Viewport | Content | Each track |
|---|---|---|
| 1280 | 976 | 472 |
| 1440 | 1136 | 552 |
| 1536 | 1232 | 600 |
| 1920 | 1616 | 792 |

A track never reaches 640px until viewport ~1616. **So the inner grids must collapse — this
is not optional.** Below `xl` there is one track and the grids behave as today.

## Inner grids

The rule is a three-step chain: `sm` = today, `xl` = one column (track too narrow), `2xl` =
back to today's count (track wide enough again at 600px, only just).

| # | Fieldset | line | old grid | new grid | width per field @1280 / @1920 |
|---|---|---|---|---|---|
| 1 | Personal Information | 103 | `sm:grid-cols-3` | `sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3` | 472 / 248 |
| 2 | Contact Information | 151 | `sm:grid-cols-2` | `sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2` | 472 / 384 |
| 3 | Account | 177 | `sm:grid-cols-2` | `sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2` | 472 / 384 |
| 4 | Employment Details | 246 | `sm:grid-cols-2` | `sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2` | 472 / 384 |
| 5 | Government IDs | 423 | `sm:grid-cols-2` | `sm:grid-cols-2` (unchanged — outside the tracks) | 472 / 796 |
| 6 | Emergency Contact | 486 | `sm:grid-cols-3` | `sm:grid-cols-3` (unchanged — outside the tracks) | 315 / 531 |
| 7 | Bank / GCash | 523 | `sm:grid-cols-2` | `sm:grid-cols-2` (unchanged — outside the tracks) | 472 / 796 |

Fieldsets 5-7 are unchanged because the disclosure sits **below** both tracks at full
width — they never live inside a narrow track. At 1920 that leaves a 796px input for a
bank account number, which is too wide; if this direction is chosen, add
`2xl:grid-cols-4` to 5 and 7 and `2xl:grid-cols-6` to 6. Flagging it rather than hiding
it.

Height balance: left track carries 9 fields in 3 fieldsets, right track 9 fields in 1.
Stacked one-up at `xl`, left is roughly two fieldset chromes (~200px) taller. `items-start`
means the right track just ends early. That gap is B's permanent cosmetic cost.

## Disclosure

Sibling **after** the grid, spanning full width. Nothing beside it, so opening it pushes
only itself and the action bar down. This is the whole reason it is not inside a track —
put it in the right track to "balance the heights" and every open/close jerks the left
track's scroll position.

## Submit row

Same sticky bar as Direction A, below the disclosure, spanning both tracks. Bottom Cancel
deleted.

## Markup

```svelte
<div class="space-y-6">
	<PageHeader title="Onboard New Employee">
		{#snippet back()}
			<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
		{/snippet}
	</PageHeader>

	{#key data.organizationId}
		<form method="POST" action="?/create" use:enhance={create.enhance} class="space-y-8">
			<h2 class="text-sm font-semibold text-muted-foreground">Required to hire</h2>

			<div class="grid items-start gap-8 xl:grid-cols-2">
				<div class="space-y-8">
					<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">
						<legend class="float-left mb-4 w-full font-semibold">Personal Information</legend>
						<div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
							<div>
								<label for="firstName" class="text-sm font-medium"
									>First Name <span class="text-destructive">*</span></label
								>
								<input
									id="firstName"
									name="firstName"
									aria-invalid={invalid('firstName')}
									required
									value={form?.values?.firstName ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
								{#if form?.fieldErrors?.firstName}
									<p class="mt-1 text-xs text-destructive">{form.fieldErrors.firstName[0]}</p>
								{/if}
							</div>
						</div>
					</fieldset>

					<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">
						<legend class="float-left mb-4 w-full font-semibold">Contact Information</legend>
						<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
							<div>
								<label for="contactPhone" class="text-sm font-medium">Phone</label>
								<input
									id="contactPhone"
									name="contactPhone"
									type="tel"
									value={form?.values?.contactPhone ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							</div>
							<div>
								<label for="contactAddress" class="text-sm font-medium">Address</label>
								<input
									id="contactAddress"
									name="contactAddress"
									value={form?.values?.contactAddress ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							</div>
						</div>
					</fieldset>
				</div>

				<div class="space-y-8">
					<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">
						<legend class="float-left mb-4 w-full font-semibold">Employment Details</legend>
						<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"></div>
					</fieldset>
				</div>
			</div>

			<details open={optionalHasError} class="rounded-md border">
				<summary class="cursor-pointer px-4 py-3 text-sm font-semibold"
					>Complete later — 12 optional fields</summary
				>
				<div class="space-y-8 border-t p-4"></div>
			</details>

			<div
				class="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8"
			>
				<button
					type="submit"
					disabled={create.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{create.busy ? 'Creating…' : 'Create Employee'}
				</button>
			</div>
		</form>
	{/key}
</div>
```

## ASCII

**1920 (content 1616, tracks 792)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Onboard New Employee                                            [ Cancel ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Required to hire                                                             │
│ ┌───────────────────────────────────┐  ┌──────────────────────────────────┐  │
│ │ Personal Information              │  │ Employment Details               │  │
│ │ [First Name*]     [Last Name*]    │  │ [Department*]   [Job Title*]     │  │
│ │ [Middle Name]                     │  │ [Empl. Type*]   [Start Date*]    │  │
│ └───────────────────────────────────┘  │ [Rate Basis*]   [Salary*]        │  │
│ ┌───────────────────────────────────┐  │ [Reports To]    [Position]       │  │
│ │ Contact Information               │  │ [Work Schedule]                  │  │
│ │ [Phone]           [Address]       │  └──────────────────────────────────┘  │
│ └───────────────────────────────────┘                                        │
│ ┌───────────────────────────────────┐        (right track ends early —       │
│ │ Account                           │         this gap is permanent)         │
│ │ [Email*]          [Password]      │                                        │
│ │ [Role*]           [Discord ID]    │                                        │
│ └───────────────────────────────────┘                                        │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ▸ Complete later — 12 optional fields          (spans both tracks)       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ (sticky)                                              [ Create Employee ]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**1280 (content 976, tracks 472)** — same shape, but every inner grid is **one column**:

```
┌─────────────────────────────────────────────────────────┐
│ ┌───────────────────────┐  ┌──────────────────────────┐ │
│ │ Personal Information  │  │ Employment Details       │ │
│ │ [First Name*        ] │  │ [Department*           ] │ │
│ │ [Last Name*         ] │  │ [Job Title*            ] │ │
│ │ [Middle Name        ] │  │ [Employment Type*      ] │ │
│ └───────────────────────┘  │ [Start Date*           ] │ │
│ ┌───────────────────────┐  │ [Rate Basis*           ] │ │
│ │ Contact Information   │  │ [Basic Monthly Salary*]  │ │
│ │ [Phone              ] │  │ [Reports To            ] │ │
│ │ [Address            ] │  │ [Position              ] │ │
│ └───────────────────────┘  │ [Work Schedule         ] │ │
│ ┌───────────────────────┐  └──────────────────────────┘ │
│ │ Account               │                               │
│ │ [Email*             ] │                               │
│ │ [Password           ] │                               │
│ │ [Role*              ] │                               │
│ │ [Discord ID         ] │                               │
│ └───────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
```

**390 (content 358)** — split off, single column, today's shape.

## Reading order and tab order

**Column-major, and it must be stated to the owner.** DOM order = left track complete,
then right track: First → Last → Middle → Phone → Address → Email → Password → Role →
Discord → **then** Department → Job Title → Employment Type → Start Date → Rate Basis →
Salary → Reports To → Position → Work Schedule → disclosure → optional fields in place →
Create Employee. Tab order matches the visual order exactly (down the left, then down the
right). It does **not** match a row-wise scan; a user whose eye goes Personal → Employment
will find Tab disagrees with them.

## Cost

- Files touched: `src/routes/(app)/employees/new/+page.svelte` only.
- ~20 lines: 1 wrapper, 2 track divs opened/closed, 4 inner grid class chains, the
  disclosure moved out of the required block, submit row, 1 deletion.
- **`{@const}` risk: none** — no new `{@const}` is introduced. The two track divs are plain
  elements.
- `tests/e2e/admin.spec.ts`: **no break**, same reasoning as A.

## Downsides (honest)

- **Every inner grid gets narrower between 1280 and 1536.** A 472px track showing one field
  per row means a 1280px laptop sees *fewer* fields per screen than today's 768px centred
  form does in places. This is the direction paying for the outer split with inner density.
- The `sm:grid-cols-N xl:grid-cols-1 2xl:grid-cols-N` chain is three breakpoints to hold in
  your head per fieldset, and a future field added to Employment Details silently lands in
  a 1-up column at 1280.
- Permanent ragged bottom on the right track.
- Fieldsets 5-7 are left at `sm:grid-cols-2/3` and go too wide at 1920 unless the flagged
  `2xl` additions are made.
- Column-major tab order is correct but surprising.

---

# Direction C — Companion Rail (recommended)

**One line:** the form keeps the whole left side and every field grid gets *wider*, and the
recovered width on the right becomes a sticky companion that does what the form cannot —
tells you where you are, where the errors are, and holds the one submit.

## The idea

The form has 29 fields across 7 fieldsets, 10 of them required, with 11 more hidden behind
a disclosure. The real problem on this page is not that it is centred — it is that on a
failed submit you get a red banner saying "Please fix the errors below" (line 89) and then
have to hunt. The `optionalHasError` hack (line 56) exists solely to stop that hunt ending
in a collapsed box. Direction C turns the recovered horizontal space into the fix for that,
instead of spending it on squeezing fields.

It is still two columns. It is just that the second column is not more form.

## Layout

At `xl` and up: `grid-cols-[minmax(0,1fr)_16rem]` with `gap-8`, `items-start`. Left = the
form sections and the disclosure. Right = a 256px `sticky top-8` aside. Below `xl` the
aside stacks under the form, so the submit stays last on mobile.

Form column = content − 32 − 256:

| Viewport | Content | Form column | vs today (768 cap) |
|---|---|---|---|
| 1280 | 976 | **688** | +18% |
| 1440 | 1136 | 848 | +45% |
| 1536 | 1232 | 944 | +62% |
| 1920 | 1616 | 1328 | +128% |

688 at 1280 clears the 640 `sm` breakpoint with 48px of headroom — enough that a 15px
classic scrollbar (673) still clears it. That headroom is why the rail is `16rem` and not
`18rem`; at 18rem the margin drops to 16px and a scrollbar eats it.

## Inner grids

**No grid ever gets narrower.** Three of seven change, all additive, all at `2xl`.

| # | Fieldset | line | old grid | new grid | width per field @1280 / @1920 |
|---|---|---|---|---|---|
| 1 | Personal Information | 103 | `sm:grid-cols-3` | `sm:grid-cols-3` (unchanged) | 213 / 426 |
| 2 | Contact Information | 151 | `sm:grid-cols-2` | `sm:grid-cols-3` + `sm:col-span-2` on `contactAddress` | 213 / 426 (addr 2×) |
| 3 | Account | 177 | `sm:grid-cols-2` | `sm:grid-cols-2` (unchanged) | 332 / 652 |
| 4 | Employment Details | 246 | `sm:grid-cols-2` | `sm:grid-cols-2 2xl:grid-cols-3` | 332 / 426 |
| 5 | Government IDs | 423 | `sm:grid-cols-2` | `sm:grid-cols-2 2xl:grid-cols-4` | 332 / 314 |
| 6 | Emergency Contact | 486 | `sm:grid-cols-3` | `sm:grid-cols-3` (unchanged) | 213 / 426 |
| 7 | Bank / GCash | 523 | `sm:grid-cols-2` | `sm:grid-cols-2 2xl:grid-cols-4` | 332 / 314 |

Rows 4, 5, 7 are the only ones with a new class, and each one is a single appended token.
The `2xl` gate is checked: at 1536 the form column is 944, so 3-up is 314 and 4-up is 236.
Both comfortable.

## Disclosure

Stays in the form column, full width of it, below Employment Details. **What happens to the
column beside it when it opens: nothing.** The aside is `sticky top-8` — it is pinned to
the viewport, not sized to the form, so a 900px expansion on the left does not move it by
a pixel. That is the direct answer the brief asked for, and C is the only direction where
the answer is "by construction" rather than "because we kept them apart".

`open={optionalHasError}` is untouched, and it now also serves the rail's jump link — an
anchor to `#sssNumber` lands on a `<details>` that has already opened itself.

## Submit row

The whole `<div class="flex justify-end gap-3">` at line 578 is **deleted**. Create
Employee moves into the aside as a full-width button. Cancel stays only in the PageHeader.
There is exactly one Create button in the DOM — see the Cost trap.

## Markup

Script addition (avoids `Object.keys` in markup and avoids any `{@const}`):

```svelte
const errorFields = $derived(
	Object.keys(
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors ?? {}
	)
)
```

Page wrapper and shell:

```svelte
<div class="space-y-6">
	<PageHeader title="Onboard New Employee">
		{#snippet back()}
			<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{typeof form.error === 'string' ? form.error : 'Please fix the errors below.'}
		</div>
	{/if}

	{#key data.organizationId}
		<form
			method="POST"
			action="?/create"
			use:enhance={create.enhance}
			class="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_16rem]"
		>
			<div class="space-y-8">
				<h2 class="text-sm font-semibold text-muted-foreground">Required to hire</h2>

				<fieldset
					id="sec-personal"
					class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left scroll-mt-8"
				>
					<legend class="float-left mb-4 w-full font-semibold">Personal Information</legend>
					<div class="grid gap-4 sm:grid-cols-3">
						<div>
							<label for="firstName" class="text-sm font-medium"
								>First Name <span class="text-destructive">*</span></label
							>
							<input
								id="firstName"
								name="firstName"
								aria-invalid={invalid('firstName')}
								required
								value={form?.values?.firstName ?? ''}
								class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm scroll-mt-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
							{#if form?.fieldErrors?.firstName}
								<p class="mt-1 text-xs text-destructive">{form.fieldErrors.firstName[0]}</p>
							{/if}
						</div>
					</div>
				</fieldset>

				<fieldset
					id="sec-employment"
					class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left scroll-mt-8"
				>
					<legend class="float-left mb-4 w-full font-semibold">Employment Details</legend>
					<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
						<div>
							<label for="departmentId" class="text-sm font-medium"
								>Department <span class="text-destructive">*</span></label
							>
							<select
								id="departmentId"
								name="departmentId"
								aria-invalid={invalid('departmentId')}
								required
								class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm scroll-mt-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<option value="">Select department…</option>
								{#each data.departments as dept (dept.id)}
									<option value={dept.id}>{dept.name}</option>
								{/each}
							</select>
							{#if form?.fieldErrors?.departmentId}
								<p class="mt-1 text-xs text-destructive">{form.fieldErrors.departmentId[0]}</p>
							{/if}
						</div>
					</div>
				</fieldset>

				<details open={optionalHasError} class="rounded-md border">
					<summary class="cursor-pointer px-4 py-3 text-sm font-semibold"
						>Complete later — 12 optional fields</summary
					>
					<div class="space-y-8 border-t p-4"></div>
				</details>
			</div>

			<aside class="space-y-4 xl:sticky xl:top-8">
				{#if errorFields.length}
					<div class="rounded-lg border border-destructive bg-destructive/10 p-3">
						<p class="text-sm font-medium text-destructive">
							{errorFields.length} field{errorFields.length === 1 ? '' : 's'} need attention
						</p>
						<a
							href="#{errorFields[0]}"
							class="mt-1 inline-block text-xs text-destructive underline underline-offset-2"
							>Go to the first one</a
						>
					</div>
				{/if}

				<nav aria-label="Form sections" class="hidden rounded-lg border bg-card p-2 xl:block">
					<ul class="space-y-0.5 text-sm">
						<li>
							<a
								href="#sec-personal"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>Personal Information</a
							>
						</li>
						<li>
							<a
								href="#sec-employment"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>Employment Details</a
							>
						</li>
					</ul>
				</nav>

				<button
					type="submit"
					disabled={create.busy}
					class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{create.busy ? 'Creating…' : 'Create Employee'}
				</button>
			</aside>
		</form>
	{/key}
</div>
```

Notes on the markup:

- The aside is inside `<form>`, so the button needs no `form=` attribute and no new id.
- `href="#firstName"` targets the input itself. Browsers move focus to a focusable fragment
  target, so the jump also lands the caret — no JS.
- `scroll-mt-8` on the anchor targets keeps them clear of the top edge after a jump.
- The jump nav is `hidden xl:block`: on mobile a section list under a form you already
  scrolled is noise, and hiding it keeps it out of the mobile tab order entirely. Its
  `px-2 py-1.5` rows are ~30px tall, under the 44px touch guidance — acceptable precisely
  because it only exists at `xl`, where the pointer is fine. The repo's own coarse-pointer
  floor (`src/app.css`, `@media (pointer: coarse)`) is 24px and does not apply to anchors.

## ASCII

**1920 (content 1616 → form 1328, rail 256)**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Onboard New Employee                                            [ Cancel ]   │
├─────────────────────────────────────────────────────────┬────────────────────┤
│ Required to hire                                        │ ┌────────────────┐ │
│ ┌─────────────────────────────────────────────────────┐ │ │ 2 fields need  │ │
│ │ Personal Information                                │ │ │ attention      │ │
│ │ [First Name*]   [Last Name*]    [Middle Name]       │ │ │ Go to the first│ │
│ └─────────────────────────────────────────────────────┘ │ └────────────────┘ │
│ ┌─────────────────────────────────────────────────────┐ │ ┌────────────────┐ │
│ │ Contact Information                                 │ │ │ Personal Info  │ │
│ │ [Phone]         [Address ──────────────────────]    │ │ │ Contact Info   │ │
│ └─────────────────────────────────────────────────────┘ │ │ Account        │ │
│ ┌─────────────────────────────────────────────────────┐ │ │ Employment     │ │
│ │ Account                                             │ │ └────────────────┘ │
│ │ [Email*]                    [Password]              │ │                    │
│ │ [Role*]                     [Discord ID]            │ │ [Create Employee]  │
│ └─────────────────────────────────────────────────────┘ │                    │
│ ┌─────────────────────────────────────────────────────┐ │   ▲ sticky: does   │
│ │ Employment Details                                  │ │     not move when  │
│ │ [Department*] [Job Title*]   [Employment Type*]     │ │     the disclosure │
│ │ [Start Date*] [Rate Basis*]  [Monthly Salary*]      │ │     below opens    │
│ │ [Reports To]  [Position]     [Work Schedule]        │ │                    │
│ └─────────────────────────────────────────────────────┘ │                    │
│ ┌─────────────────────────────────────────────────────┐ │                    │
│ │ ▾ Complete later — 12 optional fields               │ │                    │
│ │   Government IDs  [SSS][PhilHealth][Pag-IBIG][TIN]  │ │                    │
│ │   Emergency       [Name][Relationship][Phone]       │ │                    │
│ │   Bank / GCash    [Bank][Acct Name][Acct No][GCash] │ │                    │
│ └─────────────────────────────────────────────────────┘ │                    │
└─────────────────────────────────────────────────────────┴────────────────────┘
```

**1280 (content 976 → form 688, rail 256)** — same shape; Employment Details is 2-up
(332px each) because `2xl:grid-cols-3` has not kicked in yet.

```
┌───────────────────────────────────────────┬────────────────┐
│ ┌───────────────────────────────────────┐ │ ┌────────────┐ │
│ │ Personal Information                  │ │ │ Personal   │ │
│ │ [First*]   [Last*]   [Middle]         │ │ │ Contact    │ │
│ └───────────────────────────────────────┘ │ │ Account    │ │
│ ┌───────────────────────────────────────┐ │ │ Employment │ │
│ │ Employment Details                    │ │ └────────────┘ │
│ │ [Department*]     [Job Title*]        │ │                │
│ │ [Empl. Type*]     [Start Date*]       │ │ [Create Empl.] │
│ │ [Rate Basis*]     [Salary*]           │ │                │
│ │ [Reports To]      [Position]          │ │  (sticky)      │
│ │ [Work Schedule]                       │ │                │
│ └───────────────────────────────────────┘ │                │
│ ┌───────────────────────────────────────┐ │                │
│ │ ▸ Complete later — 12 optional fields │ │                │
│ └───────────────────────────────────────┘ │                │
└───────────────────────────────────────────┴────────────────┘
```

**390 (content 358)** — one column, rail stacks last, jump nav hidden:

```
┌──────────────────────────┐
│ Onboard New Employee     │
│              [ Cancel ]  │
├──────────────────────────┤
│ Required to hire         │
│ ┌──────────────────────┐ │
│ │ Personal Information │ │
│ │ [First Name*]        │ │
│ │ [Last Name*]         │ │
│ │ [Middle Name]        │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ Employment Details   │ │
│ │ …                    │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ ▸ Complete later —   │ │
│ │   12 optional fields │ │
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 2 fields need        │ │  ← only when the server rejected
│ │ attention            │ │
│ └──────────────────────┘ │
│ [   Create Employee    ] │
└──────────────────────────┘
```

## Reading order and tab order

Unchanged from today for the whole form, then the aside:

First → Last → Middle → Phone → Address → Email → Password → Role → Discord → Department →
Job Title → Employment Type → Start Date → Rate Basis → Salary → Reports To → Position →
Work Schedule → disclosure summary → (when open) SSS → PhilHealth → Pag-IBIG → TIN →
Emergency Name → Relationship → Emergency Phone → Bank → Account Name → Account Number →
GCash → **error link (only when present)** → 4 jump links → Create Employee.

The one wrinkle, stated plainly: a sighted user sees the rail at the top right on first
paint, but reaches it by keyboard only after the whole form. That is the standard
trailing-sidebar trade and it is the right one here — the submit belongs last, and the jump
links are a shortcut, not a step.

## Cost

- Files touched: `src/routes/(app)/employees/new/+page.svelte` only.
- ~50 lines net: 1 `$derived`, the form class, 4 fieldset `id` + `scroll-mt-8`, 3 inner grid
  tokens, ~35 lines of aside, 10 lines deleted (the old submit row).
- 0 new components, 0 new deps, 0 new client state, no `{@const}`.
- `tests/e2e/admin.spec.ts`: **no break.** `getByLabel` (lines 37-48, 116-130, 145-163),
  `locator('select[name=…]')` (190, 216, 229, 251), `getByText('Complete later — 12
  optional fields')` (128, 159) and `getByRole('button', { name: 'Create Employee' })` (49)
  all still resolve.
- **The trap, for whoever builds this:** `getByRole('button', { name: 'Create Employee' })`
  runs in strict mode. If the build keeps the old submit button *and* adds the rail one,
  that locator matches two elements and **every one of the four onboarding e2e tests
  fails**. Playwright's role engine does skip elements hidden with `display:none`, so an
  `xl:hidden` / `hidden xl:block` duplicate pair would probably resolve — do not rely on
  it. Ship exactly one Create Employee button, as the markup above does.

## Downsides (honest)

- It is the largest diff of the three (~50 lines vs ~14 and ~20).
- The rail tabs last (above).
- The error box shows a count and a link to the *first* error, not a list. A full list
  needs a field-name → label map, which is a second source of truth for labels that can
  drift. I deliberately did not build it. If the owner wants the list, that map is the
  cost.
- The jump nav is desktop-only, so its value is invisible to anyone reviewing on a phone.
- A reviewer may say the right column "is not part of the form" and therefore does not
  satisfy "two column layout". It is a framing the owner has to accept or reject.

---

# Comparison

| | A — Section Rail | B — Two Tracks | C — Companion Rail |
|---|---|---|---|
| Matches the owner's literal words | Partly | **Yes** | Partly (2 cols, 2nd is not fields) |
| Inner grids made **narrower** anywhere | Never | **Yes, 1280-1536** | Never |
| Inner grids changed | 4 of 7 | 4 of 7 (+3 flagged) | 3 of 7 |
| Breakpoints to reason about per fieldset | 2 | **3** | 2 |
| Disclosure has anything beside it | No | No | No (rail is sticky) |
| Duplicate Cancel resolved | Yes | Yes | Yes |
| Server errors easier to find than today | No | No | **Yes** |
| New a11y wrinkles | None | Column-major tab order | Rail tabs last |
| Diff size | ~14 lines | ~20 lines | ~50 lines |
| New components / deps / state | None | None | None |
| e2e risk | None | None | None (one trap, named) |
| Permanent cosmetic cost | 192px empty rail on small fieldsets | Ragged right track bottom | Rail is thin on a short form |

# Recommendation

**Direction C — Companion Rail.**

Three reasons, in order:

1. **It designs the nesting problem out instead of patching it.** A and B both have to
   answer "what happens to seven inner grids". C's answer is that the form column only ever
   gets wider — 688px at 1280 against today's 768px cap, 1328px at 1920 — so no grid is
   ever squeezed and only three of seven need a class at all. B has to make fields
   *narrower* on a 1280px laptop to satisfy a layout meant to give them more room. That is
   the wrong trade on a data-entry page.
2. **It is the only one that pays for the width with a user benefit.** The other two spend
   1616px of screen on rearranging the same boxes. C turns it into the thing this form
   actually lacks: on a 29-field form with 11 fields behind a disclosure, "Please fix the
   errors below" plus a hunt is the real failure, and the `optionalHasError` hack is the
   scar tissue proving it. A count, a jump, and a pinned submit are the answer.
3. **The sticky rail is the clean answer to the disclosure question.** A and B answer "what
   is beside the `<details>` when it opens" by keeping the space empty. C answers it by
   construction — the rail is pinned to the viewport, so a 900px expansion moves nothing.

If the owner rejects the rail as "not really two columns", fall back to **A**, not B. A is
the cheapest diff, has zero accessibility delta, and still never narrows a field. B should
only be chosen if the owner explicitly accepts one-field-per-row inside the tracks between
1280 and 1536 after seeing it.

---

# Unresolved questions

1. **Direction A only:** the rail pattern wants one line of guidance copy under each
   legend. There is none today. Does the owner want that copy written, or should the rail
   hold the legend alone?
2. **Direction B only:** at 1920 fieldsets 5-7 sit at 796px per field inside the
   full-width disclosure. Confirm the flagged `2xl:grid-cols-4` / `2xl:grid-cols-6`
   additions are wanted, or accept the wide inputs.
3. **All directions:** should the PageHeader control stay the word "Cancel", or become a
   "Back to employees" link now that it is the only one? The owner's title-row rule allows
   one control either way; this is a copy call.
4. **Direction C:** count-plus-first-link, or a full list of failing fields? The full list
   needs a field-name → label map and I did not build one.
5. Nothing here was verified in a live browser — the dev server is the owner's to start.
   Every number above is derived from the CSS constants cited in §Measured shell constants.
   A screenshot pass at 390 / 1280 / 1920 in both themes should follow whichever direction
   is picked, before it is called done.
