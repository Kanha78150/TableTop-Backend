# Order Timeout Auto-Cancel & Notification Feature

## Overview

When a food order stays in `pending` or `preparing` status beyond the configured `MAX_PREPARATION_TIME` (default: **45 minutes**), the system now automatically:

1. **Cancels the order**
2. **Refunds coins** (if the user used coins for payment)
3. **Marks payment for refund** (if already paid)
4. **Frees the table** (if a table was assigned)
5. **Sends real-time notifications** to all relevant parties (user, staff, manager, admin)

---

## Configuration

| Environment Variable   | Default | Description                                           |
| ---------------------- | ------- | ----------------------------------------------------- |
| `MAX_PREPARATION_TIME` | `45`    | Maximum allowed preparation time in **minutes**       |
| `MONITORING_INTERVAL`  | `30000` | How often (in ms) the TimeTracker checks for timeouts |

Set these in your `.env` file:

```env
MAX_PREPARATION_TIME=45
MONITORING_INTERVAL=30000
```

---

## How It Works

### Flow Diagram

```
TimeTracker (runs every MONITORING_INTERVAL)
    │
    ├── checkTimeoutOrders()
    │       │
    │       ├── Finds orders where:
    │       │     • status is "pending" or "preparing"
    │       │     • createdAt < (now - MAX_PREPARATION_TIME)
    │       │     • isTimeout is NOT already true
    │       │
    │       ├── For each timed-out order:
    │       │     │
    │       │     ├── autoCancelTimedOutOrder()  [order.service.js]
    │       │     │     ├── Refund coins to user
    │       │     │     ├── Set status → "cancelled"
    │       │     │     ├── Set isTimeout → true
    │       │     │     ├── Set cancellationReason
    │       │     │     ├── Set payment status → "refund_pending" or "cancelled"
    │       │     │     ├── Waive commission
    │       │     │     └── Free table (status → "available")
    │       │     │
    │       │     └── notifyOrderTimeoutCancelled()  [notification.service.js]
    │       │           ├── Notify User (Socket.IO)
    │       │           ├── Notify Staff (Socket.IO)
    │       │           ├── Notify Manager(s) (Socket.IO)
    │       │           ├── Notify Admin (Socket.IO)
    │       │           └── Notify Branch Room (Socket.IO)
    │       │
    │       └── Update metrics (timeoutHandled counter)
    │
    └── (other monitoring tasks...)
```

---

## Files Modified

### 1. `src/services/timeTracker.service.js`

**What changed:** The `checkTimeoutOrders()` method was updated from just flagging timed-out orders to actually cancelling them and sending notifications.

**Key changes:**

- Added imports for `autoCancelTimedOutOrder` and `notifyOrderTimeoutCancelled`
- Query now excludes already timed-out orders (`isTimeout: { $ne: true }`) to prevent re-processing
- Removed the `staff: { $exists: true }` filter so orders without staff assignment are also caught
- Calls `autoCancelTimedOutOrder()` to cancel the order
- Calls `notifyOrderTimeoutCancelled()` to notify all parties
- Logs success/failure for each order

### 2. `src/services/order/order.service.js`

**What changed:** Added a new exported function `autoCancelTimedOutOrder()`.

**Function:** `autoCancelTimedOutOrder(orderId, maxPrepTime)`

| Parameter     | Type     | Description                                 |
| ------------- | -------- | ------------------------------------------- |
| `orderId`     | `string` | The MongoDB ObjectId of the order           |
| `maxPrepTime` | `number` | The MAX_PREPARATION_TIME value (in minutes) |

**What it does step by step:**

1. **Fetches the order** from the database by ID
2. **Validates the order** is still in `pending` or `preparing` status (skips if already cancelled/completed)
3. **Refunds coins** to the user via `coinService.handleCoinRefund()` (non-blocking — if refund fails, cancellation still proceeds)
4. **Updates order fields:**
   - `status` → `"cancelled"`
   - `isTimeout` → `true`
   - `timeoutDetectedAt` → current timestamp
   - `cancellationReason` → descriptive reason with the timeout duration
   - `cancelledAt` → current timestamp
5. **Updates payment status:**
   - If payment was `"paid"` → sets to `"refund_pending"`
   - Otherwise → sets to `"cancelled"`
6. **Waives commission:**
   - Sets `commissionStatus` → `"waived"`
   - Sets `commissionAmount` → `0`
7. **Frees the table** (if order had a table assigned):
   - Sets table `status` → `"available"`
   - Clears `currentOrder` and `currentCustomer`
8. **Returns** the updated order object (or `null` on failure)

### 3. `src/services/notification.service.js`

**What changed:** Added a new exported function `notifyOrderTimeoutCancelled()`.

**Function:** `notifyOrderTimeoutCancelled(order, maxPrepTime)`

| Parameter     | Type     | Description                                             |
| ------------- | -------- | ------------------------------------------------------- |
| `order`       | `Object` | The populated order object (with user, staff populated) |
| `maxPrepTime` | `number` | The MAX_PREPARATION_TIME value (in minutes)             |

**Socket.IO Event:** `order:timeout_cancelled`

**Notification recipients and their messages:**

#### User (`user_{userId}` room)

- **Message:** `"Your order #{orderNumber} was automatically cancelled because the restaurant did not confirm it within {maxPrepTime} minutes. If you were charged, a refund will be processed."`
- **Purpose:** Inform the customer and reassure about refund

#### Staff (`staff_{staffId}` room)

- **Message:** `"Order #{orderNumber} was auto-cancelled due to timeout ({maxPrepTime} min exceeded)."`
- **Purpose:** Alert the assigned staff member

