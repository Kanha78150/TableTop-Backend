# 🛒 Complete Cart to Payment Process - Hotel Management System

## 📋 Overview

This document outlines the complete workflow from adding items to cart through payment completion using Razorpay integration in the Hotel Management System.

---

## 🔄 Process Flow Diagram

```
User Authentication → Add to Cart → Cart Management → Checkout → Payment → Order Confirmation
      ↓                   ↓             ↓            ↓          ↓           ↓
   JWT Token         Cart Creation   View/Update    Create    Razorpay    Order Update
                                      Items        Order     Payment      Status
```

---

## 📝 Step-by-Step Process

### 1. 🔐 User Authentication

**Endpoint**: `POST /api/v1/auth/user/login`

```javascript
// Request
{
  "email": "user@example.com",
  "password": "userpassword"
}

// Response
{
  "success": true,
  "data": {
    "user": { /* user details */ },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  },
  "message": "User logged in successfully"
}
```

**Headers for subsequent requests**:

```
Authorization: Bearer <accessToken>
Content-Type: application/json
```

---

### 2. 🛒 Add Items to Cart

**Endpoint**: `POST /api/v1/user/cart/add`

```javascript
// Request
{
  "hotelId": "60f7b1b3e1b3c123456789ab",
  "foodItemId": "60f7b1b3e1b3c123456789cd",
  "quantity": 2,
  "tableId": "60f7b1b3e1b3c123456789ef"
}

// Response
{
  "success": true,
  "data": {
    "_id": "60f7b1b3e1b3c123456789gh",
    "user": "60f7b1b3e1b3c123456789ij",
    "hotel": "60f7b1b3e1b3c123456789ab",
    "table": "60f7b1b3e1b3c123456789ef",
    "items": [
      {
        "foodItem": {
          "_id": "60f7b1b3e1b3c123456789cd",
          "name": "Chicken Biryani",
          "price": 250,
          "image": "biryani.jpg"
        },
        "quantity": 2,
        "price": 250,
        "totalPrice": 500
      }
    ],
    "subtotal": 500,
    "taxes": 45,
    "serviceCharge": 25,
    "totalPrice": 570,
    "status": "active"
  },
  "message": "Item added to cart successfully"
}
```

---

### 3. 👀 View Cart

**Endpoint**: `GET /api/v1/user/cart`

```javascript
// Response
{
  "success": true,
  "data": {
    "_id": "60f7b1b3e1b3c123456789gh",
    "user": "60f7b1b3e1b3c123456789ij",
    "hotel": {
      "_id": "60f7b1b3e1b3c123456789ab",
      "name": "Grand Hotel",
      "address": "123 Main Street"
    },
    "table": {
      "_id": "60f7b1b3e1b3c123456789ef",
      "tableNumber": "T-01",
      "capacity": 4
    },
    "items": [
      {
        "foodItem": {
          "_id": "60f7b1b3e1b3c123456789cd",
          "name": "Chicken Biryani",
          "price": 250,
          "category": "Main Course",
          "image": "biryani.jpg",
          "description": "Aromatic basmati rice with chicken"
        },
        "quantity": 2,
        "price": 250,
        "totalPrice": 500
      }
    ],
    "subtotal": 500,
    "taxes": 45,
    "serviceCharge": 25,
    "totalPrice": 570,
    "status": "active",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Cart retrieved successfully"
}
```

---

### 4. ✏️ Update Cart Item (Optional)

**Endpoint**: `PUT /api/v1/user/cart/update/:itemId`

```javascript
// Request
{
  "quantity": 3
}

// Response
{
  "success": true,
  "data": {
    /* Updated cart with new quantities and totals */
  },
  "message": "Cart item updated successfully"
}
```

---

### 5. 🗑️ Remove Item from Cart (Optional)

**Endpoint**: `DELETE /api/v1/user/cart/remove/:itemId`

```javascript
// Response
{
  "success": true,
  "data": {
    /* Updated cart without the removed item */
  },
  "message": "Item removed from cart successfully"
}
```

---

### 6. 🛍️ Checkout - Create Order

**Endpoint**: `POST /api/v1/user/cart/checkout`

