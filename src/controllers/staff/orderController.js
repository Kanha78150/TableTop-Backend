// src/controllers/staff/orderController.js - Staff Order Management Controller
import { Order } from "../../models/Order.model.js";
import { Staff } from "../../models/Staff.model.js";
import { Table } from "../../models/Table.model.js";
import assignmentService from "../../services/assignmentService.js";
import timeTracker from "../../services/timeTracker.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import Joi from "joi";

/**
 * Get orders assigned to current staff member
 * GET /api/v1/staff/orders/my-orders
 * @access Staff
 */
export const getMyOrders = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const { status, limit, page, sortBy, sortOrder } = req.query;

    // Validate query parameters
    const { error } = validateGetOrdersQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    // Calculate pagination
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 20;
    const skip = (pageNumber - 1) * limitNumber;

    // Build query filter
    const filter = { staff: staffId };
    if (status && status !== "all") {
      if (status === "active") {
        filter.status = { $in: ["pending", "confirmed", "preparing", "ready"] };
      } else {
        filter.status = status;
      }
    }

    // Build sort criteria
    const sort = {};
    sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

    // Get orders
    const orders = await Order.find(filter)
      .populate("user", "name phone")
      .populate("table", "tableNumber")
      .populate("hotel", "name")
      .populate("branch", "name")
      .sort(sort)
      .limit(limitNumber)
      .skip(skip);

    const totalCount = await Order.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / limitNumber);

    res.status(200).json(
      new APIResponse(
        200,
        {
          orders,
          pagination: {
            total: totalCount,
            page: pageNumber,
            pages: totalPages,
            limit: limitNumber,
            hasMore: pageNumber < totalPages,
          },
        },
        "Orders retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting staff orders:", error);
    next(error);
  }
};

/**
 * Update order status
 * PUT /api/v1/staff/orders/:orderId/status
 * @access Staff
 */
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    const staffId = req.user._id;

    // Validate input
    const { error } = validateStatusUpdate({ orderId, status, notes });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Get current order
    const order = await Order.findById(orderId);
    if (!order) {
      return next(new APIError(404, "Order not found"));
    }

    // Check if staff is assigned to this order
    if (order.staff.toString() !== staffId.toString()) {
      return next(new APIError(403, "You are not assigned to this order"));
    }

    // Validate status transition
    const validTransitions = {
      pending: ["confirmed", "preparing", "cancelled"],
      confirmed: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["served", "cancelled"],
      served: ["completed"],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      return next(
        new APIError(
          400,
          `Cannot change status from ${order.status} to ${status}`
        )
      );
    }

    // Update order status
    const updateData = {
      status,
      updatedAt: new Date(),
      $push: {
        statusHistory: {
          status,
          timestamp: new Date(),
          updatedBy: staffId,
          notes,
        },
      },
    };

    // Set specific completion fields
    if (status === "served") {
      updateData.servedBy = staffId;
      updateData.servedAt = new Date();
    }

    if (status === "completed") {
      updateData.completedAt = new Date();
      updateData.actualServiceTime = order.calculateServiceTime();
    }

    const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, {
      new: true,
    })
      .populate("user", "name phone")
      .populate("table", "tableNumber")
      .populate("staff", "name staffId");

    // Handle order completion - trigger waiter reassignment
    let reassignmentResult = null;
    if (status === "completed") {
      try {
        // This will handle:
        // 1. Decrementing activeOrdersCount
        // 2. Incrementing completedOrders
        // 3. Assigning next order from queue
        reassignmentResult = await timeTracker.handleOrderCompletion(orderId);

        logger.info(`Order ${orderId} completed by staff ${staffId}`);
      } catch (reassignmentError) {
        logger.error(
          `Failed to handle reassignment after completion of ${orderId}:`,
          reassignmentError
        );
      }
    }

    const responseData = {
      order: updatedOrder,
      reassignment: reassignmentResult
        ? {
            newOrderAssigned: reassignmentResult.newOrderAssigned?.order?._id,
            message: "New order automatically assigned from queue",
          }
        : null,
    };

    res
      .status(200)
      .json(
        new APIResponse(200, responseData, `Order status updated to ${status}`)
      );
  } catch (error) {
    logger.error("Error updating order status:", error);
    next(error);
  }
};

/**
 * Get order details
 * GET /api/v1/staff/orders/:orderId
 * @access Staff
 */
