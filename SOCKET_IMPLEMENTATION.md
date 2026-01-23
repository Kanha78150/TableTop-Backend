# Socket-Based Order Assignment Notification System

## 🎯 Overview

Real-time socket notification system for order assignments with JWT authentication, staff acknowledgment tracking, and priority-based notifications.

---

## 📁 Files Created/Modified

### ✅ Created Files

1. **[src/middleware/socket.auth.middleware.js](src/middleware/socket.auth.middleware.js)** - Socket JWT authentication
2. **[src/socket/socketHandler.js](src/socket/socketHandler.js)** - Order assignment event handlers

### ✏️ Modified Files

1. **[src/models/Order.model.js](src/models/Order.model.js)** - Added tracking fields
2. **[src/services/notificationService.js](src/services/notificationService.js)** - Added notification functions
3. **[src/services/assignmentService.js](src/services/assignmentService.js)** - Integrated socket emissions
4. **[server.js](server.js)** - Wired up authentication & event handlers

---

## 🔐 Authentication Flow

### Socket Connection

```javascript
// Frontend: Connect with JWT token
const socket = io("http://localhost:8080", {
  auth: {
    token: "your-jwt-token-here",
  },
});

// Server validates token and attaches user data to socket
socket.data.user = {
  id: "staff_id",
  role: "waiter",
  name: "John Doe",
  staffId: "ST001",
  hotel: "hotel_id",
  branch: "branch_id",
  manager: "manager_id",
};
```

### Security Features

- ✅ JWT token verification on connection
- ✅ Role-based access control
- ✅ Ownership verification (staff can only join their own rooms)
- ✅ Branch/hotel boundary enforcement
- ✅ Automatic disconnection for unauthenticated sockets

---

## 📡 Socket Events

### Backend → Frontend (Server Emits)

#### 1. **order:assigned** (Normal Priority)

Automatic assignment via load balancing or round-robin.

```javascript
{
  orderId: "673abc123...",
  orderNumber: "ORD12345",
  tableNumber: "T-15",
  totalPrice: 450,
  itemCount: 3,
  items: [
    { name: "Margherita Pizza", quantity: 2, price: 200 },
    { name: "Caesar Salad", quantity: 1, price: 50 }
  ],
  specialInstructions: "Extra cheese, no onions",
  assignmentMethod: "load-balancing", // or "round-robin"
  priority: "normal",
  assignedAt: "2026-01-23T10:30:00Z",
  estimatedTime: 25, // minutes
  hotel: "hotel_id",
  branch: "branch_id"
}
```

#### 2. **order:from_queue** (High Priority)

Order assigned from queue - customer already waited.

```javascript
{
  // ... same fields as order:assigned ...
  assignmentMethod: "queue",
  priority: "high",
  queuePosition: 3,
  queuedDuration: 8, // minutes waited
  urgent: true // Flag for special UI treatment
}
```

#### 3. **order:manual_assigned** (Urgent Priority)

Manager manually assigned order to specific staff.

```javascript
{
  // ... same fields as order:assigned ...
  assignmentMethod: "manual",
  priority: "urgent",
  reason: "Staff requested this customer" // Optional manager reason
}
```

#### 4. **order:ack:confirmed**

Confirmation that staff's acknowledgment was recorded.

```javascript
{
  orderId: "673abc123...",
  acknowledgedAt: "2026-01-23T10:30:15Z",
  message: "Order acknowledgment recorded"
}
```

#### 5. **order:acknowledged:notification** (to Manager)

Notifies manager when staff acknowledges an order.

```javascript
{
  orderId: "673abc123...",
  staffId: "staff_id",
  staffName: "John Doe",
  acknowledgedAt: "2026-01-23T10:30:15Z"
}
```

#### 6. **order:assignment:success** (to Manager)

Manager notification about successful assignment.

```javascript
{
  orderId: "673abc123...",
  orderNumber: "ORD12345",
  tableNumber: "T-15",
  totalPrice: 450,
  itemCount: 3,
  staffId: "staff_id",
  staffName: "John Doe",
  assignmentMethod: "automatic",
  isManualAssignment: false,
  reason: null,
  assignedAt: "2026-01-23T10:30:00Z",
  priority: "normal"
}
```

