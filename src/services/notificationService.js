// src/services/notificationService.js - Notification Service for Complaints

import { logger } from "../utils/logger.js";

// TODO: Import email service when ready
// import { sendEmail } from "../utils/emailService.js";

// Socket.io instance will be set from server.js
let io = null;

export const setSocketIO = (socketInstance) => {
  io = socketInstance;
  logger.info("Socket.IO instance set for notification service");
};

/**
 * Notify manager of new complaint
 * @param {Object} complaint - The complaint object
 * @param {Object} manager - The manager object
 */
export const notifyManagerNewComplaint = async (complaint, manager) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      title: complaint.title,
      category: complaint.category,
      priority: complaint.priority,
      user: {
        name: complaint.user?.name,
        phone: complaint.user?.phone,
      },
      createdAt: complaint.createdAt,
      message: `New ${complaint.priority} priority complaint submitted`,
    };

    // Socket notification to manager
    if (io) {
      io.to(`manager_${manager._id}`).emit("complaint:new", notificationData);
      io.to(`branch_${complaint.branch}`).emit(
        "complaint:new",
        notificationData
      );
      logger.info(
        `Socket notification sent to manager ${manager._id} for new complaint ${complaint.complaintId}`
      );
    }

    // TODO: Email notification (Phase 7 enhancement)
    // const emailHtml = getNewComplaintEmailHtml(complaint, manager);
    // await sendEmail({
    //   to: manager.email,
    //   subject: `New ${complaint.priority} Priority Complaint - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(
      `Manager ${manager._id} notified of new complaint ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying manager of new complaint:", error);
    // Don't throw - notification failure shouldn't block complaint creation
  }
};

/**
 * Notify staff of complaint assignment
 * @param {Object} complaint - The complaint object
 * @param {String} staffId - The staff member ID
 */
export const notifyStaffComplaintAssigned = async (complaint, staffId) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      title: complaint.title,
      priority: complaint.priority,
      category: complaint.category,
      assignedAt: new Date(),
      message: "New complaint assigned for your awareness (view-only)",
      readOnly: true,
    };

    // Socket notification to staff
    if (io) {
      io.to(`staff_${staffId}`).emit("complaint:assigned", notificationData);
      logger.info(
        `Socket notification sent to staff ${staffId} for complaint assignment ${complaint.complaintId}`
      );
    }

    // TODO: Email notification
    // const staff = await Staff.findById(staffId);
    // const emailHtml = getStaffAssignmentEmailHtml(complaint, staff);
    // await sendEmail({
    //   to: staff.email,
    //   subject: `Complaint Assigned for Your Awareness - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(
      `Staff ${staffId} notified of complaint assignment ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying staff of assignment:", error);
  }
};

/**
 * Notify staff of complaint update by manager/admin
 * @param {Object} complaint - The complaint object
 * @param {Object} updatedBy - The user who made the update
 * @param {String} updateType - Type of update (status_changed, response_added, resolved)
 */
export const notifyStaffComplaintUpdated = async (
  complaint,
  updatedBy,
  updateType
) => {
  try {
    if (!complaint.assignedTo) return;

    const updateMessages = {
      status_changed: `Status updated to "${complaint.status}"`,
      response_added: "New response added",
      resolved: "Complaint has been resolved",
      escalated: "Complaint has been escalated",
    };

    const notificationData = {
      complaintId: complaint.complaintId,
      updateType,
      updatedBy: updatedBy.name || "Manager",
      updatedByRole: updatedBy.role || "manager",
      message: updateMessages[updateType],
      newStatus: complaint.status,
      timestamp: new Date(),
    };

    // Socket notification to assigned staff
    if (io) {
      io.to(`staff_${complaint.assignedTo}`).emit(
        "complaint:updated",
        notificationData
      );
      logger.info(
        `Socket notification sent to staff ${complaint.assignedTo} for complaint update ${complaint.complaintId}`
      );
    }

    // TODO: Email notification (batched - sent once daily)
    // Can implement email digest for all updates

    logger.info(
      `Staff ${complaint.assignedTo} notified of complaint update ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying staff of update:", error);
  }
};

