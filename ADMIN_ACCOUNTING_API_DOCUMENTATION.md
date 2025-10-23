# Admin Accounting & Transactions API Documentation

## Overview

Complete accounting and transaction management system for admin users with comprehensive reporting, analytics, and export capabilities.

## Base URL

```
/api/v1/admin/accounting
```

## Authentication

- **Required Role**: `admin`
- **Authentication**: Bearer Token
- All endpoints require admin authentication

## Test Data Available

For testing purposes, sample data has been created:

- **Hotel ID**: `68fa10cd2a7c1aed56790178`
- **Branch ID**: `68fa10cd2a7c1aed56790179`
- **User ID**: `68fa10cd2a7c1aed5679017a`
- **Sample Orders**: 5 orders with various payment methods (razorpay, upi, cash, card, wallet)
- **Payment Status**: 3 paid, 1 pending, 1 failed

---

## 🏦 **1. All Transactions History**

### GET `/transactions`

Get all transactions with advanced filtering and pagination.

#### Query Parameters

```javascript
{
  // Pagination
  page?: number = 1,
  limit?: number = 20,

  // Filters
  hotelId?: string,
  branchId?: string,
  status?: "pending" | "completed" | "failed" | "cancelled" | "paid" | "refund_pending" | "refunded",
  paymentMethod?: "card" | "upi" | "wallet" | "cash" | "razorpay",

  // Date Range
  startDate?: string, // YYYY-MM-DD
  endDate?: string,   // YYYY-MM-DD

  // Amount Range
  minAmount?: number,
  maxAmount?: number,

  // Sorting
  sortBy?: "createdAt" | "amount" | "status" = "createdAt",
  sortOrder?: "asc" | "desc" = "desc"
}
```

#### Response Example

```javascript
{
  "statusCode": 200,
  "data": {
    "transactions": [
      {
        "_id": "67123456789abcdef0123456",
        "transactionId": "TXN-2025-001234",
        "orderId": "ORD-2025-001234",
        "hotel": {
          "_id": "67123456789abcdef0123456",
          "name": "Grand Palace Hotel",
          "hotelId": "HOTEL-001"
        },
        "branch": {
          "_id": "67123456789abcdef0123456",
          "name": "Main Branch",
          "branchId": "BRANCH-001"
        },
        "user": {
          "_id": "67123456789abcdef0123456",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "amount": 1250.50,
        "paymentMethod": "upi",
        "status": "completed",
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 25,
      "totalTransactions": 500,
      "hasNext": true,
      "hasPrev": false
    },
    "summary": {
      "totalAmount": 125000.50,
      "totalTransactions": 500,
      "successfulTransactions": 485,
      "failedTransactions": 15,
      "pendingTransactions": 0,
      "avgTransactionAmount": 250.00,
      "successRate": 97.00
    },
    "filters": {
      "hotelId": null,
      "branchId": null,
      "status": null,
      // ... applied filters
    }
  },
  "message": "Transactions retrieved successfully"
}
```

---

## 🏨 **2. Hotel-wise Accounting**

### GET `/hotels`

Get revenue and transaction summary for all hotels.

#### Query Parameters

```javascript
{
  startDate?: string, // YYYY-MM-DD
  endDate?: string,   // YYYY-MM-DD
  status?: "completed" | "pending" | "failed" | "paid" = "completed"
}
```

#### Response Example

```javascript
{
  "statusCode": 200,
  "data": {
    "hotels": [
      {
        "hotelId": "67123456789abcdef0123456",
        "hotelName": "Grand Palace Hotel",
        "hotelCode": "HOTEL-001",
        "location": {
          "city": "Mumbai",
          "state": "Maharashtra"
        },
        "totalRevenue": 125000.50,
        "totalTransactions": 450,
        "avgTransactionAmount": 277.78,
        "paymentBreakdown": {
          "upi": 75000.25,
          "card": 35000.15,
          "wallet": 15000.10
        },
        "revenueShare": 35.71
      }
    ],
    "summary": {
      "totalRevenue": 350000.75,
      "totalTransactions": 1200,
      "totalHotels": 5,
      "avgRevenuePerHotel": 70000.15
    },
    "filters": {
      "startDate": "2025-01-01",
      "endDate": "2025-01-31",
      "status": "completed"
    }
  },
  "message": "Hotel-wise accounting retrieved successfully"
}
```

