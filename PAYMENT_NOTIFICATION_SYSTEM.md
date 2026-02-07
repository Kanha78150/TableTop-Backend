# Payment Configuration Notification System

## Overview

Complete 3-layer notification system for payment gateway activation workflow:

1. **Socket.IO** (Real-time notifications)
2. **Email** (EmailQueue for persistent delivery)
3. **Console Logs** (Audit trail)

---

## Notification Flow

### 1. Admin Tests Production Credentials ✅

**Endpoint:** `POST /api/v1/payment-config/:hotelId/test`  
**Actor:** Admin  
**Trigger:** When `isProduction: true` and credentials verify successfully

**What Happens:**

- ✅ Credentials verified with Razorpay API
- ✅ Database updated: `verified: true`, `isActive: false`
- 🔔 **Super Admins notified** (Socket + Email)
- ⏳ Admin waits for activation

**Notifications Sent:**

- **To:** All Super Admins
- **Socket Event:** `payment:pending_activation`
- **Email Subject:** 🔔 Action Required: Production Payment Gateway Activation
- **Priority:** High

```javascript
// Socket payload
{
  hotelId: "6980bded6fa1da0a392db955",
  hotelName: "Grand Hotel",
  provider: "RAZORPAY",
  adminName: "John Admin",
  adminEmail: "admin@hotel.com",
  configId: "6982276d91bb0808d57f27f7",
  message: "Production RAZORPAY gateway requires activation",
  priority: "high",
  actionUrl: "/api/v1/payment-config/6980bded6fa1da0a392db955/activate"
}
```

---

### 2. Super Admin Activates Production Gateway ✅

**Endpoint:** `POST /api/v1/payment-config/:hotelId/activate`  
**Actor:** Super Admin  
**Body:** `{ "confirm": true }`

**What Happens:**

- ✅ Payment gateway activated: `isActive: true`
- ✅ Audit trail recorded (activatedBy, activatedAt, activationIp)
- 🔔 **Hotel Admin notified** (Socket + Email)
- 🎉 Admin can now accept live payments

**Notifications Sent:**

- **To:** Hotel Admin who created the config
- **Socket Event:** `payment:activated`
- **Email Subject:** ✅ RAZORPAY Production Gateway Activated
- **Priority:** High

```javascript
// Socket payload
{
  hotelId: "6980bded6fa1da0a392db955",
  hotelName: "Grand Hotel",
  provider: "RAZORPAY",
  activatedBy: "Super Admin Name",
  configId: "6982276d91bb0808d57f27f7",
  message: "RAZORPAY production gateway is now ACTIVE",
  priority: "high"
}
```

---

### 3. Super Admin Deactivates Gateway ⚠️

**Endpoint:** `POST /api/v1/payment-config/:hotelId/deactivate`  
**Actor:** Super Admin  
**Body:** `{ "reason": "Security issue detected" }` (optional)

**What Happens:**

- ❌ Payment gateway deactivated: `isActive: false`
- ✅ Audit trail recorded (deactivatedBy, deactivatedAt, deactivationReason)
- 🔔 **Hotel Admin notified** (Socket + Email)
- ⚠️ Admin's payments now disabled

**Notifications Sent:**

- **To:** Hotel Admin
- **Socket Event:** `payment:deactivated`
- **Email Subject:** ⚠️ RAZORPAY Production Gateway Deactivated
- **Priority:** Urgent

```javascript
// Socket payload
{
  hotelId: "6980bded6fa1da0a392db955",
  hotelName: "Grand Hotel",
  provider: "RAZORPAY",
  deactivatedBy: "Super Admin Name",
  reason: "Security issue detected",
  configId: "6982276d91bb0808d57f27f7",
  message: "RAZORPAY gateway has been DEACTIVATED",
  priority: "urgent"
}
```

---

## Frontend Integration

### 1. Socket.IO Connection

Admins and Super Admins must join their notification room:

```javascript
// Admin Dashboard - Connect to socket
import io from "socket.io-client";

const socket = io(process.env.REACT_APP_API_URL, {
  auth: { token: localStorage.getItem("token") },
});

// Join admin notification room
socket.emit("join:admin", adminId);

// Listen for payment notifications
socket.on("payment:pending_activation", (data) => {
  // Show notification: "Production gateway awaits activation"
  showNotification({
    title: data.message,
    type: "info",
    priority: data.priority,
    actionButton: {
      text: "Activate Now",
      onClick: () => activateGateway(data.hotelId),
    },
  });
});

socket.on("payment:activated", (data) => {
  // Show success: "Your payment gateway is LIVE"
  showNotification({
    title: "✅ Payment Gateway Activated",
    message: data.message,
    type: "success",
  });
});

socket.on("payment:deactivated", (data) => {
  // Show urgent warning
  showNotification({
    title: "⚠️ Payment Gateway Deactivated",
    message: `${data.message}. Reason: ${data.reason}`,
    type: "error",
    priority: "urgent",
    persistent: true, // Don't auto-dismiss
  });
});
```