/**
 * Notify staff when complaint is reassigned
 * @param {Object} complaint - The complaint object
 * @param {String} staffId - The staff member ID (old or new)
 * @param {String} action - "removed" or "assigned"
 */
export const notifyStaffComplaintReassigned = async (
  complaint,
  staffId,
  action
) => {
  try {
    const message =
      action === "removed"
        ? "Complaint has been reassigned to another staff member"
        : "Complaint has been reassigned to you";

    const notificationData = {
      complaintId: complaint.complaintId,
      action,
      message,
      timestamp: new Date(),
    };

    // Socket notification
    if (io) {
      io.to(`staff_${staffId}`).emit("complaint:reassigned", notificationData);
      logger.info(
        `Socket notification sent to staff ${staffId} for complaint reassignment ${complaint.complaintId}`
      );
    }

    logger.info(
      `Staff ${staffId} notified of complaint reassignment ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying staff of reassignment:", error);
  }
};

/**
 * Notify user of complaint response
 * @param {Object} complaint - The complaint object
 * @param {Object} response - The response object
 * @param {Object} user - The user object
 */
export const notifyUserComplaintResponse = async (
  complaint,
  response,
  user
) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      message: response.message,
      respondedBy: response.respondedBy.userType,
      respondedAt: response.respondedAt,
    };

    // Socket notification to user
    if (io) {
      io.to(`user_${user._id}`).emit("complaint:response", notificationData);
      logger.info(
        `Socket notification sent to user ${user._id} for complaint response ${complaint.complaintId}`
      );
    }

    // TODO: Email notification
    // const emailHtml = getComplaintResponseEmailHtml(complaint, response, user);
    // await sendEmail({
    //   to: user.email,
    //   subject: `Response to Your Complaint - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(
      `User ${user._id} notified of complaint response ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying user of response:", error);
  }
};

/**
 * Notify user when complaint is resolved
 * @param {Object} complaint - The complaint object
 * @param {Object} user - The user object
 */
export const notifyUserComplaintResolved = async (complaint, user) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      resolution: complaint.resolution,
      resolvedBy: complaint.resolvedBy,
      resolvedAt: complaint.resolvedAt,
      coinCompensation: complaint.coinCompensation,
      message: "Your complaint has been resolved",
    };

    // Socket notification to user
    if (io) {
      io.to(`user_${user._id}`).emit("complaint:resolved", notificationData);
      logger.info(
        `Socket notification sent to user ${user._id} for complaint resolution ${complaint.complaintId}`
      );
    }

    // TODO: Email notification with rating request
    // const emailHtml = getComplaintResolvedEmailHtml(complaint, user);
    // await sendEmail({
    //   to: user.email,
    //   subject: `Your Complaint Has Been Resolved - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(
      `User ${user._id} notified of complaint resolution ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying user of resolution:", error);
  }
};

/**
 * Notify user of complaint status update
 * @param {Object} complaint - The complaint object
 * @param {String} status - The new status
 */
export const notifyUserComplaintUpdated = async (complaint, status) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      oldStatus:
        complaint.statusHistory[complaint.statusHistory.length - 2]?.status,
      newStatus: status,
      message: `Your complaint status has been updated to ${status}`,
      timestamp: new Date(),
    };

    // Socket notification to user
    if (io) {
      io.to(`user_${complaint.user}`).emit(
        "complaint:status_updated",
        notificationData
      );
      logger.info(
        `Socket notification sent to user ${complaint.user} for status update ${complaint.complaintId}`
      );
    }

    logger.info(
      `User ${complaint.user} notified of complaint status update ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying user of status update:", error);
  }
};

/**
 * Notify management of complaint escalation
 * @param {Object} complaint - The complaint object
 * @param {Object} manager - The manager object
 */
export const notifyManagementComplaintEscalated = async (
  complaint,
  manager
) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      title: complaint.title,
      priority: complaint.priority,
      escalatedAt: complaint.escalatedAt,
      escalationReason: complaint.escalationReason,
      daysPending: Math.floor(
        (new Date() - complaint.createdAt) / (1000 * 60 * 60 * 24)
      ),
      message: "URGENT: Complaint has been escalated",
    };

    // Socket notification to managers and admins
    if (io) {
      io.to(`branch_${complaint.branch}`).emit(
        "complaint:escalated",
        notificationData
      );
      io.to(`hotel_${complaint.hotel}`).emit(
        "complaint:escalated",
        notificationData
      );
      logger.info(
        `Socket notification sent for complaint escalation ${complaint.complaintId}`
      );
    }

    // Also notify assigned staff
    if (complaint.assignedTo) {
      io.to(`staff_${complaint.assignedTo}`).emit(
        "complaint:escalated",
        notificationData
      );
    }

    // TODO: Email notification to management
    // const emailHtml = getComplaintEscalatedEmailHtml(complaint, manager);
    // await sendEmail({
    //   to: manager.email,
    //   subject: `URGENT: Complaint Escalated - ${complaint.complaintId}`,
    //   html: emailHtml,
    //   priority: 'high',
    // });

    logger.info(
      `Management notified of complaint escalation ${complaint.complaintId}`
    );
  } catch (error) {
    logger.error("Error notifying management of escalation:", error);
  }
};

