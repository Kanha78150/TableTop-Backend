import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import paymentService from "../../services/paymentService.js";
import { Order } from "../../models/Order.model.js";
import { User } from "../../models/User.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";

/**
 * @desc    Initiate PhonePe payment
 * @route   POST /api/v1/payment/phonepe/initiate
 * @access  Private
 */
const initiatePayment = asyncHandler(async (req, res) => {
  const { orderId, amount, userId, userPhone, userName, userEmail } = req.body;

  // Validate required fields
  if (!orderId || !amount || !userId || !userPhone) {
    throw new APIError(
      400,
      "Missing required fields: orderId, amount, userId, userPhone"
    );
  }

  // Validate payment
  const validation = await paymentService.validatePayment(orderId, amount);
  if (!validation.valid) {
    throw new APIError(400, "Payment validation failed");
  }

  // Get user details if not provided
  let customerDetails = { userName, userEmail, userPhone };
  if (!userName || !userEmail) {
    const user = await User.findById(userId).select("name email phone");
    if (user) {
      customerDetails.userName = userName || user.name;
      customerDetails.userEmail = userEmail || user.email;
      customerDetails.userPhone = userPhone || user.phone;
    }
  }

  // Initiate payment
  const paymentResponse = await paymentService.initiatePayment({
    orderId,
    amount,
    userId,
    ...customerDetails,
  });

  logger.info("Payment initiated successfully", {
    orderId,
    transactionId: paymentResponse.transactionId,
    userId,
  });

  res
    .status(200)
    .json(
      new APIResponse(200, paymentResponse, "Payment initiated successfully")
    );
});

/**
 * @desc    Handle PhonePe payment callback/redirect
 * @route   GET /api/v1/payment/phonepe/callback
 * @access  Public
 */
const handlePaymentCallback = asyncHandler(async (req, res) => {
  const { orderId } = req.query;
  const { code, merchantId, transactionId, amount, providerReferenceId } =
    req.query;

  logger.info("Payment callback received", {
    orderId,
    transactionId,
    code,
    query: req.query,
  });

  try {
    // Find order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/failed?error=order_not_found`
      );
    }

    // Check payment status
    const statusResponse = await paymentService.checkPaymentStatus(
      order.payment.transactionId,
      orderId
    );

    const redirectUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (statusResponse.status === "paid") {
      // Payment successful
      logger.info("Payment successful", {
        orderId,
        transactionId: statusResponse.transactionId,
      });

      return res.redirect(
        `${redirectUrl}/payment/success?orderId=${orderId}&transactionId=${statusResponse.transactionId}`
      );
    } else {
      // Payment failed or pending
      logger.warn("Payment not successful", {
        orderId,
        status: statusResponse.status,
      });

      return res.redirect(
        `${redirectUrl}/payment/failed?orderId=${orderId}&status=${statusResponse.status}`
      );
    }
  } catch (error) {
    logger.error("Payment callback error", {
      error: error.message,
      orderId,
      transactionId,
    });

    const redirectUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    return res.redirect(`${redirectUrl}/payment/failed?error=callback_error`);
  }
});

/**
 * @desc    Handle PhonePe payment webhook/status callback
 * @route   POST /api/v1/payment/phonepe/status
 * @access  Public
 */
const handlePaymentWebhook = asyncHandler(async (req, res) => {
  logger.info("Payment webhook received", { body: req.body });

  try {
    const callbackResult = await paymentService.handlePaymentCallback(req.body);

    logger.info("Payment webhook processed successfully", {
      orderId: callbackResult.orderId,
      status: callbackResult.status,
    });

    // PhonePe expects a success response
    res.status(200).json({
      success: true,
      code: "PAYMENT_SUCCESS",
      message: "OK",
    });
  } catch (error) {
    logger.error("Payment webhook processing failed", {
      error: error.message,
      body: req.body,
    });

    // Still return success to PhonePe to avoid retries
    res.status(200).json({
      success: false,
      code: "PAYMENT_ERROR",
      message: "Webhook processing failed",
    });
  }
});

/**
 * @desc    Check payment status
 * @route   GET /api/v1/payment/phonepe/status/:transactionId
 * @access  Private
 */
const checkPaymentStatus = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  // Find order by transaction ID
  const order = await Order.findOne({
    "payment.transactionId": transactionId,
  }).select("payment");

  if (!order) {
    throw new APIError(404, "Order not found for this transaction");
  }

  // Check payment status
  const statusResponse = await paymentService.checkPaymentStatus(
    transactionId,
    order._id.toString()
  );

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        statusResponse,
        "Payment status retrieved successfully"
      )
    );
});

/**
 * @desc    Initiate payment refund
 * @route   POST /api/v1/payment/phonepe/refund
 * @access  Private (Admin/Manager)
 */
