// src/controllers/admin/order.controller.js - Admin Order Management Controller
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
    } else if (branchId) {
      // Admin / super_admin can filter by specific branch
      filter.branch = branchId;
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

export default {
  getAllOrders,
  confirmCashPayment,
};
