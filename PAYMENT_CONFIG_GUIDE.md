# Payment Configuration Guide - Role-Based Activation

## Overview

This system implements secure payment gateway configuration with role-based activation for production environments.

---

## Security Model

### Test Mode (Sandbox)

- ✅ Any admin can create and activate
- ✅ Auto-activation after verification
- ✅ Quick testing workflow

### Production Mode (Live)

- ✅ Any admin can create and test credentials
- ⚠️ **Only Super Admin can activate**
- ✅ Full audit trail (IP, timestamp, user)
- ✅ Email notifications
- ✅ Emergency deactivation

---

## Complete Workflow

### **Scenario 1: Test/Sandbox Configuration**

#### Step 1: Create Test Config

```http
POST /api/v1/payment-config/6980bded6fa1da0a392db955
Authorization: Bearer ADMIN_JWT_TOKEN
Content-Type: application/json

{
    "provider": "razorpay",
    "credentials": {
        "keyId": "rzp_test_XXXXXXXXXXXXXX",
        "keySecret": "YOUR_TEST_SECRET_KEY",
        "webhookSecret": "YOUR_TEST_WEBHOOK_SECRET",
        "isProduction": false
    }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment configuration created successfully",
  "data": {
    "provider": "razorpay",
    "isActive": true,
    "isProduction": false
  }
}
```

#### Step 2: Verify Test Credentials

```http
POST /api/v1/payment-config/6980bded6fa1da0a392db955/test
Authorization: Bearer ADMIN_JWT_TOKEN
```

**Response:**

```json
{
  "success": true,
  "message": "Razorpay test credentials verified successfully",
  "data": {
    "provider": "razorpay",
    "credentialsValid": true,
    "verified": true,
    "verificationMethod": "api_test",
    "verifiedAt": "2026-02-03T15:00:00.000Z",
    "isProduction": false,
    "isActive": true,
    "tested": true
  }
}
```

✅ **Test mode is now active!** You can start creating orders and processing test payments.

---

### **Scenario 2: Production Configuration (Live)**

#### Step 1: Create Production Config

```http
POST /api/v1/payment-config/6980bded6fa1da0a392db955
Authorization: Bearer ADMIN_JWT_TOKEN
Content-Type: application/json

{
    "provider": "razorpay",
    "credentials": {
        "keyId": "rzp_live_S3fN8JnoDTSACi",
        "keySecret": "mzwFu6XHMqwndkDgzUsw04Sn",
        "webhookSecret": "beanrowofficalsuriyabhola@cDSSSRFAt33Q7",
        "isProduction": true
    }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment configuration created successfully",
  "data": {
    "provider": "razorpay",
    "isActive": false,
    "isProduction": true
  }
}
```

#### Step 2: Verify Production Credentials

```http
POST /api/v1/payment-config/6980bded6fa1da0a392db955/test
Authorization: Bearer ADMIN_JWT_TOKEN
```

**Response:**

```json
{
  "success": true,
  "message": "Razorpay production credentials verified successfully. Production mode requires Super Admin activation.",
  "data": {
    "provider": "razorpay",
    "credentialsValid": true,
    "verified": true,
    "verificationMethod": "api_test",
    "verifiedAt": "2026-02-03T15:00:00.000Z",
    "isProduction": true,
    "isActive": false,
    "requiresActivation": true,
    "activationMessage": "Contact Super Admin to activate production payment gateway",
    "tested": true
  }
}
```

⚠️ **Status:** Verified but NOT active. Requires Super Admin activation.

#### Step 3: Super Admin Activates Production

```http
POST /api/v1/payment-config/6980bded6fa1da0a392db955/activate
Authorization: Bearer SUPER_ADMIN_JWT_TOKEN
Content-Type: application/json

{
    "confirm": true
}
```

**Response:**

```json
{
  "success": true,
  "message": "Production payment gateway activated successfully",
  "data": {
    "provider": "razorpay",
    "isActive": true,
    "isProduction": true,
    "verified": true,
    "activatedBy": {
      "name": "Super Admin",
      "email": "superadmin@example.com"
    },
    "activatedAt": "2026-02-03T15:30:00.000Z",
    "activationIp": "203.0.113.45"
  }
}
```

✅ **Production is now LIVE!** Real payments will be processed.

---

## Emergency Deactivation

### Deactivate Payment Gateway (Super Admin only)

```http
POST /api/v1/payment-config/6980bded6fa1da0a392db955/deactivate
Authorization: Bearer SUPER_ADMIN_JWT_TOKEN
Content-Type: application/json

{
    "reason": "Suspicious activity detected"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment gateway deactivated successfully",
  "data": {
    "provider": "razorpay",
    "isActive": false,
    "deactivatedBy": {
      "name": "Super Admin",
      "email": "superadmin@example.com"
    },
    "deactivatedAt": "2026-02-03T16:00:00.000Z",
    "reason": "Suspicious activity detected"
  }
}
```

