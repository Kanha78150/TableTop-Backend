// src/services/assignmentSystemInit.js - Assignment System Initialization and Cleanup
import { Staff } from "../models/Staff.model.js";
import { Order } from "../models/Order.model.js";
import assignmentService from "./assignmentService.js";
import queueService from "./queueService.js";
import timeTracker from "./timeTracker.js";
import { logger } from "../utils/logger.js";

/**
 * Assignment System Initialization Service
 *
 * Features:
 * 1. System startup initialization
 * 2. Data consistency checks and repairs
 * 3. Background service management
 * 4. Graceful shutdown handling
 * 5. Recovery from unexpected shutdowns
 */
class AssignmentSystemInit {
  constructor() {
    this.isInitialized = false;
    this.shutdownHandlers = [];
    this.initStartTime = null;
  }

  /**
   * Initialize the assignment system
   * @param {Object} options - Initialization options
   */
  async initialize(options = {}) {
    try {
      this.initStartTime = new Date();
      logger.info("🚀 Initializing Waiter Assignment System...");

      const {
        skipDataValidation = false,
        skipTimeTracker = false,
        autoRepairData = true,
      } = options;

      // Step 1: Validate and repair data consistency
      if (!skipDataValidation) {
        await this.validateAndRepairData(autoRepairData);
      }

      // Step 2: Initialize active order counts for all waiters
      await this.initializeWaiterStats();

      // Step 3: Process any orphaned orders or queue items
      await this.processOrphanedOrders();

      // Step 4: Start background services
      if (!skipTimeTracker) {
        await this.startBackgroundServices();
      }

      // Step 5: Setup graceful shutdown handlers
      this.setupShutdownHandlers();

      this.isInitialized = true;
      const initTime = Date.now() - this.initStartTime.getTime();

      logger.info(
        `✅ Assignment System initialized successfully in ${initTime}ms`
      );

      return {
        success: true,
        initializationTime: initTime,
        timestamp: new Date(),
        services: {
          assignmentService: true,
          queueService: true,
          timeTracker: !skipTimeTracker,
        },
      };
    } catch (error) {
      logger.error("❌ Failed to initialize Assignment System:", error);
      throw error;
    }
  }

  /**
   * Validate and repair data consistency
   * @param {Boolean} autoRepair - Whether to automatically repair inconsistencies
   */
  async validateAndRepairData(autoRepair = true) {
    try {
      logger.info("🔍 Validating data consistency...");

      // Check 1: Orders with missing or invalid staff assignments
      const ordersWithInvalidStaff = await Order.find({
        status: { $in: ["pending", "preparing", "ready"] },
        $or: [{ staff: { $exists: false } }, { staff: null }],
      });

      if (ordersWithInvalidStaff.length > 0) {
        logger.warn(
          `Found ${ordersWithInvalidStaff.length} orders with missing staff assignments`
        );

        if (autoRepair) {
          // Try to reassign these orders
          for (const order of ordersWithInvalidStaff) {
            try {
              await assignmentService.assignOrder(order);
              logger.info(`Reassigned orphaned order ${order._id}`);
            } catch (assignError) {
              logger.error(
                `Failed to reassign order ${order._id}:`,
                assignError
              );
            }
          }
        }
      }

      // Check 2: Queue positions consistency
      const queuedOrders = await Order.find({
        status: "queued",
        queuePosition: { $exists: true },
      }).sort({ queuePosition: 1 });

      let expectedPosition = 1;
      const positionFixes = [];

      for (const order of queuedOrders) {
        if (order.queuePosition !== expectedPosition) {
          positionFixes.push({
            orderId: order._id,
            currentPosition: order.queuePosition,
            correctPosition: expectedPosition,
          });
        }
        expectedPosition++;
      }

      if (positionFixes.length > 0 && autoRepair) {
        logger.warn(
          `Fixing ${positionFixes.length} queue position inconsistencies`
        );

        for (const fix of positionFixes) {
          await Order.findByIdAndUpdate(fix.orderId, {
            queuePosition: fix.correctPosition,
          });
        }
      }

      // Check 3: Staff active order counts
      const waiters = await Staff.find({ role: "waiter" });
      const countMismatches = [];

      for (const waiter of waiters) {
        const actualCount = await Order.countDocuments({
          staff: waiter._id,
          status: { $in: ["pending", "preparing", "ready"] },
        });

        if (waiter.activeOrdersCount !== actualCount) {
          countMismatches.push({
            waiterId: waiter._id,
            name: waiter.name,
            storedCount: waiter.activeOrdersCount,
            actualCount,
          });
        }
      }

      if (countMismatches.length > 0 && autoRepair) {
        logger.warn(
          `Fixing ${countMismatches.length} waiter active order count mismatches`
        );

        for (const mismatch of countMismatches) {
          await Staff.findByIdAndUpdate(mismatch.waiterId, {
            activeOrdersCount: mismatch.actualCount,
          });
        }
      }

      logger.info("✅ Data consistency validation completed");

      return {
        ordersWithInvalidStaff: ordersWithInvalidStaff.length,
        queuePositionFixes: positionFixes.length,
        countMismatches: countMismatches.length,
        autoRepaired: autoRepair,
      };
    } catch (error) {
      logger.error("Error validating data consistency:", error);
      throw error;
    }
  }

