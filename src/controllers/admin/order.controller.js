// src/controllers/admin/order.controller.js - Admin Order Management Controller
import mongoose from "mongoose";
import { Order } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import orderService from "../../services/order.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { getIO, isIOInitialized } from "../../utils/socketService.js";
import { sendReviewInvitationEmail } from "../../utils/emailService.js";
import Joi from "joi";

/**
 * Helper function to parse date strings in multiple formats
 * Accepts: YYYY-MM-DD, DD-MM-YYYY, or ISO string
 */
const parseDate = (dateString) => {
  if (!dateString) return null;

  // Try parsing as ISO date first
  let date = new Date(dateString);

  // Check if date is valid
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try parsing DD-MM-YYYY format
  const ddmmyyyyPattern = /^(\d{2})-(\d{2})-(\d{4})$/;
  const match = dateString.match(ddmmyyyyPattern);

  if (match) {
    const [, day, month, year] = match;
    date = new Date(year, month - 1, day);

    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date(dateString);
};

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
export const getAllOrders = async (req, res, next) => {
  try {
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
          return next(
            new APIError(403, "You do not have access to this branch")
          );
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
  } catch (error) {
    logger.error("Error getting admin orders:", error);
    next(error);
  }
};

/**
 * Get order details by ID
 * GET /api/v1/admin/orders/:orderId
 * @access Admin
 */
export const getOrderDetails = async (req, res, next) => {
  try {
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
  } catch (error) {
    logger.error("Error getting admin order details:", error);
    next(error);
  }
};

/**
 * Confirm cash payment for an order
 * PUT /api/v1/admin/orders/:orderId/confirm-payment
 * @access Admin (can confirm payment for any order in their hotel)
 */
export const confirmCashPayment = async (req, res, next) => {
  try {
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

    // Send review invitation email if order is already completed and email not sent yet
    if (
      updatedOrder.status === "completed" &&
      !updatedOrder.reviewInviteSentAt
    ) {
      try {
        const user = await User.findById(
          updatedOrder.user._id || updatedOrder.user
        );
        if (user && user.email) {
          const orderWithDetails = await Order.findById(updatedOrder._id)
            .populate("hotel", "name")
            .populate("branch", "name");

          await sendReviewInvitationEmail(orderWithDetails, user);

          Order.findByIdAndUpdate(orderId, {
            reviewInviteSentAt: new Date(),
          }).catch((err) =>
            logger.error("Failed to update reviewInviteSentAt:", err)
          );

          logger.info(
            `Review invitation email sent after cash payment confirmation for order ${orderId}`
          );
        }
      } catch (emailError) {
        logger.error(
          `Failed to send review invitation email for order ${orderId}:`,
          emailError
        );
      }
    }

    // Emit socket notification to user
    try {
      if (isIOInitialized()) {
        const io = getIO();
        const userId = updatedOrder.user._id || updatedOrder.user;
        io.to(`user_${userId}`).emit("payment:confirmed", {
          orderId: updatedOrder._id,
          paymentStatus: "paid",
          paymentMethod: "cash",
          confirmedBy: "admin",
          message: "Your cash payment has been confirmed",
        });
      }
    } catch (socketError) {
      logger.error("Socket notification error:", socketError);
    }

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
  } catch (error) {
    logger.error("Error confirming cash payment:", error);
    next(error);
  }
};

/**
 * Get order analytics summary for admin
 * GET /api/v1/admin/orders/analytics/summary
 * @access Admin
 */
export const getOrderAnalytics = async (req, res, next) => {
  try {
    const adminRole = req.admin.role;
    const {
      period = "7",
      startDate: startDateParam,
      endDate: endDateParam,
      groupBy = "day",
      hotelId,
      branchId,
    } = req.query;

    // Calculate date range - prefer startDate/endDate params, fallback to period
    let startDate, endDate;
    if (startDateParam) {
      startDate = parseDate(startDateParam);
    } else {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(period));
    }

    if (endDateParam) {
      endDate = parseDate(endDateParam);
      endDate.setHours(23, 59, 59, 999);
    } else {
      endDate = new Date();
    }

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
              period: startDateParam
                ? `${startDateParam} to ${endDateParam || "now"}`
                : `${period} days`,
              groupBy,
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
          return next(
            new APIError(403, "You do not have access to this branch")
          );
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

    // Build groupBy date expression for aggregation
    let dateGroupExpression;
    switch (groupBy) {
      case "week":
        dateGroupExpression = {
          year: { $isoWeekYear: "$createdAt" },
          week: { $isoWeek: "$createdAt" },
        };
        break;
      case "month":
        dateGroupExpression = {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        };
        break;
      case "day":
      default:
        dateGroupExpression = {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        };
        break;
    }

    // Get analytics data
    const [
      totalOrders,
      statusBreakdown,
      revenueStats,
      averageOrderValue,
      popularItems,
      staffPerformance,
      timeSeriesData,
    ] = await Promise.all([
      Order.countDocuments(filter),

      Order.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      Order.aggregate([
        { $match: { ...filter, status: { $in: ["completed", "served"] } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPrice" },
            avgOrderValue: { $avg: "$totalPrice" },
          },
        },
      ]),

      Order.aggregate([
        { $match: filter },
        { $group: { _id: null, avgValue: { $avg: "$totalPrice" } } },
      ]),

      Order.aggregate([
        { $match: filter },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.foodItemName",
            totalQuantity: { $sum: "$items.quantity" },
            totalRevenue: { $sum: "$items.totalPrice" },
          },
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 5 },
      ]),

      Order.aggregate([
        { $match: { ...filter, staff: { $exists: true } } },
        {
          $group: {
            _id: "$staff",
            orderCount: { $sum: 1 },
            totalRevenue: { $sum: "$totalPrice" },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "staffs",
            localField: "_id",
            foreignField: "_id",
            as: "staffDetails",
          },
        },
      ]),

      Order.aggregate([
        { $match: filter },
        {
          $group: {
            _id: dateGroupExpression,
            orders: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["completed", "served"]] },
                  "$totalPrice",
                  0,
                ],
              },
            },
            completedOrders: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
              },
            },
            cancelledOrders: {
              $sum: {
                $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
              },
            },
          },
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
            "_id.week": 1,
            "_id.day": 1,
          },
        },
      ]),
    ]);

    // Format time series labels
    const formattedTimeSeries = timeSeriesData.map((item) => {
      let label;
      if (groupBy === "week") {
        label = `${item._id.year}-W${String(item._id.week).padStart(2, "0")}`;
      } else if (groupBy === "month") {
        label = `${item._id.year}-${String(item._id.month).padStart(2, "0")}`;
      } else {
        label = `${item._id.year}-${String(item._id.month).padStart(2, "0")}-${String(item._id.day).padStart(2, "0")}`;
      }
      return {
        label,
        orders: item.orders,
        revenue: item.revenue,
        completedOrders: item.completedOrders,
        cancelledOrders: item.cancelledOrders,
      };
    });

    const periodLabel = startDateParam
      ? `${startDateParam} to ${endDateParam || "now"}`
      : `${period} days`;

    const analytics = {
      period: periodLabel,
      groupBy,
      summary: {
        totalOrders,
        totalRevenue:
          revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        averageOrderValue:
          averageOrderValue.length > 0 ? averageOrderValue[0].avgValue : 0,
      },
      statusDistribution: statusBreakdown.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      timeSeries: formattedTimeSeries,
      popularItems: popularItems.map((item) => ({
        name: item._id,
        quantity: item.totalQuantity,
        revenue: item.totalRevenue,
      })),
      topPerformingStaff: staffPerformance.map((staff) => ({
        id: staff._id,
        name: staff.staffDetails[0]?.name || "Unknown",
        orderCount: staff.orderCount,
        totalRevenue: staff.totalRevenue,
      })),
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          analytics,
          "Order analytics retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting admin order analytics:", error);
    next(error);
  }
};

export default {
  getAllOrders,
  getOrderDetails,
  getOrderAnalytics,
  confirmCashPayment,
};