---

## 🏢 **3. Branch-wise Accounting**

### GET `/branches`

Get revenue and transaction summary for branches.

#### Query Parameters

```javascript
{
  hotelId?: string,   // Filter by specific hotel
  startDate?: string, // YYYY-MM-DD
  endDate?: string,   // YYYY-MM-DD
  status?: "completed" | "pending" | "failed" | "paid" = "completed"
}
```

#### Response Example

```javascript
{
  "statusCode": 200,
  "data": {
    "branches": [
      {
        "branchId": "67123456789abcdef0123456",
        "branchName": "Main Branch",
        "branchCode": "BRANCH-001",
        "hotelId": "67123456789abcdef0123456",
        "hotelName": "Grand Palace Hotel",
        "location": {
          "address": "123 Main St",
          "city": "Mumbai",
          "state": "Maharashtra"
        },
        "totalRevenue": 45000.25,
        "totalTransactions": 180,
        "avgTransactionAmount": 250.00,
        "dailyRevenue": {
          "2025-01-15": 1500.50,
          "2025-01-16": 1750.75,
          // ... daily breakdown
        }
      }
    ],
    "summary": {
      "totalRevenue": 125000.50,
      "totalTransactions": 500,
      "totalBranches": 8,
      "avgRevenuePerBranch": 15625.06
    },
    "filters": {
      "hotelId": "67123456789abcdef0123456",
      "startDate": "2025-01-01",
      "endDate": "2025-01-31"
    }
  },
  "message": "Branch-wise accounting retrieved successfully"
}
```

---

## 💰 **4. Settlement Tracking & Payout Logs**

### GET `/settlements`

Get settlement tracking with payout status and logs.

#### Query Parameters

```javascript
{
  // Pagination
  page?: number = 1,
  limit?: number = 20,

  // Filters
  hotelId?: string,
  branchId?: string,
  status?: string,
  payoutStatus?: "all" | "pending" | "processing" | "settled" = "all",

  // Date Range
  startDate?: string, // YYYY-MM-DD
  endDate?: string    // YYYY-MM-DD
}
```

#### Response Example

```javascript
{
  "statusCode": 200,
  "data": {
    "settlements": [
      {
        "settlementId": "SET-2025-01-15-123456",
        "hotelId": "67123456789abcdef0123456",
        "hotelName": "Grand Palace Hotel",
        "branchId": "67123456789abcdef0123456",
        "branchName": "Main Branch",
        "settlementDate": "2025-01-15",
        "totalAmount": 5500.75,
        "transactionCount": 25,
        "settlementStatus": "pending", // pending | processing | settled
        "estimatedPayoutDate": "2025-01-22T00:00:00.000Z",
        "transactions": [
          {
            "transactionId": "67123456789abcdef0123456",
            "orderId": "67123456789abcdef0123456",
            "amount": 250.50,
            "paymentMethod": "upi",
            "createdAt": "2025-01-15T10:30:00.000Z"
          }
        ]
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 15,
      "totalSettlements": 150,
      "hasNext": true,
      "hasPrev": false
    },
    "summary": {
      "totalSettlementAmount": 275000.50,
      "totalSettlements": 150,
      "pendingAmount": 125000.25,
      "processingAmount": 50000.15,
      "settledAmount": 100000.10
    }
  },
  "message": "Settlements retrieved successfully"
}
```

---

## 📊 **5. Export Reports**

### POST `/export`

Export accounting reports in multiple formats.

#### Request Body

```javascript
{
  "format": "csv" | "excel" | "pdf",
  "reportType": "transactions" | "hotels" | "branches" | "settlements",

  // Optional Filters
  "hotelId"?: string,
  "branchId"?: string,
  "startDate"?: string, // YYYY-MM-DD
  "endDate"?: string,   // YYYY-MM-DD
  "status"?: string
}
```

#### Response

- **Content-Type**: Based on format
  - CSV: `text/csv`
  - Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - PDF: `application/pdf`
- **Content-Disposition**: `attachment; filename="report_name.format"`

#### Example Request

```javascript
POST /api/v1/admin/accounting/export
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "format": "excel",
  "reportType": "transactions",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "hotelId": "67123456789abcdef0123456"
}
```