const initiateRefund = asyncHandler(async (req, res) => {
  const { orderId, amount, reason } = req.body;

  if (!orderId || !amount) {
    throw new APIError(400, "Missing required fields: orderId, amount");
  }

  // Find order
  const order = await Order.findById(orderId);
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  if (order.payment.paymentStatus !== "paid") {
    throw new APIError(400, "Cannot refund unpaid order");
  }

  if (!order.payment.transactionId) {
    throw new APIError(400, "No payment transaction found for this order");
  }

  // Validate refund amount
  if (amount > order.totalPrice) {
    throw new APIError(400, "Refund amount cannot exceed order amount");
  }

  // Initiate refund
  const refundResponse = await paymentService.initiateRefund({
    orderId,
    merchantTransactionId: order.payment.transactionId,
    amount,
    reason,
  });

  logger.info("Refund initiated", {
    orderId,
    refundTransactionId: refundResponse.refundTransactionId,
    amount,
    initiatedBy: req.user._id,
  });

  res
    .status(200)
    .json(
      new APIResponse(200, refundResponse, "Refund initiated successfully")
    );
});

/**
 * @desc    Get payment history for an order
 * @route   GET /api/v1/payment/history/:orderId
 * @access  Private
 */
const getPaymentHistory = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId)
    .select("payment totalPrice orderStatus createdAt")
    .lean();

  if (!order) {
    throw new APIError(404, "Order not found");
  }

  // Format payment history
  const paymentHistory = {
    orderId,
    totalAmount: order.totalPrice,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
    payment: {
      method: order.payment.paymentMethod,
      status: order.payment.paymentStatus,
      transactionId: order.payment.transactionId,
      gatewayTransactionId: order.payment.gatewayTransactionId,
      paidAt: order.payment.paidAt,
      refund: order.payment.refund || null,
    },
  };

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        paymentHistory,
        "Payment history retrieved successfully"
      )
    );
});

/**
 * @desc    Get all payments (Admin only)
 * @route   GET /api/v1/payment/all
 * @access  Private (Admin)
 */
const getAllPayments = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    method,
    startDate,
    endDate,
    search,
  } = req.query;

  // Build query
  const query = {};

  if (status) {
    query["payment.paymentStatus"] = status;
  }

  if (method) {
    query["payment.paymentMethod"] = method;
  }

  if (startDate && endDate) {
    query.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  if (search) {
    query.$or = [
      { "payment.transactionId": { $regex: search, $options: "i" } },
      { "payment.gatewayTransactionId": { $regex: search, $options: "i" } },
    ];
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    select:
      "payment totalPrice orderStatus createdAt user subtotal taxes serviceCharge",
    populate: {
      path: "user",
      select: "name email phone",
    },
  };

  const payments = await Order.paginate(query, options);

  res
    .status(200)
    .json(new APIResponse(200, payments, "Payments retrieved successfully"));
});

/**
 * @desc    Get payment analytics
 * @route   GET /api/v1/payment/analytics
 * @access  Private (Admin/Manager)
 */
const getPaymentAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate, branchId, hotelId } = req.query;

  const matchQuery = {};

  if (startDate && endDate) {
    matchQuery.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  if (hotelId) {
    matchQuery.hotel = new mongoose.Types.ObjectId(hotelId);
  }

  if (branchId) {
    matchQuery.branch = new mongoose.Types.ObjectId(branchId);
  }

  const analytics = await Order.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$payment.paymentMethod",
        totalAmount: { $sum: "$totalPrice" },
        totalTransactions: { $sum: 1 },
        successfulPayments: {
          $sum: { $cond: [{ $eq: ["$payment.paymentStatus", "paid"] }, 1, 0] },
        },
        failedPayments: {
          $sum: {
            $cond: [{ $eq: ["$payment.paymentStatus", "failed"] }, 1, 0],
          },
        },
      },
    },
    {
      $project: {
        paymentMethod: "$_id",
        totalAmount: 1,
        totalTransactions: 1,
        successfulPayments: 1,
        failedPayments: 1,
        successRate: {
          $multiply: [
            { $divide: ["$successfulPayments", "$totalTransactions"] },
            100,
          ],
        },
      },
    },
  ]);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        analytics,
        "Payment analytics retrieved successfully"
      )
    );
});

/**
 * @desc    Debug orders data (temporary)
 * @route   GET /api/v1/payment/debug/orders
 * @access  Private (Admin)
 */
const debugOrdersData = asyncHandler(async (req, res) => {
  const { hotelId, branchId } = req.query;

  // Sample query
  const sampleOrders = await Order.find({
    ...(hotelId && { hotel: new mongoose.Types.ObjectId(hotelId) }),
    ...(branchId && { branch: new mongoose.Types.ObjectId(branchId) }),
  })
    .select("hotel branch payment totalPrice createdAt")
    .limit(5)
    .lean();

  const totalOrders = await Order.countDocuments({
    ...(hotelId && { hotel: new mongoose.Types.ObjectId(hotelId) }),
    ...(branchId && { branch: new mongoose.Types.ObjectId(branchId) }),
  });

  res.status(200).json(
    new APIResponse(
      200,
      {
        totalOrders,
        sampleOrders,
        queryParams: { hotelId, branchId },
      },
      "Debug data retrieved"
    )
  );
});

export {
  initiatePayment,
  handlePaymentCallback,
  handlePaymentWebhook,
  checkPaymentStatus,
  initiateRefund,
  getPaymentHistory,
  getAllPayments,
  getPaymentAnalytics,
  debugOrdersData,
};
