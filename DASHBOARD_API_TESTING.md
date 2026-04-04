# Admin Dashboard API — Postman Testing Guide

> **Base URL:** `{{BASE_URL}}/api/v1/admin`
>
> **Auth:** All endpoints require admin JWT token in `Authorization: Bearer {{ADMIN_TOKEN}}` header.
>
> **Subscription:** All endpoints require active subscription with `analyticsAccess` feature enabled.
>
> **Scoping:**
>
> - `admin` role → sees all hotels they own
> - `branch_admin` role → sees only their assigned branches

---

## Common Query Parameters

| Param       | Type   | Default | Options                  | Description                     |
| ----------- | ------ | ------- | ------------------------ | ------------------------------- |
| `hotelId`   | String | —       | Valid MongoDB ObjectId   | Filter to a specific hotel      |
| `branchId`  | String | —       | Valid MongoDB ObjectId   | Filter to a specific branch     |
| `timeRange` | String | `30d`   | `1d`, `7d`, `30d`, `90d` | Time range for data aggregation |

---

## EXISTING ENDPOINTS (Already Implemented)

---

### 1. Dashboard Overview (KPI Summary)

```
GET {{BASE_URL}}/api/v1/admin/dashboard
```

**Query Params:**

| Param       | Required | Example              |
| ----------- | -------- | -------------------- |
| `branchId`  | No       | `665a1b2c3d4e5f6789` |
| `timeRange` | No       | `7d`                 |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard?timeRange=30d&branchId=665a1b2c3d4e5f6789
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "overview": {
      "totalOrders": 1250,
      "completedOrders": 980,
      "cancelledOrders": 45,
      "pendingOrders": 225,
      "totalRevenue": 485000,
      "averageOrderValue": 495.92,
      "totalCustomers": 3200,
      "newCustomers": 180,
      "totalBranches": 4,
      "orderGrowth": 12.5,
      "revenueGrowth": 8.3
    },
    "trends": {
      "orderTrend": [
        {
          "_id": { "date": "2026-03-25" },
          "orders": 45,
          "revenue": 22500
        }
      ]
    },
    "topItems": [
      {
        "name": "Butter Chicken",
        "quantity": 320,
        "revenue": 96000
      }
    ],
    "timeRange": "30d"
  },
  "message": "Dashboard overview retrieved successfully"
}
```

---

### 2. Sales Report (Revenue Trend)

```
GET {{BASE_URL}}/api/v1/admin/reports/sales
```

**Query Params:**

| Param       | Required | Example      |
| ----------- | -------- | ------------ |
| `startDate` | **Yes**  | `2026-03-01` |
| `endDate`   | **Yes**  | `2026-03-31` |
| `groupBy`   | No       | `day`        |
| `branchId`  | No       | ObjectId     |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/reports/sales?startDate=2026-03-01&endDate=2026-03-31&groupBy=day
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "salesData": [
      {
        "_id": { "day": "2026-03-01" },
        "totalOrders": 42,
        "totalRevenue": 21000,
        "averageOrderValue": 500
      }
    ],
    "paymentMethods": [
      { "_id": "cash", "count": 120, "revenue": 60000 },
      { "_id": "razorpay", "count": 85, "revenue": 42500 },
      { "_id": "upi", "count": 200, "revenue": 100000 }
    ],
    "branchBreakdown": [
      {
        "branchName": "Main Branch",
        "branchId": "BR001",
        "totalOrders": 300,
        "totalRevenue": 150000
      }
    ],
    "summary": {
      "totalOrders": 1250,
      "totalRevenue": 485000,
      "averageOrderValue": 388,
      "period": {
        "startDate": "2026-03-01",
        "endDate": "2026-03-31"
      },
      "groupBy": "day"
    }
  },
  "message": "Sales report generated successfully"
}
```

---

### 3. Accounting Dashboard (Payment Distribution)

```
GET {{BASE_URL}}/api/v1/admin/accounting/dashboard
```

**Query Params:**

