// src/services/queueService.js - Order Queue Management Service
import { Order } from "../models/Order.model.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";

/**
 * Queue Service for Managing Order Queues
 *
 * Features:
 * 1. FIFO (First In, First Out) queue management
 * 2. Priority-based queuing (if needed)
 * 3. Branch/Hotel specific queues
 * 4. Queue statistics and monitoring
 */
class QueueService {
  constructor() {
    // Configuration
    this.MAX_QUEUE_SIZE = process.env.MAX_QUEUE_SIZE || 100;
    this.DEFAULT_PRIORITY = "normal";
    this.PRIORITIES = {
      high: 3,
      normal: 2,
      low: 1,
    };
  }

  /**
   * Add order to queue
   * @param {Object} order - Order object to queue
   * @param {Object} options - Queue options (hotel, branch, priority, etc.)
   * @returns {Object} Queue result with position and estimated wait time
   */
  async addToQueue(order, options = {}) {
    try {
      const {
        hotel,
        branch,
        priority = this.DEFAULT_PRIORITY,
        estimatedWaitTime = 30,
      } = options;

      logger.info(`Adding order ${order._id} to queue`);

      // Validate priority
      if (!this.PRIORITIES[priority]) {
        throw new APIError(400, `Invalid priority: ${priority}`);
      }

      // Check queue size limit
      const currentQueueSize = await this.getQueueSize({ hotel, branch });
      if (currentQueueSize >= this.MAX_QUEUE_SIZE) {
        throw new APIError(503, "Queue is full. Please try again later.");
      }

      // Calculate queue position
      const position = await this.calculateQueuePosition({
        hotel,
        branch,
        priority,
      });

      // Create queue entry in database
      const queueEntry = {
        queuedAt: new Date(),
        queuePosition: position,
        priority: priority,
        priorityValue: this.PRIORITIES[priority],
        estimatedWaitTime: estimatedWaitTime,
        hotel: hotel,
        branch: branch,
        status: "queued",
      };

      // Update order with queue information
      await Order.findByIdAndUpdate(order._id, queueEntry);

      // Update positions of other orders if necessary
      await this.updateQueuePositions({ hotel, branch });

      logger.info(
        `Order ${order._id} queued at position ${position} with priority ${priority}`
      );

      return {
        success: true,
        orderId: order._id,
        position: position,
        priority: priority,
        estimatedWaitTime: estimatedWaitTime,
        queuedAt: new Date(),
      };
    } catch (error) {
      logger.error(`Error adding order ${order._id} to queue:`, error);
      throw error;
    }
  }

