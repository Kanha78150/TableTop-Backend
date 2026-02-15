import orderService from "../../services/order.service.js";
import assignmentService from "../../services/assignment.service.js";
import timeTracker from "../../services/timeTracker.service.js";
import { validateOrder } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import { Order } from "../../models/Order.model.js";
import { RefundRequest } from "../../models/RefundRequest.model.js";
import { invoiceService } from "../../services/invoice.service.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
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

    // Automatically assign waiter to the new order (only for cash orders)
    // For digital payments (razorpay, phonepe, etc.), assignment happens AFTER payment verification
    let assignmentResult = null;
    const isCashOrder =
      paymentMethod === "cash" || order.payment?.paymentMethod === "cash";
    if (isCashOrder) {
      try {
        assignmentResult = await assignmentService.assignOrder(order);
        logger.info(`Order ${order._id} assigned successfully`);
      } catch (assignmentError) {
        logger.error(`Failed to assign order ${order._id}:`, assignmentError);
        // Order is placed but assignment failed - it will be handled by timeTracker
      }
    } else {
      logger.info(
        `Order ${order._id} - skipping staff assignment, waiting for payment verification (method: ${paymentMethod})`
      );
    }

    // Prepare response data
    const responseData = {
      order,
      assignment: assignmentResult
        ? {
            waiter: assignmentResult.waiter,
            assignmentMethod: assignmentResult.assignmentMethod,
            queuePosition: assignmentResult.queuePosition,
            estimatedWaitTime: assignmentResult.estimatedWaitTime,
            assignedAt: assignmentResult.assignedAt,
          }
        : null,
    };

    const message = assignmentResult?.queued
      ? "Order placed and added to queue - will be assigned when a waiter becomes available"
      : assignmentResult
        ? "Order placed and assigned to waiter successfully"
        : "Order placed successfully - assignment pending";

    res.status(201).json(new APIResponse(201, responseData, message));
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
 * Get order payment information (for payment page)
 * GET /api/v1/user/orders/:orderId/payment-info
 */