### Frontend → Backend (Client Emits)

#### 1. **join:staff:orders**

Staff joins their order notification room.

```javascript
socket.emit("join:staff:orders", staffId);

// Response
socket.on("joined", (data) => {
  // { room: "staff_673abc...", type: "orders", message: "Successfully joined..." }
});
```

#### 2. **join:manager:orders**

Manager joins their notification room.

```javascript
socket.emit("join:manager:orders", managerId);
```

#### 3. **join:branch:orders**

Join branch-wide order notifications.

```javascript
socket.emit("join:branch:orders", branchId);
```

#### 4. **order:acknowledged**

Staff confirms they received and saw the order.

```javascript
socket.emit("order:acknowledged", {
  orderId: "673abc123...",
});

// Response
socket.on("order:ack:confirmed", (data) => {
  // { orderId: "...", acknowledgedAt: "...", message: "..." }
});
```

#### 5. **order:viewed**

Track when staff views order details (analytics).

```javascript
socket.emit("order:viewed", {
  orderId: "673abc123...",
});
// Silent success - no response needed
```

#### 6. **staff:availability:update**

Staff updates their availability status.

```javascript
socket.emit("staff:availability:update", {
  isAvailable: false, // Going on break
});

// Response
socket.on("staff:availability:confirmed", (data) => {
  // { isAvailable: false, timestamp: "..." }
});
```

---

## 🎨 Priority Levels & UI Recommendations

### Normal Priority

- **When:** Automatic assignment (staff has capacity)
- **UI:** Blue notification, standard sound
- **Action:** Staff can handle at normal pace

```javascript
if (data.priority === "normal") {
  showNotification({
    color: "blue",
    sound: "notification.mp3",
    title: "New Order Assigned",
  });
}
```

### High Priority

- **When:** Assignment from queue (customer waited)
- **UI:** Orange/yellow, urgent sound, "QUEUE ORDER" badge
- **Action:** Staff should prioritize

```javascript
if (data.priority === "high") {
  showNotification({
    color: "orange",
    sound: "urgent.mp3",
    title: "⚡ Queue Order Assigned",
    badge: `Waited ${data.queuedDuration} min`,
  });
}
```

### Urgent Priority

- **When:** Manual assignment by manager
- **UI:** Red, vibration + sound, manager reason displayed
- **Action:** Immediate attention required

```javascript
if (data.priority === "urgent") {
  showNotification({
    color: "red",
    sound: "alert.mp3",
    vibrate: true,
    title: "🚨 Manager Assignment",
    message: data.reason || "Special request",
  });
}
```

---

## 📊 Database Schema Changes

### Order Model - New Fields

```javascript
{
  // ... existing fields ...

  // Notification tracking
  priority: {
    type: String,
    enum: ["normal", "high", "urgent"],
    default: "normal"
  },
  notificationSentAt: Date,

  // Acknowledgment tracking
  acknowledgedAt: Date,
  acknowledgedBy: ObjectId (ref: "Staff"),

  // Analytics
  viewedAt: Date
}
```

---

## 🔄 Integration Flow

### 1. User Places Order

```
User → Cart → orderService.placeOrderFromCart()
  → assignmentService.assignOrder()
  → performAssignment()
  → notifyStaffOrderAssigned() ✉️
  → Socket emission to staff_${staffId}
```

### 2. Order Assigned from Queue

```
Staff completes order
  → assignmentService.orderCompleted()
  → assignFromQueue()
  → notifyStaffOrderFromQueue() ✉️ HIGH PRIORITY
  → Socket emission with urgent flag
```

### 3. Manager Manual Assignment

```
Manager → manualAssignOrder()
  → assignmentService.manualAssignment()
  → notifyStaffOrderAssigned("manual") ✉️ URGENT
  → Socket emission with reason
```

---

## 🧪 Testing Guide

### Test 1: Socket Authentication

