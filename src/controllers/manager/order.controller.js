// src/controllers/manager/orderController.js - Manager Order Management Controller
import { Order } from "../../models/Order.model.js";
import { Staff } from "../../models/Staff.model.js";
import { FoodItem } from "../../models/FoodItem.model.js";
import { Table } from "../../models/Table.model.js";
import assignmentService from "../../services/assignment/assignment.service.js";
import orderService from "../../services/order/order.service.js";
import timeTracker from "../../services/timeTracker.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { parseDate } from "../../utils/parseDate.js";
import { getOrderAnalytics as _getOrderAnalytics } from "../../services/order/analytics.service.js";
import {
  sendReviewEmailIfReady,
  emitPaymentConfirmed,
} from "../../services/order/cashPayment.helper.js";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";

/**
 * Helper function to extract branch ID from req.user.branch
 * Handles both cases: when branch is an ObjectId string or a populated Branch document
 */
const getManagerBranchId = (userBranch) => {
  if (!userBranch) return null;
  // If branch is a populated document, extract _id
  if (typeof userBranch === "object" && userBranch._id) {
    return userBranch._id;
  }
  // If branch is already an ObjectId string
  return userBranch;
};

/**
 * Get all orders for the branch
 * GET /api/v1/manager/orders
 * @access Manager
 */
export const getAllOrders = asyncHandler(async (req, res, next) => {
  // Extract branch ID properly - handle both string and object cases
  const managerBranch = getManagerBranchId(req.user.branch);
  const {
    status,
    staff,
    staffId, // Support staffId as well
    table,
    limit,
    page,
    skip,
    sortBy,
    sortOrder,
    startDate,
    endDate,
  } = req.query;

  // Validate query parameters
  const { error } = validateGetOrdersQuery(req.query);
  if (error) {
    return next(new APIError(400, "Invalid query parameters", error.details));
  }

  // Build filter for manager's branch
  const filter = { branch: managerBranch };

  if (status && status !== "all") {
    if (status === "active") {
      filter.status = { $in: ["pending", "preparing", "ready"] };
    } else {
      filter.status = status;
    }
  }

  // Support both 'staff' and 'staffId' parameters
  if (staff || staffId) {
    filter.staff = staff || staffId;
  }

  if (table) {
    filter.table = table;
  }

  // Date range filter with support for multiple date formats
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      const parsedStartDate = parseDate(startDate);
      filter.createdAt.$gte = parsedStartDate;
    }
    if (endDate) {
      const parsedEndDate = parseDate(endDate);
      // Set to end of day for endDate
      parsedEndDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = parsedEndDate;
    }
  }

  // Handle pagination - support both page-based and skip-based
  const limitNumber = parseInt(limit) || 20;
  let skipNumber = 0;

  if (page) {
    // Page-based pagination (more intuitive)
    const pageNumber = parseInt(page) || 1;
    skipNumber = (pageNumber - 1) * limitNumber;
  } else if (skip) {
    // Skip-based pagination (backward compatible)
    skipNumber = parseInt(skip) || 0;
  }

  // Build sort criteria
  const sort = {};
  sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

  // Get orders with pagination
  const orders = await Order.find(filter)
    .populate("user", "name phone")
    .populate("staff", "name staffId role")
    .populate("table", "tableNumber")
    .populate("items.foodItem", "name price category")
    .sort(sort)
    .limit(limitNumber)
    .skip(skipNumber);

  const totalCount = await Order.countDocuments(filter);
  const totalPages = Math.ceil(totalCount / limitNumber);
  const currentPage = page
    ? parseInt(page)
    : Math.floor(skipNumber / limitNumber) + 1;

  res.status(200).json(
    new APIResponse(
      200,
      {
        orders,
        pagination: {
          total: totalCount,
          page: currentPage,
          pages: totalPages,
          limit: limitNumber,
          hasMore: currentPage < totalPages,
        },
      },
      "Orders retrieved successfully"
    )
  );
});

/**
 * Get order details by ID
 * GET /api/v1/manager/orders/:orderId
 * @access Manager
 */
export const getOrderDetails = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  // Extract branch ID properly - handle both string and object cases
  const managerBranch = getManagerBranchId(req.user.branch);

  // Validate order ID
  if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid order ID"));
  }

  const order = await Order.findById(orderId)
    .populate("user", "name phone email")
    .populate("staff", "name staffId role")
    .populate("table", "tableNumber seatingCapacity")
    .populate("items.foodItem", "name price category description")
    .populate("assignmentHistory.waiter", "name staffId")
    .populate("statusHistory.updatedBy", "name staffId");

  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  // Check if order belongs to manager's branch
  if (order.branch?.toString() !== managerBranch?.toString()) {
    return next(new APIError(403, "You can only view orders from your branch"));
  }

  res
    .status(200)
    .json(
      new APIResponse(200, { order }, "Order details retrieved successfully")
    );
});

/**
 * Update order status
 * PUT /api/v1/manager/orders/:orderId/status
 * @access Manager
 */