```javascript
// Request
{
  "paymentMethod": "razorpay", // Options: "cash", "card", "upi", "wallet", "razorpay"
  "specialInstructions": "Extra spicy, no onions",
  "deliveryAddress": "Room 101" // Optional for room service
}

// Response
{
  "success": true,
  "data": {
    "_id": "60f7b1b3e1b3c123456789kl",
    "orderNumber": "ORD-2024-001234",
    "user": "60f7b1b3e1b3c123456789ij",
    "hotel": "60f7b1b3e1b3c123456789ab",
    "table": "60f7b1b3e1b3c123456789ef",
    "items": [
      {
        "foodItem": "60f7b1b3e1b3c123456789cd",
        "name": "Chicken Biryani",
        "quantity": 2,
        "price": 250,
        "totalPrice": 500
      }
    ],
    "subtotal": 500,
    "taxes": 45,
    "serviceCharge": 25,
    "totalPrice": 570,
    "payment": {
      "paymentMethod": "razorpay",
      "paymentStatus": "pending"
    },
    "status": "pending",
    "specialInstructions": "Extra spicy, no onions",
    "createdAt": "2024-01-15T10:35:00.000Z"
  },
  "message": "Order created successfully"
}
```

---

### 7. 💳 Initiate Payment (Razorpay)

**Endpoint**: `POST /api/v1/payment/razorpay/initiate`

```javascript
// Request
{
  "orderId": "60f7b1b3e1b3c123456789kl",
  "customerName": "John Doe",
  "customerEmail": "john@example.com",
  "customerPhone": "9999999999"
}

// Response
{
  "success": true,
  "data": {
    "transactionId": "TXN-2025-1729012345678ABC", // Our unique transaction ID
    "orderId": "order_razorpay_abc123def456",
    "amount": 57000, // Amount in paise (₹570.00)
    "currency": "INR",
    "key": "rzp_test_RSwQ42n81g7z6f",
    "name": "Hotel Management System",
    "description": "Payment for Order #ORD-2024-001234",
    "order_id": "order_razorpay_abc123def456",
    "callback_url": "http://localhost:8000/api/v1/payment/razorpay/callback",
    "prefill": {
      "name": "John Doe",
      "email": "john@example.com",
      "contact": "9999999999"
    },
    "theme": {
      "color": "#3399cc"
    }
  },
  "message": "Payment initiated successfully"
}
```

---

### 8. 🎯 Frontend Razorpay Integration

```html
<!-- Include Razorpay Script -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

<script>
  async function initiatePayment(orderId) {
    try {
      // Step 1: Get payment order from backend
      const response = await fetch("/api/v1/payment/razorpay/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + localStorage.getItem("accessToken"),
        },
        body: JSON.stringify({
          orderId: orderId,
          customerName: "John Doe",
          customerEmail: "john@example.com",
          customerPhone: "9999999999",
        }),
      });

      const paymentData = await response.json();

      if (!paymentData.success) {
        throw new Error(paymentData.message);
      }

      // Step 2: Open Razorpay Checkout
      const options = {
        key: paymentData.data.key,
        amount: paymentData.data.amount,
        currency: paymentData.data.currency,
        name: paymentData.data.name,
        description: paymentData.data.description,
        order_id: paymentData.data.order_id,
        handler: function (response) {
          // Payment successful
          console.log("Payment Success:", response);
          handlePaymentSuccess(response);
        },
        prefill: paymentData.data.prefill,
        theme: paymentData.data.theme,
        modal: {
          ondismiss: function () {
            console.log("Payment cancelled by user");
            handlePaymentCancel();
          },
        },
      };

      const rzp = new Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error("Payment initiation failed:", error);
      handlePaymentError(error);
    }
  }

  function handlePaymentSuccess(response) {
    // Redirect to success page or show success message
    alert("Payment Successful! Payment ID: " + response.razorpay_payment_id);
    window.location.href =
      "/order-success?orderId=" + response.razorpay_order_id;
  }

  function handlePaymentCancel() {
    alert("Payment was cancelled. You can retry payment from your orders.");
  }

  function handlePaymentError(error) {
    alert("Payment failed: " + error.message);
  }
</script>
```

---

### 9. ✅ Payment Callback Handling

**Flexible Callback System** - Supports both Razorpay and custom callbacks

