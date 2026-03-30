// src/services/staffDeactivation.service.js - Staff Deactivation Side-Effects Service

import { Order } from "../models/Order.model.js";
import { Staff } from "../models/Staff.model.js";
import { logger } from "../utils/logger.js";
import { getIO, isIOInitialized } from "../utils/socketService.js";

/**
 * Handle all side effects when a staff member is deactivated.
 * Called from admin, manager, and self-deactivation flows.
 *
 * @param {Object} staff - The staff document being deactivated
 * @param {Object} options
 * @param {String} options.deactivatedBy - "self" | "admin" | "manager"
 * @param {String} [options.deactivatedById] - ID of admin/manager who performed deactivation
 * @param {String} [options.reason] - Reason for deactivation
 * @returns {Object} Summary of side-effect results
 */
export const handleDeactivationSideEffects = async (staff, options = {}) => {
  const { deactivatedBy = "self", deactivatedById = null, reason = null } = options;
  const results = {
    ordersReassigned: 0,
    ordersUnassigned: 0,
    socketDisconnected: false,
    staffNotified: false,
    managerNotified: false,
  };

  try {
    // 1. Reassign or unassign active orders
    const orderResult = await handleActiveOrders(staff);
    results.ordersReassigned = orderResult.reassigned;
    results.ordersUnassigned = orderResult.unassigned;

    // 2. Force-disconnect active sockets
    results.socketDisconnected = await forceDisconnectStaff(staff._id, {
      reason: reason || `Account deactivated by ${deactivatedBy}`,
    });

    // 3. Notify the staff member about deactivation
    if (deactivatedBy !== "self") {
      results.staffNotified = await notifyStaffDeactivated(staff, {
        deactivatedBy,
        deactivatedById,
        reason,
      });
    }

    // 4. Notify manager when staff self-deactivates
    if (deactivatedBy === "self" && staff.manager) {
      results.managerNotified = await notifyManagerStaffDeactivated(staff);
    }

    // 5. Sync isAvailable, reset activeOrdersCount, invalidate sessions
    await Staff.findByIdAndUpdate(staff._id, {
      isAvailable: false,
      activeOrdersCount: 0,
      refreshToken: null,
      $inc: { tokenVersion: 1 },
    });

    // 6. Record status change in audit trail
    await Staff.findByIdAndUpdate(staff._id, {
      $push: {
        statusChangeHistory: {
          fromStatus: staff.status === "inactive" ? staff.status : "active", // status was already changed before this call
          toStatus: "inactive",
          changedBy: deactivatedBy,
          changedById: deactivatedById || staff._id,
          changedByModel:
            deactivatedBy === "admin"
              ? "Admin"
              : deactivatedBy === "manager"
                ? "Manager"
                : "Staff",
          reason: reason || `Deactivated by ${deactivatedBy}`,
          changedAt: new Date(),
        },
      },
    });

    logger.info(
      `Deactivation side effects completed for staff ${staff._id}: ${JSON.stringify(results)}`
    );
  } catch (error) {
    logger.error(
      `Error handling deactivation side effects for staff ${staff._id}:`,
      error
    );
    // Don't throw - side-effect failures shouldn't block deactivation
  }

  return results;
};

/**
 * Reassign or unassign active orders from the deactivated staff.
 * Tries to auto-assign to another available waiter in the same branch.
 * If no one is available, unassigns the order so it can be picked up.
 */