export const updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const { status, notes } = req.body;
  const managerId = req.user._id;
  const managerBranch = getManagerBranchId(req.user.branch);

  // Validate input
  const { error } = validateStatusUpdate({ orderId, status, notes });
  if (error) {
    return next(new APIError(400, "Validation failed", error.details));
  }

  // Get order
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  // Check branch access
  if (order.branch?.toString() !== managerBranch?.toString()) {
    return next(
      new APIError(403, "You can only update orders from your branch")
    );
  }

  // Validate status transition
  const validTransitions = {
    pending: ["preparing", "cancelled"],
    preparing: ["ready", "cancelled"],
    ready: ["served", "cancelled"],
    served: ["completed"],
    completed: [], // No transitions from completed
    cancelled: [], // No transitions from cancelled
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
        updatedBy: managerId,
        notes,
      },
    },
  };

  // Set completion fields
  if (status === "completed") {
    updateData.completedAt = new Date();
    updateData.actualServiceTime = order.calculateServiceTime();
  }

  const updatedOrder = await Order.findByIdAndUpdate(orderId, updateData, {
    new: true,
  })
    .populate("user", "name phone")
    .populate("staff", "name staffId")
    .populate("table", "tableNumber");

  // Release table when order is completed or cancelled
  if (status === "completed" || status === "cancelled") {
    if (updatedOrder.table) {
      try {
        const tableId = updatedOrder.table._id || updatedOrder.table;
        if (status === "completed") {
          const table = await Table.findById(tableId);
          if (table) {
            await table.recordOrderCompletion(updatedOrder.totalPrice);
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

  // Handle completion for assignment system
  if (status === "completed") {
    try {
      await timeTracker.handleOrderCompletion(orderId);

      // Send review invitation email if order is paid and email not sent yet
      if (updatedOrder.payment?.paymentStatus === "paid") {
        await sendReviewEmailIfReady(updatedOrder, orderId);
      }
    } catch (assignmentError) {
      logger.error(
        `Assignment system error on order completion:`,
        assignmentError
      );
    }
  }

  logger.info(
    `Order ${orderId} status updated to ${status} by manager ${managerId}`
  );

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        { order: updatedOrder },
        `Order status updated to ${status}`
      )
    );
});

/**
 * Get orders by status
 * GET /api/v1/manager/orders/status/:status
 * @access Manager
 */
export const getOrdersByStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.params;
  const managerBranch = getManagerBranchId(req.user.branch);
  const { limit, skip, sortBy, sortOrder } = req.query;

  // Validate status
  const validStatuses = [
    "pending",
    "preparing",
    "ready",
    "served",
    "completed",
    "cancelled",
  ];
  if (!validStatuses.includes(status)) {
    return next(new APIError(400, "Invalid status"));
  }

  // Build filter
  const filter = {
    branch: managerBranch,
    status: status,
  };

  // Build sort criteria
  const sort = {};
  sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

  // Get orders
  const orders = await Order.find(filter)
    .populate("user", "name phone")
    .populate("staff", "name staffId")
    .populate("table", "tableNumber")
    .sort(sort)
    .limit(parseInt(limit) || 20)
    .skip(parseInt(skip) || 0);

  const totalCount = await Order.countDocuments(filter);

  res.status(200).json(
    new APIResponse(
      200,
      {
        orders,
        status,
        pagination: {
          total: totalCount,
          limit: parseInt(limit) || 20,
          skip: parseInt(skip) || 0,
          hasMore: (parseInt(skip) || 0) + orders.length < totalCount,
        },
      },
      `${status} orders retrieved successfully`
    )
  );
});

/**
 * Get order analytics summary
 * GET /api/v1/manager/orders/analytics/summary
 * @access Manager
 */
