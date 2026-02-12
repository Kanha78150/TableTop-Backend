# 🔄 Payment System Migration Guide

**Date:** February 12, 2026  
**Status:** ✅ Completed  
**Impact:** Breaking Changes - Frontend Update Required

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [What Changed](#what-changed)
3. [Why This Change Was Made](#why-this-change-was-made)
4. [Deleted/Disabled Routes](#deleteddisabled-routes)
5. [New Routes](#new-routes)
6. [Code Changes](#code-changes)
7. [Migration Guide](#migration-guide)
8. [Testing](#testing)

---

## 🎯 Overview

**Problem Found:** Users could make payments without admin-configured credentials because two payment systems were running simultaneously:
- **OLD System:** Hardcoded Razorpay credentials from `.env` file
- **NEW System:** Dynamic credentials from `PaymentConfig` database

**Solution:** Disabled old payment routes and migrated to the new dynamic multi-provider payment system.

---

## 🔧 What Changed

### **1. Route Changes**

| Change Type | Route Path | Status |
|------------|-----------|--------|
| ❌ **DISABLED** | `/api/v1/payment/*` | Commented out |
| ✅ **ACTIVE** | `/api/v1/payment-config/*` | Configuration management |
| ✅ **ACTIVE** | `/api/v1/payments/*` | Payment operations |
| ✅ **NEW** | `/api/v1/payments/public-key/:hotelId` | Get Razorpay public key |

### **2. Payment Flow**

| Old Flow | New Flow |
|----------|----------|
| User orders → Backend uses `.env` credentials | User orders → Backend uses PaymentConfig from database |
| No admin setup required | Admin must configure credentials via dashboard |
| Single provider (Razorpay only) | Multi-provider support (Razorpay, PhonePe, Paytm) |
| No testing endpoint | Test endpoint available |
| No approval workflow | Super Admin approval for production |

### **3. Credential Usage**

| Credentials | Old Usage | New Usage |
|------------|-----------|-----------|
| `.env` RAZORPAY_KEY_ID | All payments | **Admin subscription payments ONLY** |
| `.env` RAZORPAY_KEY_SECRET | All payments | **Admin subscription payments ONLY** |
| PaymentConfig (Database) | Not used | **All user food order payments** |

---

## ❓ Why This Change Was Made

### **Security Issue Discovered**

Frontend developer reported: *"Users can pay without admin-configured credentials"*

**Root Cause Analysis:**
1. Admin created PaymentConfig in database (new system)
2. Old payment routes still active using hardcoded credentials
3. Anyone could use old routes to bypass PaymentConfig
4. Security vulnerability: No control over payment gateway

### **Benefits of New System**

✅ **Security:** Only approved credentials can be used  
✅ **Flexibility:** Each hotel can use different payment providers  
✅ **Testing:** Admins can test credentials before going live  
✅ **Approval Workflow:** Super Admin must approve production credentials  
✅ **Multi-Provider:** Support for Razorpay, PhonePe, Paytm  
✅ **Deactivation:** Payment gateway can be disabled per hotel  

---

## ❌ Deleted/Disabled Routes

### **File:** `src/routes/index.route.js`

**Before:**
```javascript
router.use("/payment", ensureDbReady, paymentRoutes);
```

**After:**
```javascript
// ⚠️ OLD PAYMENT ROUTES DISABLED - Using new dynamic payment system below
// Payment routes (Razorpay integration - OLD HARDCODED CREDENTIALS)
// router.use("/payment", ensureDbReady, paymentRoutes);
```

### **Affected Endpoints (No Longer Work - Return 404)**

| Method | Old Route | Status |
|--------|-----------|--------|
| POST | `/api/v1/payment/create-order` | ❌ Disabled |
| POST | `/api/v1/payment/verify` | ❌ Disabled |
| GET | `/api/v1/payment/success` | ❌ Disabled |
| POST | `/api/v1/payment/webhook` | ❌ Disabled |
| GET | `/api/v1/payment/orders` | ❌ Disabled |

**⚠️ IMPORTANT:** Any frontend code using these routes must be updated immediately.

---

## ✅ New Routes

### **1. Payment Configuration Routes** (`/api/v1/payment-config`)

#### **Get Supported Providers** (Public)
```http
GET /api/v1/payment-config/providers
```
**Response:**
```json
{
  "success": true,
  "data": {
    "providers": ["razorpay", "phonepe", "paytm"]
  }
}
```

---

#### **Setup Payment Config** (Admin/Manager)
```http
POST /api/v1/payment-config/:hotelId
Headers: Authorization: Bearer <admin_token>
Content-Type: application/json
```
**Body:**
```json
{
  "provider": "razorpay",
  "credentials": {
    "keyId": "rzp_test_xxxxxxxxx",
    "keySecret": "xxxxxxxxxxxxxxxxx",
    "webhookSecret": "optional_webhook_secret"
  },
  "isProduction": false
}
```
**Response:**
```json
{
  "success": true,
  "message": "Payment configuration created successfully"
}
```

---

#### **Test Payment Config** (Admin/Manager)
```http
POST /api/v1/payment-config/:hotelId/test
Headers: Authorization: Bearer <admin_token>
```
**Response:**
```json
{
  "success": true,
  "message": "Test credentials are valid",
  "data": {
    "testResult": true,
    "isActive": true
  }
}
```

---

#### **Get Payment Config** (Admin/Manager)
```http
GET /api/v1/payment-config/:hotelId
Headers: Authorization: Bearer <admin_token>
```

---

#### **Toggle Payment Config** (Admin/Manager)
```http
PATCH /api/v1/payment-config/:hotelId/toggle
Headers: Authorization: Bearer <admin_token>
Content-Type: application/json
```
**Body:**
```json
{
  "isActive": true
}
```

---

#### **Request Deactivation** (Admin/Manager)
```http
POST /api/v1/payment-config/:hotelId/request-deactivation
Headers: Authorization: Bearer <admin_token>
Content-Type: application/json
```
**Body:**
```json
{
  "reason": "Switching to different provider"
}
```

---

#### **Get Pending Approvals** (Super Admin Only)
```http
GET /api/v1/payment-config/pending-approvals
Headers: Authorization: Bearer <super_admin_token>
```

---

#### **Activate Production Config** (Super Admin Only)
```http
POST /api/v1/payment-config/:hotelId/activate
Headers: Authorization: Bearer <super_admin_token>
```

---

#### **Deactivate Config** (Super Admin Only)
```http
POST /api/v1/payment-config/:hotelId/deactivate
Headers: Authorization: Bearer <super_admin_token>
Content-Type: application/json
```
**Body:**
```json
{
  "reason": "Security compliance"
}
```

---

#### **Delete Payment Config** (Admin Only)
```http
DELETE /api/v1/payment-config/:hotelId
Headers: Authorization: Bearer <admin_token>
```

---

### **2. Payment Operations Routes** (`/api/v1/payments`)

#### **🆕 Get Payment Public Key** (Public - No Auth)
```http
GET /api/v1/payments/public-key/:hotelId
```
**Response:**
```json
{
  "success": true,
  "message": "Payment public key retrieved successfully",
  "data": {
    "provider": "razorpay",
    "keyId": "rzp_test_xxxxxxxxx",
    "hotelName": "Grand Palace Hotel"
  }
}
```
**Purpose:** Frontend needs this public key to initialize Razorpay Checkout.

---

#### **Initiate Payment** (User)
```http
POST /api/v1/payments/initiate
Headers: Authorization: Bearer <user_token>
Content-Type: application/json
```
**Body:**
```json
{
  "orderId": "698def11c4fec0300633e683"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "success": true,
    "provider": "razorpay",
    "orderId": "698def11c4fec0300633e683",
    "gatewayOrderId": "order_SFHdms67IHnbdk",
    "amount": 1.05,
    "currency": "INR",
    "commission": {
      "amount": 0.05,
      "rate": 0.05
    }
  }
}
```

---

#### **Verify Payment** (User)
```http
POST /api/v1/payments/verify
Headers: Authorization: Bearer <user_token>
Content-Type: application/json
```
**Body:**
```json
{
  "orderId": "698def11c4fec0300633e683",
  "paymentId": "pay_OjkZL7xY9K8Pqr",
  "signature": "a1b2c3d4e5f6..."
}
```
**Note:** `signature` is provided by Razorpay after successful payment.

---

#### **Get My Payments** (User)
```http
GET /api/v1/payments/my-payments
Headers: Authorization: Bearer <user_token>
```

---

#### **Get Payment Status** (User/Manager/Admin)
```http
GET /api/v1/payments/:orderId/status
Headers: Authorization: Bearer <token>
```

---

#### **Request Refund** (Manager/Admin)
```http
POST /api/v1/payments/:orderId/refund
Headers: Authorization: Bearer <admin_token>
Content-Type: application/json
```
**Body:**
```json
{
  "reason": "Customer request",
  "amount": 1.05
}
```

---

#### **Get Hotel Payment History** (Manager/Admin)
```http
GET /api/v1/payments/hotel/:hotelId/history?page=1&limit=20
Headers: Authorization: Bearer <admin_token>
```

---

#### **Get Commission Summary** (Manager/Admin)
```http
GET /api/v1/payments/hotel/:hotelId/commission?startDate=2026-01-01&endDate=2026-02-12
Headers: Authorization: Bearer <admin_token>
```

---

## 📝 Code Changes

### **1. Routes** (`src/routes/index.route.js`)

**BEFORE:**
```javascript
router.use("/payment", ensureDbReady, paymentRoutes);
```

**AFTER:**
```javascript
// ⚠️ OLD PAYMENT ROUTES DISABLED
// router.use("/payment", ensureDbReady, paymentRoutes);

// ✅ NEW Multi-Provider Dynamic Payment System
router.use("/payment-config", ensureDbReady, paymentConfigRoutes);
router.use("/payments", ensureDbReady, dynamicPaymentRoutes);
```

---

### **2. Environment Variables** (`.env`)

**Comments Added:**
```bash
# ⚠️ IMPORTANT: These Razorpay credentials are ONLY used for ADMIN SUBSCRIPTION PAYMENTS
# User food order payments use dynamic credentials from PaymentConfig database
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxx
```

---

### **3. Payment Config** (`src/config/payment.js`)

**Comments Added:**
```javascript
/**
 * ⚠️ IMPORTANT: These credentials are ONLY used for ADMIN SUBSCRIPTION PAYMENTS
 * User food orders use dynamic credentials from PaymentConfig database
 * managed per-hotel via /api/v1/payment-config endpoints
 */
```

---

### **4. Dynamic Payment Service** (`src/services/dynamicPaymentService.js`)

**CHANGED:** Query method to explicitly select encrypted credential fields

**Before:**
```javascript
const paymentConfig = await PaymentConfig.findOne({ hotel: hotelId });
```

**After:**
```javascript
const paymentConfig = await PaymentConfig.findOne({ hotel: hotelId }).select(
  '+credentials.keyId +credentials.keySecret +credentials.webhookSecret ' +
  '+credentials.merchantId +credentials.saltKey +credentials.saltIndex ' +
  '+credentials.merchantKey +credentials.websiteName'
);
```

**Reason:** Credential subfields have `select: false` in schema for security. Must explicitly select them to decrypt.

---

### **5. Payment Controller** (`src/controllers/payment/paymentController.js`)

#### **Bug Fix:** Field name mismatch
**Before:**
```javascript
amount: order.totalAmount
```

**After:**
```javascript
amount: order.totalPrice
```

#### **🆕 New Function:** `getPaymentPublicKey()`
**Purpose:** Provide Razorpay public key to frontend for checkout initialization.

**Implementation:**
```javascript
export const getPaymentPublicKey = async (req, res) => {
  const { hotelId } = req.params;
  const paymentConfig = await PaymentConfig.findOne({ hotel: hotelId }).select(
    '+credentials.keyId'
  );
  const credentials = paymentConfig.getDecryptedCredentials();
  
  return res.status(200).json({
    success: true,
    data: {
      provider: paymentConfig.provider,
      keyId: credentials.keyId, // Public key - safe to expose
      hotelName: hotel.name,
    },
  });
};
```

---

### **6. Payment Routes** (`src/routes/payment/payment.route.js`)

**Added:**
```javascript
import { getPaymentPublicKey } from "../../controllers/payment/paymentController.js";

// Public route - Get payment gateway public key for frontend
router.get("/public-key/:hotelId", getPaymentPublicKey);
```

---

## 🚀 Migration Guide

### **For Backend Developers**

#### **Step 1: Update Local Environment**
1. Pull latest code from repository
2. Restart server: `npm start` or `node server.js`
3. No database migrations needed (PaymentConfig model already exists)

#### **Step 2: Test New Routes**
Use Postman collection to test:
1. Create PaymentConfig: `POST /api/v1/payment-config/:hotelId`
2. Test credentials: `POST /api/v1/payment-config/:hotelId/test`
3. Get public key: `GET /api/v1/payments/public-key/:hotelId`
4. Initiate payment: `POST /api/v1/payments/initiate`

---

### **For Frontend Developers**

#### **Step 1: Remove Old Payment Code**
Delete or comment out any code using:
- `/api/v1/payment/create-order`
- `/api/v1/payment/verify`
- `/api/v1/payment/success`

#### **Step 2: Install Razorpay Checkout**
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

#### **Step 3: Implement New Payment Flow**

```javascript
async function handlePayment(orderId, hotelId) {
  const userToken = localStorage.getItem('userToken');
  
  try {
    // 1. Get Razorpay public key
    const keyResponse = await fetch(
      `${API_URL}/api/v1/payments/public-key/${hotelId}`
    );
    const keyData = await keyResponse.json();
    const razorpayKey = keyData.data.keyId;

    // 2. Initiate payment
    const paymentResponse = await fetch(
      `${API_URL}/api/v1/payments/initiate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderId })
      }
    );
    
    const paymentData = await paymentResponse.json();
    const { gatewayOrderId, amount, currency } = paymentData.data;

    // 3. Open Razorpay Checkout
    const options = {
      key: razorpayKey,
      amount: amount * 100,
      currency: currency,
      order_id: gatewayOrderId,
      name: keyData.data.hotelName,
      description: "Food Order Payment",
      
      handler: async function(response) {
        // 4. Verify payment
        const verifyResponse = await fetch(
          `${API_URL}/api/v1/payments/verify`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${userToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              orderId: orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature
            })
          }
        );
        
        const verifyData = await verifyResponse.json();
        if (verifyData.success) {
          // Payment successful
          window.location.href = '/order-success';
        }
      },
      
      prefill: {
        name: "Customer Name",
        email: "customer@example.com",
        contact: "9999999999"
      }
    };
    
    const rzp = new Razorpay(options);
    rzp.open();
    
  } catch (error) {
    console.error('Payment error:', error);
    alert('Payment failed. Please try again.');
  }
}
```

---

### **For Admin Panel Developers**

#### **New Features to Implement:**

1. **Payment Gateway Configuration Page**
   - Form to enter Razorpay/PhonePe/Paytm credentials
   - Test credentials button
   - Toggle enable/disable
   - Request deactivation

2. **Super Admin Approval Dashboard**
   - List pending approval requests
   - Approve/reject production credentials
   - View approval history

---

## ✅ Testing

### **1. Configuration Testing**

```bash
# Setup payment config
POST /api/v1/payment-config/6980bded6fa1da0a392db955
{
  "provider": "razorpay",
  "credentials": {
    "keyId": "rzp_test_xxxxxxxxx",
    "keySecret": "xxxxxxxxxxxxxxxxx"
  },
  "isProduction": false
}