| Param      | Required | Example  |
| ---------- | -------- | -------- |
| `period`   | No       | `30d`    |
| `hotelId`  | No       | ObjectId |
| `branchId` | No       | ObjectId |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/accounting/dashboard?period=30d
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "overview": {
      "period": "30d",
      "totalRevenue": 485000,
      "totalTransactions": 1250,
      "avgTransactionAmount": 388,
      "successRate": 98.5
    },
    "growth": {
      "revenue": 8.3,
      "transactions": 12.5,
      "avgTransaction": -3.2
    },
    "dailyTrends": [
      {
        "date": "2026-03-25",
        "totalAmount": 22500,
        "transactionCount": 45
      }
    ],
    "topPerformers": {
      "hotels": [{ "name": "Hotel Grand", "revenue": 250000 }],
      "branches": [{ "name": "Main Branch", "revenue": 150000 }]
    },
    "paymentMethods": [
      { "method": "cash", "count": 400, "amount": 200000, "percentage": 41.2 },
      { "method": "upi", "count": 350, "amount": 175000, "percentage": 36.1 }
    ],
    "quickStats": {
      "todayRevenue": 15000,
      "yesterdayRevenue": 18000,
      "avgDailyRevenue": 16166.67,
      "peakTransactionDay": {
        "transactionCount": 68,
        "date": "2026-03-15"
      }
    }
  },
  "message": "Accounting dashboard data retrieved successfully"
}
```

---

### 4. Best Selling Items (Top Categories)

```
GET {{BASE_URL}}/api/v1/admin/reports/best-sellers
```

**Query Params:**

| Param       | Required | Example      |
| ----------- | -------- | ------------ |
| `branchId`  | No       | ObjectId     |
| `hotelId`   | No       | ObjectId     |
| `startDate` | No       | `2026-03-01` |
| `endDate`   | No       | `2026-03-31` |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/reports/best-sellers
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": [
    {
      "name": "Butter Chicken",
      "quantity": 320,
      "revenue": 96000
    },
    {
      "name": "Paneer Tikka",
      "quantity": 280,
      "revenue": 56000
    }
  ],
  "message": "Best selling items retrieved successfully"
}
```

---

### 5. Accounting Financial Summary

```
GET {{BASE_URL}}/api/v1/admin/accounting/summary
```

**Query Params:**

| Param    | Required | Example |
| -------- | -------- | ------- |
| `period` | No       | `30d`   |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/accounting/summary?period=7d
```

---

## NEW ENDPOINTS (Dashboard Module)

---

### 6. Order Status Distribution (Pie Chart)

```
GET {{BASE_URL}}/api/v1/admin/dashboard/order-status
```

**Query Params:**

| Param       | Required | Example  |
| ----------- | -------- | -------- |
| `hotelId`   | No       | ObjectId |
| `branchId`  | No       | ObjectId |
| `timeRange` | No       | `30d`    |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/order-status?timeRange=7d&hotelId=665a1b2c3d4e5f6789
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "distribution": [
      { "status": "pending", "count": 25 },
      { "status": "confirmed", "count": 18 },
      { "status": "preparing", "count": 12 },
      { "status": "ready", "count": 8 },
      { "status": "served", "count": 45 },
      { "status": "completed", "count": 980 },
      { "status": "cancelled", "count": 45 },
      { "status": "queued", "count": 5 }
    ],
    "total": 1138,
    "timeRange": "7d"
  },
  "message": "Order status distribution retrieved successfully"
}
```

---

### 7. Customer Ratings (Multi-Dimensional)

```
GET {{BASE_URL}}/api/v1/admin/dashboard/customer-ratings
```

**Query Params:**

| Param       | Required | Example  |
| ----------- | -------- | -------- |
| `hotelId`   | No       | ObjectId |
| `branchId`  | No       | ObjectId |
| `timeRange` | No       | `30d`    |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/customer-ratings?timeRange=30d
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "dimensions": {
      "food": 4.5,
      "hotel": 4.2,
      "branch": 4.3,
      "staff": 4.1
    },
    "distribution": [
      { "stars": 1, "count": 5 },
      { "stars": 2, "count": 12 },
      { "stars": 3, "count": 45 },
      { "stars": 4, "count": 180 },
      { "stars": 5, "count": 258 }
    ],
    "totalReviews": 500,
    "overallAverage": 4.28,
    "timeRange": "30d"
  },
  "message": "Customer ratings retrieved successfully"
}
```

---

### 8. Table Utilization (Hourly)

```
GET {{BASE_URL}}/api/v1/admin/dashboard/table-utilization
```

**Query Params:**

| Param      | Required | Example      |
| ---------- | -------- | ------------ |
| `hotelId`  | No       | ObjectId     |
| `branchId` | No       | ObjectId     |
| `date`     | No       | `2026-03-31` |

> **Note:** `date` defaults to today if not provided.

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/table-utilization?branchId=665a1b2c3d4e5f6789&date=2026-03-31
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "date": "2026-03-31",
    "totalTables": 20,
    "utilization": [
      { "hour": 0, "occupied": 0, "available": 20, "occupancyPercent": 0 },
      { "hour": 1, "occupied": 0, "available": 20, "occupancyPercent": 0 },
      { "hour": 9, "occupied": 3, "available": 17, "occupancyPercent": 15 },
      { "hour": 12, "occupied": 15, "available": 5, "occupancyPercent": 75 },
      { "hour": 13, "occupied": 18, "available": 2, "occupancyPercent": 90 },
      { "hour": 19, "occupied": 16, "available": 4, "occupancyPercent": 80 },
      { "hour": 20, "occupied": 19, "available": 1, "occupancyPercent": 95 },
      { "hour": 23, "occupied": 2, "available": 18, "occupancyPercent": 10 }
    ]
  },
  "message": "Table utilization retrieved successfully"
}
```

