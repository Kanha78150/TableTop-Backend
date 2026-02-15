// src/services/timeTracker.js - Time Tracking and Automatic Assignment Service
import { Order } from "../models/Order.model.js";
import { Staff } from "../models/Staff.model.js";
import assignmentService from "./assignment.service.js";
import queueService from "./queue.service.js";
import { logger } from "../utils/logger.js";

/**
 * Time Tracker Service for Monitoring Order Progress and Automatic Assignments
 *
 * Features:
 * 1. Background monitoring of active orders
 * 2. Automatic reassignment when waiters become available
 * 3. Order timeout detection and handling
 * 4. Performance metrics collection
 * 5. Automated cleanup of stale data
 */
class TimeTracker {
  constructor() {
    // Configuration
    this.MONITORING_INTERVAL = process.env.MONITORING_INTERVAL || 30000; // 30 seconds
    this.ORDER_TIMEOUT_MINUTES = process.env.ORDER_TIMEOUT_MINUTES || 60; // 1 hour
    this.CLEANUP_INTERVAL = process.env.CLEANUP_INTERVAL || 3600000; // 1 hour
    this.MAX_PREPARATION_TIME = process.env.MAX_PREPARATION_TIME || 45; // 45 minutes

    // Tracking variables
    this.monitoringTimer = null;
    this.cleanupTimer = null;
    this.isRunning = false;
    this.lastCleanup = new Date();

    // Performance metrics
    this.metrics = {
      totalAssignments: 0,
      queueAssignments: 0,
      timeoutHandled: 0,
      averageAssignmentTime: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Start the time tracker with monitoring and cleanup intervals
   */
  start() {
    if (this.isRunning) {
      logger.warn("Time tracker is already running");
      return;
    }

    logger.info("Starting Time Tracker service");
    this.isRunning = true;

    // Start monitoring active orders
    this.monitoringTimer = setInterval(() => {
      this.monitorActiveOrders().catch((error) => {
        logger.error("Error in monitoring active orders:", error);
      });
    }, this.MONITORING_INTERVAL);

    // Start cleanup process
    this.cleanupTimer = setInterval(() => {
      this.performCleanup().catch((error) => {
        logger.error("Error in cleanup process:", error);
      });
    }, this.CLEANUP_INTERVAL);

    logger.info(
      `Time tracker started with monitoring interval: ${this.MONITORING_INTERVAL}ms`
    );
  }

  /**
   * Stop the time tracker
   */
  stop() {
    if (!this.isRunning) {
      logger.warn("Time tracker is not running");
      return;
    }

    logger.info("Stopping Time Tracker service");

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isRunning = false;
    logger.info("Time tracker stopped");
  }

  /**
   * Monitor active orders and trigger reassignments
   */
  async monitorActiveOrders() {
    try {
      logger.debug("Monitoring active orders for reassignments");

      // Check for completed orders that might free up waiters
      await this.checkCompletedOrders();

      // Check for timeout orders
      await this.checkTimeoutOrders();

      // Process queue assignments for available waiters
      await this.processQueueAssignments();

      // Update performance metrics
      await this.updateMetrics();
    } catch (error) {
      logger.error("Error monitoring active orders:", error);
      throw error;
    }
  }

  /**
   * Check for recently completed orders and trigger queue assignments
   */
  async checkCompletedOrders() {
    try {
      // Find orders completed in the last monitoring interval
      const recentlyCompleted = await Order.find({
        status: { $in: ["completed", "served"] },
        updatedAt: {
          $gte: new Date(Date.now() - this.MONITORING_INTERVAL * 2), // Double interval for safety
        },
        staff: { $exists: true },
      }).populate("staff", "_id name staffId hotel branch");

      for (const completedOrder of recentlyCompleted) {
        if (completedOrder.staff) {
          try {
            logger.info(
              `Checking for queue assignments after order ${completedOrder._id} completion`
            );

            // Try to assign next order from queue to this waiter
            const queueAssignment = await assignmentService.assignFromQueue(
              completedOrder.staff._id
            );

            if (queueAssignment) {
              this.metrics.queueAssignments += 1;
              logger.info(
                `Assigned queued order to waiter ${completedOrder.staff.name} after completion`
              );
            }
          } catch (error) {
            logger.error(
              `Error processing queue assignment for waiter ${completedOrder.staff._id}:`,
              error
            );
          }
        }
      }
    } catch (error) {
      logger.error("Error checking completed orders:", error);
    }
  }

  /**
   * Check for orders that have exceeded reasonable preparation time
   */
  async checkTimeoutOrders() {
    try {
      const timeoutThreshold = new Date(
        Date.now() - this.MAX_PREPARATION_TIME * 60 * 1000
      );

      // Find orders that are taking too long
      const timeoutOrders = await Order.find({
        status: { $in: ["pending", "preparing"] },
        createdAt: { $lt: timeoutThreshold },
        staff: { $exists: true },
      })
        .populate("staff", "name staffId")
        .populate("user", "name phone");

      for (const order of timeoutOrders) {
        try {
          logger.warn(
            `Order ${order._id} has exceeded maximum preparation time (${this.MAX_PREPARATION_TIME} minutes)`
          );

          // Add timeout flag and notification
          await Order.findByIdAndUpdate(order._id, {
            isTimeout: true,
            timeoutDetectedAt: new Date(),
            $push: {
              statusHistory: {
                status: "timeout_detected",
                timestamp: new Date(),
                notes: `Order exceeded ${this.MAX_PREPARATION_TIME} minutes preparation time`,
              },
            },
          });

          // Could trigger notifications here
          // await notificationService.sendTimeoutAlert(order);

          this.metrics.timeoutHandled += 1;
        } catch (error) {
          logger.error(`Error handling timeout for order ${order._id}:`, error);
        }
      }
    } catch (error) {
      logger.error("Error checking timeout orders:", error);
    }
  }

  /**
   * Process queue assignments for all available waiters
   */
  async processQueueAssignments() {
    try {
      // Get all active waiters
      const activeWaiters = await Staff.find({
        role: "waiter",
        status: "active",
        isAvailable: true,
      }).lean();

      // Check each waiter for queue assignments
      for (const waiter of activeWaiters) {
        try {
          // Check if waiter can take more orders
          const activeOrdersCount = await Order.countDocuments({
            staff: waiter._id,
            status: { $in: ["pending", "preparing", "ready"] },
          });

          const maxOrders = process.env.MAX_ORDERS_PER_WAITER || 5;

          if (activeOrdersCount < maxOrders) {
            // Try to assign from queue
            const queueAssignment = await assignmentService.assignFromQueue(
              waiter._id
            );

            if (queueAssignment) {
              this.metrics.queueAssignments += 1;
              logger.info(
                `Queue assignment: ${queueAssignment.order._id} -> ${waiter.name}`
              );
            }
          }
        } catch (error) {
          logger.error(
            `Error processing queue assignments for waiter ${waiter._id}:`,
            error
          );
        }
      }
    } catch (error) {
      logger.error("Error processing queue assignments:", error);
    }
  }

  /**
   * Update performance metrics
   */
  async updateMetrics() {
    try {
      // Calculate average assignment time for recent assignments
      const recentAssignments = await Order.find({
        assignedAt: { $exists: true },
        createdAt: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      }).select("createdAt assignedAt");

      if (recentAssignments.length > 0) {
        const totalAssignmentTime = recentAssignments.reduce((sum, order) => {
          return sum + (order.assignedAt - order.createdAt);
        }, 0);

        this.metrics.averageAssignmentTime = Math.round(
          totalAssignmentTime / recentAssignments.length / 1000
        ); // Convert to seconds
        this.metrics.totalAssignments = recentAssignments.length;
      }
    } catch (error) {
      logger.error("Error updating metrics:", error);
    }
  }

  /**
   * Perform cleanup operations
   */
  async performCleanup() {
    try {
      logger.info("Performing cleanup operations");

      // Clean expired queue entries
      await queueService.clearExpiredQueueEntries(24); // 24 hours

      // Clean up old assignment history (keep last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      await Order.updateMany(
        {},
        {
          $pull: {
            assignmentHistory: {
              assignedAt: { $lt: thirtyDaysAgo },
            },
          },
        }
      );

      // Reset daily metrics if it's a new day
      const now = new Date();
      const lastReset = new Date(this.metrics.lastReset);

      if (now.toDateString() !== lastReset.toDateString()) {
        this.resetDailyMetrics();
      }

      this.lastCleanup = new Date();
      logger.info("Cleanup operations completed");
    } catch (error) {
      logger.error("Error in cleanup operations:", error);
    }
  }

  /**
   * Reset daily metrics
   */
  resetDailyMetrics() {
    logger.info("Resetting daily metrics");

    this.metrics = {
      totalAssignments: 0,
      queueAssignments: 0,
      timeoutHandled: 0,
      averageAssignmentTime: 0,
      lastReset: new Date(),
    };
  }

  /**
   * Handle manual order completion (called from order controller)
   * @param {String} orderId - Completed order ID
   */
  async handleOrderCompletion(orderId) {
    try {
      logger.info(`Handling completion of order ${orderId}`);

      const result = await assignmentService.handleOrderCompletion(orderId);

      if (result && result.newOrderAssigned) {
        this.metrics.queueAssignments += 1;
        logger.info(
          `Automatically assigned queued order after completion of ${orderId}`
        );
      }

      return result;
    } catch (error) {
      logger.error(`Error handling order completion ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Handle order cancellation (free up waiter for queue)
   * @param {String} orderId - Cancelled order ID
   */
  async handleOrderCancellation(orderId) {
    try {
      logger.info(`Handling cancellation of order ${orderId}`);

      const order = await Order.findById(orderId);
      if (order && order.staff) {
        // Try to assign next order from queue
        const queueAssignment = await assignmentService.assignFromQueue(
          order.staff
        );

        if (queueAssignment) {
          this.metrics.queueAssignments += 1;
          logger.info(`Assigned queued order after cancellation of ${orderId}`);
          return queueAssignment;
        }
      }

      return null;
    } catch (error) {
      logger.error(`Error handling order cancellation ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get current performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      lastCleanup: this.lastCleanup,
      uptime: this.isRunning
        ? Date.now() - this.metrics.lastReset.getTime()
        : 0,
      monitoringInterval: this.MONITORING_INTERVAL,
      cleanupInterval: this.CLEANUP_INTERVAL,
    };
  }

  /**
   * Get system health status
   * @returns {Object} Health status
   */
  async getHealthStatus() {
    try {
      // Check database connectivity
      const totalOrders = await Order.countDocuments();
      const queuedOrders = await queueService.getQueueSize();
      const activeWaiters = await Staff.countDocuments({
        role: "waiter",
        status: "active",
        isAvailable: true,
      });

      return {
        status: this.isRunning ? "healthy" : "stopped",
        database: {
          connected: true,
          totalOrders,
          queuedOrders,
          activeWaiters,
        },
        services: {
          timeTracker: this.isRunning,
          assignmentService: true,
          queueService: true,
        },
        metrics: this.getMetrics(),
        lastHealthCheck: new Date(),
      };
    } catch (error) {
      logger.error("Error getting health status:", error);
      return {
        status: "unhealthy",
        error: error.message,
        lastHealthCheck: new Date(),
      };
    }
  }

  /**
   * Force a manual monitoring cycle (useful for testing)
   */
  async forceMonitoring() {
    if (!this.isRunning) {
      throw new Error("Time tracker is not running");
    }

    logger.info("Forcing manual monitoring cycle");
    await this.monitorActiveOrders();
    return { success: true, timestamp: new Date() };
  }

  /**
   * Force a manual cleanup cycle
   */
  async forceCleanup() {
    logger.info("Forcing manual cleanup cycle");
    await this.performCleanup();
    return { success: true, timestamp: new Date() };
  }
}

// Export singleton instance
const timeTracker = new TimeTracker();
export default timeTracker;
