// ============================================================
// SOCKET TESTING SCRIPT
// Test socket notifications without frontend UI
// ============================================================
// Usage: node test-socket-notifications.js

import io from "socket.io-client";
import jwt from "jsonwebtoken";

// ============================================================
// CONFIGURATION
// ============================================================
const SERVER_URL = "http://localhost:8080";
const JWT_SECRET = process.env.JWT_SECRET || "your-jwt-secret";

// Test user credentials (replace with actual IDs from your database)
const TEST_STAFF = {
  _id: "your-staff-id-here",
  role: "waiter",
  name: "Test Waiter",
  staffId: "ST001",
  hotel: "hotel-id",
  branch: "branch-id",
  manager: "manager-id"
};

const TEST_MANAGER = {
  _id: "your-manager-id-here",
  role: "manager",
  name: "Test Manager",
  managerId: "MGR001",
  hotel: "hotel-id",
  branch: "branch-id"
};

// ============================================================
// GENERATE JWT TOKENS
// ============================================================
function generateToken(user) {
  return jwt.sign(
    { _id: user._id, role: user.role },
    JWT_SECRET,
    { expiresIn: "24h" }
  );
}

const staffToken = generateToken(TEST_STAFF);
const managerToken = generateToken(TEST_MANAGER);

console.log("\n🔐 Generated JWT Tokens:");
console.log("Staff Token:", staffToken.substring(0, 50) + "...");
console.log("Manager Token:", managerToken.substring(0, 50) + "...\n");

// ============================================================
// TEST 1: STAFF SOCKET CONNECTION & AUTHENTICATION
// ============================================================
console.log("📡 TEST 1: Staff Socket Connection & Authentication\n");

const staffSocket = io(SERVER_URL, {
  auth: { token: staffToken }
});

staffSocket.on("connect", () => {
  console.log("✅ Staff socket connected:", staffSocket.id);
  console.log("📞 Joining staff order room...");
  staffSocket.emit("join:staff:orders", TEST_STAFF._id);
});

staffSocket.on("joined", (data) => {
  console.log("✅ Joined room:", data);
});

staffSocket.on("connect_error", (error) => {
  console.error("❌ Staff connection error:", error.message);
});

// ============================================================
// TEST 2: MANAGER SOCKET CONNECTION
// ============================================================
console.log("📡 TEST 2: Manager Socket Connection\n");

const managerSocket = io(SERVER_URL, {
  auth: { token: managerToken }
});

managerSocket.on("connect", () => {
  console.log("✅ Manager socket connected:", managerSocket.id);
  console.log("📞 Joining manager order room...");
  managerSocket.emit("join:manager:orders", TEST_MANAGER._id);
  managerSocket.emit("join:branch:orders", TEST_MANAGER.branch);
});

managerSocket.on("joined", (data) => {
  console.log("✅ Manager joined room:", data);
});

// ============================================================
// TEST 3: LISTEN FOR ORDER ASSIGNMENTS (Staff)
// ============================================================
console.log("\n📦 TEST 3: Listening for Order Assignments\n");

staffSocket.on("order:assigned", (data) => {
  console.log("\n🔔 NORMAL PRIORITY ORDER ASSIGNED:");
  console.log("  Order ID:", data.orderId);
  console.log("  Order Number:", data.orderNumber);
  console.log("  Table:", data.tableNumber);
  console.log("  Items:", data.itemCount);
  console.log("  Total:", `$${data.totalPrice}`);
  console.log("  Priority:", data.priority);
  console.log("  Method:", data.assignmentMethod);
  console.log("  Special Instructions:", data.specialInstructions || "None");
  
  // Acknowledge the order
  console.log("\n📝 Acknowledging order...");
  staffSocket.emit("order:acknowledged", { orderId: data.orderId });
});

staffSocket.on("order:from_queue", (data) => {
  console.log("\n⚡ HIGH PRIORITY QUEUE ORDER:");
  console.log("  Order ID:", data.orderId);
  console.log("  Queue Position:", data.queuePosition);
  console.log("  Waited:", data.queuedDuration, "minutes");
  console.log("  URGENT:", data.urgent);
  console.log("  Priority:", data.priority);
  
  // Acknowledge immediately for queue orders
  console.log("\n📝 Acknowledging HIGH PRIORITY order...");
  staffSocket.emit("order:acknowledged", { orderId: data.orderId });
});

staffSocket.on("order:manual_assigned", (data) => {
  console.log("\n🚨 URGENT - MANAGER MANUAL ASSIGNMENT:");
  console.log("  Order ID:", data.orderId);
  console.log("  Reason:", data.reason);
  console.log("  Priority:", data.priority);
  
  // Acknowledge
  console.log("\n📝 Acknowledging URGENT order...");
  staffSocket.emit("order:acknowledged", { orderId: data.orderId });
});

staffSocket.on("order:ack:confirmed", (data) => {
  console.log("\n✅ ACKNOWLEDGMENT CONFIRMED:");
  console.log("  Order ID:", data.orderId);
  console.log("  Acknowledged At:", data.acknowledgedAt);
  console.log("  Message:", data.message);
});

// ============================================================
// TEST 4: MANAGER NOTIFICATIONS
// ============================================================
console.log("\n👔 TEST 4: Manager Notifications\n");

