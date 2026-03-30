# Staff Deactivation & Activation — Gap Fixes

This document covers all 12 gaps identified and fixed in the staff deactivation/activation flow.

---

## Table of Contents

- [P0 — Critical Fixes](#p0--critical-fixes)
  - [1. Auto-Reactivation Bypass on Login](#1-auto-reactivation-bypass-on-login)
  - [2. Manual Assignment to Inactive Staff](#2-manual-assignment-to-inactive-staff)
  - [3. Queue Auto-Assignment to Inactive Staff](#3-queue-auto-assignment-to-inactive-staff)
- [P1 — High Priority Fixes](#p1--high-priority-fixes)
  - [4. Order Handoff on Deactivation](#4-order-handoff-on-deactivation)
  - [5. Force-Disconnect Sockets on Deactivation](#5-force-disconnect-sockets-on-deactivation)
  - [6. Manager Cannot Override Admin Suspension](#6-manager-cannot-override-admin-suspension)
- [P2 — Medium Priority Fixes](#p2--medium-priority-fixes)
  - [7. Notify Staff on Deactivation](#7-notify-staff-on-deactivation)
  - [8. Notify Manager on Self-Deactivation](#8-notify-manager-on-self-deactivation)
  - [9. Deactivation Reason & Audit Trail](#9-deactivation-reason--audit-trail)
- [P3 — Low Priority Fixes](#p3--low-priority-fixes)
  - [10. JWT/Session Invalidation](#10-jwtsession-invalidation)
  - [11. Sync isAvailable on All Deactivation Paths](#11-sync-isavailable-on-all-deactivation-paths)
  - [12. Reset activeOrdersCount on Deactivation](#12-reset-activeorderscount-on-deactivation)
- [Files Changed](#files-changed)
- [New File Created](#new-file-created)
- [New Socket Events](#new-socket-events)
- [New Staff Model Fields](#new-staff-model-fields)

---

## P0 — Critical Fixes

### 1. Auto-Reactivation Bypass on Login

**File:** `src/controllers/auth/staffAuth.controller.js`

**Problem:**
Any staff with a non-active status (`suspended`, `on_leave`, `on_break`) could simply log in and get auto-reactivated. This undermined admin authority — an admin suspends a staff member for misconduct, but the staff logs in and is automatically back to `active`.

**Before:**
```js
const wasInactive = staff.status === "inactive";
if (staff.status !== "active" && staff.status !== "inactive") {
  return next(new APIError(403, "Account is not accessible. Please contact your manager."));
}

// Auto-reactivate inactive account on successful login
if (wasInactive) {
  staff.status = "active";
  staff.updatedAt = new Date();
  await staff.save();
}
```

**After:**
```js
// Only self-deactivated ("inactive") accounts can auto-reactivate on login
// Admin/manager-set statuses (suspended, on_leave, on_break) must stay blocked
const wasInactive = staff.status === "inactive";
if (staff.status !== "active" && staff.status !== "inactive") {
  const statusMessages = {
    suspended: "Account is suspended. Please contact your admin.",
    on_leave: "Account is marked as on leave. Please contact your manager.",
    on_break: "Account is on break. Please contact your manager.",
  };
  return next(
    new APIError(403, statusMessages[staff.status] || "Account is not accessible. Please contact your manager.")
  );
}
```

**Behavior:**
- `inactive` (self-deactivated) → auto-reactivates on login (unchanged)
- `suspended` → blocked with `"Account is suspended. Please contact your admin."`
- `on_leave` → blocked with `"Account is marked as on leave. Please contact your manager."`
- `on_break` → blocked with `"Account is on break. Please contact your manager."`

---

### 2. Manual Assignment to Inactive Staff

**File:** `src/services/assignment/assignment.service.js` → `manualAssignment()`

**Problem:**
A manager could call `POST /assignment/manual-assign` and assign an order to an inactive/suspended staff member. The order would get stuck — assigned but unhandled because the staff can't access the API.

**Before:**
```js
if (!waiter || waiter.role !== "waiter") {
  throw new APIError(404, "Waiter not found");
}

// Check if waiter can take more orders (no status check)
```

**After:**
```js
if (!waiter || waiter.role !== "waiter") {
  throw new APIError(404, "Waiter not found");
}

// Check if waiter is active and available
if (waiter.status !== "active") {
  throw new APIError(400, `Cannot assign order to ${waiter.status} staff. Staff must be active.`);
}

// Check if waiter can take more orders
```

**Behavior:**
- Returns `400` with a clear error message if the staff is not `active`
- Prevents stuck/orphaned orders

---

### 3. Queue Auto-Assignment to Inactive Staff

**File:** `src/services/assignment/assignment.service.js` → `assignFromQueue()`

**Problem:**
When a staff member completes an order, `assignFromQueue()` automatically pulls the next queued order and assigns it. There was no check for staff status — if the staff was deactivated while they had an in-progress order, completing that order could auto-assign a new one.

**Before:**
```js
const waiter = await Staff.findById(waiterId);
if (!waiter) {
  throw new APIError(404, "Waiter not found");
}

// Check if waiter can take more orders (no status check)
```

**After:**
```js
const waiter = await Staff.findById(waiterId);
if (!waiter) {
  throw new APIError(404, "Waiter not found");
}

// Check if waiter is still active before assigning from queue
if (waiter.status !== "active") {
  logger.info(`Waiter ${waiterId} is ${waiter.status}, skipping queue assignment`);
  return null;
}

// Check if waiter can take more orders
```

**Behavior:**
- Returns `null` (no assignment) instead of assigning to inactive staff
- Queued order stays in queue for the next available active waiter

---

## P1 — High Priority Fixes

### 4. Order Handoff on Deactivation

**File:** `src/services/staffDeactivation.service.js` → `handleActiveOrders()`

**Problem:**
When a staff member was deactivated, their active orders were orphaned — no reassignment, no notification. Orders appeared "assigned" in the system but nobody was serving them.

**Solution:**
On deactivation, the system now:
1. Finds all active orders assigned to the staff (`pending`, `confirmed`, `preparing`, `ready`)
2. Looks for another available waiter in the same branch (`status: "active"`, `isAvailable: true`)
3. If found → reassigns all orders to that waiter with `method: "auto-reassign"` in assignment history
4. If not found → unassigns the orders (`$unset: { staff: 1 }`) so they go back to the assignment pool
5. Notifies the new waiter via `order:reassigned` socket event
6. Notifies the manager via `staff:orders_reassigned` socket event with counts

---

### 5. Force-Disconnect Sockets on Deactivation

**File:** `src/services/staffDeactivation.service.js` → `forceDisconnectStaff()`

**Problem:**
When a staff was deactivated, existing socket connections stayed alive. The staff could keep receiving real-time events (order updates, complaint notifications) even though they were deactivated. Only new connections were blocked.

**Solution:**
On deactivation:
1. Emits `account:deactivated` event to the staff's socket room with the reason
2. Fetches all sockets in the `staff_{id}` room using `io.in(roomName).fetchSockets()`
3. Calls `socket.disconnect(true)` on each to force-disconnect
4. Logs the number of disconnected sockets

---

### 6. Manager Cannot Override Admin Suspension

**File:** `src/controllers/manager/staff.controller.js` → `updateStaffStatus()`

**Problem:**
A manager could call `PUT /manager/staff/:staffId/status` with `{ status: "active" }` and reactivate a staff member that was `suspended` by an admin. This broke the role hierarchy.

**Before:**
```js
// No hierarchy check — any status change allowed
const updatedStaff = await Staff.findByIdAndUpdate(staffId, { status, ... });
```

**After:**
```js
// Prevent manager from overriding admin-level suspension
if (staff.status === "suspended" && status === "active") {
  return next(
    new APIError(403, "Cannot reactivate a suspended staff member. Only an admin can lift a suspension.")
  );
}
```

**Behavior:**
- Manager can still change between `active`, `inactive`, `on_break`, `on_leave`
- Manager CANNOT change `suspended` → `active` (returns `403`)
- Only admin reactivation endpoint can lift a suspension

Additionally, when a manager sets status to a non-active value, deactivation side effects (order handoff, socket disconnect, notifications) are now triggered.

---

## P2 — Medium Priority Fixes

### 7. Notify Staff on Deactivation

**File:** `src/services/staffDeactivation.service.js` → `notifyStaffDeactivated()`

**Problem:**
When an admin or manager deactivated a staff member, the staff received no notification. They would just get 403 errors on their next API request with no explanation.

**Solution:**
When staff is deactivated by admin/manager, the system emits an `account:deactivated` socket event to the staff with:
```json
{
  "message": "Your account has been deactivated by admin",
  "reason": "Reason provided or 'No reason provided'",
  "deactivatedBy": "admin",
  "deactivatedAt": "2026-03-31T..."
}
```

This is emitted BEFORE the force-disconnect, so the client receives it.

---

### 8. Notify Manager on Self-Deactivation

**File:** `src/services/staffDeactivation.service.js` → `notifyManagerStaffDeactivated()`

**Problem:**
When a staff member self-deactivated, their branch manager had no idea. This could leave a branch short-staffed without the manager knowing.

**Solution:**
When staff self-deactivates, the system emits a `staff:self_deactivated` socket event to the manager:
```json
{
  "staffId": "...",
  "staffName": "John",
  "staffRole": "waiter",
  "branch": "...",
  "deactivatedAt": "2026-03-31T...",
  "message": "Staff member John (waiter) has self-deactivated their account"
}
```

---

### 9. Deactivation Reason & Audit Trail

**Files:**
- `src/models/Staff.model.js` — new `statusChangeHistory` field
- `src/services/staffDeactivation.service.js` — pushes audit entries

**Problem:**
No record of who deactivated a staff member, when, or why. Bad for HR, dispute resolution, and compliance.

**New Schema Field:**
```js
statusChangeHistory: [
  {
    fromStatus: String,      // e.g., "active"
    toStatus: String,        // e.g., "inactive"
    changedBy: String,       // "self" | "admin" | "manager" | "system"
    changedById: ObjectId,   // ref to Admin, Manager, or Staff
    changedByModel: String,  // "Admin" | "Manager" | "Staff"
    reason: String,          // "Misconduct" or "Deactivated by admin"
    changedAt: Date,
  }
]
```

**Behavior:**
Every deactivation automatically pushes an entry to this array with full context.

---

## P3 — Low Priority Fixes

### 10. JWT/Session Invalidation

**Files:**
- `src/models/Staff.model.js` — new `tokenVersion` field
- `src/utils/tokenUtils.js` — includes `tokenVersion` in JWT payload
- `src/middleware/auth.middleware.js` — checks `tokenVersion` on each request
- `src/services/staffDeactivation.service.js` — increments `tokenVersion` on deactivation

**Problem:**
Deactivated staff's existing JWT tokens stayed valid until expiry. While the middleware returned 403 for inactive status, the token itself was technically still valid — a false sense of security.

**Solution — Token Version Counter:**

1. **Staff model** gets a `tokenVersion: Number` field (default: `0`)
2. **Token generation** includes `tokenVersion` in the JWT payload
3. **Auth middleware** compares `decoded.tokenVersion` with `staff.tokenVersion` from DB:
   - If mismatch → `401 "Session has been invalidated. Please login again."`
4. **On deactivation**, `tokenVersion` is incremented by 1 and `refreshToken` is cleared

This immediately invalidates ALL existing sessions without maintaining a token blacklist.

---

### 11. Sync isAvailable on All Deactivation Paths

**File:** `src/services/staffDeactivation.service.js`

**Problem:**
Admin deactivation and self-deactivation set `status = "inactive"` but didn't set `isAvailable = false`. Only the manager `updateStaffStatus` path did this. Inconsistent state could cause the auto-assignment system to consider a deactivated waiter as "available".

**Solution:**
The centralized `handleDeactivationSideEffects()` now sets `isAvailable: false` on every deactivation path (admin, manager, self).

---

### 12. Reset activeOrdersCount on Deactivation

**File:** `src/services/staffDeactivation.service.js`

**Problem:**
When staff was deactivated, their `activeOrdersCount` was not reset. After order handoff/unassignment, the count remained stale.

**Solution:**
The centralized `handleDeactivationSideEffects()` sets `activeOrdersCount: 0` after handling active orders.

---

## Files Changed

| # | File | What Changed |
|---|---|---|
| 1 | `src/controllers/auth/staffAuth.controller.js` | P0 #1: Only `inactive` auto-reactivates. Specific error messages for `suspended`/`on_leave`/`on_break`. Integrated deactivation side-effects on self-deactivation. |
| 2 | `src/services/assignment/assignment.service.js` | P0 #2: `manualAssignment()` rejects inactive staff with 400. P0 #3: `assignFromQueue()` skips inactive staff. |
| 3 | `src/controllers/admin/staff.controller.js` | P1 #4/5, P2 #7/9: Admin deactivation triggers `handleDeactivationSideEffects()`. |
| 4 | `src/controllers/manager/staff.controller.js` | P1 #6: Blocks manager from reactivating `suspended` staff. Triggers deactivation side-effects when moving to non-active status. |
| 5 | `src/models/Staff.model.js` | P2 #9: Added `statusChangeHistory` array. P3 #10: Added `tokenVersion` field. |
| 6 | `src/middleware/auth.middleware.js` | P3 #10: Checks `tokenVersion` in JWT against DB value. |
| 7 | `src/utils/tokenUtils.js` | P3 #10: Includes `tokenVersion` in JWT payload. |

## New File Created

| File | Purpose |
|---|---|
| `src/services/staffDeactivation.service.js` | Centralized service for all deactivation side-effects. Called by admin, manager, and self-deactivation flows. Handles: order reassignment, socket disconnect, staff notification, manager notification, `isAvailable`/`activeOrdersCount` reset, token invalidation, and audit trail. |

## New Socket Events

| Event | Emitted To | When | Payload |
|---|---|---|---|
| `account:deactivated` | Staff (`staff_{id}`) | Admin/manager deactivates staff | `{ message, reason, deactivatedBy, deactivatedAt }` |
| `staff:self_deactivated` | Manager (`manager_{id}`) | Staff self-deactivates | `{ staffId, staffName, staffRole, branch, deactivatedAt, message }` |
| `order:reassigned` | New waiter (`staff_{id}`) | Orders are reassigned from deactivated staff | `{ orderId, message, priority: "high" }` |
| `staff:orders_reassigned` | Manager (`manager_{id}`) | Orders are handled during deactivation | `{ staffId, staffName, ordersReassigned, ordersUnassigned, reassignedTo }` |

## New Staff Model Fields

| Field | Type | Default | Purpose |
|---|---|---|---|
| `tokenVersion` | `Number` | `0` | Incremented on deactivation to invalidate all existing JWT sessions |
| `statusChangeHistory` | `Array` | `[]` | Audit trail of all status changes with `fromStatus`, `toStatus`, `changedBy`, `changedById`, `reason`, `changedAt` |