export const getOrderAnalytics = asyncHandler(async (req, res) => {
  const managerBranch = getManagerBranchId(req.user.branch);
  const { startDate: startDateParam, endDate: endDateParam } = req.query;

  // Calculate date range from startDate/endDate params (default: last 30 days)
  let startDate, endDate;
  if (startDateParam) {
    startDate = parseDate(startDateParam);
  } else {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
  }
  startDate.setHours(0, 0, 0, 0);

  if (endDateParam) {
    endDate = parseDate(endDateParam);
  } else {
    endDate = new Date();
  }
  endDate.setHours(23, 59, 59, 999);

  const filter = {
    branch: managerBranch,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  // Delegate to shared analytics service
  const analyticsResult = await _getOrderAnalytics(filter);

  const analytics = {
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    ...analyticsResult,
  };

  res
    .status(200)
    .json(
      new APIResponse(200, analytics, "Order analytics retrieved successfully")
    );
});

/**
 * Get kitchen orders (preparing status)
 * GET /api/v1/manager/kitchen/orders
 * @access Manager
 */
export const getKitchenOrders = asyncHandler(async (req, res) => {
  const managerBranch = getManagerBranchId(req.user.branch);
  const { limit, skip } = req.query;

  // Get orders that are being prepared or ready
  const filter = {
    branch: managerBranch,
    status: { $in: ["preparing", "ready"] },
  };

  const orders = await Order.find(filter)
    .populate("user", "name phone")
    .populate("staff", "name staffId")
    .populate("table", "tableNumber")
    .populate("items.foodItem", "name category")
    .sort({ createdAt: 1 }) // Oldest first for kitchen queue
    .limit(parseInt(limit) || 50)
    .skip(parseInt(skip) || 0);

  const totalCount = await Order.countDocuments(filter);

  // Group orders by status for kitchen display
  const kitchenQueue = {
    preparing: orders.filter((o) => o.status === "preparing"),
    ready: orders.filter((o) => o.status === "ready"),
  };

  res.status(200).json(
    new APIResponse(
      200,
      {
        kitchenQueue,
        totalOrders: totalCount,
        summary: {
          preparing: kitchenQueue.preparing.length,
          ready: kitchenQueue.ready.length,
        },
      },
      "Kitchen orders retrieved successfully"
    )
  );
});

/**
 * Assign order to staff member
 * PUT /api/v1/manager/orders/:orderId/assign/:staffId
 * @access Manager
 */
export const assignOrderToStaff = asyncHandler(async (req, res, next) => {
  const { orderId, staffId } = req.params;
  const { reason } = req.body;
  const managerId = req.user._id;
  const managerBranch = getManagerBranchId(req.user.branch);

  // Validate IDs
  if (
    !orderId.match(/^[0-9a-fA-F]{24}$/) ||
    !staffId.match(/^[0-9a-fA-F]{24}$/)
  ) {
    return next(new APIError(400, "Invalid order or staff ID"));
  }

  // Get order and staff
  const [order, staff] = await Promise.all([
    Order.findById(orderId),
    Staff.findById(staffId),
  ]);

  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  if (!staff) {
    return next(new APIError(404, "Staff member not found"));
  }

  // Check branch access
  if (order.branch?.toString() !== managerBranch?.toString()) {
    return next(
      new APIError(403, "You can only assign orders from your branch")
    );
  }

  if (staff.branch?.toString() !== managerBranch?.toString()) {
    return next(
      new APIError(403, "You can only assign to staff from your branch")
    );
  }

  // Check if staff is a waiter and can take orders
  if (staff.role === "waiter") {
    if (!staff.canTakeMoreOrders()) {
      return next(
        new APIError(
          400,
          `Waiter is at maximum capacity (${staff.maxOrdersCapacity} orders)`
        )
      );
    }
  }

  // Use assignment service for proper assignment
  const assignmentResult = await assignmentService.manualAssignment(
    orderId,
    staffId,
    reason || `Manually assigned by manager ${managerId}`
  );

  // Update staff active orders if waiter
  if (staff.role === "waiter") {
    staff.incrementActiveOrders();
    await staff.save();
  }

  logger.info(
    `Order ${orderId} manually assigned to staff ${staffId} by manager ${managerId}`
  );

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        assignmentResult,
        `Order assigned to ${staff.name} successfully`
      )
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
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled"
      )
      .optional(),
    staff: Joi.string().length(24).hex().optional(),
    staffId: Joi.string().length(24).hex().optional(), // Allow staffId as alias
    table: Joi.string().length(24).hex().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(), // Page-based pagination
    skip: Joi.number().integer().min(0).optional(), // Skip-based pagination (backward compatible)
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "totalPrice", "status")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    // Accept multiple date formats: YYYY-MM-DD, DD-MM-YYYY, or ISO string
    startDate: Joi.alternatives()
      .try(
        Joi.date().iso(),
        Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        Joi.string().pattern(/^\d{2}-\d{2}-\d{4}$/) // DD-MM-YYYY
      )
      .optional(),
    endDate: Joi.alternatives()
      .try(
        Joi.date().iso(),
        Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
        Joi.string().pattern(/^\d{2}-\d{2}-\d{4}$/) // DD-MM-YYYY
      )
      .optional(),
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

/**
 * Confirm cash payment for an order
 * PUT /api/v1/manager/orders/:orderId/confirm-payment
 * @access Manager (only for orders in their branch)
 */
export const confirmCashPayment = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const managerId = req.user._id;
  const managerBranch = getManagerBranchId(req.user.branch);

  // Validate order ID
  if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid order ID"));
  }

  // Check if order belongs to manager's branch
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  if (order.branch?.toString() !== managerBranch?.toString()) {
    return next(
      new APIError(
        403,
        "You can only confirm payment for orders in your branch"
      )
    );
  }

  // Use the shared service to confirm payment
  const updatedOrder = await orderService.confirmCashPayment(
    orderId,
    managerId,
    "manager"
  );

  // Send review invitation email + socket notification (shared helpers)
  await sendReviewEmailIfReady(updatedOrder, orderId);
  emitPaymentConfirmed(updatedOrder, "manager");

  logger.info(
    `Cash payment confirmed for order ${orderId} by manager ${managerId}`
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
  getAllOrders,
  getOrderDetails,
  updateOrderStatus,
  getOrdersByStatus,
  getOrderAnalytics,
  getKitchenOrders,
  assignOrderToStaff,
  confirmCashPayment,
};
