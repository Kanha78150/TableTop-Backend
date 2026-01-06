// src/socket/complaintEvents.js - Socket.IO Event Handlers for Complaints

import { logger } from "../utils/logger.js";

/**
 * Setup complaint-related socket events
 * @param {Object} io - Socket.IO server instance
 */
export const setupComplaintEvents = (io) => {
  io.on("connection", (socket) => {
    logger.info(`Socket connected for complaints: ${socket.id}`);

    // User joins their personal room
    socket.on("join:user", (userId) => {
      socket.join(`user_${userId}`);
      logger.info(`User ${userId} joined complaint notifications room`);
      socket.emit("joined", { room: `user_${userId}`, type: "user" });
    });

    // Staff joins their personal room
    socket.on("join:staff", (staffId) => {
      socket.join(`staff_${staffId}`);
      logger.info(`Staff ${staffId} joined complaint notifications room`);
      socket.emit("joined", { room: `staff_${staffId}`, type: "staff" });
    });

    // Manager joins their personal room
    socket.on("join:manager", (managerId) => {
      socket.join(`manager_${managerId}`);
      logger.info(`Manager ${managerId} joined complaint notifications room`);
      socket.emit("joined", { room: `manager_${managerId}`, type: "manager" });
    });

    // Branch room (all managers/staff in a branch)
    socket.on("join:branch", (branchId) => {
      socket.join(`branch_${branchId}`);
      logger.info(`Socket joined branch ${branchId} complaint notifications room`);
      socket.emit("joined", { room: `branch_${branchId}`, type: "branch" });
    });

    // Hotel room (hotel-wide notifications)
    socket.on("join:hotel", (hotelId) => {
      socket.join(`hotel_${hotelId}`);
      logger.info(`Socket joined hotel ${hotelId} complaint notifications room`);
      socket.emit("joined", { room: `hotel_${hotelId}`, type: "hotel" });
    });

    // Leave rooms
    socket.on("leave:user", (userId) => {
      socket.leave(`user_${userId}`);
      logger.info(`User ${userId} left complaint notifications room`);
    });

    socket.on("leave:staff", (staffId) => {
      socket.leave(`staff_${staffId}`);
      logger.info(`Staff ${staffId} left complaint notifications room`);
    });

    socket.on("leave:manager", (managerId) => {
      socket.leave(`manager_${managerId}`);
      logger.info(`Manager ${managerId} left complaint notifications room`);
    });

    socket.on("leave:branch", (branchId) => {
      socket.leave(`branch_${branchId}`);
      logger.info(`Socket left branch ${branchId} complaint notifications room`);
    });

    socket.on("leave:hotel", (hotelId) => {
      socket.leave(`hotel_${hotelId}`);
      logger.info(`Socket left hotel ${hotelId} complaint notifications room`);
    });

    // Acknowledge notification receipt
    socket.on("complaint:notification:ack", (data) => {
      logger.info(`Notification acknowledged for complaint ${data.complaintId} by ${socket.id}`);
      socket.emit("complaint:notification:confirmed", {
        complaintId: data.complaintId,
        timestamp: new Date(),
      });
    });

    // Staff viewed complaint
    socket.on("complaint:viewed", (data) => {
      logger.info(`Staff viewed complaint ${data.complaintId}`);
      // Notify manager that staff viewed it
      if (data.managerId) {
        io.to(`manager_${data.managerId}`).emit("complaint:staff_viewed", {
          complaintId: data.complaintId,
          staffId: data.staffId,
          viewedAt: new Date(),
        });
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      logger.info(`Socket disconnected from complaints: ${socket.id}`);
    });
  });
};

/**
 * Helper function to emit new complaint notification
 * @param {Object} io - Socket.IO instance
 * @param {String} hotelId - Hotel ID
 * @param {Object} data - Complaint data
 */
export const emitComplaintNew = (io, hotelId, data) => {
  io.to(`hotel_${hotelId}`).emit("complaint:new", data);
  logger.info(`Emitted new complaint notification to hotel ${hotelId}`);
};

/**
 * Helper function to emit complaint update notification
 * @param {Object} io - Socket.IO instance
 * @param {String} complaintId - Complaint ID
 * @param {Object} data - Update data
 */
export const emitComplaintUpdate = (io, complaintId, data) => {
  // Emit to all relevant parties
  if (data.userId) {
    io.to(`user_${data.userId}`).emit("complaint:updated", data);
  }
  if (data.staffId) {
    io.to(`staff_${data.staffId}`).emit("complaint:updated", data);
  }
  if (data.branchId) {
    io.to(`branch_${data.branchId}`).emit("complaint:updated", data);
  }
  logger.info(`Emitted complaint update for ${complaintId}`);
};

/**
 * Helper function to emit complaint resolved notification
 * @param {Object} io - Socket.IO instance
 * @param {String} userId - User ID
 * @param {Object} data - Resolution data
 */
export const emitComplaintResolved = (io, userId, data) => {
  io.to(`user_${userId}`).emit("complaint:resolved", data);
  if (data.staffId) {
    io.to(`staff_${data.staffId}`).emit("complaint:resolved", data);
  }
  logger.info(`Emitted complaint resolved notification to user ${userId}`);
};

/**
 * Helper function to emit complaint assigned notification to staff
 * @param {Object} io - Socket.IO instance
 * @param {String} staffId - Staff ID
 * @param {Object} data - Assignment data
 */
export const emitComplaintAssigned = (io, staffId, data) => {
  io.to(`staff_${staffId}`).emit("complaint:assigned", data);
  logger.info(`Emitted complaint assigned notification to staff ${staffId}`);
};

/**
 * Helper function to emit complaint escalated notification
 * @param {Object} io - Socket.IO instance
 * @param {String} branchId - Branch ID
 * @param {String} hotelId - Hotel ID
 * @param {Object} data - Escalation data
 */
export const emitComplaintEscalated = (io, branchId, hotelId, data) => {
  io.to(`branch_${branchId}`).emit("complaint:escalated", data);
  io.to(`hotel_${hotelId}`).emit("complaint:escalated", data);
  logger.info(`Emitted complaint escalated notification to branch ${branchId} and hotel ${hotelId}`);
};

export default {
  setupComplaintEvents,
  emitComplaintNew,
  emitComplaintUpdate,
  emitComplaintResolved,
  emitComplaintAssigned,
  emitComplaintEscalated,
};
