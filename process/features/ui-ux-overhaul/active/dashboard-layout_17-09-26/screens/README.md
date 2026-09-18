# Dashboard screenshots, 18-09-26, before any change

Captured with Playwright against the local dev server on `feat/uiux-phase-6` at 17a98d8.
Six roles (admin@ = SUPER_ADMIN, hr@ = HR_ADMIN, ceo@, manager@, employee@, payroll@ = PAYROLL_OFFICER) x two themes x two widths (1440 and 390).

- `*_top.png`: the first 2400 px of the page at full resolution.
- `*_full20.png`: the whole page scaled to 20%.

Full-page heights at capture: SUPER_ADMIN / HR_ADMIN / CEO 17496 px (1440) and 25704 px (390); MANAGER 17460 / 25717; EMPLOYEE 1006 / 2194; PAYROLL_OFFICER 1006 / 2322.

The dev database holds e2e residue: 255 ACTIVE PROBATIONARY employees named `Testcase ...` and 27 `PENDING_APPROVAL` postings named `E2E-F4-self-...`. The two unbounded alert cards render all of them, which is the whole height difference between the approver roles and EMPLOYEE.