> Response contains all 24 hours (0–23). Truncated above for brevity.

---

### 9. Booking Trends (Weekly Comparison)

```
GET {{BASE_URL}}/api/v1/admin/dashboard/booking-trends
```

**Query Params:**

| Param      | Required | Example  |
| ---------- | -------- | -------- |
| `hotelId`  | No       | ObjectId |
| `branchId` | No       | ObjectId |

> Compares current week vs previous week automatically.

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/booking-trends?branchId=665a1b2c3d4e5f6789
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "trends": [
      { "day": "Sun", "current": 8, "previous": 5 },
      { "day": "Mon", "current": 12, "previous": 10 },
      { "day": "Tue", "current": 15, "previous": 14 },
      { "day": "Wed", "current": 18, "previous": 12 },
      { "day": "Thu", "current": 20, "previous": 16 },
      { "day": "Fri", "current": 25, "previous": 22 },
      { "day": "Sat", "current": 28, "previous": 24 }
    ],
    "currentWeekTotal": 126,
    "previousWeekTotal": 103,
    "changePercent": 22.33
  },
  "message": "Booking trends retrieved successfully"
}
```

---

### 10. Staff Performance

```
GET {{BASE_URL}}/api/v1/admin/dashboard/staff-performance
```

**Query Params:**

| Param       | Required | Example  |
| ----------- | -------- | -------- |
| `hotelId`   | No       | ObjectId |
| `branchId`  | No       | ObjectId |
| `timeRange` | No       | `30d`    |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/staff-performance?timeRange=30d
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "performance": [
      {
        "staffId": "STF001",
        "name": "Rahul Kumar",
        "role": "waiter",
        "ordersHandled": 145,
        "totalSales": 72500,
        "averageRating": 4.6,
        "totalReviews": 38
      },
      {
        "staffId": "STF002",
        "name": "Priya Sharma",
        "role": "waiter",
        "ordersHandled": 132,
        "totalSales": 66000,
        "averageRating": 4.8,
        "totalReviews": 42
      },
      {
        "staffId": "STF003",
        "name": "Amit Singh",
        "role": "chef",
        "ordersHandled": 98,
        "totalSales": 49000,
        "averageRating": 4.3,
        "totalReviews": 15
      }
    ],
    "timeRange": "30d"
  },
  "message": "Staff performance retrieved successfully"
}
```

> Returns top 20 staff sorted by `totalSales` descending.

---

### 11. Complaints Summary

```
GET {{BASE_URL}}/api/v1/admin/dashboard/complaints-summary
```

**Query Params:**

