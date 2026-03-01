// src/controllers/assignmentController.js - Waiter Assignment Management Controller
import assignmentService from "../services/assignment/assignment.service.js";
import queueService from "../services/queue.service.js";
import timeTracker from "../services/timeTracker.service.js";
import { Order } from "../models/Order.model.js";
import { Staff } from "../models/Staff.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Branch } from "../models/Branch.model.js";
import { Manager } from "../models/Manager.model.js";
import { APIResponse } from "../utils/APIResponse.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";
import Joi from "joi";
import { asyncHandler } from "../middleware/errorHandler.middleware.js";

/**
 * Helper function to parse date strings in multiple formats
 * Accepts: YYYY-MM-DD, DD-MM-YYYY, or ISO string
 */
const parseDateString = (dateString) => {
  if (!dateString) return null;

  // Try parsing as ISO date first
  let date = new Date(dateString);
  if (!isNaN(date.getTime())) return date;

  // Try parsing DD-MM-YYYY format
  const ddmmyyyyPattern = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = dateString.match(ddmmyyyyPattern);
  if (match) {
    const [, day, month, year] = match;
    date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) return date;
  }

  return new Date(dateString);
};

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
export const manualAssignOrder = asyncHandler(async (req, res, next) => {
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
    .json(new APIResponse(200, result, "Order manually assigned successfully"));
});

/**
 * Get assignment statistics for a branch/hotel
 * GET /api/v1/assignment/stats
 * @access Manager/Admin
 */
export const getAssignmentStats = asyncHandler(async (req, res, next) => {
  const {
    hotelId,
    branchId,
    startDate: startDateParam,
    endDate: endDateParam,
  } = req.query;

  // Validate query parameters
  const { error } = validateStatsQuery(req.query);
  if (error) {
    return next(new APIError(400, "Invalid query parameters", error.details));
  }

  // Parse date range if provided
  let startDate, endDate;
  if (startDateParam) {
    startDate = parseDateString(startDateParam);
  }
  if (endDateParam) {
    endDate = parseDateString(endDateParam);
    endDate.setHours(23, 59, 59, 999);
  }

  // Get assignment statistics
  const stats = await assignmentService.getAssignmentStats(
    hotelId,
    branchId,
    startDate,
    endDate
  );

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        stats,
        "Assignment statistics retrieved successfully"
      )
    );
});

/**
 * Get queue details and statistics
 * GET /api/v1/assignment/queue
 * @access Manager/Admin
 */
export const getQueueDetails = asyncHandler(async (req, res, next) => {
  const { hotelId, branchId, limit, skip } = req.query;

  // Validate query parameters
  const { error } = validateQueueQuery(req.query);
  if (error) {
    return next(new APIError(400, "Invalid query parameters", error.details));
  }

  // Ownership verification for admin users
  if (req.userType === "admin" && req.admin.role !== "super_admin") {
    const hotel = await Hotel.findById(hotelId).select("createdBy");
    if (!hotel || hotel.createdBy.toString() !== req.admin._id.toString()) {
      return next(new APIError(403, "You do not have access to this hotel"));
    }
  }

  // Get queue details
  const queueDetails = await queueService.getQueueDetails(
    { hotel: hotelId, branch: branchId },
    { limit: parseInt(limit) || 20, skip: parseInt(skip) || 0 }
  );

  res
    .status(200)
    .json(
      new APIResponse(200, queueDetails, "Queue details retrieved successfully")
    );
});

/**
 * Update queue priority for an order
 * PUT /api/v1/assignment/queue/:orderId/priority
 * @access Manager/Admin
 */
export const updateQueuePriority = asyncHandler(async (req, res, next) => {
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
    .json(new APIResponse(200, result, "Queue priority updated successfully"));
});

/**
 * Get available waiters for assignment
 * GET /api/v1/assignment/waiters/available
 * @access Manager/Admin
 */
export const getAvailableWaiters = asyncHandler(async (req, res, next) => {
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
});

/**
 * Update waiter availability status
 * PUT /api/v1/assignment/waiters/:waiterId/availability
 * @access Manager/Admin or Self
 */