async function handleActiveOrders(staff) {
  const result = { reassigned: 0, unassigned: 0 };

  if (staff.role !== "waiter") return result;

  // Find all active orders assigned to this staff
  const activeOrders = await Order.find({
    staff: staff._id,
    status: { $in: ["pending", "confirmed", "preparing", "ready"] },
  });

  if (activeOrders.length === 0) return result;

  logger.info(
    `Staff ${staff._id} has ${activeOrders.length} active orders to handle on deactivation`
  );

  // Find another available waiter in the same branch
  const availableWaiter = await Staff.findOne({
    _id: { $ne: staff._id },
    hotel: staff.hotel,
    branch: staff.branch,
    role: "waiter",
    status: "active",
    isAvailable: true,
  }).lean();

  for (const order of activeOrders) {
    try {
      if (availableWaiter) {
        // Reassign to available waiter
        await Order.findByIdAndUpdate(order._id, {
          staff: availableWaiter._id,
          $push: {
            assignmentHistory: {
              waiter: availableWaiter._id,
              assignedAt: new Date(),
              method: "auto-reassign",
              reason: `Reassigned from deactivated staff ${staff.staffId || staff._id}`,
            },
          },
        });

        // Increment the new waiter's active order count
        await Staff.findByIdAndUpdate(availableWaiter._id, {
          $inc: { activeOrdersCount: 1 },
        });

        // Notify the new waiter via socket
        if (isIOInitialized()) {
          const io = getIO();
          io.to(`staff_${availableWaiter._id}`).emit("order:reassigned", {
            orderId: order._id.toString(),
            message: "Order reassigned to you due to staff deactivation",
            priority: "high",
          });
        }

        result.reassigned++;
      } else {
        // No waiter available - unassign so it goes back to the pool
        await Order.findByIdAndUpdate(order._id, {
          $unset: { staff: 1 },
          $push: {
            assignmentHistory: {
              waiter: staff._id,
              assignedAt: new Date(),
              method: "unassigned",
              reason: `Unassigned due to staff deactivation. No available waiter for reassignment.`,
            },
          },
        });
        result.unassigned++;
      }
    } catch (error) {
      logger.error(
        `Failed to handle order ${order._id} during staff deactivation:`,
        error
      );
    }
  }

  // Notify manager about order reassignment
  if (isIOInitialized() && staff.manager) {
    const io = getIO();
    io.to(`manager_${staff.manager}`).emit("staff:orders_reassigned", {
      staffId: staff._id.toString(),
      staffName: staff.name,
      ordersReassigned: result.reassigned,
      ordersUnassigned: result.unassigned,
      reassignedTo: availableWaiter
        ? { id: availableWaiter._id.toString(), name: availableWaiter.name }
        : null,
    });
  }

  return result;
}

/**
 * Force-disconnect all active socket connections for a staff member.
 */
async function forceDisconnectStaff(staffId, { reason }) {
  try {
    if (!isIOInitialized()) return false;

    const io = getIO();
    const staffRoom = `staff_${staffId}`;

    // Notify before disconnecting
    io.to(staffRoom).emit("account:deactivated", {
      message: reason,
      action: "force_disconnect",
    });

    // Get all sockets in the staff's room and disconnect them
    const sockets = await io.in(staffRoom).fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }

    logger.info(
      `Force-disconnected ${sockets.length} socket(s) for staff ${staffId}`
    );
    return sockets.length > 0;
  } catch (error) {
    logger.error(`Failed to force-disconnect staff ${staffId}:`, error);
    return false;
  }
}

/**
 * Notify staff member that their account was deactivated by admin/manager.
 */
async function notifyStaffDeactivated(staff, { deactivatedBy, deactivatedById, reason }) {
  try {
    if (!isIOInitialized()) return false;

    const io = getIO();
    const staffRoom = `staff_${staff._id}`;

    io.to(staffRoom).emit("account:deactivated", {
      message: `Your account has been deactivated by ${deactivatedBy}`,
      reason: reason || "No reason provided",
      deactivatedBy,
      deactivatedAt: new Date(),
    });

    logger.info(
      `Deactivation notification sent to staff ${staff._id}`
    );
    return true;
  } catch (error) {
    logger.error(`Failed to notify staff ${staff._id} of deactivation:`, error);
    return false;
  }
}

/**
 * Notify manager when a staff member self-deactivates.
 */
async function notifyManagerStaffDeactivated(staff) {
  try {
    if (!isIOInitialized()) return false;

    const io = getIO();
    const managerRoom = `manager_${staff.manager}`;

    io.to(managerRoom).emit("staff:self_deactivated", {
      staffId: staff._id.toString(),
      staffName: staff.name,
      staffRole: staff.role,
      branch: staff.branch?.toString(),
      deactivatedAt: new Date(),
      message: `Staff member ${staff.name} (${staff.role}) has self-deactivated their account`,
    });

    logger.info(
      `Manager ${staff.manager} notified of staff ${staff._id} self-deactivation`
    );
    return true;
  } catch (error) {
    logger.error(
      `Failed to notify manager of staff ${staff._id} self-deactivation:`,
      error
    );
    return false;
  }
}