---

## Check Configuration Status

### Get Current Config

```http
GET /api/v1/payment-config/6980bded6fa1da0a392db955
Authorization: Bearer ADMIN_JWT_TOKEN
```

**Response (Production Active):**

```json
{
  "success": true,
  "configured": true,
  "data": {
    "provider": "razorpay",
    "isActive": true,
    "isProduction": true,
    "verified": true,
    "verifiedAt": "2026-02-03T15:00:00.000Z",
    "activatedBy": "6980bded6fa1da0a392db955",
    "activatedAt": "2026-02-03T15:30:00.000Z",
    "activationIp": "203.0.113.45",
    "createdAt": "2026-02-03T14:50:00.000Z",
    "updatedAt": "2026-02-03T15:30:00.000Z"
  }
}
```

---

## All Available Endpoints

| Endpoint                              | Method | Access            | Description             |
| ------------------------------------- | ------ | ----------------- | ----------------------- |
| `/payment-config/providers`           | GET    | Public            | Get supported providers |
| `/payment-config/:hotelId`            | GET    | Admin/Manager     | Get config              |
| `/payment-config/:hotelId`            | POST   | Admin/Manager     | Create/update config    |
| `/payment-config/:hotelId/test`       | POST   | Admin/Manager     | Verify credentials      |
| `/payment-config/:hotelId/activate`   | POST   | **Super Admin**   | Activate production     |
| `/payment-config/:hotelId/deactivate` | POST   | **Super Admin**   | Deactivate gateway      |
| `/payment-config/:hotelId/toggle`     | PATCH  | Admin/Manager     | Toggle active status    |
| `/payment-config/:hotelId`            | DELETE | Admin/Super Admin | Delete config           |

---

## Database Fields

### New Fields Added:

```javascript
{
    // Activation tracking
    "activatedBy": ObjectId,        // Super admin who activated
    "activatedAt": Date,            // When activated
    "activationIp": String,         // IP address of activation

    // Deactivation tracking
    "deactivatedBy": ObjectId,      // Who deactivated
    "deactivatedAt": Date,          // When deactivated
    "deactivationReason": String,   // Why deactivated
}
```

---

## Error Scenarios

### 1. Non-Super Admin Tries to Activate Production

```http
POST /api/v1/payment-config/:hotelId/activate
Authorization: Bearer ADMIN_JWT_TOKEN (not super_admin)
```

**Response: 403 Forbidden**

```json
{
  "success": false,
  "message": "Only Super Admin can activate production payment gateway"
}
```

### 2. Activate Without Verification

```http
POST /api/v1/payment-config/:hotelId/activate
```

**Response: 400 Bad Request**

```json
{
  "success": false,
  "message": "Payment configuration must be verified before activation. Run test endpoint first."
}
```

### 3. Invalid Credentials

```http
POST /api/v1/payment-config/:hotelId/test
(with wrong credentials)
```

**Response: 400 Bad Request**

```json
{
  "success": false,
  "message": "Payment gateway credentials verification failed: The api key provided is invalid",
  "error": "The api key provided is invalid",
  "tested": true,
  "credentialsValid": false
}
```

---

## Security Features

### 1. Role-Based Access Control

- **Admin/Manager:** Can create, test, view configs
- **Super Admin:** Can activate/deactivate production

### 2. Audit Trail

- Full logging of who activated/deactivated
- IP address tracking
- Timestamp recording
- Reason for deactivation

### 3. Credential Encryption

- All credentials encrypted in database
- Automatic encryption on save
- Automatic decryption on use

### 4. Email Notifications (TODO)

- Notification when production config created
- Notification when production activated
- Notification when deactivated
- Include activation details

### 5. Production Safeguards

- Requires verification before activation
- Super Admin approval required
- Confirmation required for activation
- Emergency deactivation available

---

## Testing Checklist

### Test Mode

- [ ] Create test config
- [ ] Verify credentials
- [ ] Check auto-activation
- [ ] Create test order
- [ ] Process test payment

### Production Mode

- [ ] Create production config
- [ ] Verify credentials
- [ ] Check NOT auto-activated
- [ ] Super Admin activates
- [ ] Check activation audit trail
- [ ] Create ₹1 order
- [ ] Process real payment
- [ ] Test emergency deactivation

---

## Quick Reference

### Test Mode Flow:

```
Create → Test → ✅ Active (automatic)
```

### Production Mode Flow:

```
Create → Test → ⏳ Verified (not active) → Super Admin Activates → ✅ Active
```

### Deactivation:

```
Active → Super Admin Deactivates → ❌ Inactive
```

---

## Support

For issues or questions:

1. Check logs for activation/deactivation events
2. Verify Super Admin has correct role
3. Confirm credentials are valid
4. Check audit trail in database

---

**Last Updated:** February 3, 2026