#### Manager(s) (`manager_{managerId}` room)

- **Priority:** `high`
- **Message:** `"Order #{orderNumber} was auto-cancelled. Staff did not confirm within {maxPrepTime} minutes."`
- **Extra data:** `staffName` — the name of the staff who failed to confirm
- **Purpose:** Alert management about staff non-responsiveness

#### Admin (`admin_{adminId}` room)

- **Priority:** `high`
- **Message:** `"Order #{orderNumber} auto-cancelled due to {maxPrepTime} min timeout. Review staff responsiveness."`
- **Extra data:** `staffName` — the name of the staff who failed to confirm
- **Purpose:** Enable admin to review and take action on staff performance

#### Branch Room (`branch_{branchId}` room)

- **Purpose:** Broadcast to any dashboards or monitoring screens listening on the branch room

---

## Notification Payload Structure

Every `order:timeout_cancelled` event includes the following base data:

```json
{
  "orderId": "string",
  "orderNumber": "string",
  "tableNumber": "string",
  "totalPrice": 450.0,
  "itemCount": 3,
  "items": [
    {
      "name": "Butter Chicken",
      "quantity": 2,
      "price": 180
    }
  ],
  "reason": "Order auto-cancelled: exceeded 45 minutes without confirmation",
  "cancelledAt": "2026-03-29T10:30:00.000Z",
  "hotel": "hotelObjectId",
  "branch": "branchObjectId",
  "message": "Contextual message for the recipient"
}
```

Manager and Admin notifications additionally include:

- `staffName` — Name of the assigned staff
- `priority` — Set to `"high"`

---

## Order Model Fields Used

| Field                      | Type      | Description                                   |
| -------------------------- | --------- | --------------------------------------------- |
| `status`                   | `String`  | Set to `"cancelled"`                          |
| `isTimeout`                | `Boolean` | Set to `true` to flag timeout cancellations   |
| `timeoutDetectedAt`        | `Date`    | Timestamp when timeout was detected           |
| `cancellationReason`       | `String`  | Human-readable reason for cancellation        |
| `cancelledAt`              | `Date`    | Timestamp of cancellation                     |
| `payment.paymentStatus`    | `String`  | `"refund_pending"` (if paid) or `"cancelled"` |
| `payment.commissionStatus` | `String`  | Set to `"waived"`                             |
| `payment.commissionAmount` | `Number`  | Set to `0`                                    |

---

## Frontend Integration

### Listening for Timeout Cancellation Events

Frontend clients should listen for the `order:timeout_cancelled` Socket.IO event on their respective rooms:

**User App:**

```javascript
socket.on("order:timeout_cancelled", (data) => {
  // Show notification to user
  // data.message contains user-friendly text
  // data.orderId, data.orderNumber for reference
  showNotification(data.message);
});
```

**Staff App:**

```javascript
socket.on("order:timeout_cancelled", (data) => {
  // Remove order from active orders list
  // Show alert about timeout
  removeFromActiveOrders(data.orderId);
  showAlert(data.message);
});
```

**Manager/Admin Dashboard:**

```javascript
socket.on("order:timeout_cancelled", (data) => {
  // Show high-priority alert
  // data.staffName identifies the responsible staff
  // data.priority === "high"
  showHighPriorityAlert(data.message, data.staffName);
});
```

---

## Edge Cases Handled

| Scenario                                    | Behavior                                                      |
| ------------------------------------------- | ------------------------------------------------------------- |
| Order already cancelled/completed           | Skipped — `autoCancelTimedOutOrder` checks status first       |
| Order already flagged as timeout            | Skipped — query filters `isTimeout: { $ne: true }`            |
| Coin refund fails                           | Order is still cancelled; refund failure is logged as warning |
| No staff assigned to order                  | Order is still cancelled; staff notification is skipped       |
| No manager found for hotel/branch           | Other notifications still sent; manager step is skipped       |
| Socket.IO not initialized                   | All notifications skipped with warning log                    |
| Order has no table                          | Table cleanup step is skipped                                 |
| Payment was never made (status = "pending") | Payment status set to `"cancelled"` (no refund needed)        |
| Payment was already made (status = "paid")  | Payment status set to `"refund_pending"`                      |

---

## Monitoring & Debugging

### Logs to Watch For

| Log Level | Message Pattern                                          | Meaning                                |
| --------- | -------------------------------------------------------- | -------------------------------------- |
| `WARN`    | `Order {id} has exceeded maximum preparation time`       | Timeout detected by TimeTracker        |
| `INFO`    | `Order {id} auto-cancelled and all parties notified`     | Successful cancellation + notification |
| `INFO`    | `Timeout cancellation notification sent to user_{id}`    | User notification sent                 |
| `INFO`    | `Timeout cancellation notification sent to staff_{id}`   | Staff notification sent                |
| `INFO`    | `Timeout cancellation notification sent to manager_{id}` | Manager notification sent              |
| `INFO`    | `Timeout cancellation notification sent to admin_{id}`   | Admin notification sent                |
| `WARN`    | `Coin refund failed during timeout cancellation`         | Coin refund issue (non-blocking)       |
| `ERROR`   | `Failed to auto-cancel timed out order`                  | Cancellation failed                    |
| `ERROR`   | `Error sending timeout cancellation notifications`       | Notification delivery failed           |

### Metrics

The TimeTracker tracks timeout handling in its metrics object:

```javascript
timeTracker.metrics.timeoutHandled; // Count of orders handled for timeout
```
