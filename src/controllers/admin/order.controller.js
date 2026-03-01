// src/controllers/admin/order.controller.js - Admin Order Management Controller
import mongoose from "mongoose";
import { Order } from "../../models/Order.model.js";
import orderService from "../../services/order/order.service.js";
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

// Validation schema for get orders query
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
    staffId: Joi.string().length(24).hex().optional(),
    hotelId: Joi.string().length(24).hex().optional(),
    branchId: Joi.string().length(24).hex().optional(),
    table: Joi.string().length(24).hex().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    page: Joi.number().integer().min(1).optional(),
    skip: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "totalPrice", "status")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    startDate: Joi.alternatives()
      .try(
        Joi.date().iso(),
        Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
        Joi.string().pattern(/^\d{2}-\d{2}-\d{4}$/)
      )
      .optional(),
    endDate: Joi.alternatives()
      .try(
        Joi.date().iso(),
        Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
        Joi.string().pattern(/^\d{2}-\d{2}-\d{4}$/)
      )
      .optional(),
  });
  return schema.validate(data);
};

/**
 * Get all orders for the admin (across all branches or filtered by branchId)
 * GET /api/v1/admin/orders
 * @access Admin
 */
export const getAllOrders = asyncHandler(async (req, res, next) => {
  const adminRole = req.admin.role;
  const {
    status,
    staff,
    staffId,
    hotelId,
    branchId,
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

  // Build filter based on admin role
  const filter = {};

  // Branch admin can only see orders for their assigned branches
  if (adminRole === "branch_admin") {
    const assignedBranches = req.admin.assignedBranches || [];
    if (assignedBranches.length === 0) {
      return res.status(200).json(
        new APIResponse(
          200,
          {
            orders: [],
            pagination: {
              total: 0,
              page: 1,
              pages: 0,
              limit: parseInt(limit) || 20,
              hasMore: false,
            },
          },
          "No branches assigned"
        )
      );
    }

    if (branchId) {
      // Verify the requested branch is in admin's assigned branches
      const isAllowed = assignedBranches.some(
        (b) => (b._id || b).toString() === branchId
      );
      if (!isAllowed) {
        return next(new APIError(403, "You do not have access to this branch"));
      }
      filter.branch = branchId;
    } else {
      filter.branch = { $in: assignedBranches.map((b) => b._id || b) };
    }
  } else {
    // Admin / super_admin can filter by specific hotel and/or branch
    if (hotelId) {
      filter.hotel = hotelId;
    }
    if (branchId) {
      filter.branch = branchId;
    }
  }

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
      parsedEndDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = parsedEndDate;
    }
  }

  // Handle pagination
  const limitNumber = parseInt(limit) || 20;
  let skipNumber = 0;

  if (page) {
    const pageNumber = parseInt(page) || 1;
    skipNumber = (pageNumber - 1) * limitNumber;
  } else if (skip) {
    skipNumber = parseInt(skip) || 0;
  }

  // Build sort criteria
  const sort = {};
  sort[sortBy || "createdAt"] = sortOrder === "asc" ? 1 : -1;

  // Get orders with pagination
  const orders = await Order.find(filter)
    .populate("user", "name phone")
    .populate("staff", "name staffId role isLocked")
    .populate("table", "tableNumber identifier qrScanData")
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
 * GET /api/v1/admin/orders/:orderId
 * @access Admin
 */
export const getOrderDetails = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const adminRole = req.admin.role;

  // Validate order ID
  if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid order ID"));
  }

  const order = await Order.findById(orderId)
    .populate("user", "name phone email")
    .populate("staff", "name staffId role isLocked")
    .populate("table", "tableNumber seatingCapacity")
    .populate("items.foodItem", "name price category description")
    .populate("assignmentHistory.waiter", "name staffId isLocked")
    .populate("statusHistory.updatedBy", "name staffId isLocked");

  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  // Branch admin can only view orders from their assigned branches
  if (adminRole === "branch_admin") {
    const assignedBranches = req.admin.assignedBranches || [];
    const hasAccess = assignedBranches.some(
      (b) => (b._id || b).toString() === order.branch?.toString()
    );
    if (!hasAccess) {
      return next(
        new APIError(403, "You do not have access to this order's branch")
      );
    }
  }

  res
    .status(200)
    .json(
      new APIResponse(200, { order }, "Order details retrieved successfully")
    );
});

/**
 * Confirm cash payment for an order
 * PUT /api/v1/admin/orders/:orderId/confirm-payment
 * @access Admin (can confirm payment for any order in their hotel)
 */
export const confirmCashPayment = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const adminId = req.admin._id;

  // Validate order ID
  if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
    return next(new APIError(400, "Invalid order ID"));
  }

  // Check if order exists
  const order = await Order.findById(orderId);
  if (!order) {
    return next(new APIError(404, "Order not found"));
  }

  // Use the shared service to confirm payment
  const updatedOrder = await orderService.confirmCashPayment(
    orderId,
    adminId,
    "admin"
  );

  // Send review invitation email + socket notification (shared helpers)
  await sendReviewEmailIfReady(updatedOrder, orderId);
  emitPaymentConfirmed(updatedOrder, "admin");

  logger.info(
    `Cash payment confirmed for order ${orderId} by admin ${adminId}`
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

/**
 * Get order analytics summary for admin
 * GET /api/v1/admin/orders/analytics/summary
 * @access Admin
 */
export const getOrderAnalytics = asyncHandler(async (req, res, next) => {
  const adminRole = req.admin.role;
  const {
    startDate: startDateParam,
    endDate: endDateParam,
    hotelId,
    branchId,
  } = req.query;

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

  // Build filter
  const filter = {
    createdAt: { $gte: startDate, $lte: endDate },
  };

  // Branch admin restricted to assigned branches
  // Note: Use ObjectId for aggregation pipelines (Mongoose doesn't auto-cast in $match)
  if (adminRole === "branch_admin") {
    const assignedBranches = req.admin.assignedBranches || [];
    if (assignedBranches.length === 0) {
      return res.status(200).json(
        new APIResponse(
          200,
          {
            dateRange: {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            },
            summary: {
              totalOrders: 0,
              totalRevenue: 0,
              averageOrderValue: 0,
            },
            statusDistribution: {},
            timeSeries: [],
            popularItems: [],
            topPerformingStaff: [],
          },
          "No branches assigned"
        )
      );
    }
    if (branchId) {
      const isAllowed = assignedBranches.some(
        (b) => (b._id || b).toString() === branchId
      );
      if (!isAllowed) {
        return next(new APIError(403, "You do not have access to this branch"));
      }
      filter.branch = new mongoose.Types.ObjectId(branchId);
    } else {
      filter.branch = {
        $in: assignedBranches.map(
          (b) => new mongoose.Types.ObjectId((b._id || b).toString())
        ),
      };
    }
  } else {
    if (hotelId) filter.hotel = new mongoose.Types.ObjectId(hotelId);
    if (branchId) filter.branch = new mongoose.Types.ObjectId(branchId);
  }

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

export default {
  getAllOrders,
  getOrderDetails,
  getOrderAnalytics,
  confirmCashPayment,
};
