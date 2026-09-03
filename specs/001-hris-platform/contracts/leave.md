# API Contract: Leave Management

**Base path**: `/api/v1`
**Auth**: Bearer JWT required.

---

## Leave Types

### GET /api/v1/leave-types

List configured leave types.

**Roles**: All authenticated.

**Response 200**: `{ "data": [{ "id": "uuid", "name": "string", "isPaid": true, "defaultDaysPerYear": 15 }] }`

### POST /api/v1/leave-types

Create a new leave type.

**Roles**: `HR_ADMIN`, `SUPER_ADMIN`

**Request body**: `{ "name": "string", "isPaid": true, "defaultDaysPerYear": 15, "allowCarryOver": false }`

**Response 201**: LeaveType object.

---

## Leave Balances

### GET /api/v1/employees/:employeeId/leave-balances

Get all leave balances for an employee for the current year.

**Roles**: `HR_ADMIN`, `SUPER_ADMIN` (any); `EMPLOYEE` (own only); `MANAGER` (direct reports).

**Response 200**:

```json
{
	"data": [
		{
			"leaveTypeId": "uuid",
			"leaveTypeName": "Annual Leave",
			"year": 2025,
			"allocated": 15,
			"used": 3,
			"remaining": 12
		}
	]
}
```

---

## Leave Requests

### POST /api/v1/leave-requests

Submit a leave request.

**Roles**: `EMPLOYEE`, `MANAGER` (own)

**Request body**:

```json
{
	"leaveTypeId": "uuid",
	"startDate": "2025-08-04",
	"endDate": "2025-08-06",
	"reason": "string | null"
}
```

**Validation**: `endDate ≥ startDate`; computed `totalDays` must not exceed `remaining` balance (unless HR Admin override).

**Response 201**: LeaveRequest object with `status: PENDING`.
**Error 422**: Insufficient leave balance — includes `{ "remaining": N, "requested": M }`.
**Side effect**: Manager notified; AuditLog entry.

---

### GET /api/v1/leave-requests

List leave requests.

**Roles**:

- `EMPLOYEE`/`MANAGER`: own requests
- `HR_ADMIN`/`SUPER_ADMIN`: all

**Query params**: `employeeId`, `status`, `leaveTypeId`, `year`, `page`, `limit`

**Response 200**: Paginated list.

---

### GET /api/v1/leave-requests/pending-approvals

Leave requests awaiting current user's approval.

**Roles**: `MANAGER`, `HR_ADMIN`, `SUPER_ADMIN`

**Response 200**: List of `PENDING` requests for direct reports (manager) or all (admin).

---

### POST /api/v1/leave-requests/:id/approve

**Roles**: `MANAGER` (direct reports only), `HR_ADMIN`, `SUPER_ADMIN`

**Response 200**: `{ "status": "APPROVED" }`
**Side effect**: LeaveBalance `used` incremented; employee notified; AuditLog entry.

---

### POST /api/v1/leave-requests/:id/reject

**Roles**: `MANAGER` (direct reports only), `HR_ADMIN`, `SUPER_ADMIN`

**Request body**: `{ "reason": "string" }` _(required)_

**Response 200**: `{ "status": "REJECTED", "rejectionReason": "string" }`

---

### POST /api/v1/leave-requests/:id/cancel

**Roles**: `EMPLOYEE` (own, only if `PENDING`)

**Response 200**: `{ "status": "CANCELLED" }`

---

### ~~POST /api/v1/leave-requests/:id/override-approve~~ — never built (#295)

No override endpoint exists. `PATCH /api/v1/leave/:id` briefly carried an `override-approve`
action, but it was identical to `approve` bar a stricter capability gate — it neither exceeded a
balance nor bypassed a stage — and was deleted in #295. Nothing writes the `LEAVE_OVERRIDE` audit
action, though the enum value is still in the schema.