| Param       | Required | Example  |
| ----------- | -------- | -------- |
| `hotelId`   | No       | ObjectId |
| `branchId`  | No       | ObjectId |
| `timeRange` | No       | `30d`    |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/complaints-summary?timeRange=30d
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "total": 48,
    "byStatus": [
      { "status": "pending", "count": 12 },
      { "status": "in_progress", "count": 8 },
      { "status": "resolved", "count": 25 },
      { "status": "dismissed", "count": 3 }
    ],
    "byCategory": [
      { "category": "food_quality", "count": 15 },
      { "category": "service", "count": 12 },
      { "category": "cleanliness", "count": 8 },
      { "category": "billing", "count": 5 },
      { "category": "staff_behavior", "count": 4 },
      { "category": "hygiene", "count": 3 },
      { "category": "delivery", "count": 1 }
    ],
    "byPriority": [
      { "priority": "low", "count": 10 },
      { "priority": "medium", "count": 22 },
      { "priority": "high", "count": 12 },
      { "priority": "critical", "count": 4 }
    ],
    "resolutionRate": 52.08,
    "timeRange": "30d"
  },
  "message": "Complaints summary retrieved successfully"
}
```

---

### 12. Coin & Reward Activity

```
GET {{BASE_URL}}/api/v1/admin/dashboard/coin-activity
```

**Query Params:**

| Param       | Required | Example  |
| ----------- | -------- | -------- |
| `hotelId`   | No       | ObjectId |
| `branchId`  | No       | ObjectId |
| `timeRange` | No       | `30d`    |

**Example Request:**

```
GET {{BASE_URL}}/api/v1/admin/dashboard/coin-activity?timeRange=30d
```

**Expected Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "coinsEarned": 15000,
    "coinsUsed": 8500,
    "coinsRefunded": 500,
    "netCoins": 7000,
    "transactionsByType": [
      { "type": "earned", "count": 980, "totalCoins": 15000 },
      { "type": "used", "count": 420, "totalCoins": 8500 },
      { "type": "refunded", "count": 15, "totalCoins": 500 },
      { "type": "expired", "count": 50, "totalCoins": 2000 },
      { "type": "adjusted", "count": 5, "totalCoins": 150 }
    ],
    "rewardsByType": [
      { "type": "order_reward", "count": 800, "totalCoins": 12000 },
      { "type": "task_reward", "count": 180, "totalCoins": 3000 }
    ],
    "timeRange": "30d"
  },
  "message": "Coin activity retrieved successfully"
}
```

---

## Error Responses

### 401 — No Token / Invalid Token

```json
{
  "statusCode": 401,
  "message": "Unauthorized - Please log in",
  "success": false
}
```

### 403 — No Subscription / Feature Not Enabled

```json
{
  "statusCode": 403,
  "message": "Active subscription required to access this feature",
  "success": false
}
```

### 403 — Branch Access Denied (branch_admin)

```json
{
  "statusCode": 403,
  "message": "You don't have access to this branch",
  "success": false
}
```

### 400 — Missing Required Params (Sales Report)

```json
{
  "statusCode": 400,
  "message": "Start date and end date are required",
  "success": false
}
```

---

## Postman Environment Variables

| Variable      | Example Value              | Description          |
| ------------- | -------------------------- | -------------------- |
| `BASE_URL`    | `http://localhost:5000`    | Server base URL      |
| `ADMIN_TOKEN` | `eyJhbGciOiJIUzI1NiIs...`  | Admin JWT token      |
| `HOTEL_ID`    | `665a1b2c3d4e5f6a7b8c9d0e` | Test hotel ObjectId  |
| `BRANCH_ID`   | `665a1b2c3d4e5f6a7b8c9d0f` | Test branch ObjectId |

---

## Quick Test Sequence

Test in this order to verify all endpoints:

| #   | Endpoint                                  | Purpose                             |
| --- | ----------------------------------------- | ----------------------------------- |
| 1   | `GET /admin/dashboard`                    | Verify auth + KPI summary works     |
| 2   | `GET /admin/dashboard?branchId=...`       | Verify branch scoping               |
| 3   | `GET /admin/dashboard/order-status`       | Verify all 8 statuses returned      |
| 4   | `GET /admin/dashboard/customer-ratings`   | Verify 4 rating dimensions          |
| 5   | `GET /admin/dashboard/table-utilization`  | Verify 24-hour array returned       |
| 6   | `GET /admin/dashboard/booking-trends`     | Verify current vs previous week     |
| 7   | `GET /admin/dashboard/staff-performance`  | Verify staff data with ratings      |
| 8   | `GET /admin/dashboard/complaints-summary` | Verify category/status breakdown    |
| 9   | `GET /admin/dashboard/coin-activity`      | Verify coin transaction aggregation |
| 10  | `GET /admin/reports/sales`                | Verify with startDate + endDate     |
| 11  | `GET /admin/accounting/dashboard`         | Verify payment distribution         |
| 12  | `GET /admin/reports/best-sellers`         | Verify top items                    |

---

## Edge Case Tests

| Test                                   | Expected Behavior                   |
| -------------------------------------- | ----------------------------------- |
| No `Authorization` header              | 401 Unauthorized                    |
| Expired token                          | 401 Unauthorized                    |
| `branch_admin` accessing other branch  | 403 Forbidden                       |
| No subscription                        | 403 — subscription required         |
| Subscription without `analyticsAccess` | 403 — feature not enabled           |
| Invalid `hotelId` format               | 400 or 500 — CastError              |
| `timeRange=invalid`                    | Falls back to `30d` default         |
| No data in DB                          | 200 with empty arrays / zero counts |
| `table-utilization` with future date   | 200 with all zeros                  |
| `sales` without `startDate`/`endDate`  | 400 — required params missing       |
