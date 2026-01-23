// ============================================================
// FRONTEND SOCKET INTEGRATION - QUICK START GUIDE
// ============================================================

// 1. INSTALL DEPENDENCIES
// npm install socket.io-client

// 2. IMPORT
import io from "socket.io-client";

// 3. CONNECT WITH JWT (After staff login)
const token = localStorage.getItem("staffToken"); // or from your auth store
const socket = io("http://localhost:8080", {
  auth: {
    token: token,
  },
});

// 4. HANDLE CONNECTION
socket.on("connect", () => {
  console.log("✅ Connected to server");
  const staffId = getCurrentStaffId(); // Get from your auth state
  socket.emit("join:staff:orders", staffId);
});

socket.on("joined", (data) => {
  console.log(`✅ Joined room: ${data.room}`);
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection failed:", error.message);
  // Handle auth failure - maybe redirect to login
});

// ============================================================
// 5. LISTEN FOR ORDER ASSIGNMENTS
// ============================================================

// NORMAL PRIORITY - Automatic assignment
socket.on("order:assigned", (data) => {
  console.log("📦 New order assigned:", data);

  // Show notification
  showNotification({
    title: "New Order",
    message: `Table ${data.tableNumber} - ${data.itemCount} items`,
    color: "blue",
    sound: "notification.mp3",
  });

  // Update UI - add order to pending list
  addOrderToPendingList(data);

  // Auto-acknowledge (or wait for user action)
  acknowledgeOrder(data.orderId);
});

// HIGH PRIORITY - From queue (customer already waited)
socket.on("order:from_queue", (data) => {
  console.log("⚡ HIGH PRIORITY queue order:", data);

  // Show urgent notification
  showNotification({
    title: "⚡ QUEUE ORDER - Customer Waiting!",
    message: `Table ${data.tableNumber} - Waited ${data.queuedDuration} min`,
    color: "orange",
    sound: "urgent.mp3",
    persistent: true, // Don't auto-dismiss
  });

  // Vibrate mobile device
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }

  // Update UI - add to top of list with urgent badge
  addOrderToPendingList(data, { urgent: true });

  acknowledgeOrder(data.orderId);
});

// URGENT PRIORITY - Manual assignment by manager
socket.on("order:manual_assigned", (data) => {
  console.log("🚨 URGENT - Manager assigned:", data);

  // Show urgent notification with manager's reason
  showNotification({
    title: "🚨 Manager Assignment",
    message: data.reason || `Table ${data.tableNumber} - Special request`,
    color: "red",
    sound: "alert.mp3",
    persistent: true,
    vibrate: true,
  });

  // Maybe show a modal for urgent attention
  showUrgentOrderModal(data);

  acknowledgeOrder(data.orderId);
});

// ============================================================
// 6. ACKNOWLEDGE ORDERS
// ============================================================

function acknowledgeOrder(orderId) {
  socket.emit("order:acknowledged", { orderId });
  console.log(`✅ Acknowledged order ${orderId}`);
}

// Listen for acknowledgment confirmation
socket.on("order:ack:confirmed", (data) => {
  console.log("✅ Server confirmed acknowledgment");
  // Update UI - show checkmark on order
  markOrderAsAcknowledged(data.orderId);
});

// ============================================================
// 7. TRACK ORDER VIEWS (Analytics)
// ============================================================

function viewOrderDetails(orderId) {
  // When staff opens order details
  socket.emit("order:viewed", { orderId });
  // Silent - no response needed
}

// ============================================================
// 8. UPDATE AVAILABILITY STATUS
// ============================================================

function toggleAvailability(isAvailable) {
  socket.emit("staff:availability:update", { isAvailable });
}

socket.on("staff:availability:confirmed", (data) => {
  console.log(`Availability updated: ${data.isAvailable}`);
  updateAvailabilityUI(data.isAvailable);
});

// ============================================================
// 9. ERROR HANDLING
// ============================================================

socket.on("error", (error) => {
  console.error("Socket error:", error);
  showErrorToast(error.message);
});

socket.on("disconnect", () => {
  console.log("❌ Disconnected from server");
  showDisconnectedBanner();
});

// Auto-reconnect handling
socket.on("reconnect", (attemptNumber) => {
  console.log(`Reconnected after ${attemptNumber} attempts`);
  hideDisconnectedBanner();

  // Re-join rooms
  const staffId = getCurrentStaffId();
  socket.emit("join:staff:orders", staffId);
});

// ============================================================
// 10. CLEANUP (When component unmounts / staff logs out)
// ============================================================

function cleanup() {
  const staffId = getCurrentStaffId();
  socket.emit("leave:staff:orders", staffId);
  socket.disconnect();
}

// ============================================================
// COMPLETE EXAMPLE - REACT COMPONENT
// ============================================================

import React, { useEffect, useState } from "react";
import io from "socket.io-client";