export const getOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const staffId = req.user._id;

    // Validate order ID
    if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    const order = await Order.findById(orderId)
      .populate("user", "name phone")
      .populate("table", "tableNumber")
      .populate("hotel", "name")
      .populate("branch", "name")
      .populate("staff", "name staffId")
      .populate("items.foodItem", "name price category");

    if (!order) {
      return next(new APIError(404, "Order not found"));
    }

    // Check if staff is assigned to this order or has permission to view
    const canView =
      order.staff?._id.toString() === staffId.toString() ||
      req.user.permissions?.viewOrders;

    if (!canView) {
      return next(
        new APIError(403, "You don't have permission to view this order")
      );
    }

    res
      .status(200)
      .json(
        new APIResponse(200, { order }, "Order details retrieved successfully")
      );
  } catch (error) {
    logger.error("Error getting order details:", error);
    next(error);
  }
};

/**
 * Get active orders count for current staff
 * GET /api/v1/staff/orders/active-count
 * @access Staff (Waiter)
 */
export const getActiveOrdersCount = async (req, res, next) => {
  try {
    const staffId = req.user._id;

    // Get active orders count from database (most accurate)
    const activeCount = await Order.countDocuments({
      staff: staffId,
      status: { $in: ["pending", "confirmed", "preparing", "ready"] },
    });

    // Get staff info
    const staff = await Staff.findById(staffId).select(
      "maxOrdersCapacity assignmentStats hotel branch"
    );

    // Get table counts for the staff's hotel/branch
    const tableQuery = {
      hotel: staff.hotel,
      isActive: true,
    };
    
    // Add branch filter if staff has a branch assigned
    if (staff.branch) {
      tableQuery.branch = staff.branch;
    }

    const [totalTables, activeTables] = await Promise.all([
      Table.countDocuments(tableQuery),
      Table.countDocuments({
        ...tableQuery,
        status: "available",
      }),
    ]);

    const responseData = {
      activeOrdersCount: activeCount,
      maxCapacity: staff?.maxOrdersCapacity || 5,
      canTakeMore: activeCount < (staff?.maxOrdersCapacity || 5),
      utilizationPercent: (
        (activeCount / (staff?.maxOrdersCapacity || 5)) *
        100
      ).toFixed(2),
      totalTables,
      activeTables,
      assignmentStats: staff?.assignmentStats,
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          responseData,
          "Active orders count retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting active orders count:", error);
    next(error);
  }
};

/**
 * Get all tables with their status
 * GET /api/v1/staff/tables/status
 * @access Staff
 */
export const getAllTablesStatus = async (req, res, next) => {
  try {
    const staffId = req.user._id;
    const { status, limit, page, sortBy, sortOrder } = req.query;

    // Get staff info to determine hotel/branch
    const staff = await Staff.findById(staffId).select("hotel branch");

    if (!staff) {
      return next(new APIError(404, "Staff not found"));
    }

    // Build query for tables
    const tableQuery = {
      hotel: staff.hotel,
      isActive: true,
    };

    // Add branch filter if staff has a branch assigned
    if (staff.branch) {
      tableQuery.branch = staff.branch;
    }

    // Add status filter if provided
    if (status && status !== "all") {
      tableQuery.status = status;
    }

    // Calculate pagination
    const pageNumber = parseInt(page) || 1;
    const limitNumber = parseInt(limit) || 50;
    const skip = (pageNumber - 1) * limitNumber;

    // Determine sort options
    const sortField = sortBy || "tableNumber";
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const sortOptions = { [sortField]: sortDirection };

    // Get tables with pagination
    const [tables, totalCount] = await Promise.all([
      Table.find(tableQuery)
        .select("tableNumber uniqueId status capacity currentOrder currentCustomer lastUsed totalOrders totalRevenue")
        .populate("currentOrder", "orderNumber status totalPrice")
        .populate("currentCustomer", "name phone")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNumber)
        .lean(),
      Table.countDocuments(tableQuery),
    ]);

    // Calculate status summary
    const statusSummary = await Table.aggregate([
      { $match: tableQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = statusSummary.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const responseData = {
      tables,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / limitNumber),
        totalCount,
        limit: limitNumber,
      },
      summary: {
        available: summary.available || 0,
        occupied: summary.occupied || 0,
        reserved: summary.reserved || 0,
        maintenance: summary.maintenance || 0,
        inactive: summary.inactive || 0,
        total: totalCount,
      },
    };

    res
      .status(200)
      .json(
        new APIResponse(200, responseData, "Tables status retrieved successfully")
      );
  } catch (error) {
    logger.error("Error getting tables status:", error);
    next(error);
  }
};

// Validation schemas
const validateGetOrdersQuery = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(
        "all",
        "active",
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled"
      )
      .optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "totalPrice", "status")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data);
};

const validateStatusUpdate = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().length(24).hex().required(),
    status: Joi.string()
      .valid("preparing", "ready", "served", "completed", "cancelled")
      .required(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

export default {
  getMyOrders,
  updateOrderStatus,
  getOrderDetails,
  getActiveOrdersCount,
  getAllTablesStatus,
};