export const getOrderPaymentInfo = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    const { Order } = await import("../../models/Order.model.js");
    const { Cart } = await import("../../models/Cart.model.js");

    // Find order and verify ownership
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    })
      .populate("items.foodItem", "name price image category foodType")
      .populate("table", "tableNumber seatingCapacity")
      .populate("hotel", "name")
      .populate("branch", "name address")
      .select(
        "orderId items totalPrice subtotal taxes serviceCharge offerDiscount coinDiscount coinsUsed payment createdAt status"
      );

    if (!order) {
      return next(new APIError(404, "Order not found or access denied"));
    }

    // Only allow access to pending/unpaid orders
    if (order.payment.paymentStatus !== "pending") {
      return next(
        new APIError(
          400,
          `This order has already been ${order.payment.paymentStatus}. Payment status: ${order.payment.paymentStatus}`
        )
      );
    }

    // Check if order is not too old (30 minutes timeout)
    const orderAge = Date.now() - new Date(order.createdAt).getTime();
    const TIMEOUT = 30 * 60 * 1000; // 30 minutes

    if (orderAge > TIMEOUT) {
      return next(
        new APIError(
          410,
          "Order has expired. Please create a new order from your cart."
        )
      );
    }

    // Get cart status for debugging
    const cart = await Cart.findOne({
      user: userId,
      checkoutOrderId: orderId,
    }).select("status items");

    res.status(200).json(
      new APIResponse(
        200,
        {
          orderId: order._id,
          orderNumber: order.orderId,
          items: order.items,
          pricing: {
            subtotal: order.subtotal,
            taxes: order.taxes,
            serviceCharge: order.serviceCharge,
            offerDiscount: order.offerDiscount,
            coinDiscount: order.coinDiscount,
            totalPrice: order.totalPrice,
          },
          coinsUsed: order.coinsUsed,
          payment: {
            paymentStatus: order.payment.paymentStatus,
            paymentMethod: order.payment.paymentMethod,
            razorpay_order_id: order.payment.razorpay_order_id,
          },
          table: order.table,
          hotel: order.hotel,
          branch: order.branch,
          status: order.status,
          cartStatus: cart?.status || "unknown",
          cartItemCount: cart?.items?.length || 0,
          canModify: false,
          expiresIn: Math.max(0, TIMEOUT - orderAge),
          expiresAt: new Date(
            new Date(order.createdAt).getTime() + TIMEOUT
          ).toISOString(),
        },
        "Order payment information retrieved successfully"
      )
    );
  } catch (error) {
    logger.error("Error getting order payment info:", error);
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

    // Handle waiter reassignment after cancellation
    let reassignmentResult = null;
    try {
      reassignmentResult = await timeTracker.handleOrderCancellation(orderId);
      if (reassignmentResult) {
        logger.info(`Order reassigned after cancellation of ${orderId}`);
      }
    } catch (reassignmentError) {
      logger.error(
        `Failed to handle reassignment after cancellation of ${orderId}:`,
        reassignmentError
      );
      // Continue with response even if reassignment fails
    }

    const responseData = {
      order,
      reassignment: reassignmentResult
        ? {
            newOrderAssigned: reassignmentResult.order._id,
            waiter: reassignmentResult.waiter?.name,
          }
        : null,
    };

    res
      .status(200)
      .json(new APIResponse(200, responseData, "Order cancelled successfully"));
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
    const { tableId, specialInstructions } = req.body;

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
      specialInstructions,
    });

    // Always returns cart mode response (200 OK)
    res
      .status(200)
      .json(
        new APIResponse(
          200,
          result,
          result.message || "Items added to cart for review"
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
 * Get active orders (pending, confirmed, preparing, ready)
 * GET /api/v1/user/orders/active
 */
export const getActiveOrders = async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Pass $in query to get orders with multiple statuses
    const result = await orderService.getUserOrders(userId, {
      status: { $in: ["pending", "confirmed", "preparing", "ready"] },
      limit: 50,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { orders: result.orders, count: result.orders.length },
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
    const { limit, skip, debug } = req.query;

    // Debug mode: show all orders with their statuses
    if (debug === "true") {
      const allOrders = await orderService.getUserOrders(userId, {
        limit: 50,
        skip: 0,
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      const statusSummary = {};
      allOrders.orders.forEach((order) => {
        statusSummary[order.status] = (statusSummary[order.status] || 0) + 1;
      });

      return res.status(200).json(
        new APIResponse(
          200,
          {
            debug: true,
            totalOrders: allOrders.orders.length,
            statusSummary,
            orders: allOrders.orders.map((order) => ({
              _id: order._id,
              status: order.status,
              createdAt: order.createdAt,
              totalPrice: order.totalPrice,
            })),
          },
          "Debug: All orders retrieved"
        )
      );
    }

    // Get order history directly from database with proper filtering
    const result = await orderService.getUserOrders(userId, {
      status: { $in: ["completed", "cancelled", "served"] }, // Filter at database level
      limit: limit || 20,
      skip: skip || 0,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          orders: result.orders,
          pagination: result.pagination,
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
    tableId: Joi.string().length(24).hex().optional().messages({
      "string.length": "Table ID must be a valid 24-character ID",
      "string.hex": "Table ID must be a valid hexadecimal string",
    }),
    specialInstructions: Joi.string().max(500).optional().messages({
      "string.max": "Special instructions cannot exceed 500 characters",
    }),
  });
  return schema.validate(data);
};

/**
 * Download invoice for an order
 * GET /api/v1/user/orders/:orderId/invoice
 */
export const downloadInvoice = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    // Find order and verify ownership
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    })
      .populate("user", "name email phone")
      .populate("hotel", "name email contactNumber gstin")
      .populate("branch", "name email contactNumber address")
      .populate("items.foodItem", "name price");

    if (!order) {
      return next(new APIError(404, "Order not found or access denied"));
    }

    // Check if order is paid
    if (order.payment.paymentStatus !== "paid") {
      return next(
        new APIError(
          400,
          "Invoice can only be generated for paid orders. Current payment status: " +
            order.payment.paymentStatus
        )
      );
    }

    // If invoice doesn't exist but order is paid, generate it now
    if (!order.invoiceNumber) {
      try {
        logger.info("Generating invoice on-demand for paid order", {
          orderId: order._id,
        });

        // Generate invoice number
        const invoiceNumber = `INV-${Date.now()}-${order._id
          .toString()
          .slice(-8)
          .toUpperCase()}`;

        // Create invoice snapshot
        order.invoiceNumber = invoiceNumber;
        order.invoiceGeneratedAt = new Date();
        order.invoiceSnapshot = {
          hotelName: order.hotel?.name || "Hotel Name",
          hotelEmail: order.hotel?.email || "",
          hotelPhone: order.hotel?.contactNumber || "",
          hotelGSTIN: order.hotel?.gstin || "",
          branchName: order.branch?.name || "Branch Name",
          branchAddress: order.branch?.address || "",
          branchPhone: order.branch?.contactNumber || "",
          branchEmail: order.branch?.email || "",
          customerName: order.user?.name || "Guest",
          customerEmail: order.user?.email || "",
          customerPhone: order.user?.phone || "",
          tableNumber: order.tableNumber || "",
        };

        // Try to send email if not sent
        if (order.user?.email && order.invoiceEmailStatus !== "sent") {
          try {
            const invoice = await invoiceService.generateOrderInvoice(order, {
              showCancelledStamp: false,
            });
            await invoiceService.sendInvoiceEmail(
              invoice,
              order.user.email,
              order.user.name,
              "invoice"
            );
            order.invoiceEmailStatus = "sent";
            logger.info("Invoice email sent successfully", {
              orderId: order._id,
              invoiceNumber: invoiceNumber,
            });
          } catch (emailError) {
            // Email failed - add to queue
            logger.warn("Failed to send invoice email, adding to queue", {
              orderId: order._id,
              error: emailError.message,
            });

            const EmailQueue = (
              await import("../../models/EmailQueue.model.js")
            ).EmailQueue;
            await EmailQueue.create({
              type: "invoice",
              orderId: order._id,
              recipientEmail: order.user.email,
              recipientName: order.user.name,
              status: "pending",
              emailData: {
                subject: `Invoice ${invoiceNumber} - TableTop`,
                invoiceNumber: invoiceNumber,
                amount: order.totalPrice,
              },
              scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
            });

            order.invoiceEmailStatus = "failed";
            order.invoiceEmailAttempts = 1;
          }
        }

        await order.save();

        logger.info("Invoice generated on-demand successfully", {
          orderId: order._id,
          invoiceNumber: invoiceNumber,
        });
      } catch (error) {
        logger.error("Failed to generate invoice on-demand", {
          orderId: order._id,
          error: error.message,
        });
        return next(
          new APIError(
            500,
            "Failed to generate invoice. Please try again later."
          )
        );
      }
    }

    // Check rate limit - reset monthly download count if needed
    order.resetMonthlyDownloadCount();

    // Check if user can download
    if (!order.canDownloadInvoice()) {
      return next(
        new APIError(
          429,
          "Invoice download limit exceeded. You can download up to 3 invoices per month."
        )
      );
    }

    // Determine if cancelled stamp is needed
    const showCancelledStamp = order.needsCancelledStamp();

    // Regenerate invoice from metadata
    const invoice = await invoiceService.generateOrderInvoice(order, {
      showCancelledStamp,
    });

    // Update download count and timestamp
    const now = new Date();
    const lastDownload = order.lastInvoiceDownloadAt
      ? new Date(order.lastInvoiceDownloadAt)
      : null;
    const sameMonth =
      lastDownload &&
      now.getMonth() === lastDownload.getMonth() &&
      now.getFullYear() === lastDownload.getFullYear();

    if (sameMonth) {
      order.invoiceDownloadCount += 1;
    } else {
      order.invoiceDownloadCount = 1;
    }
    order.lastInvoiceDownloadAt = now;

    await order.save();

    logger.info("Invoice downloaded", {
      orderId: order._id,
      userId: userId,
      invoiceNumber: invoice.invoiceNumber,
      downloadCount: order.invoiceDownloadCount,
    });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${invoice.fileName}"`
    );
    res.setHeader("Content-Length", invoice.buffer.length);

    // Send PDF buffer
    res.send(invoice.buffer);
  } catch (error) {
    logger.error("Error downloading invoice:", error);
    next(error);
  }
};

