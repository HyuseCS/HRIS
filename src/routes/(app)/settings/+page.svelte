<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	const cards = [
		{
			href: '/settings/company',
			title: 'Company Information',
			desc: 'Name, address, logo',
			super: false
		},
		{
			href: '/settings/org',
			title: 'Org Structure',
			desc: 'Departments & positions',
			super: false
		},
		{
			href: '/settings/org-chart',
			title: 'Org Chart',
			desc: 'Reporting hierarchy',
			super: false
		},
		{ href: '/settings/schedules', title: 'Work Schedules', desc: 'Shift templates', super: false },
		{
			href: '/settings/pay-codes',
			title: 'Earnings & Deductions',
			desc: 'Payroll codes',
			super: false
		},
		{
			href: '/settings/salary-grades',
			title: 'Salary Grades',
			desc: 'Pay bands per position',
			super: false
		},
		{
			href: '/settings/leave-types',
			title: 'Leave Types',
			desc: 'Paid/unpaid, allocation, carry-over',
			super: false
		},
		{
			href: '/settings/onboarding',
			title: 'Onboarding Checklist',
			desc: 'Derived & manual 201-file steps',
			super: false
		},
		{
			href: '/settings/offboarding',
			title: 'Offboarding Checklist',
			desc: 'Clearance steps for separations',
			super: false
		},
		{
			href: '/settings/performance',
			title: 'Review Schedule',
			desc: 'How often reviews open, and time to complete',
			hrOrgwide: true
		},
		{
			href: '/settings/posting-approvers',
			title: 'Posting Approvers',
			desc: 'Who approves each department’s job postings',
			super: false
		},
		{
			href: '/settings/job-boards',
			title: 'Job Boards',
			desc: 'Where postings can be published',
			super: false
		},
		{
			href: '/payroll/config',
			title: 'Payroll Config',
			desc: 'Cutoffs, frequency, premium multipliers',
			super: true
		},
		{
			href: '/settings/backup',
			title: 'Document Backup',
			desc: 'Automatic 201-file and attachment backups',
			super: true
		},
		{
			href: '/payroll/statutory-rates',
			title: 'Statutory Rates',
			desc: 'SSS, PhilHealth, Pag-IBIG, BIR tax',
			statutory: true
		},
		{
			href: '/settings/holidays',
			title: 'Holiday Calendar',
			desc: 'Regular & special holidays',
			super: false
		},
		{ href: '/settings/roles', title: 'Roles & Access', desc: 'User role management', roles: true }
	]
	const visible = $derived(
		cards.filter((c) => {
			if ('statutory' in c && c.statutory) return data.canStatutory
			if ('roles' in c && c.roles) return data.canRoles
			// Narrower than this page's own MANAGE_HR guard, so it cannot ride on the default (#178).
			if ('hrOrgwide' in c && c.hrOrgwide) return data.canHrOrgwide
			return !('super' in c && c.super) || data.isSuperAdmin
		})
	)
</script>

<svelte:head>
	<title>Settings — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Settings" description="Master data and configuration for your organization." />

	<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each visible as c (c.href)}
			<a
				href={c.href}
				class="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80"
			>
				<p class="font-medium">{c.title}</p>
				<p class="mt-0.5 text-xs text-muted-foreground">{c.desc}</p>
			</a>
		{/each}
	</div>
</div>
