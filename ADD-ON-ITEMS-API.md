# Add-On Items API — Postman Testing Guide

> **Base URL:** `{{baseUrl}}/api/v1`
> Set `baseUrl` as a Postman environment variable (e.g., `http://localhost:5000`)

---

## User Endpoints

### 1. Add Items to Existing Order

Adds items from the user's **active cart** to a served order.

|                  |                                                     |
| ---------------- | --------------------------------------------------- |
| **Method**       | `POST`                                              |
| **URL**          | `{{baseUrl}}/api/v1/user/orders/:orderId/add-items` |
| **Auth**         | Bearer Token (User)                                 |
| **Content-Type** | `application/json`                                  |

**URL Params:**

| Param     | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `orderId` | string | Yes      | MongoDB ObjectId of the order |

**Request Body:** _None_ — items are pulled from the user's active cart for the same hotel/branch.

**Pre-requisites:**

1. The order must have `status: "served"`
2. `pendingAddOnPayment` must be `false`
3. User must have an active cart with items for the same hotel/branch

**Example Request:**

```
POST {{baseUrl}}/api/v1/user/orders/6650abcdef1234567890abcd/add-items
Authorization: Bearer {{userToken}}
```

**Success Response (200) — Cash Order:**

```json
{
  "statusCode": 200,
  "data": {
    "order": {
      "_id": "6650abcdef1234567890abcd",
      "orderNumber": "ORD-1234",
      "status": "served",
      "currentBatch": 2,
      "hasAddOns": true,
      "pendingAddOnPayment": false,
      "subtotal": 850,
      "taxes": 42.5,
      "totalPrice": 892.5,
      "items": [
        {
          "foodItemName": "Butter Chicken",
          "quantity": 1,
          "price": 350,
          "batch": 1
        },
        {
          "foodItemName": "Paneer Tikka",
          "quantity": 2,
          "price": 250,
          "batch": 2
        }
      ],
      "payment": {
        "paymentMethod": "cash",
        "commissionAmount": 44.63,
        "commissionRate": 5
      }
    },
    "supplementaryPayment": {
      "required": false
    }
  },
  "message": "Items added to order successfully"
}
```

**Success Response (200) — Digital Payment Order:**

```json
{
  "statusCode": 200,
  "data": {
    "order": {
      "_id": "6650abcdef1234567890abcd",
      "pendingAddOnPayment": true,
      "currentBatch": 2,
      "hasAddOns": true,
      "supplementaryPayments": [
        {
          "batch": 2,
          "amount": 295,
          "paymentStatus": "pending",
          "provider": "razorpay"
        }
      ]
    },
    "supplementaryPayment": {
      "required": true,
      "amount": 295,
      "batch": 2,
      "provider": "razorpay"
    }
  },
  "message": "Items added — complete supplementary payment to notify kitchen"
}
```

**Error Responses:**

| Status | Message                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------- |
| 400    | `Order ID is required`                                                                              |
| 404    | `Order not found`                                                                                   |
| 403    | `You are not authorized to modify this order`                                                       |
| 400    | `Cannot add items when order status is "preparing". Items can only be added after food is served.`  |
| 400    | `A previous add-on payment is still pending. Please complete the payment before adding more items.` |
| 400    | `No active cart found. Please add items to your cart first.`                                        |

---

### 2. Initiate Supplementary Payment

Creates a gateway payment order for the add-on delta amount. **Only needed for digital payment orders** (when `supplementaryPayment.required === true` in the add-items response).

> **Note:** This uses the **same endpoint** as regular payment initiation. When `batch` (≥ 2) is included in the request body, the server automatically handles it as a supplementary payment.

|                  |                                        |
| ---------------- | -------------------------------------- |
| **Method**       | `POST`                                 |
| **URL**          | `{{baseUrl}}/api/v1/payments/initiate` |
| **Auth**         | Bearer Token (User)                    |
| **Content-Type** | `application/json`                     |

**Request Body:**

| Field     | Type    | Required | Description                                 |
| --------- | ------- | -------- | ------------------------------------------- |
| `orderId` | string  | Yes      | MongoDB ObjectId of the order               |
| `batch`   | integer | Yes      | Batch number (≥ 2, from add-items response) |

**Example Request:**

```json
POST {{baseUrl}}/api/v1/payments/initiate
Authorization: Bearer {{userToken}}
Content-Type: application/json

{
  "orderId": "6650abcdef1234567890abcd",
  "batch": 2
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Supplementary payment initiated successfully",
  "data": {
    "success": true,
    "provider": "razorpay",
    "orderId": "6650abcdef1234567890abcd",
    "batch": 2,
    "gatewayOrderId": "order_PxxxxYYYYzzzz",
    "amount": 295,
    "currency": "INR",
    "type": "supplementary",
    "paymentDetails": {
      "orderId": "order_PxxxxYYYYzzzz",
      "amount": 295,
      "currency": "INR"
    }
  }
}
```

