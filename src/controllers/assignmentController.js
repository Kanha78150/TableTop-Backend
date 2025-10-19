// src/controllers/assignmentController.js - Waiter Assignment Management Controller
import assignmentService from "../services/assignmentService.js";
import queueService from "../services/queueService.js";
import timeTracker from "../services/timeTracker.js";
import { Order } from "../models/Order.model.js";
import { Staff } from "../models/Staff.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { Manager } from "../models/Manager.model.js";
import { APIResponse } from "../utils/APIResponse.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";
import Joi from "joi";

/**
 * Assignment Controller for Waiter Management System
 *
 * Endpoints:
 * 1. Manual order assignment
 * 2. Get assignment statistics
 * 3. Queue management
 * 4. Waiter availability management
 * 5. System monitoring and health checks
 */

/**
 * Manually assign order to specific waiter
 * POST /api/v1/assignment/manual-assign
 * @access Manager/Admin
 */
export const manualAssignOrder = async (req, res, next) => {
  try {
    const { orderId, waiterId, reason } = req.body;

    // Validate input
    const { error } = validateManualAssignment(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Perform manual assignment
    const result = await assignmentService.manualAssignment(
      orderId,
      waiterId,
      reason
    );

    logger.info(
      `Manual assignment completed: Order ${orderId} -> Waiter ${waiterId} by ${req.user.name}`
    );

    res
      .status(200)
      .json(
        new APIResponse(200, result, "Order manually assigned successfully")
      );
  } catch (error) {
    logger.error("Manual assignment failed:", error);
    next(error);
  }
};

/**
 * Get assignment statistics for a branch/hotel
 * GET /api/v1/assignment/stats
 * @access Manager/Admin
 */
export const getAssignmentStats = async (req, res, next) => {
  try {
    const { hotelId, branchId } = req.query;

    // Validate query parameters
    const { error } = validateStatsQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Get assignment statistics
    const stats = await assignmentService.getAssignmentStats(hotelId, branchId);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          stats,
          "Assignment statistics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting assignment stats:", error);
    next(error);
  }
};

/**
 * Get queue details and statistics
 * GET /api/v1/assignment/queue
 * @access Manager/Admin/Staff
 */
export const getQueueDetails = async (req, res, next) => {
  try {
    const { hotelId, branchId, limit, skip } = req.query;

    // Validate query parameters
    const { error } = validateQueueQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Get queue details
    const queueDetails = await queueService.getQueueDetails(
      { hotel: hotelId, branch: branchId },
      { limit: parseInt(limit) || 20, skip: parseInt(skip) || 0 }
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          queueDetails,
          "Queue details retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting queue details:", error);
    next(error);
  }
};

/**
 * Update queue priority for an order
 * PUT /api/v1/assignment/queue/:orderId/priority
 * @access Manager/Admin
 */
export const updateQueuePriority = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { priority } = req.body;

    // Validate input
    const { error } = validatePriorityUpdate({ orderId, priority });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Update priority
    const result = await queueService.updateQueuePriority(orderId, priority);

    logger.info(
      `Queue priority updated: Order ${orderId} -> ${priority} by ${req.user.name}`
    );

    res
      .status(200)
      .json(
        new APIResponse(200, result, "Queue priority updated successfully")
      );
  } catch (error) {
    logger.error("Error updating queue priority:", error);
    next(error);
  }
};

/**
 * Get available waiters for assignment
 * GET /api/v1/assignment/waiters/available
 * @access Manager/Admin/Staff
 */