---

## 📈 **Report Types & Formats**

### 1. **Transactions Report**

**Columns**: Transaction ID, Order ID, Hotel, Branch, Customer, Amount, Payment Method, Status, Date

### 2. **Hotels Report**

**Columns**: Hotel Name, Hotel Code, Location, Total Revenue, Total Transactions, Avg Transaction, Revenue Share

### 3. **Branches Report**

**Columns**: Hotel, Branch Name, Branch Code, Location, Total Revenue, Total Transactions, Avg Transaction

### 4. **Settlements Report**

**Columns**: Settlement ID, Hotel, Branch, Settlement Date, Amount, Transaction Count, Status, Estimated Payout

---

## � **Status Values Reference**

### **Transaction Status Values**

| Status             | Description                                  | Usage                            |
| ------------------ | -------------------------------------------- | -------------------------------- |
| `"completed"`      | Successfully processed transactions          | Most common for revenue reports  |
| `"paid"`           | Same as completed (direct Order model value) | Alternative to completed         |
| `"pending"`        | Transactions awaiting processing             | Monitor incomplete payments      |
| `"failed"`         | Failed payment transactions                  | Error tracking and analysis      |
| `"cancelled"`      | Cancelled transactions                       | Refund and cancellation tracking |
| `"refund_pending"` | Refund initiated but not completed           | Refund pipeline monitoring       |
| `"refunded"`       | Successfully refunded transactions           | Completed refund tracking        |

### **Settlement Payout Status Values**

| PayoutStatus   | Description                    |
| -------------- | ------------------------------ |
| `"all"`        | All settlements (default)      |
| `"pending"`    | Awaiting settlement processing |
| `"processing"` | Currently being processed      |
| `"settled"`    | Completed settlements          |

---

## �🔍 **Advanced Filtering Examples**

### Filter by Date Range

```javascript
GET /api/v1/admin/accounting/transactions?startDate=2025-01-01&endDate=2025-01-31
```

### Filter by Hotel and Status

```javascript
GET /api/v1/admin/accounting/transactions?hotelId=67123456789abcdef0123456&status=completed
```

### Filter by Amount Range

```javascript
GET /api/v1/admin/accounting/transactions?minAmount=100&maxAmount=1000
```

### Filter by Payment Method

```javascript
GET /api/v1/admin/accounting/transactions?paymentMethod=upi
```

---

## ⚠️ **Error Responses**

### 400 Bad Request

```javascript
{
  "statusCode": 400,
  "message": "Invalid export format. Supported: csv, excel, pdf",
  "error": "Bad Request"
}
```

### 401 Unauthorized

```javascript
{
  "statusCode": 401,
  "message": "Access denied. Admin role required.",
  "error": "Unauthorized"
}
```

### 404 Not Found

```javascript
{
  "statusCode": 404,
  "message": "Hotel not found",
  "error": "Not Found"
}
```

### 500 Server Error

```javascript
{
  "statusCode": 500,
  "message": "Error fetching transactions",
  "error": "Internal Server Error"
}
```

---

## 📊 **Performance Notes**

1. **Pagination**: Large datasets are paginated with default limit of 20
2. **Export Limits**: Report exports limited to 10,000 records for performance
3. **Date Ranges**: Recommended to use specific date ranges for better performance
4. **Indexes**: Ensure proper indexing on `hotel`, `branch`, `status`, `createdAt` fields

---

## 🔐 **Security & Access Control**

- **Admin Only**: All endpoints require admin role
- **Input Validation**: All parameters validated using Joi schemas
- **Rate Limiting**: Export endpoints have rate limiting to prevent abuse
- **Audit Logging**: All accounting operations are logged for audit trail

---

## 📱 **Usage Examples**

### Get Recent Transactions

```javascript
fetch(
  "/api/v1/admin/accounting/transactions?page=1&limit=10&sortBy=createdAt&sortOrder=desc"
);
```

### Export Monthly Hotel Report

```javascript
fetch("/api/v1/admin/accounting/export", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    format: "excel",
    reportType: "hotels",
    startDate: "2025-01-01",
    endDate: "2025-01-31",
  }),
});
```

### Get Pending Settlements

```javascript
fetch("/api/v1/admin/accounting/settlements?payoutStatus=pending");
```