managerSocket.on("order:assignment:success", (data) => {
  console.log("\n📊 MANAGER - ORDER ASSIGNED:");
  console.log("  Order:", data.orderNumber);
  console.log("  Assigned to:", data.staffName, `(${data.staffId})`);
  console.log("  Method:", data.assignmentMethod);
  console.log("  Manual:", data.isManualAssignment);
  console.log("  Priority:", data.priority);
  if (data.reason) console.log("  Reason:", data.reason);
});

managerSocket.on("order:acknowledged:notification", (data) => {
  console.log("\n✅ MANAGER - STAFF ACKNOWLEDGED ORDER:");
  console.log("  Order ID:", data.orderId);
  console.log("  Staff:", data.staffName, `(${data.staffId})`);
  console.log("  Acknowledged At:", data.acknowledgedAt);
});

managerSocket.on("staff:availability:changed", (data) => {
  console.log("\n🔄 MANAGER - STAFF AVAILABILITY CHANGED:");
  console.log("  Staff:", data.staffName, `(${data.staffId})`);
  console.log("  Available:", data.isAvailable);
  console.log("  Timestamp:", data.timestamp);
});

// ============================================================
// TEST 5: ERROR HANDLING
// ============================================================
staffSocket.on("error", (error) => {
  console.error("\n❌ STAFF SOCKET ERROR:", error);
});

managerSocket.on("error", (error) => {
  console.error("\n❌ MANAGER SOCKET ERROR:", error);
});

// ============================================================
// TEST 6: INVALID TOKEN (Should fail)
// ============================================================
setTimeout(() => {
  console.log("\n🔓 TEST 6: Testing Invalid Token (Should Fail)\n");
  
  const invalidSocket = io(SERVER_URL, {
    auth: { token: "invalid-token-12345" }
  });

  invalidSocket.on("connect", () => {
    console.log("❌ UNEXPECTED: Invalid token connected!");
  });

  invalidSocket.on("connect_error", (error) => {
    console.log("✅ EXPECTED: Invalid token rejected:", error.message);
    invalidSocket.disconnect();
  });
}, 3000);

// ============================================================
// TEST 7: OWNERSHIP VALIDATION (Staff trying to join another's room)
// ============================================================
setTimeout(() => {
  console.log("\n🔒 TEST 7: Testing Ownership Validation\n");
  
  const anotherStaffId = "different-staff-id-12345";
  console.log(`Attempting to join room for staff: ${anotherStaffId}`);
  staffSocket.emit("join:staff:orders", anotherStaffId);
  
  // This should trigger an error event
  staffSocket.once("error", (error) => {
    if (error.event === "join:staff:orders") {
      console.log("✅ EXPECTED: Ownership validation blocked unauthorized join");
      console.log("   Error:", error.message);
    }
  });
}, 5000);

// ============================================================
// TEST 8: STAFF AVAILABILITY UPDATE
// ============================================================
setTimeout(() => {
  console.log("\n🔄 TEST 8: Testing Availability Update\n");
  
  console.log("Setting staff availability to: false (going on break)");
  staffSocket.emit("staff:availability:update", { isAvailable: false });
  
  staffSocket.once("staff:availability:confirmed", (data) => {
    console.log("✅ Availability update confirmed:", data);
  });
}, 7000);

// ============================================================
// CLEANUP
// ============================================================
process.on("SIGINT", () => {
  console.log("\n\n🔌 Disconnecting sockets...");
  staffSocket.emit("leave:staff:orders", TEST_STAFF._id);
  managerSocket.emit("leave:manager:orders", TEST_MANAGER._id);
  staffSocket.disconnect();
  managerSocket.disconnect();
  console.log("✅ Cleanup complete. Exiting...\n");
  process.exit(0);
});

// ============================================================
// KEEP ALIVE
// ============================================================
console.log("\n📡 Socket test running...");
console.log("   Listening for order assignment notifications");
console.log("   Press Ctrl+C to exit\n");
console.log("=" .repeat(60));

// ============================================================
// SIMULATE ORDER PLACEMENT (for testing without actual orders)
// ============================================================
// Uncomment to manually trigger a test notification
// This requires accessing the backend directly or using an API call

/*
setTimeout(async () => {
  console.log("\n🧪 SIMULATING ORDER PLACEMENT...\n");
  
  // You would need to make an actual API call to create an order
  // This will trigger the assignment service which will emit socket events
  
  const axios = require('axios');
  
  try {
    const response = await axios.post('http://localhost:8080/api/v1/user/orders/place', {
      tableId: "test-table-id",
      paymentMethod: "cash",
      specialInstructions: "Extra spicy, no onions"
    }, {
      headers: {
        Authorization: `Bearer ${userToken}`
      }
    });
    
    console.log("✅ Order placed:", response.data.data.orderNumber);
    console.log("   Waiting for socket notification...");
  } catch (error) {
    console.error("❌ Order placement failed:", error.message);
  }
}, 10000);
*/

// ============================================================
// EXPECTED OUTPUT
// ============================================================
/*
When an order is placed, you should see:

1. Staff receives notification:
   🔔 NORMAL PRIORITY ORDER ASSIGNED
   Order ID: 673abc...
   Table: T-15
   Items: 3
   Priority: normal

2. Staff acknowledges:
   📝 Acknowledging order...
   ✅ ACKNOWLEDGMENT CONFIRMED
   
3. Manager receives confirmation:
   📊 MANAGER - ORDER ASSIGNED
   Assigned to: Test Waiter
   
4. Manager receives acknowledgment:
   ✅ MANAGER - STAFF ACKNOWLEDGED ORDER
   Staff: Test Waiter
*/