  /**
   * Initialize waiter statistics and active order counts
   */
  async initializeWaiterStats() {
    try {
      logger.info("📊 Initializing waiter statistics...");

      const waiters = await Staff.find({ role: "waiter" });

      for (const waiter of waiters) {
        // Calculate accurate active orders count
        const activeOrdersCount = await Order.countDocuments({
          staff: waiter._id,
          status: { $in: ["pending", "preparing", "ready"] },
        });

        // Initialize assignment stats if not exists
        if (!waiter.assignmentStats) {
          waiter.assignmentStats = {
            totalAssignments: 0,
            completedOrders: 0,
            averageCompletionTime: 0,
            customerRating: 0,
            lastStatsUpdate: new Date(),
          };
        }

        // Set max capacity if not set
        if (!waiter.maxOrdersCapacity) {
          waiter.maxOrdersCapacity = 5; // Default capacity
        }

        // Update active orders count
        waiter.activeOrdersCount = activeOrdersCount;

        await waiter.save();
      }

      logger.info(`✅ Initialized statistics for ${waiters.length} waiters`);
    } catch (error) {
      logger.error("Error initializing waiter stats:", error);
      throw error;
    }
  }

  /**
   * Process orphaned orders and queue items
   */
  async processOrphanedOrders() {
    try {
      logger.info("🔧 Processing orphaned orders...");

      // Find orders that are in invalid states
      const orphanedOrders = await Order.find({
        $or: [
          // Orders marked as queued but not in queue
          {
            status: "queued",
            queuePosition: { $exists: false },
          },
          // Orders with queue position but not queued status
          {
            status: { $ne: "queued" },
            queuePosition: { $exists: true },
          },
          // Very old pending orders (more than 2 hours)
          {
            status: "pending",
            createdAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
            staff: { $exists: false },
          },
        ],
      });

      let repairedCount = 0;

      for (const order of orphanedOrders) {
        try {
          if (order.status === "queued" && !order.queuePosition) {
            // Add to queue properly
            await queueService.addToQueue(order, {
              hotel: order.hotel,
              branch: order.branch,
              priority: "normal",
            });
            repairedCount++;
          } else if (order.status !== "queued" && order.queuePosition) {
            // Remove queue information
            await Order.findByIdAndUpdate(order._id, {
              $unset: {
                queuePosition: 1,
                queuedAt: 1,
                priority: 1,
                priorityValue: 1,
              },
            });
            repairedCount++;
          } else if (!order.staff && order.status === "pending") {
            // Try to reassign old pending orders
            await assignmentService.assignOrder(order);
            repairedCount++;
          }
        } catch (repairError) {
          logger.error(
            `Failed to repair orphaned order ${order._id}:`,
            repairError
          );
        }
      }

      logger.info(
        `✅ Processed ${orphanedOrders.length} orphaned orders, repaired ${repairedCount}`
      );
    } catch (error) {
      logger.error("Error processing orphaned orders:", error);
      throw error;
    }
  }

