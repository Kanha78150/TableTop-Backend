// src/services/assignmentService.js - Waiter Assignment Service
import { Staff } from "../models/Staff.model.js";
import { Order } from "../models/Order.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { Admin } from "../models/Admin.model.js";
import { Manager } from "../models/Manager.model.js";
import { APIError } from "../utils/APIError.js";
import queueService from "./queueService.js";
import { logger } from "../utils/logger.js";
import {
  notifyStaffOrderAssigned,
  notifyStaffOrderFromQueue,
  notifyManagerOrderAssigned,
} from "./notificationService.js";

/**
 * Assignment Service for Managing Waiter-Order Assignments
 *
 * Core Features:
 * 1. Round-Robin assignment for first orders or tie cases
 * 2. Load-balancing based on active order count
 * 3. Queue management when all waiters are at capacity
 * 4. Automatic assignment from queue when waiters become available
 */
class AssignmentService {
  constructor() {
    // Configuration
    this.MAX_ORDERS_PER_WAITER = process.env.MAX_ORDERS_PER_WAITER || 5;
    this.ASSIGNMENT_TIMEOUT = process.env.ASSIGNMENT_TIMEOUT || 30000; // 30 seconds

    // In-memory tracking for round-robin (will persist in database)
    this.lastAssignedWaiter = new Map(); // branchId -> waiterId
  }