**Error Responses:**

| Status | Message                                                    |
| ------ | ---------------------------------------------------------- |
| 400    | `Order ID is required`                                     |
| 400    | `Invalid orderId`                                          |
| 404    | `Order not found: {orderId}`                               |
| 404    | `No pending supplementary payment found for batch {batch}` |
| 500    | `Supplementary payment amount must be greater than 0`      |

---

### 3. Verify Supplementary Payment

Verifies the payment with the gateway after the user completes it on the frontend.

> **Note:** This uses the **same endpoint** as regular payment verification. The server auto-detects supplementary payments when the order has `pendingAddOnPayment: true` and `gatewayOrderId` is provided in the request body.

|                  |                                      |
| ---------------- | ------------------------------------ |
| **Method**       | `POST`                               |
| **URL**          | `{{baseUrl}}/api/v1/payments/verify` |
| **Auth**         | Bearer Token (User)                  |
| **Content-Type** | `application/json`                   |

**Request Body:**

| Field            | Type   | Required | Description                                         |
| ---------------- | ------ | -------- | --------------------------------------------------- |
| `orderId`        | string | Yes      | MongoDB ObjectId of the order                       |
| `paymentId`      | string | Yes      | Payment ID from the gateway (e.g., `pay_Pxxxxxxxx`) |
| `gatewayOrderId` | string | Yes      | Gateway order ID from initiate response             |
| `signature`      | string | No       | Razorpay signature for verification                 |
| `additionalData` | object | No       | PhonePe/Paytm-specific verification data            |

**Example Request (Razorpay):**

```json
POST {{baseUrl}}/api/v1/payments/verify
Authorization: Bearer {{userToken}}
Content-Type: application/json

{
  "orderId": "6650abcdef1234567890abcd",
  "paymentId": "pay_Pxxxxxxxx",
  "gatewayOrderId": "order_PxxxxYYYYzzzz",
  "signature": "abcdef1234567890..."
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Supplementary payment verified successfully",
  "data": {
    "success": true,
    "verified": true,
    "orderId": "6650abcdef1234567890abcd",
    "batch": 2,
    "paymentId": "pay_Pxxxxxxxx",
    "paymentStatus": "paid",
    "amount": 295
  }
}
```

**Failure Response (400):**

```json
{
  "success": false,
  "message": "Supplementary payment failed",
  "data": {
    "success": false,
    "verified": true,
    "orderId": "6650abcdef1234567890abcd",
    "batch": 2,
    "paymentId": "pay_Pxxxxxxxx",
    "paymentStatus": "failed",
    "amount": 295
  }
}
```

**Side Effects on Success:**

- `order.pendingAddOnPayment` → `false`
- Socket event `order:items-added` sent to assigned staff (with `paymentVerified: true`)
- Transaction amount updated to new order total

---

## Staff Endpoints

### 4. Get Add-On Orders

Returns all active orders assigned to the staff member that have add-on items.

|            |                                           |
| ---------- | ----------------------------------------- |
| **Method** | `GET`                                     |
| **URL**    | `{{baseUrl}}/api/v1/staff/orders/add-ons` |
| **Auth**   | Bearer Token (Staff)                      |

**Query Params:**

| Param            | Type   | Required | Description                                                                |
| ---------------- | ------ | -------- | -------------------------------------------------------------------------- |
| `paymentPending` | string | No       | Set to `"true"` to filter orders waiting for supplementary digital payment |

**Example Requests:**

```
GET {{baseUrl}}/api/v1/staff/orders/add-ons
Authorization: Bearer {{staffToken}}

GET {{baseUrl}}/api/v1/staff/orders/add-ons?paymentPending=true
Authorization: Bearer {{staffToken}}
```

