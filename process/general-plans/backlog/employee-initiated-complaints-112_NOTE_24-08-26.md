---
name: note:employee-initiated-complaints-112
description: "The missing direction: an employee cannot open an HR inquiry themselves — deliberate one-directional scope for #112, but a real gap; needs its own feature, not a flag, because of the manager-complaint routing trap"
date: 24-08-26
feature: hr-complaints-112
---

# Design record — employee-initiated complaints (the missing direction)

**No GitHub issue exists for this yet.** This note captures the design problem so it is not
lost; it is not a plan and nothing here is scheduled.

## What #112 shipped, and why it is one-directional on purpose

Today the complaints/inquiries flow only goes one way: HR (or a scoped MANAGER) opens a
thread **about** an employee, and that employee can only **reply** to a thread already
opened about them. The `open` action is gated on `MANAGE_HR`
(`src/routes/(app)/complaints/+page.server.ts:69`), and a non-HR actor's list shows only
threads where `employeeId` equals their own employee id. This is not an oversight — issue #112
asked for exactly this direction ("HR raising a question or concern to a specific employee"),
and the #112 SPEC listed employee-initiated threads as explicitly out of scope on that basis:

> Employee-initiated complaints (employees can only reply to a thread HR opened; they cannot
> open a new one against themselves or anyone else). The issue describes HR raising a
> question "to a specific employee" — a one-directional opening right for HR is what was
> asked for.

## The gap is real regardless

An HRIS where staff cannot raise their own concern is missing something. Employees need a way
to say "I have a complaint" without HR having to ask first.

## Why this is a separate feature, not a flag on #112

Relaxing the `open` gate looks cheap at first glance, but it inverts the model in three ways
at once: **who opens** (currently always HR-side), **who receives** (currently always the
named subject employee), and **confidentiality** (currently there is none to design around,
because HR always already knows — they opened the thread).

**The trap that breaks the naive answer:** the hard part is routing. If an employee's
complaint routes the same way `assertCanTouchEmployee` routes everything else in this
codebase — to their manager, or to whoever can "touch" their employee record — then **a
complaint about their own manager delivers the complaint to the person being complained
about.** That is not a hypothetical edge case; it is the single most common reason an
employee-initiated complaint exists in the first place. Any routing design for this feature
must solve that case explicitly (e.g. route to any HR_ADMIN/org-wide role instead of the
reporting chain, with an explicit "who am I complaining about" field that excludes the normal
manager-routing path) or it ships a feature that is actively hostile to its main use case.

## The rejected middle option

Letting an employee open a thread **against themselves** — i.e. relaxing the `open` action's
`MANAGE_HR` gate to also allow `actorEmployeeId === targetEmployeeId` — is cheap: it is
roughly one capability-check change, reusing the existing `assertCanReachComplaint` shape.
But it gives **no confidentiality** (the thread still has one visible subject, so complaining
about a manager still surfaces to whoever can see that subject's threads) and **no routing**
(there is nothing that decides who on the HR side actually sees it beyond "everyone with
`MANAGE_HR`", which already includes the reporting chain via #133's `MANAGER` grant). It risks
being the wrong shape to live with — a feature that looks shipped but does not actually solve
the manager-complaint case above.

## Priority / next step

No priority set — no issue filed. When this is picked up, it needs its own SPEC that answers
the routing question head-on before any code changes, and should probably start from "who can
see a self-initiated complaint" rather than reusing `HrComplaint`'s existing
subject-employee-based visibility model as-is.