```javascript
// ✅ Valid token - should connect
const socket = io("http://localhost:8080", {
  auth: { token: validStaffToken },
});

socket.on("connect", () => console.log("✅ Connected"));

// ❌ Invalid token - should disconnect
const socket2 = io("http://localhost:8080", {
  auth: { token: "invalid-token" },
});

socket2.on("connect_error", (err) =>
  console.log("❌ Auth failed:", err.message)
);
```

### Test 2: Order Assignment Notification

```javascript
// Staff connects and joins room
socket.emit("join:staff:orders", staffId);

// Listen for assignments
socket.on("order:assigned", (data) => {
  console.log("📦 New order:", data.orderNumber);
  console.log("🍕 Items:", data.items);
  console.log("⏰ Priority:", data.priority);

  // Acknowledge receipt
  socket.emit("order:acknowledged", { orderId: data.orderId });
});

// Confirmation
socket.on("order:ack:confirmed", (data) => {
  console.log("✅ Acknowledgment recorded");
});
```

### Test 3: Priority Handling

```javascript
socket.on("order:assigned", handleNormalOrder);
socket.on("order:from_queue", handleHighPriority);

function handleHighPriority(data) {
  if (data.urgent) {
    playUrgentSound();
    showRedNotification();
    vibrate();
  }
}
```

---

## 🚀 Deployment Checklist

### Environment Variables

```bash
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://your-frontend.com
NODE_ENV=production
```

### Server Configuration

- ✅ Socket.IO CORS configured
- ✅ JWT_SECRET set
- ✅ Authentication middleware registered
- ✅ Event handlers initialized
- ✅ Error logging enabled

### Frontend Requirements

- Socket.IO client library (^4.8.1)
- JWT token storage (localStorage/secure cookies)
- Notification permission handling
- Sound files for different priorities
- Vibration API (mobile)

---

## 📝 API Endpoints (for reference)

Orders are assigned automatically when placed, but managers can manually assign:

### Manual Assignment

```
POST /api/v1/assignment/manual-assign
Authorization: Bearer <manager-token>

{
  "orderId": "673abc123...",
  "waiterId": "staff_id",
  "reason": "Customer requested this waiter"
}
```

---

## 🐛 Troubleshooting

### Issue: Staff not receiving notifications

**Check:**

1. Socket connected? `socket.connected === true`
2. Room joined? Check `socket.emit("join:staff:orders", staffId)` called
3. Token valid? Check auth middleware logs
4. Staff ID matches? Ownership verification enforced

### Issue: Notifications sent but not acknowledged

**Check:**

1. `order:acknowledged` event emitted from frontend?
2. Order assigned to this staff? Ownership check enforced
3. Check server logs for acknowledgment processing

### Issue: Manager not seeing assignments

**Check:**

1. Manager joined room? `socket.emit("join:manager:orders", managerId)`
2. Waiter has assigned manager? Check `waiter.manager` field
3. Check notification service logs

---

## 📈 Monitoring & Analytics

### Key Metrics to Track

- Socket connection success rate
- Average acknowledgment time
- Notification delivery rate
- Priority distribution (normal/high/urgent)
- Order viewed vs assigned ratio

### Logging

All events are logged with structured data:

```javascript
logger.info("Order assignment notification sent", {
  orderId: "...",
  staffId: "...",
  priority: "high",
  timestamp: "...",
});
```

---

## 🔮 Future Enhancements

1. **Acknowledgment Timeout** - Auto-alert manager if no ack within 2-3 min
2. **Offline Notifications** - Store in DB for retrieval on reconnection
3. **Push Notification Fallback** - Firebase/OneSignal for offline staff
4. **Notification History** - Store all notifications for audit trail
5. **Rate Limiting** - Prevent notification spam
6. **Connection Status Dashboard** - Show which staff are online
7. **Bulk Notifications** - Notify multiple staff for urgent situations

---

## 📞 Support

For issues or questions:

- Check logs in `logs/` directory
- Enable debug mode: `DEBUG=socket.io* npm start`
- Review authentication middleware logs
- Check order assignment service logs

---

**Implementation Date:** January 23, 2026  
**Version:** 1.0.0  
**Status:** ✅ Production Ready