**Success Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "orders": [
      {
        "_id": "6650abcdef1234567890abcd",
        "orderNumber": "ORD-1234",
        "status": "served",
        "hasAddOns": true,
        "pendingAddOnPayment": false,
        "currentBatch": 2,
        "user": {
          "name": "John Doe",
          "phone": "9876543210"
        },
        "table": {
          "tableNumber": 5
        },
        "items": [
          {
            "foodItem": {
              "name": "Butter Chicken",
              "price": 350,
              "category": "Main Course"
            },
            "quantity": 1,
            "batch": 1
          },
          {
            "foodItem": {
              "name": "Paneer Tikka",
              "price": 250,
              "category": "Starters"
            },
            "quantity": 2,
            "batch": 2
          }
        ],
        "supplementaryPayments": [],
        "totalPrice": 892.5
      }
    ],
    "count": 1
  },
  "message": "Add-on orders retrieved successfully"
}
```

---

### 5. Acknowledge Add-On Items

Staff acknowledges receiving the add-on notification. Moves order from `served` → `preparing` so staff can prepare the new items.

|                  |                                                              |
| ---------------- | ------------------------------------------------------------ |
| **Method**       | `PUT`                                                        |
| **URL**          | `{{baseUrl}}/api/v1/staff/orders/:orderId/acknowledge-addon` |
| **Auth**         | Bearer Token (Staff)                                         |
| **Content-Type** | `application/json`                                           |

**URL Params:**

| Param     | Type   | Required | Description                   |
| --------- | ------ | -------- | ----------------------------- |
| `orderId` | string | Yes      | MongoDB ObjectId of the order |

**Request Body:**

| Field   | Type   | Required | Description                                             |
| ------- | ------ | -------- | ------------------------------------------------------- |
| `batch` | number | No       | Batch to acknowledge (defaults to `order.currentBatch`) |

**Example Request:**

```json
PUT {{baseUrl}}/api/v1/staff/orders/6650abcdef1234567890abcd/acknowledge-addon
Authorization: Bearer {{staffToken}}
Content-Type: application/json

{
  "batch": 2
}
```

**Success Response (200):**

```json
{
  "statusCode": 200,
  "data": {
    "order": {
      "_id": "6650abcdef1234567890abcd",
      "status": "preparing",
      "previousStatus": "served",
      "hasAddOns": true,
      "currentBatch": 2,
      "statusHistory": [
        {
          "status": "preparing",
          "timestamp": "2026-03-19T10:30:00.000Z",
          "updatedBy": "6650abcdef1234567890staff",
          "notes": "Add-on batch 2 acknowledged — preparing new items"
        }
      ]
    }
  },
  "message": "Add-on acknowledged — order moved to preparing"
}
```

**Error Responses:**

| Status | Message                              |
| ------ | ------------------------------------ |
| 400    | `Invalid order ID`                   |
| 404    | `Order not found`                    |
| 403    | `You are not assigned to this order` |

**Note:** If order is not in `served` status or `pendingAddOnPayment` is true, the order is returned as-is without modification.

---

## Socket Event Reference

### Event: `order:items-added`

Staff receives this on rooms `staff_{staffId}` and `branch_{branchId}`.

**Payload:**

```json
{
  "orderId": "6650abcdef1234567890abcd",
  "orderNumber": "ORD-1234",
  "newItems": [
    {
      "foodItemName": "Paneer Tikka",
      "quantity": 2,
      "price": 250,
      "totalPrice": 500
    }
  ],
  "batch": 2,
  "updatedTotal": 892.5,
  "paymentMethod": "cash",
  "paymentVerified": true,
  "tableNumber": 5,
  "message": "Customer has added extra items to their order"
}
```

| When               | Trigger                                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| **Cash orders**    | Immediately after `POST /add-items`                                     |
| **Digital orders** | After `POST /payments/verify` succeeds (with supplementary auto-detect) |

---

## Testing Flow

### Cash Order Flow

```
1. User adds items to cart       → POST /api/v1/user/cart/add
2. User adds items to order      → POST /api/v1/user/orders/:orderId/add-items
   ✅ Staff gets socket event instantly
3. Staff views add-on orders     → GET  /api/v1/staff/orders/add-ons
4. Staff acknowledges            → PUT  /api/v1/staff/orders/:orderId/acknowledge-addon
5. Staff updates status flow     → PUT  /api/v1/staff/orders/:orderId/status (preparing → ready → served)
```

### Digital Payment Flow

```
1. User adds items to cart       → POST /api/v1/user/cart/add
2. User adds items to order      → POST /api/v1/user/orders/:orderId/add-items
   (response has supplementaryPayment.required = true)
3. Initiate supplementary pay    → POST /api/v1/payments/initiate        (with batch field)
4. Complete payment on frontend  → (Razorpay/PhonePe/Paytm checkout)
5. Verify supplementary pay      → POST /api/v1/payments/verify          (with gatewayOrderId)
   ✅ Staff gets socket event after payment verified
6. Staff views add-on orders     → GET  /api/v1/staff/orders/add-ons
7. Staff acknowledges            → PUT  /api/v1/staff/orders/:orderId/acknowledge-addon
8. Staff updates status flow     → PUT  /api/v1/staff/orders/:orderId/status
```