export const getAvailableWaiters = async (req, res, next) => {
  try {
    const { hotelId, branchId } = req.query;

    // Validate query parameters
    const { error } = validateWaitersQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Get available waiters
    const waiters = await assignmentService.getAvailableWaiters(
      hotelId,
      branchId
    );

    // Add additional stats for each waiter
    const waitersWithStats = await Promise.all(
      waiters.map(async (waiter) => {
        // Get recent order completion stats
        const recentOrders = await Order.find({
          staff: waiter._id,
          status: "completed",
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        }).select("actualServiceTime customerRating");

        const avgServiceTime =
          recentOrders.length > 0
            ? recentOrders.reduce(
                (sum, order) => sum + (order.actualServiceTime || 0),
                0
              ) / recentOrders.length
            : 0;

        const avgRating =
          recentOrders.length > 0
            ? recentOrders.reduce(
                (sum, order) => sum + (order.customerRating || 0),
                0
              ) / recentOrders.length
            : 0;

        return {
          ...waiter,
          recentStats: {
            ordersToday: recentOrders.length,
            avgServiceTime: Math.round(avgServiceTime),
            avgRating: parseFloat(avgRating.toFixed(2)),
            canTakeOrders: waiter.activeOrdersCount < waiter.maxOrdersCapacity,
          },
        };
      })
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { waiters: waitersWithStats },
          "Available waiters retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting available waiters:", error);
    next(error);
  }
};

/**
 * Update waiter availability status
 * PUT /api/v1/assignment/waiters/:waiterId/availability
 * @access Manager/Admin or Self
 */
export const updateWaiterAvailability = async (req, res, next) => {
  try {
    const { waiterId } = req.params;
    const { isAvailable, status, maxOrdersCapacity } = req.body;

    // Validate input
    const { error } = validateAvailabilityUpdate(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Check permissions - waiter can only update their own status
    const isManager = req.user.role === "manager" || req.user.role === "admin";
    const isSelf = req.user._id.toString() === waiterId;

    if (!isManager && !isSelf) {
      return next(
        new APIError(403, "You can only update your own availability")
      );
    }

    // Update waiter
    const updateData = {};
    if (typeof isAvailable === "boolean") updateData.isAvailable = isAvailable;
    if (status) updateData.status = status;
    if (maxOrdersCapacity && isManager)
      updateData.maxOrdersCapacity = maxOrdersCapacity;

    const updatedWaiter = await Staff.findByIdAndUpdate(waiterId, updateData, {
      new: true,
    }).select(
      "name staffId isAvailable status maxOrdersCapacity activeOrdersCount"
    );

    if (!updatedWaiter) {
      return next(new APIError(404, "Waiter not found"));
    }

    logger.info(`Waiter availability updated: ${waiterId} by ${req.user.name}`);

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { waiter: updatedWaiter },
          "Waiter availability updated successfully"
        )
      );
  } catch (error) {
    logger.error("Error updating waiter availability:", error);
    next(error);
  }
};

/**
 * Get system health and performance metrics
 * GET /api/v1/assignment/system/health
 * @access Manager/Admin
 */
export const getSystemHealth = async (req, res, next) => {
  try {
    // Get health status from time tracker
    const healthStatus = await timeTracker.getHealthStatus();

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          healthStatus,
          "System health retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting system health:", error);
    next(error);
  }
};

/**
 * Get time tracker performance metrics
 * GET /api/v1/assignment/system/metrics
 * @access Manager/Admin
 */
export const getPerformanceMetrics = async (req, res, next) => {
  try {
    const metrics = timeTracker.getMetrics();

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          metrics,
          "Performance metrics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting performance metrics:", error);
    next(error);
  }
};

/**
 * Force manual monitoring cycle (for testing/debugging)
 * POST /api/v1/assignment/system/force-monitoring
 * @access Admin only
 */
export const forceMonitoring = async (req, res, next) => {
  try {
    // Only admin can force monitoring
    if (req.user.role !== "admin") {
      return next(new APIError(403, "Admin access required"));
    }

    const result = await timeTracker.forceMonitoring();

    logger.info(`Manual monitoring forced by admin ${req.user.name}`);

    res
      .status(200)
      .json(new APIResponse(200, result, "Manual monitoring cycle completed"));
  } catch (error) {
    logger.error("Error forcing monitoring:", error);
    next(error);
  }
};

/**
 * Reset round-robin tracking
 * POST /api/v1/assignment/system/reset-round-robin
 * @access Manager/Admin
 */