  /**
   * Main assignment function - assigns order to best available waiter
   * @param {Object|String} orderParam - Order object or order ID string
   * @returns {Object} Assignment result with waiter info
   */
  async assignOrder(orderParam) {
    let order = null;
    try {
      // Handle both order object and order ID string
      if (typeof orderParam === "string") {
        // If it's a string, fetch the order from database
        order = await Order.findById(orderParam).lean();
        if (!order) {
          throw new APIError(404, `Order not found: ${orderParam}`);
        }
        logger.info(
          `Starting assignment process for order ${orderParam} (fetched from DB)`
        );
      } else {
        // If it's already an order object, convert to plain object if Mongoose doc
        order = orderParam.toObject ? orderParam.toObject() : orderParam;
        logger.info(
          `Starting assignment process for order ${order._id} (using provided object)`
        );
      }

      // Get all available waiters for this branch/hotel
      const availableWaiters = await this.getAvailableWaiters(
        order.hotel,
        order.branch
      );

      if (availableWaiters.length === 0) {
        logger.warn(`No waiters available for order ${order._id}`);
        throw new APIError(503, "No waiters available at the moment");
      }

      // Check if any waiter can take the order (not at max capacity)
      const eligibleWaiters = availableWaiters.filter(
        (waiter) => waiter.activeOrdersCount < this.MAX_ORDERS_PER_WAITER
      );

      if (eligibleWaiters.length === 0) {
        // All waiters are at capacity - add to queue
        logger.info(`All waiters at capacity, queuing order ${order._id}`);
        return await this.addOrderToQueue(order, availableWaiters);
      }

      // Assign to best available waiter
      const selectedWaiter = await this.selectBestWaiter(
        eligibleWaiters,
        order.branch
      );

      // Perform the assignment
      const assignmentResult = await this.performAssignment(
        order,
        selectedWaiter
      );

      logger.info(
        `Order ${order._id} assigned to waiter ${selectedWaiter._id} (${selectedWaiter.name})`
      );

      return assignmentResult;
    } catch (error) {
      const orderId =
        order?._id ||
        (typeof orderParam === "string"
          ? orderParam
          : orderParam?._id || "unknown");
      logger.error(`Assignment failed for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get all available waiters for a branch/hotel
   * Validates organizational hierarchy: Hotel->Admin->Manager->Staff
   * @param {String} hotelId - Hotel ID
   * @param {String} branchId - Branch ID (optional)
   * @returns {Array} Array of available waiters with active order counts
   */
  async getAvailableWaiters(hotelId, branchId = null) {
    try {
      // First, validate the organizational hierarchy
      const hierarchyValidation = await this.validateOrganizationalHierarchy(
        hotelId,
        branchId
      );
      if (!hierarchyValidation.isValid) {
        throw new APIError(
          400,
          `Invalid organizational hierarchy: ${hierarchyValidation.reason}`
        );
      }

      // Build query filter for waiters
      const filter = {
        hotel: hotelId,
        role: "waiter",
        status: "active",
        isAvailable: true,
      };

      if (branchId) {
        filter.branch = branchId;
      }

      // Get waiters and validate they belong to correct managers in the hierarchy
      const waiters = await Staff.find(filter)
        .populate({
          path: "manager",
          populate: {
            path: "createdBy",
            model: "Admin",
          },
        })
        .lean();

      // Filter waiters based on organizational hierarchy validation
      const validWaiters = waiters.filter((waiter) => {
        // Check if waiter has a manager
        if (!waiter.manager) {
          logger.warn(`Waiter ${waiter._id} has no assigned manager`);
          return false;
        }

        // Check if manager was created by the same admin who created the hotel/branch
        if (!waiter.manager.createdBy) {
          logger.warn(`Manager ${waiter.manager._id} has no createdBy admin`);
          return false;
        }

        // Validate the admin chain
        const managerAdminId =
          waiter.manager.createdBy._id || waiter.manager.createdBy;
        return (
          managerAdminId.toString() === hierarchyValidation.adminId.toString()
        );
      });

      // Calculate active orders for each valid waiter using aggregation (eliminates N+1 query problem)
      // Build a map of waiter IDs for efficient lookup
      const waiterIds = validWaiters.map((w) => w._id);

      // Single aggregation query to get order counts for all waiters at once
      const orderCounts = await Order.aggregate([
        {
          $match: {
            staff: { $in: waiterIds },
            status: { $in: ["pending", "confirmed", "preparing", "ready"] },
          },
        },
        {
          $group: {
            _id: "$staff",
            count: { $sum: 1 },
          },
        },
      ]);

      // Create a map for O(1) lookup
      const orderCountMap = new Map(
        orderCounts.map((item) => [item._id.toString(), item.count])
      );

      // Merge counts with waiter data
      const waitersWithCounts = validWaiters.map((waiter) => ({
        ...waiter,
        activeOrdersCount: orderCountMap.get(waiter._id.toString()) || 0,
      }));

      logger.info(
        `Found ${waitersWithCounts.length} valid waiters for hotel ${hotelId}${
          branchId ? `, branch ${branchId}` : ""
        }`
      );
      return waitersWithCounts;
    } catch (error) {
      logger.error("Error getting available waiters:", error);
      throw new APIError(500, "Failed to get available waiters");
    }
  }

  /**
   * Select the best waiter using Round-Robin or Load-Balancing
   * @param {Array} eligibleWaiters - Waiters who can take orders
   * @param {String} branchId - Branch ID for round-robin tracking
   * @returns {Object} Selected waiter
   */
  async selectBestWaiter(eligibleWaiters, branchId) {
    try {
      // Sort waiters by active order count (ascending) for load balancing
      const sortedWaiters = eligibleWaiters.sort(
        (a, b) => a.activeOrdersCount - b.activeOrdersCount
      );

      const minOrderCount = sortedWaiters[0].activeOrdersCount;

      // Get all waiters with minimum order count (tie case)
      const leastBusyWaiters = sortedWaiters.filter(
        (waiter) => waiter.activeOrdersCount === minOrderCount
      );

      // If only one waiter has minimum orders, assign to them
      if (leastBusyWaiters.length === 1) {
        logger.info(
          `Load balancing: Selected waiter with ${minOrderCount} active orders`
        );
        return leastBusyWaiters[0];
      }

      // Multiple waiters with same order count - use Round-Robin
      logger.info(
        `Tie case: ${leastBusyWaiters.length} waiters with ${minOrderCount} orders, using round-robin`
      );

      const selectedWaiter = await this.roundRobinSelection(
        leastBusyWaiters,
        branchId
      );
      return selectedWaiter;
    } catch (error) {
      logger.error("Error selecting best waiter:", error);
      throw error;
    }
  }

  /**
   * Round-Robin selection among waiters with equal load
   * @param {Array} waiters - Waiters to choose from
   * @param {String} branchId - Branch ID for tracking
   * @returns {Object} Selected waiter
   */
  async roundRobinSelection(waiters, branchId) {
    try {
      const branchKey = branchId || "default";
      const lastAssignedId = this.lastAssignedWaiter.get(branchKey);

      let selectedWaiter;

      if (!lastAssignedId) {
        // First assignment - select first waiter
        selectedWaiter = waiters[0];
      } else {
        // Find current position of last assigned waiter
        const lastIndex = waiters.findIndex(
          (w) => w._id.toString() === lastAssignedId
        );

        if (lastIndex === -1 || lastIndex === waiters.length - 1) {
          // Last waiter was not found or was the last in list - start from beginning
          selectedWaiter = waiters[0];
        } else {
          // Select next waiter in round-robin
          selectedWaiter = waiters[lastIndex + 1];
        }
      }

      // Update round-robin tracking
      this.lastAssignedWaiter.set(branchKey, selectedWaiter._id.toString());

      logger.info(
        `Round-robin selection: ${selectedWaiter.name} (${selectedWaiter._id})`
      );
      return selectedWaiter;
    } catch (error) {
      logger.error("Error in round-robin selection:", error);
      throw error;
    }
  }

  /**
   * Perform the actual assignment of order to waiter
   * @param {Object} order - Order to assign
   * @param {Object} waiter - Selected waiter
   * @returns {Object} Assignment result
   */
  async performAssignment(order, waiter, fromQueue = false) {
    try {
      // Determine assignment method
      const assignmentMethod = fromQueue
        ? "queue"
        : waiter.activeOrdersCount === 0
          ? "round-robin"
          : "load-balancing";

      // Update order with assignment
      const updatedOrder = await Order.findByIdAndUpdate(
        order._id,
        {
          staff: waiter._id,
          assignedAt: new Date(),
          assignmentMethod: assignmentMethod,
          $push: {
            assignmentHistory: {
              waiter: waiter._id,
              assignedAt: new Date(),
              method: assignmentMethod,
              reason: fromQueue ? "queue-assignment" : "automatic-assignment",
            },
          },
        },
        { new: true }
      ).populate("staff", "name staffId role");

      if (!updatedOrder) {
        throw new APIError(404, "Order not found");
      }

      // Update waiter's active order count in database AND memory
      const newActiveOrdersCount = waiter.activeOrdersCount + 1;
      await Staff.findByIdAndUpdate(waiter._id, {
        activeOrdersCount: newActiveOrdersCount,
        lastAssignedAt: new Date(),
        $inc: { "assignmentStats.totalAssignments": 1 },
      });

      // Send socket notification to staff
      try {
        await notifyStaffOrderAssigned(updatedOrder, waiter, assignmentMethod);

        // Notify manager if available
        if (waiter.manager) {
          await notifyManagerOrderAssigned(updatedOrder, waiter.manager, {
            staff: waiter,
            assignmentMethod: assignmentMethod,
            isManualAssignment: false,
          });
        }

        logger.info(
          `Socket notifications sent for order ${order._id} assignment to staff ${waiter._id}`
        );
      } catch (socketError) {
        logger.error(
          `Socket notification failed for order ${order._id}:`,
          socketError.message
        );
        // Continue - don't fail assignment on socket error
      }

      return {
        success: true,
        order: updatedOrder,
        waiter: {
          id: waiter._id,
          name: waiter.name,
          staffId: waiter.staffId,
          activeOrdersCount: newActiveOrdersCount,
        },
        assignmentMethod:
          newActiveOrdersCount === 1 ? "round-robin" : "load-balancing",
        assignedAt: new Date(),
        queuePosition: null,
      };
    } catch (error) {
      logger.error("Error performing assignment:", error);
      throw error;
    }
  }

  /**
   * Add order to queue when all waiters are at capacity
   * @param {Object} order - Order to queue
   * @param {Array} availableWaiters - All available waiters (at capacity)
   * @returns {Object} Queue result
   */
  async addOrderToQueue(order, availableWaiters) {
    try {
      // Add to queue service
      const queueResult = await queueService.addToQueue(order, {
        hotel: order.hotel,
        branch: order.branch,
        priority: "normal",
        estimatedWaitTime: this.calculateEstimatedWaitTime(availableWaiters),
      });

      // Update order with queue status
      await Order.findByIdAndUpdate(order._id, {
        status: "queued",
        queuePosition: queueResult.position,
        queuedAt: new Date(),
        estimatedAssignmentTime: new Date(
          Date.now() + queueResult.estimatedWaitTime * 60000
        ),
      });

      logger.info(
        `Order ${order._id} added to queue at position ${queueResult.position}`
      );

      return {
        success: true,
        queued: true,
        order: order,
        queuePosition: queueResult.position,
        estimatedWaitTime: queueResult.estimatedWaitTime,
        message:
          "Order added to queue - will be assigned when a waiter becomes available",
      };
    } catch (error) {
      logger.error("Error adding order to queue:", error);
      throw error;
    }
  }

  /**
   * Assign next order from queue to a newly available waiter
   * @param {String} waiterId - ID of waiter who became available
   * @returns {Object} Assignment result or null if no queued orders
   */
  async assignFromQueue(waiterId) {
    try {
      logger.info(`Checking queue for waiter ${waiterId}`);

      // Get waiter details
      const waiter = await Staff.findById(waiterId);
      if (!waiter) {
        throw new APIError(404, "Waiter not found");
      }

      // Check if waiter can take more orders
      const activeOrdersCount = await Order.countDocuments({
        staff: waiterId,
        status: { $in: ["pending", "confirmed", "preparing", "ready"] },
      });

      if (activeOrdersCount >= this.MAX_ORDERS_PER_WAITER) {
        logger.info(
          `Waiter ${waiterId} still at capacity with ${activeOrdersCount} active orders`
        );
        return null;
      }

      // Get next order from queue for this hotel/branch
      const nextOrder = await queueService.getNextInQueue({
        hotel: waiter.hotel,
        branch: waiter.branch,
      });

      if (!nextOrder) {
        logger.info("No orders in queue");
        return null;
      }

      // Remove from queue
      await queueService.removeFromQueue(nextOrder._id);

      // Assign the order (fromQueue = true for high-priority notification)
      const assignmentResult = await this.performAssignment(
        nextOrder,
        {
          ...waiter.toObject(),
          activeOrdersCount,
        },
        true // fromQueue parameter
      );

      // Update order status from queued to pending
      await Order.findByIdAndUpdate(nextOrder._id, {
        status: "pending",
        $unset: { queuePosition: 1, queuedAt: 1, estimatedAssignmentTime: 1 },
      });

      // NOTE: High-priority socket notification sent by performAssignment() with method='queue'
      logger.info(
        `Order ${nextOrder._id} assigned from queue with HIGH PRIORITY notification`
      );

      logger.info(
        `Order ${nextOrder._id} assigned from queue to waiter ${waiterId}`
      );

      return {
        ...assignmentResult,
        fromQueue: true,
        previousQueuePosition: nextOrder.queuePosition,
      };
    } catch (error) {
      logger.error(`Error assigning from queue to waiter ${waiterId}:`, error);
      throw error;
    }
  }

  /**
   * Handle order completion - potentially assign new order from queue
   * @param {String} orderId - Completed order ID
   * @returns {Object} Result of potential new assignment
   */
  async handleOrderCompletion(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order || !order.staff) {
        logger.warn(`Order ${orderId} not found or not assigned`);
        return null;
      }

      const waiterId = order.staff;
      logger.info(
        `Order ${orderId} completed by waiter ${waiterId}, checking for queue assignments`
      );

      // Decrease waiter's active order count
      await Staff.findByIdAndUpdate(waiterId, {
        $inc: {
          activeOrdersCount: -1,
          "assignmentStats.completedOrders": 1,
        },
      });
      logger.info(`Decreased active order count for waiter ${waiterId}`);

      // Attempt to assign next order from queue
      const queueAssignment = await this.assignFromQueue(waiterId);

      if (queueAssignment) {
        return {
          orderCompleted: orderId,
          newOrderAssigned: queueAssignment,
        };
      }

      return {
        orderCompleted: orderId,
        newOrderAssigned: null,
      };
    } catch (error) {
      logger.error(`Error handling order completion for ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Manual assignment of order to specific waiter
   * @param {String} orderId - Order ID
   * @param {String} waiterId - Waiter ID
   * @param {String} reason - Reason for manual assignment
   * @returns {Object} Assignment result
   */
  async manualAssignment(orderId, waiterId, reason = "manual-assignment") {
    try {
      const order = await Order.findById(orderId);
      const waiter = await Staff.findById(waiterId);

      if (!order) {
        throw new APIError(404, "Order not found");
      }

      if (!waiter || waiter.role !== "waiter") {
        throw new APIError(404, "Waiter not found");
      }

      // Check if waiter can take more orders
      const activeOrdersCount = await Order.countDocuments({
        staff: waiterId,
        status: { $in: ["pending", "confirmed", "preparing", "ready"] },
      });

      if (activeOrdersCount >= this.MAX_ORDERS_PER_WAITER) {
        throw new APIError(
          400,
          `Waiter is at maximum capacity (${this.MAX_ORDERS_PER_WAITER} orders)`
        );
      }

      // If order was queued, remove from queue
      if (order.queuePosition) {
        await queueService.removeFromQueue(orderId);
      }

      // Perform assignment
      const assignmentResult = await this.performAssignment(order, {
        ...waiter.toObject(),
        activeOrdersCount,
      });

      // Update assignment history with manual assignment
      await Order.findByIdAndUpdate(orderId, {
        $push: {
          assignmentHistory: {
            waiter: waiterId,
            assignedAt: new Date(),
            method: "manual",
            reason: reason,
          },
        },
        priority: "urgent", // Manual assignments are urgent priority
      });

      // Send URGENT socket notification to staff
      try {
        // For manual assignment, include reason in notification
        const populatedOrder = await Order.findById(orderId)
          .populate("user", "name phone")
          .populate("table", "tableNumber")
          .populate("items.foodItem", "name price");

        await notifyStaffOrderAssigned(
          populatedOrder || order,
          waiter,
          "manual",
          reason
        );

        // Notify manager about manual assignment success
        if (waiter.manager) {
          await notifyManagerOrderAssigned(
            populatedOrder || order,
            waiter.manager,
            {
              staff: waiter,
              assignmentMethod: "manual",
              isManualAssignment: true,
              reason: reason,
            }
          );
        }

        logger.info(
          `URGENT socket notification sent for manual order ${orderId} assignment`
        );
      } catch (socketError) {
        logger.error(
          `Socket notification failed for manual assignment ${orderId}:`,
          socketError.message
        );
        // Continue - don't fail assignment on socket error
      }

      logger.info(
        `Manual assignment: Order ${orderId} assigned to waiter ${waiterId}`
      );

      return {
        ...assignmentResult,
        manual: true,
        reason,
      };
    } catch (error) {
      logger.error(`Manual assignment failed for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get assignment statistics for a branch/hotel
   * @param {String} hotelId - Hotel ID
   * @param {String} branchId - Branch ID (optional)
   * @returns {Object} Assignment statistics
   */
  async getAssignmentStats(hotelId, branchId = null) {
    try {
      const filter = { hotel: hotelId };
      if (branchId) filter.branch = branchId;

      // Get waiter stats
      const waiters = await this.getAvailableWaiters(hotelId, branchId);
      const totalWaiters = waiters.length;
      const availableWaiters = waiters.filter(
        (w) => w.activeOrdersCount < this.MAX_ORDERS_PER_WAITER
      ).length;
      const busyWaiters = totalWaiters - availableWaiters;

      // Get queue stats
      const queueStats = await queueService.getQueueStats({
        hotel: hotelId,
        branch: branchId,
      });

      // Get recent assignment history
      const recentAssignments = await Order.find(filter)
        .populate("staff", "name staffId")
        .sort({ assignedAt: -1 })
        .limit(10)
        .select("_id staff assignedAt assignmentMethod totalPrice status");

      return {
        waiters: {
          total: totalWaiters,
          available: availableWaiters,
          busy: busyWaiters,
          utilization:
            totalWaiters > 0
              ? ((busyWaiters / totalWaiters) * 100).toFixed(2)
              : 0,
        },
        queue: queueStats,
        recentAssignments,
        averageOrdersPerWaiter:
          totalWaiters > 0
            ? (
                waiters.reduce((sum, w) => sum + w.activeOrdersCount, 0) /
                totalWaiters
              ).toFixed(2)
            : 0,
        maxCapacity: totalWaiters * this.MAX_ORDERS_PER_WAITER,
        currentLoad: waiters.reduce((sum, w) => sum + w.activeOrdersCount, 0),
      };
    } catch (error) {
      logger.error("Error getting assignment stats:", error);
      throw error;
    }
  }

  /**
   * Calculate estimated wait time based on current waiter loads
   * @param {Array} waiters - Array of waiters with their active order counts
   * @returns {Number} Estimated wait time in minutes
   */
  calculateEstimatedWaitTime(waiters) {
    if (!waiters || waiters.length === 0) return 30; // Default 30 minutes

    const totalActiveOrders = waiters.reduce(
      (sum, w) => sum + w.activeOrdersCount,
      0
    );
    const avgOrdersPerWaiter = totalActiveOrders / waiters.length;

    // Estimate based on average order completion time (15 minutes) and current load
    const baseTime = 15; // Average order completion time
    const loadMultiplier = Math.max(
      1,
      avgOrdersPerWaiter / this.MAX_ORDERS_PER_WAITER
    );

    return Math.ceil(baseTime * loadMultiplier);
  }

  /**
   * Reset round-robin tracking (useful for testing or daily resets)
   * @param {String} branchId - Branch ID (optional, resets all if not provided)
   */
  resetRoundRobin(hotelId, branchId = null) {
    if (branchId) {
      // Reset for specific branch only
      this.lastAssignedWaiter.delete(branchId);
      logger.info(
        `Round-robin reset for hotel ${hotelId}, branch ${branchId}`,
        {
          hotelId,
          branchId,
          scope: "branch",
        }
      );
    } else if (hotelId) {
      // Reset for all branches of a specific hotel
      const keysToDelete = [];
      for (const key of this.lastAssignedWaiter.keys()) {
        // If we have a way to map branch to hotel, we'd use it here
        // For now, we'll need to check each branch's hotel association
        keysToDelete.push(key);
      }

      // Delete all entries (since we don't have hotel->branch mapping in memory)
      // In a real implementation, you'd query branches by hotelId and delete only those
      keysToDelete.forEach((key) => this.lastAssignedWaiter.delete(key));

      logger.info(`Round-robin reset for hotel ${hotelId} (all branches)`, {
        hotelId,
        scope: "hotel",
        branchesReset: keysToDelete.length,
      });
    } else {
      // Reset all (fallback for backward compatibility)
      this.lastAssignedWaiter.clear();
      logger.info("Round-robin reset for all hotels and branches", {
        scope: "global",
      });
    }
  }

  /**
   * Validate organizational hierarchy for staff assignment
   * Ensures the order's hotel/branch belongs to the correct admin chain
   * @param {String} hotelId - Hotel ID from the order
   * @param {String} branchId - Branch ID from the order (optional)
   * @returns {Object} Validation result with adminId if valid
   */
  async validateOrganizationalHierarchy(hotelId, branchId = null) {
    try {
      // Get hotel information with admin
      const hotel = await Hotel.findById(hotelId).populate("createdBy").lean();
      if (!hotel) {
        return {
          isValid: false,
          reason: "Hotel not found",
        };
      }

      if (!hotel.createdBy) {
        return {
          isValid: false,
          reason: "Hotel has no assigned admin",
        };
      }

      const hotelAdminId = hotel.createdBy._id || hotel.createdBy;

      // If branch is specified, validate branch hierarchy
      if (branchId) {
        const branch = await Branch.findById(branchId)
          .populate("createdBy")
          .lean();
        if (!branch) {
          return {
            isValid: false,
            reason: "Branch not found",
          };
        }

        if (!branch.createdBy) {
          return {
            isValid: false,
            reason: "Branch has no assigned admin",
          };
        }

        // Verify branch belongs to the same hotel
        if (branch.hotel.toString() !== hotelId.toString()) {
          return {
            isValid: false,
            reason: "Branch does not belong to the specified hotel",
          };
        }

        const branchAdminId = branch.createdBy._id || branch.createdBy;

        // Verify both hotel and branch are managed by the same admin
        if (hotelAdminId.toString() !== branchAdminId.toString()) {
          return {
            isValid: false,
            reason: "Hotel and branch are managed by different admins",
          };
        }

        return {
          isValid: true,
          adminId: branchAdminId,
        };
      }

      // Return hotel admin if no branch specified
      return {
        isValid: true,
        adminId: hotelAdminId,
      };
    } catch (error) {
      logger.error("Error validating organizational hierarchy:", error);
      return {
        isValid: false,
        reason: "Error validating hierarchy",
      };
    }
  }
}

// Export singleton instance
const assignmentService = new AssignmentService();
export default assignmentService;