/**
 * Download credit note for an order
 * GET /api/v1/user/orders/:orderId/credit-notes/:creditNoteNumber
 */
export const downloadCreditNote = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { orderId, creditNoteNumber } = req.params;

    // Validate order ID
    if (!orderId || !orderId.match(/^[0-9a-fA-F]{24}$/)) {
      return next(new APIError(400, "Invalid order ID"));
    }

    if (!creditNoteNumber) {
      return next(new APIError(400, "Credit note number is required"));
    }

    // Find order and verify ownership
    const order = await Order.findOne({
      _id: orderId,
      user: userId,
    })
      .populate("user", "name email phone")
      .populate("hotel", "name email contactNumber gstin")
      .populate("branch", "name email contactNumber address");

    if (!order) {
      return next(new APIError(404, "Order not found or access denied"));
    }

    // Find the credit note
    const creditNote = order.creditNotes?.find(
      (cn) => cn.creditNoteNumber === creditNoteNumber
    );

    if (!creditNote) {
      return next(new APIError(404, "Credit note not found for this order"));
    }

    // Get the refund request
    const refundRequest = await RefundRequest.findById(
      creditNote.refundRequestId
    );

    if (!refundRequest) {
      return next(new APIError(404, "Refund request not found"));
    }

    // Regenerate credit note from metadata
    const creditNoteData = await invoiceService.generateCreditNote(
      order,
      refundRequest
    );

    logger.info("Credit note downloaded", {
      orderId: order._id,
      userId: userId,
      creditNoteNumber: creditNoteNumber,
    });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${creditNoteData.fileName}"`
    );
    res.setHeader("Content-Length", creditNoteData.buffer.length);

    // Send PDF buffer
    res.send(creditNoteData.buffer);
  } catch (error) {
    logger.error("Error downloading credit note:", error);
    next(error);
  }
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
  downloadInvoice,
  downloadCreditNote,
};
