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
      io.to(`branch_${complaint.branch}`).emit("complaint:new", notificationData);
      logger.info(`Socket notification sent to manager ${manager._id} for new complaint ${complaint.complaintId}`);
    }

    // TODO: Email notification (Phase 7 enhancement)
    // const emailHtml = getNewComplaintEmailHtml(complaint, manager);
    // await sendEmail({
    //   to: manager.email,
    //   subject: `New ${complaint.priority} Priority Complaint - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(`Manager ${manager._id} notified of new complaint ${complaint.complaintId}`);
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
      logger.info(`Socket notification sent to staff ${staffId} for complaint assignment ${complaint.complaintId}`);
    }

    // TODO: Email notification
    // const staff = await Staff.findById(staffId);
    // const emailHtml = getStaffAssignmentEmailHtml(complaint, staff);
    // await sendEmail({
    //   to: staff.email,
    //   subject: `Complaint Assigned for Your Awareness - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(`Staff ${staffId} notified of complaint assignment ${complaint.complaintId}`);
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
export const notifyStaffComplaintUpdated = async (complaint, updatedBy, updateType) => {
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
      io.to(`staff_${complaint.assignedTo}`).emit("complaint:updated", notificationData);
      logger.info(`Socket notification sent to staff ${complaint.assignedTo} for complaint update ${complaint.complaintId}`);
    }

    // TODO: Email notification (batched - sent once daily)
    // Can implement email digest for all updates

    logger.info(`Staff ${complaint.assignedTo} notified of complaint update ${complaint.complaintId}`);
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
export const notifyStaffComplaintReassigned = async (complaint, staffId, action) => {
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
      logger.info(`Socket notification sent to staff ${staffId} for complaint reassignment ${complaint.complaintId}`);
    }

    logger.info(`Staff ${staffId} notified of complaint reassignment ${complaint.complaintId}`);
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
export const notifyUserComplaintResponse = async (complaint, response, user) => {
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
      logger.info(`Socket notification sent to user ${user._id} for complaint response ${complaint.complaintId}`);
    }

    // TODO: Email notification
    // const emailHtml = getComplaintResponseEmailHtml(complaint, response, user);
    // await sendEmail({
    //   to: user.email,
    //   subject: `Response to Your Complaint - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(`User ${user._id} notified of complaint response ${complaint.complaintId}`);
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
      logger.info(`Socket notification sent to user ${user._id} for complaint resolution ${complaint.complaintId}`);
    }

    // TODO: Email notification with rating request
    // const emailHtml = getComplaintResolvedEmailHtml(complaint, user);
    // await sendEmail({
    //   to: user.email,
    //   subject: `Your Complaint Has Been Resolved - ${complaint.complaintId}`,
    //   html: emailHtml,
    // });

    logger.info(`User ${user._id} notified of complaint resolution ${complaint.complaintId}`);
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
      oldStatus: complaint.statusHistory[complaint.statusHistory.length - 2]?.status,
      newStatus: status,
      message: `Your complaint status has been updated to ${status}`,
      timestamp: new Date(),
    };

    // Socket notification to user
    if (io) {
      io.to(`user_${complaint.user}`).emit("complaint:status_updated", notificationData);
      logger.info(`Socket notification sent to user ${complaint.user} for status update ${complaint.complaintId}`);
    }

    logger.info(`User ${complaint.user} notified of complaint status update ${complaint.complaintId}`);
  } catch (error) {
    logger.error("Error notifying user of status update:", error);
  }
};

/**
 * Notify management of complaint escalation
 * @param {Object} complaint - The complaint object
 * @param {Object} manager - The manager object
 */
export const notifyManagementComplaintEscalated = async (complaint, manager) => {
  try {
    const notificationData = {
      complaintId: complaint.complaintId,
      title: complaint.title,
      priority: complaint.priority,
      escalatedAt: complaint.escalatedAt,
      escalationReason: complaint.escalationReason,
      daysPending: Math.floor((new Date() - complaint.createdAt) / (1000 * 60 * 60 * 24)),
      message: "URGENT: Complaint has been escalated",
    };

    // Socket notification to managers and admins
    if (io) {
      io.to(`branch_${complaint.branch}`).emit("complaint:escalated", notificationData);
      io.to(`hotel_${complaint.hotel}`).emit("complaint:escalated", notificationData);
      logger.info(`Socket notification sent for complaint escalation ${complaint.complaintId}`);
    }

    // Also notify assigned staff
    if (complaint.assignedTo) {
      io.to(`staff_${complaint.assignedTo}`).emit("complaint:escalated", notificationData);
    }

    // TODO: Email notification to management
    // const emailHtml = getComplaintEscalatedEmailHtml(complaint, manager);
    // await sendEmail({
    //   to: manager.email,
    //   subject: `URGENT: Complaint Escalated - ${complaint.complaintId}`,
    //   html: emailHtml,
    //   priority: 'high',
    // });

    logger.info(`Management notified of complaint escalation ${complaint.complaintId}`);
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
      io.to(`branch_${complaint.branch}`).emit("complaint:followup", notificationData);
      
      if (complaint.assignedTo) {
        io.to(`staff_${complaint.assignedTo}`).emit("complaint:followup", notificationData);
      }
      
      logger.info(`Manager and staff notified of user follow-up ${complaint.complaintId}`);
    }
  } catch (error) {
    logger.error("Error notifying of user follow-up:", error);
  }
};

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
};