**Endpoint**: `GET/POST /api/v1/payment/razorpay/callback`

#### Standard Razorpay Callback (Automatic)

```javascript
// Razorpay automatically sends these parameters after payment
{
  "razorpay_payment_id": "pay_abc123def456ghi789",
  "razorpay_order_id": "order_razorpay_abc123def456",
  "razorpay_signature": "signature_hash_string"
}

// Backend verifies signature and processes payment
// Redirect URL: http://localhost:3000/payment/success?orderId=60f7b1b3e1b3c123456789kl
```

#### Custom Callback (Manual/Frontend Initiated)

```javascript
// Frontend can also call callback with our custom parameters
{
  "orderId": "68ed1635aa2e171936cfbb58",
  "transactionId": "TXN-2025-4127359B6519"
}

// Backend checks payment status from Razorpay and processes accordingly
// Redirect URL: http://localhost:3000/payment/success?orderId=68ed1635aa2e171936cfbb58
```

> **Note**: The system automatically detects callback type and handles both scenarios properly.

---

### 10. 🔔 Webhook Processing (Real-time)

**Endpoint**: `POST /api/v1/payment/razorpay/webhook`

```javascript
// Razorpay webhook payload
{
  "event": "payment.captured",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_abc123def456ghi789",
        "order_id": "order_razorpay_abc123def456",
        "amount": 57000,
        "currency": "INR",
        "status": "captured",
        "method": "upi"
      }
    }
  }
}

// Backend automatically updates order status
```

---

### 11. 📊 Check Payment Status

**Endpoint**: `GET /api/v1/payment/razorpay/status/:transactionId`

```javascript
// Response
{
  "success": true,
  "data": {
    "transactionId": "TXN-2025-1729012345678ABC", // Our unique transaction ID
    "orderId": "60f7b1b3e1b3c123456789kl",
    "razorpayOrderId": "order_razorpay_abc123def456",
    "razorpayPaymentId": "pay_abc123def456ghi789",
    "status": "paid",
    "amount": 570,
    "currency": "INR",
    "method": "upi",
    "createdAt": "2024-01-15T10:40:00.000Z"
  },
  "message": "Payment status retrieved successfully"
}
```

---

### 12. 📋 View Order Status

**Endpoint**: `GET /api/v1/user/orders/:orderId`

```javascript
// Response
{
  "success": true,
  "data": {
    "_id": "60f7b1b3e1b3c123456789kl",
    "orderNumber": "ORD-2024-001234",
    "user": {
      "_id": "60f7b1b3e1b3c123456789ij",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "hotel": {
      "_id": "60f7b1b3e1b3c123456789ab",
      "name": "Grand Hotel"
    },
    "table": {
      "_id": "60f7b1b3e1b3c123456789ef",
      "tableNumber": "T-01"
    },
    "items": [
      {
        "foodItem": {
          "_id": "60f7b1b3e1b3c123456789cd",
          "name": "Chicken Biryani",
          "image": "biryani.jpg"
        },
        "quantity": 2,
        "price": 250,
        "totalPrice": 500
      }
    ],
    "subtotal": 500,
    "taxes": 45,
    "serviceCharge": 25,
    "totalPrice": 570,
    "payment": {
      "paymentMethod": "razorpay",
      "paymentStatus": "paid",
      "razorpayOrderId": "order_razorpay_abc123def456",
      "razorpayPaymentId": "pay_abc123def456ghi789",
      "paidAt": "2024-01-15T10:40:00.000Z"
    },
    "status": "confirmed", // pending → confirmed → preparing → ready → served
    "specialInstructions": "Extra spicy, no onions",
    "estimatedTime": 25,
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:40:00.000Z"
  },
  "message": "Order retrieved successfully"
}
```

---

## 🔧 Error Handling

### Common Error Responses

#### 1. Authentication Error

```javascript
{
  "success": false,
  "statusCode": 401,
  "message": "Access token is required"
}
```

#### 2. Cart Not Found

```javascript
{
  "success": false,
  "statusCode": 404,
  "message": "Cart not found"
}
```

#### 3. Payment Initiation Failed

```javascript
{
  "success": false,
  "statusCode": 500,
  "message": "Payment initiation failed"
}
```

#### 4. Invalid Payment Signature