/**
 * Notify user when they add a follow-up message
 * @param {Object} complaint - The complaint object
 */
export const notifyManagerUserFollowUp = async (complaint) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      title: complaint.title,
      message: "Customer added a follow-up message",
      timestamp: new Date(),
    };

    // Notify manager and assigned staff
    if (io) {
      io.to(`branch_${complaint.branch}`).emit(
        "complaint:followup",
        notificationData
      );

      if (complaint.assignedTo) {
        io.to(`staff_${complaint.assignedTo}`).emit(
          "complaint:followup",
          notificationData
        );
      }

      logger.info(
        `Manager and staff notified of user follow-up ${complaint.complaintId}`
      );
    }
  } catch (error) {
    logger.error("Error notifying of user follow-up:", error);
  }
};

// ==================== ORDER ASSIGNMENT NOTIFICATIONS ====================

/**
 * Notify staff when order is assigned (automatic assignment)
 * @param {Object} order - Populated order object
 * @param {Object} staff - Staff member object
 * @param {String} assignmentMethod - 'automatic' | 'load-balancing' | 'round-robin' | 'manual'
 * @param {String} reason - Optional reason for manual assignments
 */
export const notifyStaffOrderAssigned = async (
  order,
  staff,
  assignmentMethod = "automatic",
  reason = undefined
) => {
  try {
    if (!io) {
      logger.warn(
        "Socket.IO not initialized, skipping order assignment notification"
      );
      return;
    }

    // Determine priority based on assignment method
    let priority = "normal";
    if (assignmentMethod === "queue") {
      priority = "high";
    }

    // Build notification payload
    const notificationData = {
      orderId: order._id.toString(),
      orderNumber:
        order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
      tableNumber: order.tableNumber || order.table?.tableNumber || "N/A",
      totalPrice: order.totalPrice,
      itemCount: order.items?.length || 0,
      items:
        order.items?.map((item) => ({
          name: item.foodItemName || item.foodItem?.name,
          quantity: item.quantity,
          price: item.price,
        })) || [],
      specialInstructions: order.specialInstructions || "",
      assignmentMethod: assignmentMethod,
      priority: priority,
      assignedAt: new Date(),
      estimatedTime: order.estimatedTime,
      hotel: order.hotel,
      branch: order.branch,
      ...(reason && { reason: reason }), // Include reason for manual assignments
    };

    // Emit to staff's personal room
    const staffIdString = staff._id?.toString() || staff.toString();
    const roomName = `staff_${staffIdString}`;

    console.log(`\n🔔 ========== ORDER NOTIFICATION ==========`);
    console.log(`📤 Emitting event: order:assigned`);
    console.log(`📍 To room: ${roomName}`);
    console.log(`👤 Staff: ${staff.name} (${staffIdString})`);
    console.log(`📦 Order: ${order._id}`);
    console.log(`⚡ Priority: ${priority}`);
    console.log(`🔔 =========================================\n`);

    io.to(roomName).emit("order:assigned", notificationData);

    logger.info(
      `✅ Order assignment notification emitted to ${roomName} - Order: ${order._id}, Priority: ${priority}`
    );

    // Update order with notification timestamp
    await import("../models/Order.model.js").then(({ Order }) => {
      Order.findByIdAndUpdate(order._id, {
        notificationSentAt: new Date(),
        priority: priority,
      })
        .exec()
        .catch((err) =>
          logger.error("Failed to update order notification timestamp:", err)
        );
    });

    return { success: true, notificationSent: true };
  } catch (error) {
    logger.error("Error notifying staff of order assignment:", {
      error: error.message,
      orderId: order?._id,
      staffId: staff?._id,
      stack: error.stack,
    });
    // Don't throw - notification failure shouldn't break assignment
    return { success: false, error: error.message };
  }
};

