import orderService from "../../services/orderService.js";
import { validateOrder } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import Joi from "joi";

/**
 * Place order from user's cart
 * POST /api/v1/user/orders/place
 */
export const placeOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      hotelId,
      branchId,
      tableId,
      paymentMethod,
      specialInstructions,
      customerNote,
      coinsToUse = 0,
    } = req.body;

    // Validate request body
    const { error } = validatePlaceOrder(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    // Additional validation for coins
    if (coinsToUse < 0) {
      return next(new APIError(400, "Coins to use cannot be negative"));
    }

    if (coinsToUse > 0) {
      // Check if user has sufficient coins (basic check, detailed check in service)
      const user = await User.findById(userId);
      if (!user || !user.hasSufficientCoins(coinsToUse)) {
        return next(new APIError(400, "Insufficient coin balance"));
      }
    }

    // Place order from cart only
    const order = await orderService.placeOrderFromCart(
      userId,
      hotelId,
      branchId,
      {
        tableId,
        paymentMethod,
        specialInstructions,
        customerNote,
        coinsToUse,
      }
    );

    res
      .status(201)
      .json(
        new APIResponse(201, { order }, "Order placed successfully from cart")
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's orders with pagination and filters
 * GET /api/v1/user/orders
 */
export const getMyOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { status, hotel, branch, limit, skip, sortBy, sortOrder } = req.query;

    // Validate query parameters
    const { error } = validateGetOrdersQuery(req.query);
    if (error) {
      return next(new APIError(400, "Invalid query parameters", error.details));
    }

    const result = await orderService.getUserOrders(userId, {
      status,
      hotel,
      branch,
      limit,
      skip,
      sortBy,
      sortOrder,
    });

    res
      .status(200)
      .json(new APIResponse(200, result, "Orders retrieved successfully"));
  } catch (error) {
    next(error);
  }
};

/**
 * Get order details by ID
 * GET /api/v1/user/orders/:orderId
 */
export const getOrderDetails = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    const order = await orderService.getOrderById(orderId, userId);

    res
      .status(200)
      .json(
        new APIResponse(200, { order }, "Order details retrieved successfully")
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel order
 * PUT /api/v1/user/orders/:orderId/cancel
 */
export const cancelOrder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { reason } = req.body;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    // Validate reason
    const { error } = validateCancelOrder({ reason });
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    const order = await orderService.cancelOrder(orderId, userId, reason);

    res
      .status(200)
      .json(new APIResponse(200, { order }, "Order cancelled successfully"));
  } catch (error) {
    next(error);
  }
};

/**
 * Reorder from previous order
 * POST /api/v1/user/orders/:orderId/reorder
 */
export const reorder = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;
    const { tableId, paymentMethod, specialInstructions } = req.body;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    // Validate request body
    const { error } = validateReorder(req.body);
    if (error) {
      return next(new APIError(400, "Validation failed", error.details));
    }

    const result = await orderService.reorderFromPrevious(orderId, userId, {
      tableId,
      paymentMethod,
      specialInstructions,
    });

    res
      .status(201)
      .json(
        new APIResponse(
          201,
          result,
          result.message || "Reorder placed successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Get order status updates
 * GET /api/v1/user/orders/:orderId/status
 */
export const getOrderStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    const order = await orderService.getOrderById(orderId, userId);

    const statusInfo = {
      orderId: order._id,
      status: order.status,
      estimatedTime: order.estimatedTime,
      placedAt: order.createdAt,
      updatedAt: order.updatedAt,
      paymentStatus: order.paymentStatus,
      trackingInfo: {
        pending: order.status === "pending",
        preparing: ["preparing", "ready", "served", "completed"].includes(
          order.status
        ),
        ready: ["ready", "served", "completed"].includes(order.status),
        served: ["served", "completed"].includes(order.status),
        completed: order.status === "completed",
        cancelled: order.status === "cancelled",
      },
    };

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { statusInfo },
          "Order status retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Get active orders (pending, preparing, ready)
 * GET /api/v1/user/orders/active
 */
export const getActiveOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await orderService.getUserOrders(userId, {
      status: "active", // This will be handled in service to include pending, preparing, ready
      limit: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    // Filter for truly active orders
    const activeOrders = result.orders.filter((order) =>
      ["pending", "preparing", "ready"].includes(order.status)
    );

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { orders: activeOrders, count: activeOrders.length },
          "Active orders retrieved successfully"
        )
      );
  } catch (error) {
    next(error);
  }
};

/**
 * Get order history (completed, cancelled)
 * GET /api/v1/user/orders/history
 */
