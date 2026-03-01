// src/controllers/staff/orderController.js - Staff Order Management Controller
import { Order } from "../../models/Order.model.js";
import { Staff } from "../../models/Staff.model.js";
import { Table } from "../../models/Table.model.js";
import assignmentService from "../../services/assignment/assignment.service.js";
import orderService from "../../services/order/order.service.js";
import timeTracker from "../../services/timeTracker.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import {
  sendReviewEmailIfReady,
  emitPaymentConfirmed,
} from "../../services/order/cashPayment.helper.js";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

/**
 * Get orders assigned to current staff member
 * GET /api/v1/staff/orders/my-orders
 * @access Staff
 */
export const getMyOrders = asyncHandler(async (req, res, next) => {
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
});

/**
 * Update order status
 * PUT /api/v1/staff/orders/:orderId/status
 * @access Staff
 */
export const updateOrderStatus = asyncHandler(async (req, res, next) => {
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
  if (!order.staff || order.staff.toString() !== staffId.toString()) {
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

  // Release table when order is completed or cancelled
  if (status === "completed" || status === "cancelled") {
    if (updatedOrder.table) {
      try {
        const tableId = updatedOrder.table._id || updatedOrder.table;
        if (status === "completed") {
          const tableDoc = await Table.findById(tableId);
          if (tableDoc) {
            await tableDoc.recordOrderCompletion(updatedOrder.totalPrice);
          }
        } else {
          await Table.findByIdAndUpdate(tableId, {
            status: "available",
            currentOrder: null,
            currentCustomer: null,
          });
        }
      } catch (tableError) {
        logger.error(
          `Failed to update table status for order ${orderId}:`,
          tableError
        );
      }
    }
  }

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

      // Send review invitation email if order is paid and email not sent yet
      if (updatedOrder.payment?.paymentStatus === "paid") {
        await sendReviewEmailIfReady(updatedOrder, orderId);
      }
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
});

/**
 * Get order details
 * GET /api/v1/staff/orders/:orderId
 * @access Staff
 */
export const getOrderDetails = asyncHandler(async (req, res, next) => {
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
});

/**
 * Get active orders count for current staff
 * GET /api/v1/staff/orders/active-count
 * @access Staff (Waiter)
 */
export const getActiveOrdersCount = asyncHandler(async (req, res) => {
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
});

/**
 * Get all tables with their status
 * GET /api/v1/staff/tables/status
 * @access Staff
 */
export const getAllTablesStatus = asyncHandler(async (req, res, next) => {
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
      .select(
        "tableNumber uniqueId status capacity currentOrder currentCustomer lastUsed totalOrders totalRevenue"
      )
      .populate("currentOrder", "orderNumber status totalPrice")
      .populate("currentCustomer", "name phone")
      .sort(sortOptions)
      .collation({ locale: "en", numericOrdering: true })
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
});

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
      .valid(
        "confirmed",
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled"
      )
      .required(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

/**
 * Confirm cash payment for an order
 * PUT /api/v1/staff/orders/:orderId/confirm-payment
 * @access Staff (only for their assigned orders)
 */
export const confirmCashPayment = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const staffId = req.user._id;

  // Validate order ID
  if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid order ID"));
  }

  // Check if order is assigned to this staff member
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  if (!order.staff || order.staff.toString() !== staffId.toString()) {
    return next(
      new APIError(
        403,
        "You can only confirm payment for orders assigned to you"
      )
    );
  }

  // Use the shared service to confirm payment
  const updatedOrder = await orderService.confirmCashPayment(
    orderId,
    staffId,
    "staff"
  );

  // Send review invitation email + socket notification (shared helpers)
  await sendReviewEmailIfReady(updatedOrder, orderId);
  emitPaymentConfirmed(updatedOrder, "staff");

  logger.info(
    `Cash payment confirmed for order ${orderId} by staff ${staffId}`
  );

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { order: updatedOrder },
        "Cash payment confirmed successfully"
      )
    );
});

export default {
  getMyOrders,
  updateOrderStatus,
  getOrderDetails,
  getActiveOrdersCount,
  getAllTablesStatus,
  confirmCashPayment,
};