export const updateWaiterAvailability = asyncHandler(async (req, res, next) => {
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
    return next(new APIError(403, "You can only update your own availability"));
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
});

/**
 * Get system health and performance metrics
 * GET /api/v1/assignment/system/health
 * @access Manager/Admin
 */
export const getSystemHealth = asyncHandler(async (req, res) => {
  // Get health status from time tracker
  const healthStatus = await timeTracker.getHealthStatus();

  res
    .status(200)
    .json(
      new APIResponse(200, healthStatus, "System health retrieved successfully")
    );
});

/**
 * Get time tracker performance metrics
 * GET /api/v1/assignment/system/metrics?startDate=DD-MM-YYYY&endDate=DD-MM-YYYY
 * @access Manager/Admin
 */
export const getPerformanceMetrics = asyncHandler(async (req, res, next) => {
  const {
    startDate: startDateParam,
    endDate: endDateParam,
    hotelId,
    branchId,
  } = req.query;

  // Default to last 30 days if no dates provided
  let startDate, endDate;
  if (startDateParam) {
    startDate = parseDateString(startDateParam);
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
  }
  startDate.setHours(0, 0, 0, 0);

  if (endDateParam) {
    endDate = parseDateString(endDateParam);
  } else {
    endDate = new Date();
  }
  endDate.setHours(23, 59, 59, 999);

  // Query orders within the date range that have a staff assignment
  const dateFilter = {
    createdAt: { $gte: startDate, $lte: endDate },
  };

  // Auto-scope by user role
  if (req.userType === "manager" && req.manager) {
    // Manager: scope to their hotel/branch
    if (req.manager.hotel)
      dateFilter.hotel = req.manager.hotel._id || req.manager.hotel;
    if (req.manager.branch)
      dateFilter.branch = req.manager.branch._id || req.manager.branch;
  } else if (req.userType === "admin") {
    if (req.admin.role === "branch_admin") {
      const assignedBranches = req.admin.assignedBranches || [];
      if (assignedBranches.length > 0) {
        dateFilter.branch = { $in: assignedBranches.map((b) => b._id || b) };
      }
    } else if (req.admin.role !== "super_admin") {
      // Regular admin: auto-scope to their own hotels
      const adminHotels = await Hotel.find({ createdBy: req.admin._id }).select(
        "_id"
      );
      const adminHotelIds = adminHotels.map((h) => h._id);
      if (adminHotelIds.length > 0) {
        dateFilter.hotel = { $in: adminHotelIds };
      }
    }
    // super_admin: no additional filter (can see all)
  }

  // Allow further drill-down by hotelId/branchId query params
  if (hotelId) {
    // Verify ownership for non-super_admin
    if (req.userType === "admin" && req.admin.role !== "super_admin") {
      const hotel = await Hotel.findById(hotelId).select("createdBy");
      if (!hotel || hotel.createdBy.toString() !== req.admin._id.toString()) {
        return next(new APIError(403, "You do not have access to this hotel"));
      }
    }
    dateFilter.hotel = hotelId;
  }
  if (branchId) {
    dateFilter.branch = branchId;
  }

  const [totalAssignments, timeoutOrders, avgAssignmentTime] =
    await Promise.all([
      // Total orders assigned to staff in this period
      Order.countDocuments({
        ...dateFilter,
        staff: { $exists: true, $ne: null },
      }),

      // Orders that were cancelled due to timeout in this period
      Order.countDocuments({ ...dateFilter, status: "cancelled" }),

      // Average time between order creation and staff assignment
      Order.aggregate([
        {
          $match: {
            ...dateFilter,
            staff: { $exists: true, $ne: null },
            assignedAt: { $exists: true },
          },
        },
        {
          $project: {
            assignmentTime: {
              $subtract: ["$assignedAt", "$createdAt"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgTime: { $avg: "$assignmentTime" },
          },
        },
      ]),
    ]);

  // Get real-time system status from in-memory tracker
  const systemStatus = {
    isRunning: timeTracker.isRunning,
    lastCleanup: timeTracker.lastCleanup,
    uptime: timeTracker.isRunning
      ? Date.now() - timeTracker.metrics.lastReset.getTime()
      : 0,
    monitoringInterval: timeTracker.MONITORING_INTERVAL,
    cleanupInterval: timeTracker.CLEANUP_INTERVAL,
  };

  const metrics = {
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    totalAssignments,
    timeoutHandled: timeoutOrders,
    averageAssignmentTime:
      avgAssignmentTime.length > 0
        ? Math.round(avgAssignmentTime[0].avgTime)
        : 0,
    ...systemStatus,
  };

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        metrics,
        "Performance metrics retrieved successfully"
      )
    );
});