export const getOrderHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { limit, skip } = req.query;

    const result = await orderService.getUserOrders(userId, {
      limit: limit || 20,
      skip: skip || 0,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    // Filter for completed/cancelled orders
    const historyOrders = result.orders.filter((order) =>
      ["completed", "cancelled", "served"].includes(order.status)
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          orders: historyOrders,
          pagination: {
            ...result.pagination,
            total: historyOrders.length,
          },
        },
        "Order history retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get table order history
 * @description Get order history for a specific table
 * @route GET /api/v1/user/orders/table-history
 * @access Private
 */
export const getTableOrderHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { tableId, hotelId, branchId, limit, skip, sortBy, sortOrder } =
      req.query;

    // Build query filters
    const filters = {
      limit: parseInt(limit) || 10,
      skip: parseInt(skip) || 0,
      sortBy: sortBy || "createdAt",
      sortOrder: sortOrder || "desc",
    };

    // Add table/hotel/branch filters if provided
    if (hotelId) filters.hotel = hotelId;
    if (branchId) filters.branch = branchId;

    const result = await orderService.getUserOrders(userId, filters);

    // Filter orders by table if tableId is provided
    let orders = result.orders;
    if (tableId) {
      orders = orders.filter(
        (order) =>
          order.table &&
          order.table._id &&
          order.table._id.toString() === tableId
      );
    }

    // Get table information if tableId is provided
    let tableInfo = null;
    if (tableId && orders.length > 0) {
      const sampleOrder = orders[0];
      tableInfo = {
        tableNumber: sampleOrder.table?.tableNumber || "N/A",
        totalOrdersToday: orders.filter((order) => {
          const today = new Date();
          const orderDate = new Date(order.createdAt);
          return orderDate.toDateString() === today.toDateString();
        }).length,
        totalRevenueToday: orders
          .filter((order) => {
            const today = new Date();
            const orderDate = new Date(order.createdAt);
            return orderDate.toDateString() === today.toDateString();
          })
          .reduce((sum, order) => sum + (order.totalPrice || 0), 0),
        popularItems: [
          ...new Set(
            orders.flatMap(
              (order) =>
                order.items?.map((item) => item.foodItemName || item.name) || []
            )
          ),
        ].slice(0, 5), // Top 5 popular items
      };
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          orders,
          tableInfo,
          pagination: {
            currentPage: Math.floor(filters.skip / filters.limit) + 1,
            totalPages: Math.ceil(orders.length / filters.limit),
            totalItems: orders.length,
            hasNext: filters.skip + filters.limit < orders.length,
            hasPrev: filters.skip > 0,
          },
        },
        "Table order history retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

// Validation schemas
const validatePlaceOrder = (data) => {
  const schema = Joi.object({
    hotelId: Joi.string().length(24).hex().required().messages({
      "string.length": "Hotel ID must be 24 characters",
      "string.hex": "Hotel ID must be valid",
      "any.required": "Hotel ID is required",
    }),
    branchId: Joi.string()
      .length(24)
      .hex()
      .optional()
      .allow(null, "")
      .messages({
        "string.length": "Branch ID must be 24 characters",
        "string.hex": "Branch ID must be valid",
      }),
    tableId: Joi.string().length(24).hex().optional().messages({
      "string.length": "Table ID must be 24 characters",
      "string.hex": "Table ID must be valid",
    }),
    paymentMethod: Joi.string()
      .valid("cash", "card", "upi", "wallet")
      .default("cash")
      .messages({
        "any.only": "Payment method must be one of: cash, card, upi, wallet",
      }),
    specialInstructions: Joi.string().max(500).optional().messages({
      "string.max": "Special instructions cannot exceed 500 characters",
    }),
    customerNote: Joi.string().max(300).optional().messages({
      "string.max": "Customer note cannot exceed 300 characters",
    }),
    coinsToUse: Joi.number().integer().min(0).optional().default(0).messages({
      "number.base": "Coins to use must be a number",
      "number.integer": "Coins to use must be an integer",
      "number.min": "Coins to use cannot be negative",
    }),
  });
  return schema.validate(data);
};

const validateGetOrdersQuery = (data) => {
  const schema = Joi.object({
    status: Joi.string()
      .valid(
        "all",
        "pending",
        "preparing",
        "ready",
        "served",
        "completed",
        "cancelled"
      )
      .optional(),
    hotel: Joi.string().length(24).hex().optional(),
    branch: Joi.string().length(24).hex().optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    skip: Joi.number().integer().min(0).optional(),
    sortBy: Joi.string()
      .valid("createdAt", "updatedAt", "totalPrice", "status")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
  });
  return schema.validate(data);
};

const validateCancelOrder = (data) => {
  const schema = Joi.object({
    reason: Joi.string().min(3).max(200).optional().messages({
      "string.min": "Reason must be at least 3 characters",
      "string.max": "Reason cannot exceed 200 characters",
    }),
  });
  return schema.validate(data);
};

const validateReorder = (data) => {
  const schema = Joi.object({
    tableId: Joi.string().length(24).hex().optional(),
    paymentMethod: Joi.string()
      .valid("cash", "card", "upi", "wallet")
      .default("cash"),
    specialInstructions: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

export default {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  reorder,
  getOrderStatus,
  getActiveOrders,
  getOrderHistory,
};
