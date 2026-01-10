# Postman API Testing Collection - TableTop Hotel Management

**Project:** TableTop Hotel Management System  
**Base URL:** `http://localhost:8000/api/v1`  
**API Version:** v1.6.0  
**Last Updated:** November 9, 2025

---

## Table of Contents

1. [Quick Setup](#quick-setup)
2. [Environment Variables](#environment-variables)
3. [Authentication](#authentication)
4. [API Collections](#api-collections)
   - [Super Admin Authentication](#1-super-admin-authentication)
   - [Subscription Plans](#2-subscription-plan-management)
   - [Super Admin Dashboard](#3-super-admin-dashboard)
   - [Subscription Jobs](#4-subscription-jobs)
   - [Admin Subscription](#5-admin-subscription-management)
   - [Payment APIs](#6-payment-apis)
5. [Pre-request Scripts](#pre-request-scripts)
6. [Test Scripts](#test-scripts)
7. [Testing Workflow](#testing-workflow)

---

## Quick Setup

### Base URL Configuration

```
Development:  http://localhost:8000/api/v1
Staging:      https://staging-api.tabletop.com/api/v1
Production:   https://api.tabletop.com/api/v1
```

### Import Environment

1. Open Postman
2. Click "Environments" → "Import"
3. Copy the environment JSON below
4. Paste and import

---

## Environment Variables

### Postman Environment JSON

```json
{
  "name": "TableTop - Development",
  "values": [
    {
      "key": "base_url",
      "value": "http://localhost:8000/api/v1",
      "enabled": true
    },
    {
      "key": "super_admin_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "admin_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "manager_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "staff_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "user_token",
      "value": "",
      "enabled": true
    },
    {
      "key": "super_admin_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "admin_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "hotel_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "branch_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "subscription_plan_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "subscription_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "order_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "payment_order_id",
      "value": "",
      "enabled": true
    },
    {
      "key": "razorpay_key_id",
      "value": "rzp_test_YOUR_KEY_ID",
      "enabled": true
    }
  ]
}
```

---

## Authentication

All authenticated endpoints require JWT token in Authorization header:

```
Authorization: Bearer <token>
```

**Token Structure:**

- Access Token: 15 minutes expiry
- Refresh Token: 7 days expiry

---

## API Collections

## 1. Super Admin Authentication

**Base Path:** `/auth/super-admin`

### 1.1 Register Super Admin

```http
POST {{base_url}}/auth/super-admin/register
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Super Admin",
  "email": "superadmin@tabletop.com",
  "password": "SuperAdmin@123",
  "dateOfBirth": "1990-01-15",
  "phone": "9876543210"
}
```

**Required Fields:**

- `name` (string, 2-100 characters)
- `email` (string, valid email format)
- `password` (string, minimum 8 characters)
- `dateOfBirth` (date, YYYY-MM-DD format, cannot be in future)

**Optional Fields:**

- `phone` (string, 10-15 digits, can include +, spaces, -, (, ))

**Success Response (201):**

```json
{
  "success": true,
  "message": "Super Admin registered successfully. Please verify your email.",
  "data": {
    "email": "superadmin@tabletop.com",
    "name": "Super Admin"
  }
}
```

**Test Script:**

```javascript
pm.test("Status code is 201", () => {
  pm.response.to.have.status(201);
});

pm.test("Registration successful", () => {
  const jsonData = pm.response.json();
  pm.expect(jsonData.success).to.be.true;
  pm.environment.set("super_admin_email", jsonData.data.email);
});
```

---

### 1.2 Verify Email with OTP

```http
POST {{base_url}}/auth/super-admin/verify-email
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "superadmin@tabletop.com",
  "otp": "123456"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "isVerified": true
  }
}
```

---

### 1.3 Resend OTP

```http
POST {{base_url}}/auth/super-admin/resend-otp
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "superadmin@tabletop.com"
}
```

---

### 1.4 Login Super Admin

```http
POST {{base_url}}/auth/super-admin/login
Content-Type: application/json
```

**Request Body:**

```json
{
  "email": "superadmin@tabletop.com",
  "password": "SuperAdmin@123",
  "dateOfBirth": "1990-01-15"
}
```

**Success Response (200):**

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "superAdmin": {
      "_id": "673456789abcdef123456789",
      "name": "Super Admin",
      "email": "superadmin@tabletop.com",
      "role": "super_admin"
    }
  }
}
```

**Test Script:**

```javascript
pm.test("Login successful", () => {
  const jsonData = pm.response.json();
  pm.expect(jsonData.success).to.be.true;

  // Save tokens
  if (jsonData.data && jsonData.data.token) {
    pm.environment.set("super_admin_token", jsonData.data.token);
  }

  // Save super admin ID
  if (jsonData.data && jsonData.data.superAdmin) {
    pm.environment.set("super_admin_id", jsonData.data.superAdmin._id);
  }
});
```

---

### 1.5 Get Profile

```http
GET {{base_url}}/auth/super-admin/profile
Authorization: Bearer {{super_admin_token}}
```

---

### 1.6 Update Profile

```http
PUT {{base_url}}/auth/super-admin/profile
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Super Admin Updated",
  "phone": "9876543211"
}
```

**Optional Fields:**

- `name` (string, 2-100 characters)
- `phone` (string, 10-15 digits)
- `department` (string: operations, finance, marketing, hr, it, system)
- `status` (string: active, inactive, suspended)
- `permissions` (object: various boolean permissions)

---

### 1.7 Logout

```http
POST {{base_url}}/auth/super-admin/logout
Authorization: Bearer {{super_admin_token}}
```

---

## 2. Subscription Plan Management

**Base Path:** `/super-admin/plans`  
**Required Role:** Super Admin

### 2.1 Create Subscription Plan

```http
POST {{base_url}}/super-admin/plans
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Premium Plan",
  "description": "Full-featured plan for large restaurants",
  "price": {
    "monthly": 9999,
    "yearly": 99999
  },
  "features": {
    "maxHotels": 5,
    "maxBranches": 10,
    "maxManagers": 15,
    "maxStaff": 100,
    "maxTables": 100,
    "analyticsAccess": true,
    "advancedReports": true,
    "coinSystem": true,
    "offerManagement": true,
    "multipleLocations": true,
    "inventoryManagement": true,
    "orderAssignment": true,
    "qrCodeGeneration": true,
    "customBranding": true,
    "apiAccess": true,
    "prioritySupport": true
  },
  "limitations": {
    "ordersPerMonth": 10000,
    "storageGB": 50,
    "customReports": 20
  },
  "displayOrder": 2
}
```

**Success Response (201):**

```json
{
  "success": true,
  "message": "Subscription plan created successfully",
  "data": {
    "_id": "673456789abcdef123456789",
    "name": "Premium Plan",
    "planId": "PLAN-1699012345-abc123",
    "price": 9999,
    "features": { ... }
  }
}
```

**Test Script:**

```javascript
pm.test("Plan created successfully", () => {
  const jsonData = pm.response.json();
  pm.expect(jsonData.success).to.be.true;

  if (jsonData.data && jsonData.data._id) {
    pm.environment.set("subscription_plan_id", jsonData.data._id);
  }
});
```

---

### 2.2 Get All Plans

```http
GET {{base_url}}/super-admin/plans?page=1&limit=10&status=active
Authorization: Bearer {{super_admin_token}}
```

**Query Parameters:**

- `status` (optional): active, inactive, all
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search by name

---

### 2.3 Get Plan by ID

```http
GET {{base_url}}/super-admin/plans/{{subscription_plan_id}}
Authorization: Bearer {{super_admin_token}}
```

---

### 2.4 Update Plan

```http
PUT {{base_url}}/super-admin/plans/{{subscription_plan_id}}
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Premium Plan Updated",
  "price": {
    "monthly": 10999,
    "yearly": 109999
  },
  "features": {
    "maxHotels": 10,
    "maxBranches": 15
  }
}
```

---

### 2.5 Delete Plan

```http
DELETE {{base_url}}/super-admin/plans/{{subscription_plan_id}}
Authorization: Bearer {{super_admin_token}}
```

---

### 2.6 Toggle Plan Status

```http
PATCH {{base_url}}/super-admin/plans/{{subscription_plan_id}}/toggle-status
Authorization: Bearer {{super_admin_token}}
```

---

### 2.7 Get Admins by Plan

```http
GET {{base_url}}/super-admin/plans/{{subscription_plan_id}}/admins
Authorization: Bearer {{super_admin_token}}
```

---

## 3. Super Admin Dashboard

**Base Path:** `/super-admin`  
**Required Role:** Super Admin

### 3.1 Dashboard Overview

```http
GET {{base_url}}/super-admin/dashboard
Authorization: Bearer {{super_admin_token}}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "totalAdmins": 150,
    "totalHotels": 320,
    "totalBranches": 850,
    "totalManagers": 420,
    "totalStaff": 1250,
    "subscriptions": {
      "active": 120,
      "expired": 25,
      "pending": 5
    },
    "revenue": {
      "thisMonth": 1200000,
      "total": 15000000
    },
    "recentAdmins": [...],
    "expiringSoon": [...],
    "growthMetrics": {
      "admins": 15.5,
      "hotels": 22.3,
      "revenue": 18.7
    }
  }
}
```

---

### 3.2 Get All Admins

```http
GET {{base_url}}/super-admin/admins?page=1&limit=10&search=test&status=active
Authorization: Bearer {{super_admin_token}}
```

**Query Parameters:**

- `status` (optional): active, inactive, suspended
- `subscriptionStatus` (optional): active, expired, cancelled
- `page` (optional): Page number
- `limit` (optional): Items per page
- `search` (optional): Search by name or email
- `sortBy` (optional): name, email, createdAt
- `sortOrder` (optional): asc, desc

---

### 3.3 Get Admin Details

```http
GET {{base_url}}/super-admin/admins/{{admin_id}}
Authorization: Bearer {{super_admin_token}}
```

**Response includes:**

- Admin profile
- Subscription details
- All hotels owned
- All branches with details
- All managers and staff
- Revenue statistics
- Monthly income breakdown

---

### 3.4 Get All Hotels

```http
GET {{base_url}}/super-admin/hotels?page=1&limit=10
Authorization: Bearer {{super_admin_token}}
```

---

### 3.5 Get Hotel Income Report

```http
GET {{base_url}}/super-admin/hotels/{{hotel_id}}/income?startDate=2025-11-01&endDate=2025-11-09
Authorization: Bearer {{super_admin_token}}
```

**Query Parameters:**

- `startDate` (optional): Start date (YYYY-MM-DD)
- `endDate` (optional): End date (YYYY-MM-DD)
- `period` (optional): daily, weekly, monthly, yearly

---

### 3.6 Get Branch-wise Income

```http
GET {{base_url}}/super-admin/hotels/{{hotel_id}}/branch-income
Authorization: Bearer {{super_admin_token}}
```

---

### 3.7 Get All Branches

```http
GET {{base_url}}/super-admin/branches?page=1&limit=10
Authorization: Bearer {{super_admin_token}}
```

---

### 3.8 Get All Managers

```http
GET {{base_url}}/super-admin/managers?page=1&limit=10
Authorization: Bearer {{super_admin_token}}
```

---

### 3.9 Get All Staff

```http
GET {{base_url}}/super-admin/staff?page=1&limit=10&role=waiter
Authorization: Bearer {{super_admin_token}}
```

---

### 3.10 Get Revenue Analytics

```http
GET {{base_url}}/super-admin/analytics?startDate=2025-11-01&endDate=2025-11-09&groupBy=month
Authorization: Bearer {{super_admin_token}}
```

**Query Parameters:**

- `startDate` (required): Start date
- `endDate` (required): End date
- `groupBy` (optional): day, week, month, year

---

### 3.11 Get System Statistics

```http
GET {{base_url}}/super-admin/statistics
Authorization: Bearer {{super_admin_token}}
```

---

## 4. Subscription Jobs

**Base Path:** `/super-admin/subscription-jobs`  
**Required Role:** Super Admin

### 4.1 Get Jobs Status

```http
GET {{base_url}}/super-admin/subscription-jobs/status
Authorization: Bearer {{super_admin_token}}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "subscriptionExpiryChecker": {
      "running": true,
      "schedule": "0 0 * * *",
      "description": "Checks and marks expired subscriptions"
    },
    "subscriptionReminderJob": {
      "running": true,
      "schedule": "0 9 * * *",
      "description": "Sends subscription expiry reminders"
    },
    "cleanupExpiredSubscriptionsJob": {
      "running": true,
      "schedule": "0 2 * * 0",
      "description": "Cleans up old expired subscriptions"
    }
  }
}
```

---

### 4.2 Get Available Jobs

```http
GET {{base_url}}/super-admin/subscription-jobs/available
Authorization: Bearer {{super_admin_token}}
```

---

### 4.3 Trigger Job Manually

```http
POST {{base_url}}/super-admin/subscription-jobs/trigger
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "jobName": "subscriptionExpiryChecker"
}
```

**Available Jobs:**

- `subscriptionExpiryChecker`
- `subscriptionReminderJob`
- `usageCounterResetJob`
- `autoRenewalHandlerJob`
- `failedPaymentRetryJob`
- `inactiveSubscriptionCleanupJob`
- `expiringSoonAlertJob`

---

## 5. Admin Subscription Management

**Base Path:** `/subscription`  
**Required Role:** Admin

### 5.1 Get Available Plans

```http
GET {{base_url}}/subscription/plans
Authorization: Bearer {{admin_token}}
```

---

### 5.2 Select Plan

```http
POST {{base_url}}/subscription/select
Authorization: Bearer {{admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "planId": "{{subscription_plan_id}}",
  "billingCycle": "monthly"
}
```

**Required Fields:**

- `planId` (string): MongoDB ObjectId of the plan
- `billingCycle` (string): "monthly" or "yearly"

**Success Response (200):**

```json
{
  "success": true,
  "message": "Subscription plan selected successfully",
  "data": {
    "_id": "673456789abcdef123456789",
    "admin": "673456789abcdef123456789",
    "plan": { ... },
    "status": "pending_payment",
    "paymentOrder": {
      "orderId": "order_MN1234567890",
      "amount": 999900,
      "currency": "INR",
      "key": "rzp_test_YOUR_KEY_ID"
    }
  }
}
```

**Test Script:**

```javascript
pm.test("Subscription created", () => {
  const jsonData = pm.response.json();

  if (jsonData.data && jsonData.data._id) {
    pm.environment.set("subscription_id", jsonData.data._id);
  }

  if (jsonData.data && jsonData.data.paymentOrder) {
    pm.environment.set("payment_order_id", jsonData.data.paymentOrder.orderId);
  }
});
```

---

### 5.3 Get My Subscription

```http
GET {{base_url}}/subscription/my-subscription
Authorization: Bearer {{admin_token}}
```

---

### 5.4 Get Usage Stats

```http
GET {{base_url}}/subscription/usage
Authorization: Bearer {{admin_token}}
```

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "subscription": { ... },
    "usage": {
      "hotels": 2,
      "branches": 8,
      "managers": 15,
      "staff": 65,
      "tables": 50
    },
    "limits": {
      "maxHotels": 5,
      "maxBranches": 10,
      "maxManagers": 15,
      "maxStaff": 100,
      "maxTables": 100
    },
    "percentageUsed": {
      "hotels": 40,
      "branches": 80,
      "managers": 100,
      "staff": 65,
      "tables": 50
    },
    "warnings": [
      "Branch usage is at 80%. Consider upgrading your plan.",
      "Manager usage is at 100%. You've reached your limit."
    ]
  }
}
```

---

### 5.5 Cancel Subscription

```http
POST {{base_url}}/subscription/cancel
Authorization: Bearer {{admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "reason": "Service not meeting expectations",
  "feedback": "Need more features for multi-location management"
}
```

---

### 5.6 Renew Subscription

```http
POST {{base_url}}/subscription/renew
Authorization: Bearer {{admin_token}}
Content-Type: application/json
```

---

### 5.7 Upgrade Plan

```http
POST {{base_url}}/subscription/upgrade
Authorization: Bearer {{admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "newPlanId": "{{new_plan_id}}",
  "billingCycle": "yearly"
}
```

**Required Fields:**

- `newPlanId` (string): MongoDB ObjectId of the new plan
- `billingCycle` (string): "monthly" or "yearly"

---

### 5.8 Verify Payment

```http
POST {{base_url}}/subscription/payment/verify
Authorization: Bearer {{admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "razorpay_order_id": "order_MN1234567890",
  "razorpay_payment_id": "pay_MN1234567890",
  "razorpay_signature": "generated_signature_from_razorpay"
}
```

---

## 6. Payment APIs

**Base Path:** `/payment` or `/subscription/payment`

### 6.1 Payment Webhook (Razorpay)

```http
POST {{base_url}}/subscription/payment/webhook
Content-Type: application/json
x-razorpay-signature: webhook_signature
```

**Request Body (Example - Payment Captured):**

```json
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_MN1234567890",
        "amount": 999900,
        "currency": "INR",
        "status": "captured",
        "order_id": "order_MN1234567890",
        "method": "card",
        "captured": true
      }
    }
  }
}
```

**Webhook Events Supported:**

- `payment.captured` - Payment successful
- `payment.authorized` - Payment authorized
- `payment.failed` - Payment failed
- `payment.pending` - Payment pending
- `refund.created` - Refund initiated
- `refund.processed` - Refund completed
- `refund.failed` - Refund failed
- `order.paid` - Order paid
- `settlement.processed` - Settlement completed
- `dispute.created` - Chargeback/dispute raised
- `dispute.won` - Dispute won
- `dispute.lost` - Dispute lost

---

### 6.2 Payment Reconciliation

```http
POST {{base_url}}/payment/reconcile
Authorization: Bearer {{super_admin_token}}
Content-Type: application/json
```

**Request Body:**

```json
{
  "startDate": "2025-11-01",
  "endDate": "2025-11-09",
  "type": "all",
  "autoFix": true
}
```

**Parameters:**

- `type`: order, subscription, all
- `autoFix`: true/false (auto-fix discrepancies)

---

## Pre-request Scripts

### Collection-Level Pre-request Script

Add this to your collection's Pre-request Scripts:

```javascript
// Auto-inject token based on endpoint
const url = pm.request.url.toString();

if (url.includes("/super-admin")) {
  const token = pm.environment.get("super_admin_token");
  if (token) {
    pm.request.headers.upsert({
      key: "Authorization",
      value: `Bearer ${token}`,
    });
  }
} else if (url.includes("/admin") && !url.includes("/super-admin")) {
  const token = pm.environment.get("admin_token");
  if (token) {
    pm.request.headers.upsert({
      key: "Authorization",
      value: `Bearer ${token}`,
    });
  }
} else if (url.includes("/manager")) {
  const token = pm.environment.get("manager_token");
  if (token) {
    pm.request.headers.upsert({
      key: "Authorization",
      value: `Bearer ${token}`,
    });
  }
} else if (url.includes("/staff")) {
  const token = pm.environment.get("staff_token");
  if (token) {
    pm.request.headers.upsert({
      key: "Authorization",
      value: `Bearer ${token}`,
    });
  }
} else if (url.includes("/user")) {
  const token = pm.environment.get("user_token");
  if (token) {
    pm.request.headers.upsert({
      key: "Authorization",
      value: `Bearer ${token}`,
    });
  }
}

// Set Content-Type for JSON
if (pm.request.body && pm.request.body.mode === "raw") {
  pm.request.headers.upsert({
    key: "Content-Type",
    value: "application/json",
  });
}
```

---

## Test Scripts

### Collection-Level Test Script

Add this to your collection's Tests tab:

```javascript
// Response time check
pm.test("Response time is acceptable", () => {
  pm.expect(pm.response.responseTime).to.be.below(2000);
});

// Valid JSON check
pm.test("Response is valid JSON", () => {
  pm.response.to.be.json;
});

// Success property check
pm.test("Response has success property", () => {
  const jsonData = pm.response.json();
  pm.expect(jsonData).to.have.property("success");
});

// Status code validation
if (pm.response.code >= 200 && pm.response.code < 300) {
  pm.test("Success status code", () => {
    pm.response.to.be.success;
  });
} else if (pm.response.code >= 400) {
  pm.test("Error response has message", () => {
    const jsonData = pm.response.json();
    pm.expect(jsonData).to.have.property("message");
  });
}
```

---

## Testing Workflow

### Step 1: Super Admin Setup

1. **Register Super Admin**

   - POST `/auth/super-admin/register`
   - Check console for OTP (development mode)

2. **Verify Email**

   - POST `/auth/super-admin/verify-email`
   - Use OTP from console

3. **Login**
   - POST `/auth/super-admin/login`
   - Token automatically saved to environment

---

### Step 2: Create Subscription Plans

1. **Create Starter Plan**

```json
{
  "name": "Starter Plan",
  "description": "Perfect for small cafes and food stalls",
  "price": {
    "monthly": 1499,
    "yearly": 14999
  },
  "features": {
    "maxHotels": 1,
    "maxBranches": 1,
    "maxManagers": 1,
    "maxStaff": 5,
    "maxTables": 10,
    "analyticsAccess": false,
    "advancedReports": false,
    "coinSystem": false,
    "offerManagement": false,
    "multipleLocations": false,
    "inventoryManagement": false,
    "orderAssignment": true,
    "qrCodeGeneration": true,
    "customBranding": false,
    "apiAccess": false,
    "prioritySupport": false
  },
  "limitations": {
    "ordersPerMonth": 1000,
    "storageGB": 5,
    "customReports": 0
  },
  "displayOrder": 0
}
```

2. **Create Basic Plan**

```json
{
  "name": "Basic Plan",
  "description": "Ideal for single-location restaurants",
  "price": {
    "monthly": 2999,
    "yearly": 29999
  },
  "features": {
    "maxHotels": 1,
    "maxBranches": 2,
    "maxManagers": 5,
    "maxStaff": 20,
    "maxTables": 30,
    "analyticsAccess": true,
    "advancedReports": false,
    "coinSystem": true,
    "offerManagement": true,
    "multipleLocations": false,
    "inventoryManagement": true,
    "orderAssignment": true,
    "qrCodeGeneration": true,
    "customBranding": false,
    "apiAccess": false,
    "prioritySupport": false
  },
  "limitations": {
    "ordersPerMonth": 5000,
    "storageGB": 20,
    "customReports": 5
  },
  "displayOrder": 1
}
```

3. **Create Premium Plan**

```json
{
  "name": "Premium Plan",
  "description": "Full-featured plan for large restaurants",
  "price": {
    "monthly": 9999,
    "yearly": 99999
  },
  "features": {
    "maxHotels": 5,
    "maxBranches": 10,
    "maxManagers": 15,
    "maxStaff": 100,
    "maxTables": 100,
    "analyticsAccess": true,
    "advancedReports": true,
    "coinSystem": true,
    "offerManagement": true,
    "multipleLocations": true,
    "inventoryManagement": true,
    "orderAssignment": true,
    "qrCodeGeneration": true,
    "customBranding": true,
    "apiAccess": true,
    "prioritySupport": true
  },
  "limitations": {
    "ordersPerMonth": 10000,
    "storageGB": 50,
    "customReports": 20
  },
  "displayOrder": 2
}
```

4. **Create Enterprise Plan**

```json
{
  "name": "Enterprise Plan",
  "description": "Unlimited features for restaurant chains and franchises",
  "price": {
    "monthly": 24999,
    "yearly": 249999
  },
  "features": {
    "maxHotels": 20,
    "maxBranches": 50,
    "maxManagers": 50,
    "maxStaff": 500,
    "maxTables": 500,
    "analyticsAccess": true,
    "advancedReports": true,
    "coinSystem": true,
    "offerManagement": true,
    "multipleLocations": true,
    "inventoryManagement": true,
    "orderAssignment": true,
    "qrCodeGeneration": true,
    "customBranding": true,
    "apiAccess": true,
    "prioritySupport": true
  },
  "limitations": {
    "ordersPerMonth": 100000,
    "storageGB": 200,
    "customReports": 100
  },
  "displayOrder": 3
}
```

5. **Get All Plans** - Verify creation

---

### Step 3: Admin Subscription Flow

1. **Register Admin** (using existing admin auth)
2. **Login Admin** - Token saved automatically
3. **View Available Plans** - GET `/subscription/plans`
4. **Select Plan** - POST `/subscription/select`
5. **Complete Payment** (Razorpay test mode)
6. **Verify Payment** - POST `/subscription/payment/verify`
7. **Check Subscription** - GET `/subscription/my-subscription`

---

### Step 4: Test Usage Tracking

1. **Check Current Usage** - GET `/subscription/usage`
2. **Create Hotel** - POST `/admin/hotel`
3. **Create Branch** - POST `/admin/branch`
4. **Check Updated Usage** - Verify counts increased

---

### Step 5: Test Dashboard

1. **Dashboard Overview** - GET `/super-admin/dashboard`
2. **View All Admins** - GET `/super-admin/admins`
3. **Admin Details** - GET `/super-admin/admins/:id`
4. **Revenue Analytics** - GET `/super-admin/analytics`

---

## Razorpay Test Credentials

```
Test Mode:
Key ID: rzp_test_YOUR_KEY_ID
Key Secret: YOUR_KEY_SECRET

Test Cards:
Success: 4111 1111 1111 1111
Failure: 4111 1111 1111 1234
CVV: Any 3 digits
Expiry: Any future date
Name: Any name
```

---

## Common Errors & Solutions

### 401 Unauthorized

- **Solution:** Token expired, re-login to get new token

### 403 Forbidden

- **Solution:** Check subscription is active and feature is available in plan

### 400 Bad Request

- **Solution:** Check request body format and required fields

### Payment Signature Verification Failed

- **Solution:** Verify Razorpay key_secret configuration

---

## API Endpoint Summary

### Super Admin Endpoints (7)

- POST `/auth/super-admin/register`
- POST `/auth/super-admin/verify-email`
- POST `/auth/super-admin/resend-otp`
- POST `/auth/super-admin/login`
- POST `/auth/super-admin/logout`
- GET `/auth/super-admin/profile`
- PUT `/auth/super-admin/profile`

### Subscription Plan Endpoints (7)

- POST `/super-admin/plans`
- GET `/super-admin/plans`
- GET `/super-admin/plans/:id`
- PUT `/super-admin/plans/:id`
- DELETE `/super-admin/plans/:id`
- PATCH `/super-admin/plans/:id/toggle-status`
- GET `/super-admin/plans/:id/admins`

### Dashboard Endpoints (11)

- GET `/super-admin/dashboard`
- GET `/super-admin/admins`
- GET `/super-admin/admins/:id`
- GET `/super-admin/hotels`
- GET `/super-admin/hotels/:id/income`
- GET `/super-admin/hotels/:id/branch-income`
- GET `/super-admin/branches`
- GET `/super-admin/managers`
- GET `/super-admin/staff`
- GET `/super-admin/analytics`
- GET `/super-admin/statistics`

### Subscription Jobs Endpoints (3)

- GET `/super-admin/subscription-jobs/status`
- GET `/super-admin/subscription-jobs/available`
- POST `/super-admin/subscription-jobs/trigger`

### Admin Subscription Endpoints (8)

- GET `/subscription/plans`
- POST `/subscription/select`
- GET `/subscription/my-subscription`
- GET `/subscription/usage`
- POST `/subscription/cancel`
- POST `/subscription/renew`
- POST `/subscription/upgrade`
- POST `/subscription/payment/verify`

### Payment Endpoints (2)

- POST `/subscription/payment/webhook`
- POST `/payment/reconcile`

**Total Endpoints:** 38

---

## Next Steps

1. ✅ Import environment variables to Postman
2. ✅ Add collection-level pre-request and test scripts
3. ✅ Start backend server (`npm start`)
4. ✅ Test Super Admin registration and login
5. ✅ Create subscription plans
6. ✅ Test admin subscription flow
7. ✅ Test payment integration
8. ✅ Test dashboard endpoints
9. ✅ Test background jobs
10. ✅ Document any issues found

---

**Last Updated:** November 9, 2025  
**Maintained By:** Development Team  
**Contact:** superadmin@tabletop.com