/**
 * Force manual monitoring cycle (for testing/debugging)
 * POST /api/v1/assignment/system/force-monitoring
 * @access Admin only
 */
export const forceMonitoring = asyncHandler(async (req, res, next) => {
  // Only admin can force monitoring
  if (req.user.role !== "admin") {
    return next(new APIError(403, "Admin access required"));
  }

  const result = await timeTracker.forceMonitoring();

  logger.info(`Manual monitoring forced by admin ${req.user.name}`);

  res
    .status(200)
    .json(new APIResponse(200, result, "Manual monitoring cycle completed"));
});

/**
 * Reset round-robin tracking
 * POST /api/v1/assignment/system/reset-round-robin
 * @access Manager/Admin
 */
export const resetRoundRobin = asyncHandler(async (req, res, next) => {
  const { hotelId, branchId } = req.body;

  // Validate request body
  const { error } = validateRoundRobinReset(req.body);
  if (error) {
    return next(new APIError(400, "Invalid request parameters", error.details));
  }

  // Reset round-robin with hotel and branch context
  assignmentService.resetRoundRobin(hotelId, branchId);

  const scope = branchId
    ? `hotel ${hotelId}, branch ${branchId}`
    : `hotel ${hotelId} (all branches)`;
  logger.info(`Round-robin reset for ${scope} by ${req.user.name}`);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { hotelId, branchId, resetAt: new Date(), scope },
        "Round-robin tracking reset successfully"
      )
    );
});

/**
 * Get waiter performance report
 * GET /api/v1/assignment/waiters/:waiterId/performance
 * @access Manager/Admin
 */
export const getWaiterPerformance = asyncHandler(async (req, res, next) => {
  const { waiterId } = req.params;
  const {
    days = 7,
    startDate: startDateParam,
    endDate: endDateParam,
  } = req.query;

  // Validate waiter exists
  const waiter = await Staff.findById(waiterId);
  if (!waiter || waiter.role !== "waiter") {
    return next(new APIError(404, "Waiter not found"));
  }

  // Calculate date range - prefer startDate/endDate params, fallback to days
  let startDate, endDate;

  if (startDateParam) {
    startDate = parseDateString(startDateParam);
  } else {
    startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  if (endDateParam) {
    endDate = parseDateString(endDateParam);
    endDate.setHours(23, 59, 59, 999);
  } else {
    endDate = new Date();
  }

  // Get orders handled by this waiter
  const orders = await Order.find({
    staff: waiterId,
    createdAt: { $gte: startDate, $lte: endDate },
  }).select(
    "status totalPrice actualServiceTime customerRating createdAt updatedAt"
  );

  // Calculate performance metrics
  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status === "completed").length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);
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

  // Build period label
  const periodLabel = startDateParam
    ? `${startDateParam} to ${endDateParam || "now"}`
    : `${days} days`;

  const performanceReport = {
    waiter: {
      id: waiter._id,
      name: waiter.name,
      staffId: waiter.staffId,
    },
    period: {
      label: periodLabel,
      startDate: startDate,
      endDate: endDate,
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
});

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
    startDate: Joi.string().optional().messages({
      "string.base": "Start date must be a string",
    }),
    endDate: Joi.string().optional().messages({
      "string.base": "End date must be a string",
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

const validateRoundRobinReset = (data) => {
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