```javascript
{
  "success": false,
  "statusCode": 400,
  "message": "Invalid payment signature"
}
```

---

## 🔄 Order Status Lifecycle

```
pending → confirmed → preparing → ready → served → completed
   ↓         ↓          ↓         ↓       ↓         ↓
Payment   Payment   Kitchen    Ready   Customer   Order
Required  Success   Started    for     Served     Done
                              Pickup
```

### Status Descriptions:

- **pending**: Order created, payment pending
- **confirmed**: Payment successful, order confirmed
- **preparing**: Kitchen started preparing the order
- **ready**: Order ready for pickup/serving
- **served**: Order delivered to customer
- **completed**: Order fully completed

---

## 💰 Payment Methods Supported

1. **Cash** - `"cash"`
2. **Card** - `"card"`
3. **UPI** - `"upi"`
4. **Wallet** - `"wallet"`
5. **Razorpay** - `"razorpay"` (Online payment gateway)

---

## 🧪 Testing Endpoints

### Test Server Health

```bash
curl -X GET http://localhost:8000/api/v1/payment/health
```

### Test Payment Initiation

```bash
curl -X POST http://localhost:8000/api/v1/payment/razorpay/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "orderId": "60f7b1b3e1b3c123456789kl",
    "customerName": "Test User",
    "customerEmail": "test@example.com",
    "customerPhone": "9999999999"
  }'
```

---

## 📱 Frontend Integration Examples

### React.js Example

```jsx
import React, { useState } from "react";

const PaymentComponent = ({ orderId, amount, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    setLoading(true);

    const res = await loadRazorpay();
    if (!res) {
      alert("Razorpay SDK failed to load");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/v1/payment/razorpay/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      const options = {
        key: data.data.key,
        amount: data.data.amount,
        currency: data.data.currency,
        order_id: data.data.order_id,
        name: data.data.name,
        description: data.data.description,
        handler: function (response) {
          onSuccess(response);
        },
        prefill: data.data.prefill,
        theme: data.data.theme,
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
      setLoading(false);
    } catch (error) {
      onError(error);
      setLoading(false);
    }
  };

  return (
    <button onClick={handlePayment} disabled={loading} className="pay-button">
      {loading ? "Processing..." : `Pay ₹${amount}`}
    </button>
  );
};

export default PaymentComponent;
```

---

## 🔍 Debugging & Logs

### Enable Debug Logging

```bash
DEBUG=razorpay* npm run dev
```

### Check Payment Logs

- Payment initiation logs in server console
- Webhook processing logs with signature verification
- Order status update logs

### Common Debug Points

1. JWT token validation
2. Cart item calculations
3. Razorpay order creation
4. Payment signature verification
5. Webhook signature validation
6. Order status updates

---

## 🚀 Production Deployment Checklist

### Environment Variables

```env
# Razorpay Live Credentials
RAZORPAY_KEY_ID=rzp_live_YOUR_KEY_ID
RAZORPAY_KEY_SECRET=YOUR_LIVE_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET

# Production URLs
RAZORPAY_REDIRECT_URL=https://yourdomain.com/api/v1/payment/razorpay/callback
RAZORPAY_WEBHOOK_URL=https://yourdomain.com/api/v1/payment/razorpay/webhook
FRONTEND_URL=https://yourdomain.com
```

### Razorpay Dashboard Configuration

1. Enable webhooks for production
2. Set webhook URL: `https://yourdomain.com/api/v1/payment/razorpay/webhook`
3. Enable events: `payment.captured`, `payment.failed`, `payment.authorized`
4. Test webhook deliveries

### Security Checklist

- ✅ HTTPS enabled for all payment endpoints
- ✅ JWT tokens properly validated
- ✅ Webhook signatures verified
- ✅ Rate limiting enabled
- ✅ Input validation on all endpoints
- ✅ Error handling without sensitive data exposure

---

## 📞 Support & Documentation

- **Razorpay Documentation**: https://razorpay.com/docs/
- **Webhook Testing**: https://razorpay.com/docs/webhooks/validate-test/
- **Payment Gateway**: https://razorpay.com/docs/payment-gateway/

---

_This documentation covers the complete flow from cart management to payment completion. All endpoints are tested and production-ready with proper error handling and security measures._