export const resetRoundRobin = async (req, res, next) => {
  try {
    const { branchId } = req.body;

    assignmentService.resetRoundRobin(branchId);

    logger.info(
      `Round-robin reset for branch ${branchId || "all"} by ${req.user.name}`
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { branchId, resetAt: new Date() },
          "Round-robin tracking reset successfully"
        )
      );
  } catch (error) {
    logger.error("Error resetting round-robin:", error);
    next(error);
  }
};

/**
 * Get waiter performance report
 * GET /api/v1/assignment/waiters/:waiterId/performance
 * @access Manager/Admin
 */
export const getWaiterPerformance = async (req, res, next) => {
  try {
    const { waiterId } = req.params;
    const { days = 7 } = req.query;

    // Validate waiter exists
    const waiter = await Staff.findById(waiterId);
    if (!waiter || waiter.role !== "waiter") {
      return next(new APIError(404, "Waiter not found"));
    }

    // Calculate date range
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get orders handled by this waiter
    const orders = await Order.find({
      staff: waiterId,
      createdAt: { $gte: startDate },
    }).select(
      "status totalPrice actualServiceTime customerRating createdAt updatedAt"
    );

    // Calculate performance metrics
    const totalOrders = orders.length;
    const completedOrders = orders.filter(
      (o) => o.status === "completed"
    ).length;
    const totalRevenue = orders.reduce(
      (sum, order) => sum + order.totalPrice,
      0
    );
    const avgServiceTime =
      completedOrders > 0
        ? orders
            .filter((o) => o.actualServiceTime)
            .reduce((sum, o) => sum + o.actualServiceTime, 0) / completedOrders
        : 0;
    const avgRating =
      orders.filter((o) => o.customerRating).length > 0
        ? orders
            .filter((o) => o.customerRating)
            .reduce((sum, o) => sum + o.customerRating, 0) /
          orders.filter((o) => o.customerRating).length
        : 0;

    // Group by day for trend analysis
    const dailyStats = {};
    orders.forEach((order) => {
      const day = order.createdAt.toDateString();
      if (!dailyStats[day]) {
        dailyStats[day] = { orders: 0, revenue: 0, completed: 0 };
      }
      dailyStats[day].orders += 1;
      dailyStats[day].revenue += order.totalPrice;
      if (order.status === "completed") {
        dailyStats[day].completed += 1;
      }
    });

    const performanceReport = {
      waiter: {
        id: waiter._id,
        name: waiter.name,
        staffId: waiter.staffId,
      },
      period: {
        days: days,
        startDate: startDate,
        endDate: new Date(),
      },
      summary: {
        totalOrders,
        completedOrders,
        completionRate:
          totalOrders > 0
            ? ((completedOrders / totalOrders) * 100).toFixed(2)
            : 0,
        totalRevenue,
        avgOrderValue:
          totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(2) : 0,
        avgServiceTime: Math.round(avgServiceTime),
        avgCustomerRating: parseFloat(avgRating.toFixed(2)),
      },
      dailyTrends: Object.entries(dailyStats)
        .map(([date, stats]) => ({
          date,
          ...stats,
          completionRate:
            stats.orders > 0
              ? ((stats.completed / stats.orders) * 100).toFixed(2)
              : 0,
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          performanceReport,
          "Waiter performance report generated successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting waiter performance:", error);
    next(error);
  }
};

// Validation schemas
const validateManualAssignment = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().length(24).hex().required().messages({
      "string.length": "Order ID must be 24 characters",
      "string.hex": "Order ID must be valid",
      "any.required": "Order ID is required",
    }),
    waiterId: Joi.string().length(24).hex().required().messages({
      "string.length": "Waiter ID must be 24 characters",
      "string.hex": "Waiter ID must be valid",
      "any.required": "Waiter ID is required",
    }),
    reason: Joi.string().min(3).max(200).optional().messages({
      "string.min": "Reason must be at least 3 characters",
      "string.max": "Reason cannot exceed 200 characters",
    }),
  });
  return schema.validate(data);
};