### 2. Email Notifications

Emails are queued automatically in `EmailQueue` model. You need to process the queue:

```javascript
// Backend - Email Queue Processor (run as cron job or worker)
import { EmailQueue } from "./models/EmailQueue.model.js";
import { sendEmail } from "./utils/emailService.js";

async function processEmailQueue() {
  const pendingEmails = await EmailQueue.find({
    status: "pending",
  }).limit(10);

  for (const email of pendingEmails) {
    try {
      await sendEmail({
        to: email.recipient,
        subject: email.subject,
        html: email.htmlContent,
      });

      email.status = "sent";
      email.sentAt = new Date();
      await email.save();
    } catch (error) {
      email.status = "failed";
      email.error = error.message;
      await email.save();
    }
  }
}

// Run every minute
setInterval(processEmailQueue, 60000);
```

---

## Database Records

### EmailQueue Model (Already Exists)

```javascript
{
  recipient: "admin@hotel.com",
  subject: "🔔 Action Required: Production Payment Gateway Activation",
  htmlContent: "<h2>Production Payment Gateway Requires Activation...</h2>",
  priority: "high",
  status: "pending", // pending | sent | failed
  sentAt: null,
  error: null
}
```

### PaymentConfig Audit Trail

```javascript
{
  // ... other fields
  verified: true,
  verifiedAt: "2026-02-03T17:04:55.006Z",
  isActive: true,
  activatedBy: ObjectId("697f74b3443b916f11a32cfe"),
  activatedAt: "2026-02-03T17:09:33.249Z",
  activationIp: "192.168.1.100",
  deactivatedBy: null,
  deactivatedAt: null,
  deactivationReason: null
}
```

---

## Testing Notifications

### Test Pending Activation Notification

```bash
# 1. Create production config
POST /api/v1/payment-config/:hotelId
{
  "provider": "razorpay",
  "credentials": {
    "keyId": "rzp_live_XXX",
    "keySecret": "XXX",
    "isProduction": true
  }
}

# 2. Test credentials (triggers notification)
POST /api/v1/payment-config/:hotelId/test

# Expected:
# - Super Admin gets Socket notification
# - Super Admin gets email
# - Console shows: "✅ Pending activation notifications sent to X super admins"
```

### Test Activation Notification

```bash
# Super Admin activates
POST /api/v1/payment-config/:hotelId/activate
{
  "confirm": true
}

# Expected:
# - Hotel Admin gets Socket notification
# - Hotel Admin gets email
# - Console shows: "✅ Activation notification sent to admin@hotel.com"
```

### Test Deactivation Notification

```bash
# Super Admin deactivates
POST /api/v1/payment-config/:hotelId/deactivate
{
  "reason": "Testing notifications"
}

# Expected:
# - Hotel Admin gets Socket notification (priority: urgent)
# - Hotel Admin gets email
# - Console shows: "✅ Deactivation notification sent to admin@hotel.com"
```

---

## Console Logs (Audit Trail)

All events are logged to console for security audit:

```bash
# Pending Activation
✅ Pending activation notifications sent to 2 super admins

# Activation
[PAYMENT ACTIVATION] Hotel: 6980bded6fa1da0a392db955, Provider: razorpay, Activated by: superadmin@system.com, IP: 192.168.1.100
✅ Activation notification sent to admin@hotel.com

# Deactivation
[PAYMENT DEACTIVATION] Hotel: 6980bded6fa1da0a392db955, Provider: razorpay, Deactivated by: superadmin@system.com, Reason: Security issue
✅ Deactivation notification sent to admin@hotel.com
```

---

## Security Features

✅ **Real-time notifications** via Socket.IO (instant)  
✅ **Persistent email delivery** via EmailQueue  
✅ **Audit trail** in database (who, when, why, from where)  
✅ **Console logs** for security monitoring  
✅ **Priority levels** (high, urgent) for critical alerts  
✅ **Action URLs** for quick access from notifications

---

## Summary

### Admin's Experience:

1. Admin configures production Razorpay credentials
2. Admin tests credentials → Gets "Awaiting Super Admin approval" message
3. **🔔 Admin waits** (no manual follow-up needed)
4. **🔔 Socket notification:** "✅ Your gateway is activated!"
5. **📧 Email confirmation:** Details with activation info
6. Admin can now accept live payments

### Super Admin's Experience:

1. **🔔 Socket notification:** "New production gateway needs activation"
2. **📧 Email alert:** Hotel details, admin info, action required
3. Super Admin reviews and activates via API
4. System sends confirmation to admin automatically
5. **Emergency:** Can deactivate anytime with reason

### No Manual Communication Needed!

- ❌ No need for admins to call/email super admins
- ❌ No need for super admins to manually notify admins
- ✅ Everything is automated via Socket + Email
- ✅ Everyone knows status in real-time