function StaffOrderDashboard() {
  const [socket, setSocket] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  const staffId = "your-staff-id"; // From auth context
  const token = "your-jwt-token"; // From auth context

  useEffect(() => {
    // Initialize socket
    const newSocket = io("http://localhost:8080", {
      auth: { token },
    });

    // Connection handlers
    newSocket.on("connect", () => {
      setIsConnected(true);
      newSocket.emit("join:staff:orders", staffId);
    });

    newSocket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Order assignment handlers
    newSocket.on("order:assigned", (data) => {
      playSound("notification.mp3");
      setOrders((prev) => [data, ...prev]);
      acknowledgeOrder(newSocket, data.orderId);
    });

    newSocket.on("order:from_queue", (data) => {
      playSound("urgent.mp3");
      vibrate();
      setOrders((prev) => [{ ...data, urgent: true }, ...prev]);
      acknowledgeOrder(newSocket, data.orderId);
    });

    setSocket(newSocket);

    // Cleanup
    return () => {
      newSocket.emit("leave:staff:orders", staffId);
      newSocket.disconnect();
    };
  }, [staffId, token]);

  const acknowledgeOrder = (socket, orderId) => {
    socket.emit("order:acknowledged", { orderId });
  };

  return (
    <div>
      <div className={`status ${isConnected ? "connected" : "disconnected"}`}>
        {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
      </div>

      <div className="orders">
        {orders.map((order) => (
          <OrderCard
            key={order.orderId}
            order={order}
            onView={() =>
              socket?.emit("order:viewed", { orderId: order.orderId })
            }
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// NOTIFICATION HELPER FUNCTIONS
// ============================================================

function showNotification({
  title,
  message,
  color,
  sound,
  persistent = false,
}) {
  // Browser notification
  if (Notification.permission === "granted") {
    new Notification(title, {
      body: message,
      icon: "/icon.png",
      badge: "/badge.png",
    });
  }

  // In-app notification
  // Use your UI library (toast, snackbar, etc.)
  toast({
    title,
    message,
    color,
    duration: persistent ? 0 : 5000,
  });

  // Play sound
  if (sound) {
    playSound(sound);
  }
}

function playSound(filename) {
  const audio = new Audio(`/sounds/${filename}`);
  audio.play().catch((err) => console.log("Audio play failed:", err));
}

function vibrate() {
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

// ============================================================
// PRIORITY-BASED UI STYLING
// ============================================================

function getOrderCardStyle(priority) {
  switch (priority) {
    case "urgent":
      return {
        backgroundColor: "#fee",
        borderColor: "#f00",
        borderWidth: "3px",
        animation: "pulse 1s infinite",
      };
    case "high":
      return {
        backgroundColor: "#fff4e6",
        borderColor: "#ff9800",
        borderWidth: "2px",
      };
    case "normal":
    default:
      return {
        backgroundColor: "#f5f5f5",
        borderColor: "#2196f3",
        borderWidth: "1px",
      };
  }
}

// ============================================================
// MANAGER NOTIFICATIONS (Separate component/logic)
// ============================================================

function ManagerDashboard() {
  const managerId = "your-manager-id";

  useEffect(() => {
    const socket = io("http://localhost:8080", {
      auth: { token: managerToken },
    });

    socket.on("connect", () => {
      socket.emit("join:manager:orders", managerId);
      socket.emit("join:branch:orders", branchId);
    });

    // Listen for assignment confirmations
    socket.on("order:assignment:success", (data) => {
      console.log("Order assigned:", data);
      updateAssignmentStats(data);
    });

    // Listen for staff acknowledgments
    socket.on("order:acknowledged:notification", (data) => {
      console.log(`${data.staffName} acknowledged order ${data.orderId}`);
      markAsAcknowledged(data.orderId);
    });

    return () => socket.disconnect();
  }, [managerId]);
}

// ============================================================
// KEY SOCKET EVENTS REFERENCE
// ============================================================

/*
EMIT (Frontend → Backend):
- join:staff:orders(staffId)
- join:manager:orders(managerId)
- join:branch:orders(branchId)
- order:acknowledged({ orderId })
- order:viewed({ orderId })
- staff:availability:update({ isAvailable })
- leave:staff:orders(staffId)

LISTEN (Backend → Frontend):
- connect
- disconnect
- connect_error
- joined({ room, type, message })
- order:assigned({ orderId, tableNumber, items, priority, ... })
- order:from_queue({ ...same, queuePosition, urgent: true })
- order:manual_assigned({ ...same, reason })
- order:ack:confirmed({ orderId, acknowledgedAt })
- order:acknowledged:notification({ orderId, staffId, staffName }) [Manager only]
- order:assignment:success({ orderId, staffId, ... }) [Manager only]
- staff:availability:confirmed({ isAvailable, timestamp })
- error({ event, message })
*/

export default StaffOrderDashboard;