const validateStatsQuery = (data) => {
  const schema = Joi.object({
    hotelId: Joi.string().length(24).hex().required().messages({
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
      "any.required": "Hotel ID is required",
    }),
    branchId: Joi.string().length(24).hex().optional().messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
  });
  return schema.validate(data);
};

const validateQueueQuery = (data) => {
  const schema = Joi.object({
    hotelId: Joi.string().length(24).hex().required(),
    branchId: Joi.string().length(24).hex().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    skip: Joi.number().integer().min(0).optional(),
  });
  return schema.validate(data);
};

const validatePriorityUpdate = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().length(24).hex().required(),
    priority: Joi.string().valid("low", "normal", "high").required(),
  });
  return schema.validate(data);
};

const validateWaitersQuery = (data) => {
  const schema = Joi.object({
    hotelId: Joi.string().length(24).hex().required(),
    branchId: Joi.string().length(24).hex().optional(),
  });
  return schema.validate(data);
};

const validateAvailabilityUpdate = (data) => {
  const schema = Joi.object({
    isAvailable: Joi.boolean().optional(),
    status: Joi.string()
      .valid("active", "inactive", "on_break", "on_leave")
      .optional(),
    maxOrdersCapacity: Joi.number().integer().min(1).max(10).optional(),
  });
  return schema.validate(data);
};

/**
 * Validate organizational hierarchy for a hotel/branch
 * GET /api/v1/assignment/validate-hierarchy/:hotelId/:branchId?
 * @access Manager/Admin
 */
export const validateHierarchy = async (req, res, next) => {
  try {
    const { hotelId, branchId } = req.params;

    // Validate input
    const schema = Joi.object({
      hotelId: Joi.string().required(),
      branchId: Joi.string().optional(),
    });

    const { error } = schema.validate({ hotelId, branchId });
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Validate hierarchy using assignment service
    const validation = await assignmentService.validateOrganizationalHierarchy(
      hotelId,
      branchId
    );

    return res.status(200).json(
      new APIResponse(
        200,
        {
          hotelId,
          branchId: branchId || null,
          validation,
        },
        "Hierarchy validation completed"
      )
    );
  } catch (error) {
    logger.error("Error validating hierarchy:", error);
    return next(new APIError(500, "Failed to validate hierarchy"));
  }
};

/**
 * Get detailed staff hierarchy for a hotel/branch
 * GET /api/v1/assignment/staff-hierarchy/:hotelId/:branchId?
 * @access Manager/Admin
 */