  /**
   * Get next order from queue (FIFO with priority consideration)
   * @param {Object} filter - Filter criteria (hotel, branch)
   * @returns {Object|null} Next order or null if queue is empty
   */
  async getNextInQueue(filter = {}) {
    try {
      const { hotel, branch } = filter;

      // Build query filter
      const queryFilter = {
        status: "queued",
        queuePosition: { $exists: true, $ne: null },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      // Get next order based on priority and queue position
      // Higher priority first, then earlier queue position
      const nextOrder = await Order.findOne(queryFilter)
        .sort({
          priorityValue: -1, // Higher priority first
          queuePosition: 1, // Earlier position first
        })
        .populate("user", "name phone")
        .populate("table", "tableNumber")
        .lean();

      if (!nextOrder) {
        logger.info("No orders in queue");
        return null;
      }

      logger.info(
        `Retrieved next order from queue: ${nextOrder._id} at position ${nextOrder.queuePosition}`
      );
      return nextOrder;
    } catch (error) {
      logger.error("Error getting next order from queue:", error);
      throw error;
    }
  }

  /**
   * Remove order from queue
   * @param {String} orderId - Order ID to remove
   * @returns {Object} Removal result
   */
  async removeFromQueue(orderId) {
    try {
      logger.info(`Removing order ${orderId} from queue`);

      // Get order details before removal
      const order = await Order.findById(orderId);
      if (!order) {
        throw new APIError(404, "Order not found");
      }

      if (!order.queuePosition) {
        logger.warn(`Order ${orderId} is not in queue`);
        return { success: true, message: "Order was not in queue" };
      }

      const removedPosition = order.queuePosition;
      const hotel = order.hotel;
      const branch = order.branch;

      // Remove queue information from order
      await Order.findByIdAndUpdate(orderId, {
        $unset: {
          queuePosition: 1,
          queuedAt: 1,
          priority: 1,
          priorityValue: 1,
          estimatedWaitTime: 1,
        },
      });

      // Update positions of remaining orders
      await this.updateQueuePositionsAfterRemoval(removedPosition, {
        hotel,
        branch,
      });

      logger.info(
        `Order ${orderId} removed from queue position ${removedPosition}`
      );

      return {
        success: true,
        orderId: orderId,
        removedFromPosition: removedPosition,
        updatedPositions: true,
      };
    } catch (error) {
      logger.error(`Error removing order ${orderId} from queue:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   * @param {Object} filter - Filter criteria (hotel, branch)
   * @returns {Object} Queue statistics
   */
  async getQueueStats(filter = {}) {
    try {
      const { hotel, branch } = filter;

      // Build query filter
      const queryFilter = {
        status: "queued",
        queuePosition: { $exists: true, $ne: null },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      // Get basic queue stats
      const totalQueued = await Order.countDocuments(queryFilter);

      // Get priority breakdown
      const priorityBreakdown = await Order.aggregate([
        { $match: queryFilter },
        {
          $group: {
            _id: "$priority",
            count: { $sum: 1 },
            avgWaitTime: { $avg: "$estimatedWaitTime" },
          },
        },
      ]);

      // Get oldest queued order
      const oldestOrder = await Order.findOne(queryFilter)
        .sort({ queuedAt: 1 })
        .select("queuedAt queuePosition estimatedWaitTime");

      // Calculate average wait time
      const avgWaitTime = await Order.aggregate([
        { $match: queryFilter },
        {
          $group: {
            _id: null,
            avgWaitTime: { $avg: "$estimatedWaitTime" },
          },
        },
      ]);

      return {
        totalQueued,
        priorityBreakdown: priorityBreakdown.reduce((acc, item) => {
          acc[item._id] = {
            count: item.count,
            avgWaitTime: Math.round(item.avgWaitTime || 0),
          };
          return acc;
        }, {}),
        oldestOrder: oldestOrder
          ? {
              queuedAt: oldestOrder.queuedAt,
              position: oldestOrder.queuePosition,
              waitTime: oldestOrder.estimatedWaitTime,
            }
          : null,
        averageWaitTime:
          avgWaitTime.length > 0 ? Math.round(avgWaitTime[0].avgWaitTime) : 0,
        isEmpty: totalQueued === 0,
        isFull: totalQueued >= this.MAX_QUEUE_SIZE,
      };
    } catch (error) {
      logger.error("Error getting queue stats:", error);
      throw error;
    }
  }

  /**
   * Get full queue for a hotel/branch (admin view)
   * @param {Object} filter - Filter criteria
   * @param {Object} pagination - Pagination options
   * @returns {Object} Queue details with orders
   */
  async getQueueDetails(filter = {}, pagination = {}) {
    try {
      const { hotel, branch } = filter;
      const { limit = 50, skip = 0 } = pagination;

      // Build query filter
      const queryFilter = {
        status: "queued",
        queuePosition: { $exists: true, $ne: null },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      // Get queued orders
      const queuedOrders = await Order.find(queryFilter)
        .populate("user", "name phone")
        .populate("table", "tableNumber")
        .populate("staff", "name staffId")
        .sort({
          priorityValue: -1,
          queuePosition: 1,
        })
        .limit(limit)
        .skip(skip)
        .select(
          "_id user table totalPrice items priority queuePosition queuedAt estimatedWaitTime specialInstructions"
        );

      const totalCount = await Order.countDocuments(queryFilter);

      return {
        orders: queuedOrders,
        pagination: {
          total: totalCount,
          limit,
          skip,
          hasMore: skip + limit < totalCount,
        },
        stats: await this.getQueueStats(filter),
      };
    } catch (error) {
      logger.error("Error getting queue details:", error);
      throw error;
    }
  }

  /**
   * Update queue priority for an order
   * @param {String} orderId - Order ID
   * @param {String} newPriority - New priority level
   * @returns {Object} Update result
   */
  async updateQueuePriority(orderId, newPriority) {
    try {
      // Validate priority
      if (!this.PRIORITIES[newPriority]) {
        throw new APIError(400, `Invalid priority: ${newPriority}`);
      }

      const order = await Order.findById(orderId);
      if (!order || !order.queuePosition) {
        throw new APIError(404, "Order not found in queue");
      }

      const oldPriority = order.priority;

      // Update priority
      await Order.findByIdAndUpdate(orderId, {
        priority: newPriority,
        priorityValue: this.PRIORITIES[newPriority],
      });

      // Recalculate queue positions if priority changed significantly
      if (this.PRIORITIES[newPriority] !== this.PRIORITIES[oldPriority]) {
        await this.updateQueuePositions({
          hotel: order.hotel,
          branch: order.branch,
        });
      }

      logger.info(
        `Updated priority for order ${orderId} from ${oldPriority} to ${newPriority}`
      );

      return {
        success: true,
        orderId,
        oldPriority,
        newPriority,
        positionsUpdated: true,
      };
    } catch (error) {
      logger.error(
        `Error updating queue priority for order ${orderId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Calculate queue position for new order
   * @param {Object} filter - Filter criteria
   * @returns {Number} Queue position
   */
  async calculateQueuePosition(filter = {}) {
    try {
      const { hotel, branch, priority = this.DEFAULT_PRIORITY } = filter;

      const queryFilter = {
        status: "queued",
        queuePosition: { $exists: true, $ne: null },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      // Count orders with higher or equal priority
      const higherPriorityCount = await Order.countDocuments({
        ...queryFilter,
        priorityValue: { $gte: this.PRIORITIES[priority] },
      });

      return higherPriorityCount + 1;
    } catch (error) {
      logger.error("Error calculating queue position:", error);
      return 1; // Default to position 1 if calculation fails
    }
  }

  /**
   * Update queue positions after changes
   * @param {Object} filter - Filter criteria
   * @returns {Boolean} Success status
   */
  async updateQueuePositions(filter = {}) {
    try {
      const { hotel, branch } = filter;

      const queryFilter = {
        status: "queued",
        queuePosition: { $exists: true, $ne: null },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      // Get all queued orders sorted by priority and queue time
      const queuedOrders = await Order.find(queryFilter)
        .sort({
          priorityValue: -1,
          queuedAt: 1,
        })
        .select("_id");

      // Update positions
      const updatePromises = queuedOrders.map((order, index) =>
        Order.findByIdAndUpdate(order._id, { queuePosition: index + 1 })
      );

      await Promise.all(updatePromises);

      logger.info(`Updated ${queuedOrders.length} queue positions`);
      return true;
    } catch (error) {
      logger.error("Error updating queue positions:", error);
      return false;
    }
  }

  /**
   * Update queue positions after removing an order
   * @param {Number} removedPosition - Position that was removed
   * @param {Object} filter - Filter criteria
   * @returns {Boolean} Success status
   */
  async updateQueuePositionsAfterRemoval(removedPosition, filter = {}) {
    try {
      const { hotel, branch } = filter;

      const queryFilter = {
        status: "queued",
        queuePosition: { $gt: removedPosition },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      // Decrement positions for all orders after the removed position
      await Order.updateMany(queryFilter, {
        $inc: { queuePosition: -1 },
      });

      logger.info(
        `Updated queue positions after removing position ${removedPosition}`
      );
      return true;
    } catch (error) {
      logger.error("Error updating queue positions after removal:", error);
      return false;
    }
  }

  /**
   * Get current queue size
   * @param {Object} filter - Filter criteria
   * @returns {Number} Queue size
   */
  async getQueueSize(filter = {}) {
    try {
      const { hotel, branch } = filter;

      const queryFilter = {
        status: "queued",
        queuePosition: { $exists: true, $ne: null },
      };

      if (hotel) queryFilter.hotel = hotel;
      if (branch) queryFilter.branch = branch;

      return await Order.countDocuments(queryFilter);
    } catch (error) {
      logger.error("Error getting queue size:", error);
      return 0;
    }
  }

  /**
   * Clear expired queue entries (cleanup function)
   * @param {Number} maxAgeHours - Maximum age in hours
   * @returns {Object} Cleanup result
   */
  async clearExpiredQueueEntries(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

      const expiredOrders = await Order.find({
        status: "queued",
        queuedAt: { $lt: cutoffTime },
      }).select("_id queuePosition hotel branch");

      // Remove expired entries
      const result = await Order.updateMany(
        {
          status: "queued",
          queuedAt: { $lt: cutoffTime },
        },
        {
          status: "expired",
          $unset: {
            queuePosition: 1,
            queuedAt: 1,
            priority: 1,
            priorityValue: 1,
            estimatedWaitTime: 1,
          },
        }
      );

      // Update positions for remaining orders in affected branches
      const affectedBranches = [
        ...new Set(expiredOrders.map((o) => o.branch?.toString())),
      ];
      const affectedHotels = [
        ...new Set(expiredOrders.map((o) => o.hotel?.toString())),
      ];

      for (const hotel of affectedHotels) {
        for (const branch of affectedBranches.filter((b) => b)) {
          await this.updateQueuePositions({ hotel, branch });
        }
      }

      logger.info(`Cleared ${result.modifiedCount} expired queue entries`);

      return {
        success: true,
        expiredCount: result.modifiedCount,
        cutoffTime,
      };
    } catch (error) {
      logger.error("Error clearing expired queue entries:", error);
      throw error;
    }
  }
}

// Export singleton instance
const queueService = new QueueService();
export default queueService;