  /**
   * Start background services
   */
  async startBackgroundServices() {
    try {
      logger.info("🔄 Starting background services...");

      // Start time tracker
      timeTracker.start();

      // Schedule daily cleanup
      this.scheduleDailyCleanup();

      logger.info("✅ Background services started");
    } catch (error) {
      logger.error("Error starting background services:", error);
      throw error;
    }
  }

  /**
   * Schedule daily cleanup tasks
   */
  scheduleDailyCleanup() {
    // Run cleanup every 24 hours
    setInterval(async () => {
      try {
        logger.info("🧹 Running daily cleanup...");

        // Clear old assignment history
        await Order.updateMany(
          {},
          {
            $pull: {
              assignmentHistory: {
                assignedAt: {
                  $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
              },
            },
          }
        );

        // Clear expired queue entries
        await queueService.clearExpiredQueueEntries(24);

        // Reset daily metrics in time tracker
        timeTracker.resetDailyMetrics();

        logger.info("✅ Daily cleanup completed");
      } catch (error) {
        logger.error("Error in daily cleanup:", error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours
  }

  /**
   * Setup graceful shutdown handlers
   */
  setupShutdownHandlers() {
    const shutdown = async (signal) => {
      logger.info(
        `📴 Received ${signal}, shutting down Assignment System gracefully...`
      );

      try {
        await this.shutdown();
        process.exit(0);
      } catch (error) {
        logger.error("Error during shutdown:", error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGUSR2", () => shutdown("SIGUSR2")); // nodemon restart

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception:", error);
      shutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);
      shutdown("UNHANDLED_REJECTION");
    });
  }

  /**
   * Graceful shutdown of the assignment system
   */
  async shutdown() {
    try {
      logger.info("🔄 Starting graceful shutdown...");

      // Stop time tracker
      timeTracker.stop();

      // Save current state
      await this.saveSystemState();

      // Run any custom shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (error) {
          logger.error("Error in shutdown handler:", error);
        }
      }

      this.isInitialized = false;
      logger.info("✅ Assignment System shutdown completed");
    } catch (error) {
      logger.error("Error during shutdown:", error);
      throw error;
    }
  }

  /**
   * Save current system state for recovery
   */
  async saveSystemState() {
    try {
      // Update all waiter active order counts one final time
      const waiters = await Staff.find({ role: "waiter" });

      for (const waiter of waiters) {
        const activeCount = await Order.countDocuments({
          staff: waiter._id,
          status: { $in: ["pending", "preparing", "ready"] },
        });

        await Staff.findByIdAndUpdate(waiter._id, {
          activeOrdersCount: activeCount,
          lastUpdated: new Date(),
        });
      }

      logger.info("💾 System state saved");
    } catch (error) {
      logger.error("Error saving system state:", error);
    }
  }

  /**
   * Add custom shutdown handler
   * @param {Function} handler - Async function to run during shutdown
   */
  addShutdownHandler(handler) {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Get system status
   * @returns {Object} System status information
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      initStartTime: this.initStartTime,
      uptime: this.isInitialized
        ? Date.now() - this.initStartTime?.getTime()
        : 0,
      services: {
        assignmentService: true,
        queueService: true,
        timeTracker: timeTracker.isRunning,
      },
      shutdownHandlers: this.shutdownHandlers.length,
    };
  }

  /**
   * Health check for the assignment system
   * @returns {Object} Health check result
   */
  async healthCheck() {
    try {
      if (!this.isInitialized) {
        return {
          status: "unhealthy",
          reason: "System not initialized",
          timestamp: new Date(),
        };
      }

      // Basic database connectivity check
      const waiterCount = await Staff.countDocuments({ role: "waiter" });
      const activeOrderCount = await Order.countDocuments({
        status: { $in: ["pending", "preparing", "ready"] },
      });

      return {
        status: "healthy",
        services: {
          database: true,
          timeTracker: timeTracker.isRunning,
          assignmentService: true,
          queueService: true,
        },
        stats: {
          totalWaiters: waiterCount,
          activeOrders: activeOrderCount,
        },
        uptime: Date.now() - this.initStartTime?.getTime(),
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date(),
      };
    }
  }
}

// Export singleton instance
const assignmentSystemInit = new AssignmentSystemInit();
export default assignmentSystemInit;
