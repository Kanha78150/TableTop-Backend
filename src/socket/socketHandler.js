// src/socket/socketHandler.js - Socket.IO Event Handlers for Order Assignments

import { Order } from "../models/Order.model.js";
import { logger } from "../utils/logger.js";
import {
  requireRole,
  requireOwnership,
} from "../middleware/socket.auth.middleware.js";

/**
 * Setup order assignment socket events
 * @param {Object} io - Socket.IO server instance
 */
export const setupOrderEvents = (io) => {
  io.on("connection", (socket) => {
    const userData = socket.data.user;

    if (!userData) {
      logger.warn(`Unauthenticated socket connection attempt: ${socket.id}`);
      socket.disconnect(true);
      return;
    }

    logger.info(
      `Socket connected for orders: ${socket.id} - ${userData.userModel} ${userData.name} (${userData.id})`
    );

    // ==================== JOIN ROOMS ====================

    /**
     * Staff joins their personal order notification room
     * Staff can ONLY join their own room (enforced by ownership check)
     */
    socket.on("join:staff:orders", (staffId) => {
      try {
        // Verify this is a staff member
        const roleCheck = requireRole(socket, ["staff", "waiter", "chef"]);
        if (!roleCheck.authorized) {
          logger.warn(
            `Unauthorized join:staff:orders attempt by ${userData.role} ${userData.id}`
          );
          socket.emit("action:error", {
            event: "join:staff:orders",
            message: roleCheck.error,
          });
          return;
        }

        // Verify staff can only join their own room
        const ownershipCheck = requireOwnership(socket, staffId);
        if (!ownershipCheck.authorized) {
          logger.warn(
            `Staff ${userData.id} attempted to join room for staff ${staffId}`
          );
          socket.emit("action:error", {
            event: "join:staff:orders",
            message: "Cannot join other staff member's room",
          });
          return;
        }

        socket.join(`staff_${staffId}`);
        console.log(`\n✅ ========== STAFF JOINED ORDERS ==========`);
        console.log(`👤 Staff ID: ${staffId}`);
        console.log(`👤 Staff Name: ${userData.name}`);
        console.log(`📍 Room: staff_${staffId}`);
        console.log(`🔌 Socket ID: ${socket.id}`);
        console.log(`✅ ========================================\n`);
        logger.info(
          `✅ Staff ${staffId} (${userData.name}) joined order notifications room`
        );
        socket.emit("joined", {
          room: `staff_${staffId}`,
          type: "orders",
          message: "Successfully joined order notifications",
        });
      } catch (error) {
        logger.error(`Error in join:staff:orders: ${error.message}`);
        socket.emit("action:error", {
          event: "join:staff:orders",
          message: "Failed to join room",
        });
      }
    });

    /**
     * Manager joins their branch/hotel order notification room
     */
    socket.on("join:manager:orders", (managerId) => {
      try {
        const roleCheck = requireRole(socket, ["manager", "branch_manager"]);
        if (!roleCheck.authorized) {
          socket.emit("action:error", {
            event: "join:manager:orders",
            message: roleCheck.error,
          });
          return;
        }

        const ownershipCheck = requireOwnership(socket, managerId);
        if (!ownershipCheck.authorized) {
          socket.emit("action:error", {
            event: "join:manager:orders",
            message: "Cannot join other manager's room",
          });
          return;
        }

        socket.join(`manager_${managerId}`);
        console.log(`\n✅ ========== MANAGER JOINED ORDERS ==========`);
        console.log(`👔 Manager ID: ${managerId}`);
        console.log(`👔 Manager Name: ${userData.name}`);
        console.log(`📍 Room: manager_${managerId}`);
        console.log(`🔌 Socket ID: ${socket.id}`);
        console.log(`✅ ==========================================\n`);
        logger.info(
          `✅ Manager ${managerId} (${userData.name}) joined order notifications room`
        );
        socket.emit("joined", {
          room: `manager_${managerId}`,
          type: "orders",
          message: "Successfully joined order notifications",
        });
      } catch (error) {
        logger.error(`Error in join:manager:orders: ${error.message}`);
        socket.emit("action:error", {
          event: "join:manager:orders",
          message: "Failed to join room",
        });
      }
    });

    /**
     * Join branch-wide order notifications
     */
    socket.on("join:branch:orders", (branchId) => {
      try {
        // Only managers and staff can join branch rooms
        const roleCheck = requireRole(socket, [
          "manager",
          "branch_manager",
          "staff",
          "waiter",
          "chef",
        ]);
        if (!roleCheck.authorized) {
          socket.emit("action:error", {
            event: "join:branch:orders",
            message: roleCheck.error,
          });
          return;
        }

        // Verify user belongs to this branch (convert both to strings for comparison)
        const userBranchStr = userData.branch?.toString();
        const branchIdStr = branchId?.toString();

        if (userBranchStr !== branchIdStr) {
          logger.warn(
            `User ${userData.id} attempted to join branch ${branchIdStr} but belongs to ${userBranchStr}`
          );
          socket.emit("action:error", {
            event: "join:branch:orders",
            message: "Cannot join other branch's room",
          });
          return;
        }

        socket.join(`branch_${branchId}`);
        logger.info(
          `${userData.userModel} ${userData.id} joined branch ${branchId} order notifications`
        );
        socket.emit("joined", {
          room: `branch_${branchId}`,
          type: "orders",
          message: "Successfully joined branch order notifications",
        });
      } catch (error) {
        logger.error(`Error in join:branch:orders: ${error.message}`);
        socket.emit("action:error", {
          event: "join:branch:orders",
          message: "Failed to join room",
        });
      }
    });

    // ==================== ORDER ACKNOWLEDGMENT ====================

    /**
     * Staff acknowledges they received and saw the order assignment
     * Updates order with acknowledgment timestamp
     */
    socket.on("order:acknowledged", async (data) => {
      try {
        const { orderId } = data;

        if (!orderId) {
          socket.emit("action:error", {
            event: "order:acknowledged",
            message: "Order ID is required",
          });
          return;
        }

        // Verify this is a staff member
        const roleCheck = requireRole(socket, ["staff", "waiter", "chef"]);
        if (!roleCheck.authorized) {
          socket.emit("action:error", {
            event: "order:acknowledged",
            message: roleCheck.error,
          });
          return;
        }

        // Find order and verify it's assigned to this staff member
        const order = await Order.findById(orderId);
        if (!order) {
          socket.emit("action:error", {
            event: "order:acknowledged",
            message: "Order not found",
          });
          return;
        }

        if (order.staff?.toString() !== userData.id) {
          logger.warn(
            `Staff ${userData.id} attempted to acknowledge order ${orderId} assigned to ${order.staff}`
          );
          socket.emit("action:error", {
            event: "order:acknowledged",
            message:
              "Cannot acknowledge order assigned to another staff member",
          });
          return;
        }

        // Update order with acknowledgment
        order.acknowledgedAt = new Date();
        order.acknowledgedBy = userData.id;
        await order.save();

        logger.info(
          `Order ${orderId} acknowledged by staff ${userData.id} (${userData.name})`
        );

        // Confirm acknowledgment to staff
        socket.emit("order:ack:confirmed", {
          orderId: orderId,
          acknowledgedAt: order.acknowledgedAt,
          message: "Order acknowledgment recorded",
        });

        // Notify manager that staff acknowledged the order
        if (userData.manager) {
          io.to(`manager_${userData.manager}`).emit(
            "order:acknowledged:notification",
            {
              orderId: orderId,
              staffId: userData.id,
              staffName: userData.name,
              acknowledgedAt: order.acknowledgedAt,
            }
          );
        }
      } catch (error) {
        logger.error(`Error in order:acknowledged: ${error.message}`, {
          orderId: data?.orderId,
          staffId: userData.id,
          error: error.stack,
        });
        socket.emit("action:error", {
          event: "order:acknowledged",
          message: "Failed to record acknowledgment",
        });
      }
    });

    // ==================== ORDER VIEWED ====================

    /**
     * Staff viewed order details (for analytics)
     */
    socket.on("order:viewed", async (data) => {
      try {
        const { orderId } = data;

        if (!orderId) {
          return; // Silent fail for analytics event
        }

        const roleCheck = requireRole(socket, [
          "staff",
          "waiter",
          "chef",
          "manager",
        ]);
        if (!roleCheck.authorized) {
          return; // Silent fail
        }

        // Update order viewed timestamp
        const order = await Order.findById(orderId);
        if (order && order.staff?.toString() === userData.id) {
          order.viewedAt = new Date();
          await order.save();

          logger.info(
            `Order ${orderId} viewed by staff ${userData.id} (${userData.name})`
          );
        }
      } catch (error) {
        logger.error(`Error in order:viewed: ${error.message}`, {
          orderId: data?.orderId,
          staffId: userData.id,
        });
        // Silent fail - this is analytics only
      }
    });

    // ==================== STAFF AVAILABILITY ====================

    /**
     * Staff updates their availability status
     */
    socket.on("staff:availability:update", async (data) => {
      try {
        const { isAvailable } = data;

        const roleCheck = requireRole(socket, ["staff", "waiter", "chef"]);
        if (!roleCheck.authorized) {
          socket.emit("action:error", {
            event: "staff:availability:update",
            message: roleCheck.error,
          });
          return;
        }

        // Update staff availability (this would update Staff model)
        logger.info(
          `Staff ${userData.id} updated availability to ${isAvailable}`
        );

        // Notify manager of availability change
        if (userData.manager) {
          io.to(`manager_${userData.manager}`).emit(
            "staff:availability:changed",
            {
              staffId: userData.id,
              staffName: userData.name,
              isAvailable: isAvailable,
              timestamp: new Date(),
            }
          );
        }

        socket.emit("staff:availability:confirmed", {
          isAvailable: isAvailable,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error(`Error in staff:availability:update: ${error.message}`);
        socket.emit("action:error", {
          event: "staff:availability:update",
          message: "Failed to update availability",
        });
      }
    });

    // ==================== LEAVE ROOMS ====================

    socket.on("leave:staff:orders", (staffId) => {
      socket.leave(`staff_${staffId}`);
      logger.info(`Staff ${staffId} left order notifications room`);
    });

    socket.on("leave:manager:orders", (managerId) => {
      socket.leave(`manager_${managerId}`);
      logger.info(`Manager ${managerId} left order notifications room`);
    });

    socket.on("leave:branch:orders", (branchId) => {
      socket.leave(`branch_${branchId}`);
      logger.info(
        `${userData.userModel} ${userData.id} left branch ${branchId} order notifications`
      );
    });

    // ==================== DISCONNECTION ====================

    socket.on("disconnect", () => {
      logger.info(
        `Socket disconnected from orders: ${socket.id} - ${userData.userModel} ${userData.name}`
      );
    });
  });
};

export default setupOrderEvents;