/**
 * Notify staff when order is assigned from queue (higher priority)
 * @param {Object} order - Populated order object
 * @param {Object} staff - Staff member object
 * @param {Number} queuePosition - Position in queue before assignment
 */
export const notifyStaffOrderFromQueue = async (
  order,
  staff,
  queuePosition = null
) => {
  try {
    if (!io) {
      logger.warn(
        "Socket.IO not initialized, skipping queue order notification"
      );
      return;
    }

    // Queue assignments are HIGH priority
    const priority = "high";

    const notificationData = {
      orderId: order._id.toString(),
      orderNumber:
        order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
      tableNumber: order.tableNumber || order.table?.tableNumber || "N/A",
      totalPrice: order.totalPrice,
      itemCount: order.items?.length || 0,
      items:
        order.items?.map((item) => ({
          name: item.foodItemName || item.foodItem?.name,
          quantity: item.quantity,
          price: item.price,
        })) || [],
      specialInstructions: order.specialInstructions || "",
      assignmentMethod: "queue",
      priority: priority,
      assignedAt: new Date(),
      estimatedTime: order.estimatedTime,
      queuePosition: queuePosition,
      queuedDuration: order.queuedAt
        ? Math.round((Date.now() - new Date(order.queuedAt).getTime()) / 60000)
        : null, // Duration in minutes
      hotel: order.hotel,
      branch: order.branch,
      urgent: true, // Flag for special UI treatment
    };

    // Emit to staff's personal room
    const staffIdString = staff._id?.toString() || staff.toString();
    const roomName = `staff_${staffIdString}`;

    console.log(`\n⚡ ========== QUEUE ORDER NOTIFICATION ==========`);
    console.log(`📤 Emitting event: order:from_queue`);
    console.log(`📍 To room: ${roomName}`);
    console.log(`👤 Staff: ${staff.name} (${staffIdString})`);
    console.log(`📦 Order: ${order._id}`);
    console.log(`⏰ Queue duration: ${notificationData.queuedDuration} min`);
    console.log(`⚡ ===============================================\n`);

    io.to(roomName).emit("order:from_queue", notificationData);

    logger.info(
      `HIGH PRIORITY queue order notification sent to staff ${staff._id} (${staff.name}) - Order: ${order._id}, Queue position: ${queuePosition}`
    );

    // Update order with notification timestamp and priority
    await import("../models/Order.model.js").then(({ Order }) => {
      Order.findByIdAndUpdate(order._id, {
        notificationSentAt: new Date(),
        priority: priority,
      })
        .exec()
        .catch((err) =>
          logger.error("Failed to update order notification timestamp:", err)
        );
    });

    return { success: true, notificationSent: true, priority };
  } catch (error) {
    logger.error("Error notifying staff of queue order assignment:", {
      error: error.message,
      orderId: order?._id,
      staffId: staff?._id,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Notify manager when order is assigned (for oversight)
 * @param {Object} order - Populated order object
 * @param {String|Object} managerId - Manager ID (string, ObjectId, or populated object)
 * @param {Object} assignmentDetails - Details about the assignment
 */
export const notifyManagerOrderAssigned = async (
  order,
  managerId,
  assignmentDetails = {}
) => {
  try {
    if (!io) {
      logger.warn("Socket.IO not initialized, skipping manager notification");
      return;
    }

    // Handle managerId being an object, ObjectId, or string
    const managerIdString =
      managerId?._id?.toString() || managerId?.toString() || managerId;

    if (!managerIdString) {
      logger.warn(
        "No valid manager ID provided for order assignment notification"
      );
      return { success: false, error: "Invalid manager ID" };
    }

    const {
      staff,
      assignmentMethod = "automatic",
      isManualAssignment = false,
      reason = null,
    } = assignmentDetails;

    // Handle staff ID being an object or ObjectId
    const staffIdString = staff?._id?.toString() || order.staff?.toString();
    const staffNameString = staff?.name || "Unknown";

    const notificationData = {
      orderId: order._id.toString(),
      orderNumber:
        order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
      tableNumber: order.tableNumber || order.table?.tableNumber || "N/A",
      totalPrice: order.totalPrice,
      itemCount: order.items?.length || 0,
      staffId: staffIdString,
      staffName: staffNameString,
      assignmentMethod: assignmentMethod,
      isManualAssignment: isManualAssignment,
      reason: reason,
      assignedAt: new Date(),
      priority: order.priority || "normal",
      hotel: order.hotel?.toString() || order.hotel,
      branch: order.branch?.toString() || order.branch,
    };

    // Emit to manager's personal room
    io.to(`manager_${managerIdString}`).emit(
      "order:assignment:success",
      notificationData
    );

    logger.info(
      `✅ Order assignment notification emitted to manager_${managerIdString} room`
    );

    // Also emit to branch room if branch exists
    const branchIdString =
      order.branch?._id?.toString() || order.branch?.toString();
    if (branchIdString) {
      io.to(`branch_${branchIdString}`).emit(
        "order:assignment:branch",
        notificationData
      );
      logger.info(
        `✅ Order assignment notification also emitted to branch_${branchIdString} room`
      );
    }

    logger.info(
      `Order assignment notification sent to manager ${managerIdString} - Order: ${order._id}, Staff: ${staffIdString}`
    );

    return { success: true, notificationSent: true };
  } catch (error) {
    logger.error("Error notifying manager of order assignment:", {
      error: error.message,
      orderId: order?._id,
      managerId: managerId,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
};

// ==================== PAYMENT CONFIGURATION NOTIFICATIONS ====================

/**
 * Notify Super Admins when production config needs activation
 */
export const notifyPendingActivation = async ({
  hotel,
  paymentConfig,
  provider,
  admin,
}) => {
  try {
    const { Admin } = await import("../models/Admin.model.js");
    const { Hotel } = await import("../models/Hotel.model.js");

    // Get all super admins
    const superAdmins = await Admin.find({ role: "super_admin" });
    const hotelData = await Hotel.findById(hotel);

    for (const superAdmin of superAdmins) {
      // Socket notification
      if (io) {
        io.to(`admin_${superAdmin._id}`).emit("payment:pending_activation", {
          hotelId: hotel,
          hotelName: hotelData?.name,
          provider: provider.toUpperCase(),
          adminName: admin.name,
          adminEmail: admin.email,
          configId: paymentConfig._id,
          message: `Production ${provider.toUpperCase()} gateway requires activation`,
          priority: "high",
          actionUrl: `/api/v1/payment-config/${hotel}/activate`,
        });
        logger.info(
          `Socket notification sent to super admin ${superAdmin._id} for pending activation`
        );
      }

      // TODO: Queue email (requires general email service, not EmailQueue which is invoice-only)
      // When implementing, use a general email service:
      // await sendEmail({
      //   to: superAdmin.email,
      //   subject: `🔔 Action Required: Production Payment Gateway Activation - ${hotelData?.name}`,
      //   html: emailTemplate
      // });
    }

    logger.info(
      `✅ Pending activation notifications sent to ${superAdmins.length} super admins (Socket.IO)`
    );
  } catch (error) {
    logger.error("Failed to send pending activation notifications:", error);
  }
};

/**
 * Notify admin when production config is activated
 */
export const notifyActivated = async ({
  hotel,
  paymentConfig,
  provider,
  admin,
  activatedBy,
}) => {
  try {
    const { Hotel } = await import("../models/Hotel.model.js");

    const hotelData = await Hotel.findById(hotel);

    // Socket notification
    if (io) {
      io.to(`admin_${admin._id}`).emit("payment:activated", {
        hotelId: hotel,
        hotelName: hotelData?.name,
        provider: provider.toUpperCase(),
        activatedBy: activatedBy.name,
        configId: paymentConfig._id,
        message: `${provider.toUpperCase()} production gateway is now ACTIVE`,
        priority: "high",
      });
      logger.info(
        `Socket notification sent to admin ${admin._id} for activation`
      );
    }

    // TODO: Queue email (requires general email service)
    // await sendEmail({
    //   to: admin.email,
    //   subject: `✅ ${provider.toUpperCase()} Production Gateway Activated - ${hotelData?.name}`,
    //   html: emailTemplate
    // });

    logger.info(
      `✅ Activation notification sent to admin ${admin.email} (Socket.IO)`
    );
  } catch (error) {
    logger.error("Failed to send activation notification:", error);
  }
};

/**
 * Notify admin when config is deactivated
 */
export const notifyDeactivated = async ({
  hotel,
  paymentConfig,
  provider,
  admin,
  deactivatedBy,
  reason,
}) => {
  try {
    const { Hotel } = await import("../models/Hotel.model.js");

    const hotelData = await Hotel.findById(hotel);

    // Socket notification
    if (io) {
      io.to(`admin_${admin._id}`).emit("payment:deactivated", {
        hotelId: hotel,
        hotelName: hotelData?.name,
        provider: provider.toUpperCase(),
        deactivatedBy: deactivatedBy.name,
        reason: reason || "No reason provided",
        configId: paymentConfig._id,
        message: `${provider.toUpperCase()} gateway has been DEACTIVATED`,
        priority: "urgent",
      });
      logger.info(
        `Socket notification sent to admin ${admin._id} for deactivation`
      );
    }

    // TODO: Queue email (requires general email service)
    // await sendEmail({
    //   to: admin.email,
    //   subject: `⚠️ ${provider.toUpperCase()} Production Gateway Deactivated - ${hotelData?.name}`,
    //   html: emailTemplate
    // });

    logger.info(
      `✅ Deactivation notification sent to admin ${admin.email} (Socket.IO)`
    );
  } catch (error) {
    logger.error("Failed to send deactivation notification:", error);
  }
};

/**
 * Notify Super Admins when admin requests deactivation
 */
export const notifyDeactivationRequest = async ({
  hotel,
  paymentConfig,
  provider,
  admin,
  reason,
}) => {
  try {
    const { Admin } = await import("../models/Admin.model.js");
    const { Hotel } = await import("../models/Hotel.model.js");

    // Get all super admins
    const superAdmins = await Admin.find({ role: "super_admin" });
    const hotelData = await Hotel.findById(hotel);

    for (const superAdmin of superAdmins) {
      // Socket notification
      if (io) {
        io.to(`admin_${superAdmin._id}`).emit("payment:deactivation_request", {
          hotelId: hotel,
          hotelName: hotelData?.name,
          provider: provider.toUpperCase(),
          adminName: admin.name,
          adminEmail: admin.email,
          reason: reason,
          configId: paymentConfig._id,
          message: `Admin requests deactivation of ${provider.toUpperCase()} gateway`,
          priority: "high",
          actionUrl: `/api/v1/payment-config/${hotel}/deactivate`,
        });
        logger.info(
          `Socket notification sent to super admin ${superAdmin._id} for deactivation request`
        );
      }

      // TODO: Queue email
      // await sendEmail({
      //   to: superAdmin.email,
      //   subject: `🔔 Deactivation Request: ${hotelData?.name} - ${provider.toUpperCase()}`,
      //   html: emailTemplate
      // });
    }

    logger.info(
      `✅ Deactivation request notifications sent to ${superAdmins.length} super admins (Socket.IO)`
    );
  } catch (error) {
    logger.error("Failed to send deactivation request notifications:", error);
  }
};

// ==================== EXPORTS ====================

export default {
  setSocketIO,
  notifyManagerNewComplaint,
  notifyStaffComplaintAssigned,
  notifyStaffComplaintUpdated,
  notifyStaffComplaintReassigned,
  notifyUserComplaintResponse,
  notifyUserComplaintResolved,
  notifyUserComplaintUpdated,
  notifyManagementComplaintEscalated,
  notifyManagerUserFollowUp,
  notifyStaffOrderAssigned,
  notifyStaffOrderFromQueue,
  notifyManagerOrderAssigned,
  // Payment notifications
  notifyPendingActivation,
  notifyActivated,
  notifyDeactivated,
  notifyDeactivationRequest,
};