# Test credentials
POST /api/v1/payment-config/6980bded6fa1da0a392db955/test

# Verify config is active
GET /api/v1/payment-config/6980bded6fa1da0a392db955
```

### **2. Payment Flow Testing**

```bash
# Get public key
GET /api/v1/payments/public-key/6980bded6fa1da0a392db955

# Initiate payment (TESTED ✅)
POST /api/v1/payments/initiate
{
  "orderId": "698def11c4fec0300633e683"
}

# After Razorpay payment, verify
POST /api/v1/payments/verify
{
  "orderId": "698def11c4fec0300633e683",
  "paymentId": "pay_xxx",
  "signature": "xxx"
}
```

### **3. Expected Results**

✅ Old routes return 404  
✅ New routes return data  
✅ PaymentConfig credentials decrypt correctly  
✅ Razorpay order creation succeeds  
✅ Public key endpoint works without auth  

---

## 🔐 Security Improvements

| Security Aspect | Old System | New System |
|----------------|-----------|-----------|
| **Credential Storage** | Plain text in `.env` | Encrypted in database |
| **Credential Access** | Available to all requests | Only selected when needed |
| **Provider Flexibility** | Hardcoded Razorpay only | Multi-provider support |
| **Testing** | No test mode | Separate test/production modes |
| **Approval** | No approval needed | Super Admin approval for production |
| **Deactivation** | Manual code change | API endpoint to disable |
| **Audit Trail** | No tracking | CreatedBy, UpdatedBy, timestamps |

---

## 📊 Impact Summary

### **Files Modified:** 8
- `src/routes/index.route.js`
- `src/routes/payment/payment.route.js`
- `src/controllers/payment/paymentController.js`
- `src/services/dynamicPaymentService.js`
- `src/config/payment.js`
- `src/utils/validateEnv.js`
- `.env`
- `PAYMENT_SYSTEM_MIGRATION.md` (this file)

### **Routes Disabled:** 5
- All routes under `/api/v1/payment/*`

### **Routes Added:** 12
- 9 payment configuration routes
- 3 payment operation routes (1 new, 2 migrated)

### **Breaking Changes:** YES
- Frontend must update payment integration
- Old payment API calls will fail (404)

---

## 📞 Support

**Issues?** Contact the backend team or check:
- [FRONTEND_SOCKET_GUIDE.js](./FRONTEND_SOCKET_GUIDE.js) - Socket events documentation
- [SOCKET_IMPLEMENTATION.md](./SOCKET_IMPLEMENTATION.md) - Socket implementation details
- Server logs for detailed error messages

---

**Migration Status:** ✅ Complete  
**Last Updated:** February 12, 2026  
**Version:** 2.0.0