export const getStaffHierarchy = async (req, res, next) => {
  try {
    const { hotelId, branchId } = req.params;

    // Validate input
    const schema = Joi.object({
      hotelId: Joi.string().required(),
      branchId: Joi.string().optional(),
    });

    const { error } = schema.validate({ hotelId, branchId });
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Get available waiters with hierarchy validation
    const waiters = await assignmentService.getAvailableWaiters(
      hotelId,
      branchId
    );

    // Get hierarchy validation info
    const hierarchyValidation =
      await assignmentService.validateOrganizationalHierarchy(
        hotelId,
        branchId
      );

    // Get detailed hierarchy structure
    const hotel = await Hotel.findById(hotelId)
      .populate("createdBy", "name email role")
      .lean();
    let branch = null;
    let managers = [];

    if (branchId) {
      branch = await Branch.findById(branchId)
        .populate("createdBy", "name email role")
        .lean();
      managers = await Manager.find({ branch: branchId })
        .populate("createdBy", "name email role")
        .lean();
    } else {
      managers = await Manager.find({ hotel: hotelId })
        .populate("createdBy", "name email role")
        .lean();
    }

    const hierarchyStructure = {
      admin: hotel.createdBy,
      hotel: {
        _id: hotel._id,
        name: hotel.name,
        hotelId: hotel.hotelId,
      },
      branch: branch
        ? {
            _id: branch._id,
            name: branch.name,
            branchId: branch.branchId,
          }
        : null,
      managers: managers.map((manager) => ({
        _id: manager._id,
        name: manager.name,
        managerId: manager.managerId,
        createdBy: manager.createdBy,
      })),
      waiters: waiters.map((waiter) => ({
        _id: waiter._id,
        name: waiter.name,
        staffId: waiter.staffId,
        activeOrdersCount: waiter.activeOrdersCount,
        manager: waiter.manager,
      })),
    };

    return res.status(200).json(
      new APIResponse(
        200,
        {
          hierarchyValidation,
          hierarchyStructure,
          totalValidWaiters: waiters.length,
        },
        "Staff hierarchy retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting staff hierarchy:", error);
    return next(new APIError(500, "Failed to get staff hierarchy"));
  }
};

/**
 * Test assignment for a specific order scenario
 * POST /api/v1/assignment/test-assignment
 * @access Manager/Admin
 */
export const testAssignment = async (req, res, next) => {
  try {
    const { hotelId, branchId, tableId, testType = "hierarchy" } = req.body;

    // Validate input
    const schema = Joi.object({
      hotelId: Joi.string().required(),
      branchId: Joi.string().optional(),
      tableId: Joi.string().optional(),
      testType: Joi.string()
        .valid("hierarchy", "load-balance", "round-robin")
        .default("hierarchy"),
    });

    const { error } = schema.validate({ hotelId, branchId, tableId, testType });
    if (error) {
      return next(new APIError(400, error.details[0].message));
    }

    // Create a mock order scenario for testing
    const mockOrder = {
      hotel: hotelId,
      branch: branchId,
      table: tableId,
      status: "pending",
      items: [{ name: "Test Item", quantity: 1, price: 10 }],
      totalAmount: 10,
    };

    let testResults = {};

    if (testType === "hierarchy") {
      // Test hierarchy validation
      const hierarchyValidation =
        await assignmentService.validateOrganizationalHierarchy(
          hotelId,
          branchId
        );
      const availableWaiters = await assignmentService.getAvailableWaiters(
        hotelId,
        branchId
      );

      testResults = {
        testType: "Hierarchy Validation",
        hierarchyValidation,
        availableWaiters: availableWaiters.length,
        waitersDetails: availableWaiters.map((w) => ({
          staffId: w.staffId,
          name: w.name,
          activeOrders: w.activeOrdersCount,
          manager: w.manager,
        })),
      };
    } else if (testType === "load-balance") {
      // Test load balancing assignment
      const waiters = await assignmentService.getAvailableWaiters(
        hotelId,
        branchId
      );
      if (waiters.length > 0) {
        const selectedWaiter = await assignmentService.selectBestWaiter(
          waiters,
          branchId
        );
        testResults = {
          testType: "Load Balance Assignment",
          totalWaiters: waiters.length,
          selectedWaiter: {
            staffId: selectedWaiter.staffId,
            name: selectedWaiter.name,
            activeOrders: selectedWaiter.activeOrdersCount,
          },
          selectionReason:
            selectedWaiter.activeOrdersCount ===
            Math.min(...waiters.map((w) => w.activeOrdersCount))
              ? "Lowest load"
              : "Round-robin selection",
        };
      } else {
        testResults = {
          testType: "Load Balance Assignment",
          error: "No available waiters found",
        };
      }
    }

    return res.status(200).json(
      new APIResponse(
        200,
        {
          mockOrder,
          testResults,
          timestamp: new Date().toISOString(),
        },
        `Assignment test (${testType}) completed successfully`
      )
    );
  } catch (error) {
    logger.error("Error testing assignment:", error);
    return next(new APIError(500, "Failed to test assignment"));
  }
};

// Add new endpoints to export
export default {
  manualAssignOrder,
  getAssignmentStats,
  getQueueDetails,
  updateQueuePriority,
  getAvailableWaiters,
  updateWaiterAvailability,
  getSystemHealth,
  getPerformanceMetrics,
  forceMonitoring,
  resetRoundRobin,
  getWaiterPerformance,
  validateHierarchy,
  getStaffHierarchy,
  testAssignment,
};
