# Order Assignment System API Documentation

Complete API documentation for the automated waiter-to-order assignment system including Staff, Manager, and Admin endpoints.

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Base URLs](#base-urls)
- [Staff Endpoints](#staff-endpoints)
- [Manager Endpoints](#manager-endpoints)
- [Assignment System Endpoints](#assignment-system-endpoints)
- [Response Formats](#response-formats)
- [Error Codes](#error-codes)

---

## Overview

The Order Assignment System automatically assigns orders to waiters based on:

- **Round-Robin**: Equal distribution when waiters have the same load
- **Load-Balancing**: Assigns to the least busy waiter
- **Queue Management**: Orders are queued when all waiters are at capacity
- **Organizational Hierarchy**: Validates admin → manager → staff chain

### System Features:

- ✅ Automatic assignment on payment completion
- ✅ Real-time active order count tracking
- ✅ Queue management with priority handling
- ✅ Performance metrics and analytics
- ✅ Manual assignment override by managers
- ✅ Staff order management and status updates

---

## Authentication

All endpoints require JWT authentication via Bearer token in the Authorization header.

```
Authorization: Bearer <access_token>
```

### Token Structure:

```json
{
  "id": "staff_or_manager_id",
  "role": "waiter" | "kitchen_staff" | "branch_manager" | "super_admin",
  "type": "staff" | "manager" | "admin"
}
```

### Role Hierarchy:

1. **Super Admin** - Full system access
2. **Branch Manager** - Branch-level management
3. **Staff** (Waiter, Kitchen Staff, etc.) - Assigned tasks only

---

## Base URLs

```
Development: http://localhost:8000/api/v1
Production: https://your-domain.com/api/v1
```

---

## Staff Endpoints

### 1. Get My Orders (Assigned to Me)

Get all orders assigned to the authenticated staff member.

**Endpoint:** `GET /staff/orders/my-orders`

**Access:** Staff only (waiter, kitchen_staff, etc.)

**Query Parameters:**

- `page` (number, optional) - Page number (default: 1)
- `limit` (number, optional) - Items per page (default: 20)
- `status` (string, optional) - Filter by status: `all`, `active`, `pending`, `confirmed`, `preparing`, `ready`, `served`, `completed`, `cancelled`
- `sortBy` (string, optional) - Sort field (default: `createdAt`)
- `sortOrder` (string, optional) - `asc` or `desc` (default: `desc`)

**Note:**

- `all` - Returns all orders regardless of status
- `active` - Returns orders with status: `pending`, `confirmed`, `preparing`, or `ready`

**Example Request:**

```bash
GET /api/v1/staff/orders/my-orders?page=1&limit=20&status=pending
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Orders retrieved successfully",
  "data": {
    "orders": [
      {
        "_id": "68f483aab26ed112651b2234",
        "user": {
          "_id": "68e53f67c505e97931aa7a2b",
          "name": "John Doe",
          "phone": "9876543210"
        },
        "table": {
          "_id": "68e4ce5cec4c9891a66329b4",
          "tableNumber": "2",
          "capacity": 4
        },
        "items": [
          {
            "foodItem": {
              "_id": "68d2fa52...",
              "name": "Chicken Biryani",
              "price": 450
            },
            "quantity": 2,
            "price": 450,
            "subtotal": 900
          }
        ],
        "status": "confirmed",
        "subtotal": 900,
        "totalPrice": 900.576,
        "paymentStatus": "paid",
        "assignedAt": "2025-10-19T06:26:09.121Z",
        "assignmentMethod": "round-robin",
        "estimatedTime": 20,
        "specialInstructions": "Extra spicy",
        "createdAt": "2025-10-19T06:22:34.050Z"
      }
    ],
    "pagination": {
      "total": 5,
      "page": 1,
      "pages": 1,
      "limit": 20
    },
    "summary": {
      "totalOrders": 5,
      "activeOrders": 3,
      "completedToday": 2
    }
  }
}
```

---

### 2. Get Order Details

Get detailed information about a specific order.

**Endpoint:** `GET /staff/orders/:orderId`

**Access:** Staff only

**Path Parameters:**

- `orderId` (string, required) - Order ID

**Example Request:**

```bash
GET /api/v1/staff/orders/68f483aab26ed112651b2234
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "68f483aab26ed112651b2234",
      "user": { "name": "John Doe", "phone": "9876543210" },
      "table": { "tableNumber": "2", "location": "Main Hall" },
      "items": [...],
      "status": "confirmed",
      "totalPrice": 900.576,
      "paymentStatus": "paid",
      "assignedAt": "2025-10-19T06:26:09.121Z",
      "staff": {
        "_id": "68f3806e35208b7bd0fdc4a8",
        "name": "Bhola created staff1"
      }
    }
  }
}
```

---

### 3. Update Order Status

Update the status of an assigned order.

**Endpoint:** `PUT /staff/orders/:orderId/status`

**Access:** Staff only

**Path Parameters:**

- `orderId` (string, required)

**Request Body:**

```json
{
  "status": "preparing",
  "notes": "Started preparing the order"
}
```

**Valid Status Transitions:**

- `pending` → `confirmed` (after payment)
- `pending` → `preparing` (direct)
- `confirmed` → `preparing`
- `preparing` → `ready`
- `ready` → `served`
- `served` → `completed`
- Any status → `cancelled` (except `completed`)

**Example Request:**

```bash
PUT /api/v1/staff/orders/68f483aab26ed112651b2234/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "preparing"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "order": {
      "_id": "68f483aab26ed112651b2234",
      "status": "preparing",
      "statusHistory": [
        {
          "status": "confirmed",
          "timestamp": "2025-10-19T06:26:09.121Z"
        },
        {
          "status": "preparing",
          "timestamp": "2025-10-19T06:30:15.456Z",
          "notes": "Started preparing the order"
        }
      ]
    }
  }
}
```

---

### 4. Get Active Orders Count

Get the count of active orders assigned to the current staff member.

**Endpoint:** `GET /staff/orders/active-count`

**Access:** Staff only

**Example Request:**

```bash
GET /api/v1/staff/orders/active-count
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "activeOrdersCount": 3,
    "maxCapacity": 5,
    "availableCapacity": 2,
    "utilizationPercentage": 60,
    "breakdown": {
      "pending": 0,
      "confirmed": 1,
      "preparing": 1,
      "ready": 1
    }
  }
}
```

---

## Manager Endpoints

### 1. Get All Orders

Get all orders for the manager's branch with filtering options.

**Endpoint:** `GET /manager/orders`

**Access:** Branch Manager

**Query Parameters:**

- `page` (number, optional)
- `limit` (number, optional)
- `status` (string, optional)
  all - Returns ALL orders regardless of status (no filtering)

active - Special filter that returns orders with status: pending, confirmed, preparing, or ready

pending - Order created but payment not yet confirmed

confirmed - Payment successful, order ready for kitchen

preparing - Kitchen is actively preparing the food

ready - Food is ready and waiting to be served

served - Food has been delivered to the customer's table

completed - Order fully completed (customer finished eating)

cancelled - Order was cancelled

- `staffId` (string, optional) - Filter by assigned staff
- `startDate` (string, optional) - Date format: `YYYY-MM-DD` or `DD-MM-YYYY` (e.g., `2025-10-19` or `19-10-2025`)
- `endDate` (string, optional) - Date format: `YYYY-MM-DD` or `DD-MM-YYYY` (e.g., `2025-10-30` or `30-10-2025`)

**Example Request:**

```bash
# Example 1: Using YYYY-MM-DD format
GET /api/v1/manager/orders?page=1&limit=20&status=preparing&startDate=2025-10-19&endDate=2025-10-30
Authorization: Bearer <token>

# Example 2: Using DD-MM-YYYY format
GET /api/v1/manager/orders?page=1&limit=20&status=preparing&startDate=19-10-2025&endDate=30-10-2025
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "orders": [...],
    "pagination": {...},
    "summary": {
      "totalOrders": 45,
      "pending": 5,
      "preparing": 8,
      "ready": 3,
      "completed": 29
    }
  }
}
```

---

### 2. Get Order Details

Get detailed information about a specific order.

**Endpoint:** `GET /manager/orders/:orderId`

**Access:** Branch Manager

**Path Parameters:**

- `orderId` (string, required)

**Example Request:**

```bash
GET /api/v1/manager/orders/68f483aab26ed112651b2234
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "order": {
      "_id": "68f483aab26ed112651b2234",
      "user": {...},
      "table": {...},
      "items": [...],
      "staff": {
        "_id": "68f3806e35208b7bd0fdc4a8",
        "name": "Bhola created staff1",
        "staffId": "STF-WTR-2025-00012"
      },
      "status": "preparing",
      "assignmentMethod": "round-robin",
      "assignmentHistory": [
        {
          "waiter": "68f3806e35208b7bd0fdc4a8",
          "assignedAt": "2025-10-19T06:26:09.121Z",
          "method": "round-robin",
          "reason": "automatic-assignment"
        }
      ]
    }
  }
}
```

---

### 3. Manual Order Assignment

Manually assign an order to a specific staff member.

**Endpoint:** `PUT /manager/orders/:orderId/assign/:staffId`

**Access:** Branch Manager

**Path Parameters:**

- `orderId` (string, required)
- `staffId` (string, required)

**Request Body (optional):**

```json
{
  "reason": "Customer requested specific waiter"
}
```

**Example Request:**

```bash
PUT /api/v1/manager/orders/68f483aab26ed112651b2234/assign/68f3806e35208b7bd0fdc4a8
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Customer preference"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Order assigned successfully",
  "data": {
    "order": {
      "_id": "68f483aab26ed112651b2234",
      "staff": "68f3806e35208b7bd0fdc4a8",
      "assignedAt": "2025-10-19T07:00:00.000Z",
      "assignmentMethod": "manual"
    },
    "waiter": {
      "id": "68f3806e35208b7bd0fdc4a8",
      "name": "Bhola created staff1",
      "activeOrdersCount": 4
    }
  }
}
```

**Error Response (400):**

```json
{
  "success": false,
  "message": "Waiter is at maximum capacity (5 orders)",
  "statusCode": 400
}
```

---

### 4. Update Order Status

Update the status of any order in the branch.

**Endpoint:** `PUT /manager/orders/:orderId/status`

**Access:** Branch Manager

**Path Parameters:**

- `orderId` (string, required)

**Request Body:**

```json
{
  "status": "cancelled",
  "reason": "Customer requested cancellation"
}
```

**Example Request:**

```bash
PUT /api/v1/manager/orders/68f483aab26ed112651b2234/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "cancelled",
  "reason": "Kitchen out of ingredients"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "order": {
      "_id": "68f483aab26ed112651b2234",
      "status": "cancelled"
    }
  }
}
```

---

### 5. Get Orders by Status

Get orders filtered by a specific status.

**Endpoint:** `GET /manager/orders/status/:status`

**Access:** Branch Manager

**Path Parameters:**

- `status` (string, required) - `pending`, `confirmed`, `preparing`, `ready`, `served`, `completed`, `cancelled`

**Example Request:**

```bash
GET /api/v1/manager/orders/status/preparing
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "preparing",
    "orders": [...],
    "count": 8
  }
}
```

---

### 6. Get Kitchen Orders

Get all orders that need kitchen preparation.

**Endpoint:** `GET /manager/kitchen/orders`

**Access:** Branch Manager

**Query Parameters:**

- `status` (string, optional) - Filter by status

**Example Request:**

```bash
GET /api/v1/manager/kitchen/orders?status=preparing
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "orders": [
      {
        "_id": "68f483aab26ed112651b2234",
        "table": { "tableNumber": "2" },
        "items": [...],
        "status": "preparing",
        "priority": "high",
        "estimatedTime": 20,
        "staff": { "name": "Bhola created staff1" }
      }
    ],
    "summary": {
      "total": 8,
      "confirmed": 3,
      "preparing": 5
    }
  }
}
```

---

### 7. Get Order Analytics

Get analytics and statistics for orders in the branch.

**Endpoint:** `GET /manager/orders/analytics/summary`

**Access:** Branch Manager

**Query Parameters:**

- `startDate` (date, optional)
- `endDate` (date, optional)
- `groupBy` (string, optional) - `day`, `week`, `month`

**Example Request:**

```bash
GET /api/v1/manager/orders/analytics/summary?startDate=2025-10-01&endDate=2025-10-19
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalOrders": 450,
      "totalRevenue": 450000.5,
      "averageOrderValue": 1000.0,
      "completionRate": 95.5
    },
    "statusBreakdown": {
      "completed": 420,
      "cancelled": 10,
      "pending": 20
    },
    "staffPerformance": [
      {
        "staffId": "68f3806e35208b7bd0fdc4a8",
        "name": "Bhola created staff1",
        "totalOrders": 85,
        "completedOrders": 82,
        "averageCompletionTime": 18.5
      }
    ]
  }
}
```

---

---

## Assignment System Endpoints

### 1. Manual Order Assignment

Manually assign an order to a specific waiter (bypassing automatic system).

**Endpoint:** `POST /assignment/manual-assign`

**Access:** Branch Manager, Admin

**Request Body:**

```json
{
  "orderId": "68f483aab26ed112651b2234",
  "waiterId": "68f3806e35208b7bd0fdc4a8",
  "reason": "Customer preference",
  "priority": "high"
}
```

**Example Request:**

```bash
POST /api/v1/assignment/manual-assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "68f483aab26ed112651b2234",
  "waiterId": "68f3806e35208b7bd0fdc4a8",
  "reason": "VIP customer request"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Order manually assigned successfully",
  "data": {
    "order": {
      "_id": "68f483aab26ed112651b2234",
      "staff": "68f3806e35208b7bd0fdc4a8"
    },
    "waiter": {
      "id": "68f3806e35208b7bd0fdc4a8",
      "name": "Bhola created staff1",
      "activeOrdersCount": 4,
      "maxCapacity": 5
    },
    "assignmentMethod": "manual",
    "assignedAt": "2025-10-19T07:15:00.000Z"
  }
}
```

---

### 2. Get Assignment Statistics

Get statistics about order assignments in the system.

**Endpoint:** `GET /assignment/stats`

**Access:** Staff, Manager, Admin

**Query Parameters:**

- `hotelId` (string, optional) - Filter by hotel
- `branchId` (string, optional) - Filter by branch
- `startDate` (date, optional)
- `endDate` (date, optional)

**Example Request:**

```bash
GET /api/v1/assignment/stats?branchId=68d13a9dc10d4ebc29bfe78f
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "waiters": {
      "total": 10,
      "available": 7,
      "busy": 3,
      "utilization": "30.00"
    },
    "queue": {
      "totalInQueue": 2,
      "averageWaitTime": 15,
      "oldestQueueTime": 8
    },
    "recentAssignments": [
      {
        "_id": "68f483aab26ed112651b2234",
        "staff": {
          "name": "Bhola created staff1",
          "staffId": "STF-WTR-2025-00012"
        },
        "assignedAt": "2025-10-19T06:26:09.121Z",
        "assignmentMethod": "round-robin",
        "totalPrice": 900.576,
        "status": "preparing"
      }
    ],
    "averageOrdersPerWaiter": "3.50",
    "maxCapacity": 50,
    "currentLoad": 35
  }
}
```

---

### 3. Get System Health

Get health status of the assignment system.

**Endpoint:** `GET /assignment/system/health`

**Access:** Manager, Admin

**Example Request:**

```bash
GET /api/v1/assignment/system/health
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "uptime": 86400,
    "lastMonitoringCycle": "2025-10-19T07:20:00.000Z",
    "systemLoad": {
      "totalOrders": 35,
      "totalWaiters": 10,
      "utilizationPercentage": 70,
      "queueLength": 2
    },
    "issues": [],
    "warnings": [
      {
        "type": "high_utilization",
        "message": "System utilization above 70%",
        "severity": "medium"
      }
    ]
  }
}
```

---

### 4. Get Performance Metrics

Get detailed performance metrics of the assignment system.

**Endpoint:** `GET /assignment/system/metrics`

**Access:** Manager, Admin

**Query Parameters:**

- `period` (string, optional) - `hour`, `day`, `week`, `month` (default: `day`)

**Example Request:**

```bash
GET /api/v1/assignment/system/metrics?period=day
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "period": "day",
    "assignments": {
      "total": 245,
      "automatic": 230,
      "manual": 15,
      "roundRobin": 120,
      "loadBalancing": 110,
      "queued": 5
    },
    "performance": {
      "averageAssignmentTime": 0.25,
      "successRate": 98.5,
      "queueRate": 2.0,
      "averageQueueTime": 12
    },
    "waiters": {
      "totalActive": 10,
      "averageOrdersPerWaiter": 24.5,
      "mostBusyWaiter": {
        "id": "68f3806e35208b7bd0fdc4a8",
        "name": "Bhola created staff1",
        "ordersHandled": 35
      },
      "leastBusyWaiter": {
        "id": "68f3806e35208b7bd0fdc4b9",
        "name": "Staff 2",
        "ordersHandled": 18
      }
    }
  }
}
```

---

### 5. Get Queue Details

Get details of orders currently in the assignment queue.

**Endpoint:** `GET /assignment/queue`

**Access:** Staff, Manager, Admin

**Query Parameters:**

- `hotelId` (string, optional)
- `branchId` (string, optional)

**Example Request:**

```bash
GET /api/v1/assignment/queue?branchId=68d13a9dc10d4ebc29bfe78f
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "queue": [
      {
        "orderId": "68f485aab26ed112651b2789",
        "position": 1,
        "priority": "high",
        "queuedAt": "2025-10-19T07:10:00.000Z",
        "estimatedWaitTime": 10,
        "table": { "tableNumber": "8" },
        "totalPrice": 1500.0
      },
      {
        "orderId": "68f485aab26ed112651b2790",
        "position": 2,
        "priority": "normal",
        "queuedAt": "2025-10-19T07:12:00.000Z",
        "estimatedWaitTime": 15,
        "table": { "tableNumber": "12" },
        "totalPrice": 800.0
      }
    ],
    "summary": {
      "totalInQueue": 2,
      "averageWaitTime": 12.5,
      "oldestQueueTime": 10
    }
  }
}
```

---

### 6. Update Queue Priority

Update the priority of an order in the queue.

**Endpoint:** `PUT /assignment/queue/:orderId/priority`

**Access:** Manager, Admin

**Path Parameters:**

- `orderId` (string, required)

**Request Body:**

```json
{
  "priority": "high",
  "reason": "VIP customer"
}
```

**Example Request:**

```bash
PUT /api/v1/assignment/queue/68f485aab26ed112651b2789/priority
Authorization: Bearer <token>
Content-Type: application/json

{
  "priority": "high",
  "reason": "Customer complaint"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Queue priority updated successfully",
  "data": {
    "orderId": "68f485aab26ed112651b2789",
    "oldPriority": "normal",
    "newPriority": "high",
    "newPosition": 1
  }
}
```

---

### 7. Get Available Waiters

Get list of available waiters who can accept new orders.

**Endpoint:** `GET /assignment/waiters/available`

**Access:** Staff, Manager, Admin

**Query Parameters:**

- `hotelId` (string, optional)
- `branchId` (string, optional)

**Example Request:**

```bash
GET /api/v1/assignment/waiters/available?branchId=68d13a9dc10d4ebc29bfe78f
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "waiters": [
      {
        "_id": "68f3806e35208b7bd0fdc4a8",
        "name": "Bhola created staff1",
        "staffId": "STF-WTR-2025-00012",
        "activeOrdersCount": 3,
        "maxCapacity": 5,
        "availableCapacity": 2,
        "isAvailable": true,
        "status": "active",
        "currentShift": "morning"
      }
    ],
    "summary": {
      "totalWaiters": 10,
      "availableWaiters": 7,
      "busyWaiters": 3,
      "totalCapacity": 50,
      "usedCapacity": 35,
      "utilizationPercentage": 70
    }
  }
}
```

---

### 8. Update Waiter Availability

Update a waiter's availability status.

**Endpoint:** `PUT /assignment/waiters/:waiterId/availability`

**Access:** Manager, Admin, or Self (the waiter themselves)

**Path Parameters:**

- `waiterId` (string, required)

**Request Body:**

```json
{
  "isAvailable": false,
  "reason": "Going on break"
}
```

**Example Request:**

```bash
PUT /api/v1/assignment/waiters/68f3806e35208b7bd0fdc4a8/availability
Authorization: Bearer <token>
Content-Type: application/json

{
  "isAvailable": false,
  "reason": "Lunch break"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Waiter availability updated successfully",
  "data": {
    "waiter": {
      "_id": "68f3806e35208b7bd0fdc4a8",
      "name": "Bhola created staff1",
      "isAvailable": false,
      "activeOrdersCount": 3,
      "status": "active"
    }
  }
}
```

---

### 9. Get Waiter Performance

Get performance report for a specific waiter.

**Endpoint:** `GET /assignment/waiters/:waiterId/performance`

**Access:** Manager, Admin

**Path Parameters:**

- `waiterId` (string, required)

**Query Parameters:**

- `startDate` (date, optional)
- `endDate` (date, optional)

**Example Request:**

```bash
GET /api/v1/assignment/waiters/68f3806e35208b7bd0fdc4a8/performance?startDate=2025-10-01&endDate=2025-10-19
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "waiter": {
      "_id": "68f3806e35208b7bd0fdc4a8",
      "name": "Bhola created staff1",
      "staffId": "STF-WTR-2025-00012"
    },
    "period": {
      "startDate": "2025-10-01T00:00:00.000Z",
      "endDate": "2025-10-19T23:59:59.999Z"
    },
    "statistics": {
      "totalAssignments": 85,
      "completedOrders": 82,
      "cancelledOrders": 3,
      "averageCompletionTime": 18.5,
      "customerRating": 4.5,
      "performanceRating": 4.2
    },
    "assignmentBreakdown": {
      "automatic": 70,
      "manual": 15,
      "roundRobin": 45,
      "loadBalancing": 40
    },
    "revenueGenerated": 82000.5
  }
}
```

---

### 10. Reset Round-Robin

Reset the round-robin tracking (useful for testing or daily resets).

**Endpoint:** `POST /assignment/system/reset-round-robin`

**Access:** Manager, Admin

**Request Body (optional):**

```json
{
  "branchId": "68d13a9dc10d4ebc29bfe78f"
}
```

**Example Request:**

```bash
POST /api/v1/assignment/system/reset-round-robin
Authorization: Bearer <token>
Content-Type: application/json

{
  "branchId": "68d13a9dc10d4ebc29bfe78f"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Round-robin tracking reset successfully",
  "data": {
    "branchId": "68d13a9dc10d4ebc29bfe78f",
    "resetAt": "2025-10-19T07:30:00.000Z"
  }
}
```

---

### 11. Validate Organizational Hierarchy

Validate the organizational hierarchy for assignment operations.

**Endpoint:** `GET /assignment/validate-hierarchy/:hotelId/:branchId?`

**Access:** Manager, Admin

**Path Parameters:**

- `hotelId` (string, required)
- `branchId` (string, optional)

**Example Request:**

```bash
GET /api/v1/assignment/validate-hierarchy/68d13a52c10d4ebc29bfe787/68d13a9dc10d4ebc29bfe78f
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "isValid": true,
    "hierarchy": {
      "hotel": {
        "_id": "68d13a52c10d4ebc29bfe787",
        "name": "Grand Hotel",
        "createdBy": "68d122dbb2f15347c3b3320c"
      },
      "branch": {
        "_id": "68d13a9dc10d4ebc29bfe78f",
        "name": "Downtown Branch",
        "createdBy": "68d122dbb2f15347c3b3320c"
      },
      "admin": {
        "_id": "68d122dbb2f15347c3b3320c",
        "name": "Super Admin"
      },
      "managers": [
        {
          "_id": "68d13ab8c10d4ebc29bfe79e",
          "name": "Branch Manager 1"
        }
      ],
      "staff": [
        {
          "_id": "68f3806e35208b7bd0fdc4a8",
          "name": "Bhola created staff1",
          "role": "waiter"
        }
      ]
    }
  }
}
```

---

### 12. Get Staff Hierarchy

Get detailed staff hierarchy structure for a hotel/branch.

**Endpoint:** `GET /assignment/staff-hierarchy/:hotelId/:branchId?`

**Access:** Manager, Admin

**Path Parameters:**

- `hotelId` (string, required)
- `branchId` (string, optional)

**Example Request:**

```bash
GET /api/v1/assignment/staff-hierarchy/68d13a52c10d4ebc29bfe787/68d13a9dc10d4ebc29bfe78f
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "hotel": {
      "_id": "68d13a52c10d4ebc29bfe787",
      "name": "Grand Hotel"
    },
    "branch": {
      "_id": "68d13a9dc10d4ebc29bfe78f",
      "name": "Downtown Branch"
    },
    "hierarchy": {
      "admin": {
        "_id": "68d122dbb2f15347c3b3320c",
        "name": "Super Admin",
        "role": "super_admin"
      },
      "managers": [
        {
          "_id": "68d13ab8c10d4ebc29bfe79e",
          "name": "Branch Manager 1",
          "staffCount": 15
        }
      ],
      "staff": {
        "waiters": [
          {
            "_id": "68f3806e35208b7bd0fdc4a8",
            "name": "Bhola created staff1",
            "activeOrdersCount": 3,
            "isAvailable": true
          }
        ],
        "kitchen_staff": [...],
        "cleaning_staff": [...],
        "others": [...]
      }
    },
    "summary": {
      "totalStaff": 15,
      "waiters": 10,
      "kitchenStaff": 3,
      "others": 2
    }
  }
}
```

---

### 13. Test Assignment

Test assignment scenarios (for debugging and testing).

**Endpoint:** `POST /assignment/test-assignment`

**Access:** Manager, Admin

**Request Body:**

```json
{
  "hotelId": "68d13a52c10d4ebc29bfe787",
  "branchId": "68d13a9dc10d4ebc29bfe78f",
  "orderId": "68f483aab26ed112651b2234",
  "scenario": "load-balancing"
}
```

**Example Request:**

```bash
POST /api/v1/assignment/test-assignment
Authorization: Bearer <token>
Content-Type: application/json

{
  "hotelId": "68d13a52c10d4ebc29bfe787",
  "branchId": "68d13a9dc10d4ebc29bfe78f",
  "scenario": "round-robin"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "scenario": "round-robin",
    "availableWaiters": 10,
    "simulatedAssignment": {
      "selectedWaiter": {
        "id": "68f3806e35208b7bd0fdc4a8",
        "name": "Bhola created staff1",
        "activeOrdersCount": 3
      },
      "method": "round-robin",
      "reason": "Equal load distribution among waiters with 3 orders"
    }
  }
}
```

---

### 14. Force Monitoring Cycle

Force a manual monitoring cycle (admin only).

**Endpoint:** `POST /assignment/system/force-monitoring`

**Access:** Super Admin only

**Example Request:**

```bash
POST /api/v1/assignment/system/force-monitoring
Authorization: Bearer <token>
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Monitoring cycle executed successfully",
  "data": {
    "executedAt": "2025-10-19T07:45:00.000Z",
    "results": {
      "orphanedOrdersProcessed": 2,
      "queueAssignmentsProcessed": 1,
      "waiterStatsUpdated": 10,
      "errors": []
    }
  }
}
```

---

## Response Formats

### Success Response Structure

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {
    /* response data */
  }
}
```

### Error Response Structure

```json
{
  "success": false,
  "message": "Error description",
  "statusCode": 400,
  "errors": [
    {
      "field": "orderId",
      "message": "Order ID is required"
    }
  ]
}
```

---

## Error Codes

| Status Code | Description                                |
| ----------- | ------------------------------------------ |
| 200         | Success                                    |
| 201         | Created                                    |
| 400         | Bad Request - Invalid input data           |
| 401         | Unauthorized - Invalid or missing token    |
| 403         | Forbidden - Insufficient permissions       |
| 404         | Not Found - Resource doesn't exist         |
| 423         | Locked - Account is locked                 |
| 429         | Too Many Requests - Rate limit exceeded    |
| 500         | Internal Server Error                      |
| 503         | Service Unavailable - No waiters available |

---

## Common Error Scenarios

### 1. Invalid Access Token

```json
{
  "success": false,
  "message": "Invalid access token",
  "statusCode": 401
}
```

### 2. Token Expired

```json
{
  "success": false,
  "message": "Access token expired",
  "statusCode": 401
}
```

### 3. Insufficient Permissions

```json
{
  "success": false,
  "message": "Required roles: branch_manager, admin",
  "statusCode": 403
}
```

### 4. Waiter at Capacity

```json
{
  "success": false,
  "message": "Waiter is at maximum capacity (5 orders)",
  "statusCode": 400
}
```

### 5. No Waiters Available

```json
{
  "success": false,
  "message": "No waiters available at the moment",
  "statusCode": 503
}
```

### 6. Invalid Organizational Hierarchy

```json
{
  "success": false,
  "message": "Invalid organizational hierarchy: Branch does not belong to the specified hotel",
  "statusCode": 400
}
```

---

## Testing with Postman/Thunder Client

### 1. Set up Environment Variables

```
BASE_URL = http://localhost:8000/api/v1
ACCESS_TOKEN = your_jwt_token_here
```

### 2. Common Headers

```
Authorization: Bearer {{ACCESS_TOKEN}}
Content-Type: application/json
```

### 3. Sample Test Flow

1. **Staff Login** → Get access token
2. **Get My Orders** → View assigned orders
3. **Update Order Status** → Mark as preparing
4. **Get Active Count** → Check current workload
5. **Complete Order** → Mark as served

### 4. Date Format Requirements

**Important:** Date parameters support multiple formats for flexibility:

- ✅ **Recommended**: `YYYY-MM-DD` (e.g., `2025-10-19`)
- ✅ **Supported**: `DD-MM-YYYY` (e.g., `19-10-2025`)
- ✅ **Supported**: Full ISO string (e.g., `2025-10-19T10:30:00.000Z`)
- ❌ **Not Supported**: `DD/MM/YYYY` with slashes (e.g., `19/10/2025`)
- ❌ **Not Supported**: `MM/DD/YYYY` with slashes (e.g., `10/19/2025`)

**Example Queries:**

```bash
# Using YYYY-MM-DD format (recommended)
GET /api/v1/manager/orders?startDate=2025-10-19&endDate=2025-10-30

# Using DD-MM-YYYY format (also works)
GET /api/v1/manager/orders?startDate=19-10-2025&endDate=30-10-2025
```

**Note:** The API automatically parses both formats correctly. Use hyphens (`-`), not slashes (`/`).

---

## Webhooks & Real-time Updates

The system supports real-time updates via Socket.IO:

### Events:

- `order:assigned` - Order assigned to waiter
- `order:status_updated` - Order status changed
- `waiter:availability_changed` - Waiter availability updated
- `queue:updated` - Queue status changed

### Socket Connection:

```javascript
const socket = io("http://localhost:8000", {
  auth: { token: "your_jwt_token" },
});

socket.on("order:assigned", (data) => {
  console.log("New order assigned:", data);
});
```

---

## Rate Limiting

- **Standard endpoints**: 100 requests per 15 minutes
- **Sensitive operations**: 5 requests per 15 minutes
- **Public routes**: 3 requests per 15 minutes

Rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634567890
```

---

## Best Practices

1. **Always check waiter capacity** before manual assignment
2. **Monitor queue status** during peak hours
3. **Use filters** to reduce API response size
4. **Implement retry logic** for 503 errors (no waiters)
5. **Cache assignment stats** for better performance
6. **Use pagination** for large datasets
7. **Handle token expiry** with refresh token logic
8. **Validate hierarchy** before operations

---

## Support & Contact

For API support or bug reports:

- Email: support@yourdomain.com
- GitHub Issues: https://github.com/yourrepo/issues
- Documentation: https://docs.yourdomain.com

---

**Last Updated:** October 19, 2025  
**API Version:** v1.0.0  
**Documentation Version:** 1.0
