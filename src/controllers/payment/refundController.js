import asyncHandler from "express-async-handler";
import {
  RefundRequest,
  refundRequestValidationSchemas,
} from "../../models/RefundRequest.model.js";
import { Order } from "../../models/Order.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";
import { paymentService } from "../../services/paymentService.js";
import { coinService } from "../../services/rewardService.js";

/**
 * @desc    Create refund request (User)
 * @route   POST /api/v1/payment/refund-request
 * @access  Private (User)
 */
export const createRefundRequest = asyncHandler(async (req, res) => {
  const { orderId, amount, reason } = req.body;
  const userId = req.user._id;

  // Validate input
  const { error } = refundRequestValidationSchemas.create.validate({
    orderId,
    amount,
    reason,
  });

  if (error) {
    throw new APIError(400, error.details[0].message);
  }

  // Find and validate order
  const order = await Order.findById(orderId);
  if (!order) {
    throw new APIError(404, "Order not found");
  }

  // Check if user owns this order
  if (order.user.toString() !== userId.toString()) {
    throw new APIError(403, "You can only request refunds for your own orders");
  }

  // Check if order is paid
  if (order.payment.paymentStatus !== "paid") {
    throw new APIError(400, "Can only request refund for paid orders");
  }

  // Check if refund amount is valid
  if (amount > order.totalPrice) {
    throw new APIError(400, "Refund amount cannot exceed order total");
  }

  // Check if there's already a pending/approved refund request
  const existingRequest = await RefundRequest.findOne({
    order: orderId,
    status: { $in: ["pending", "approved", "processed"] },
  });

  if (existingRequest) {
    throw new APIError(400, "A refund request already exists for this order");
  }

  // Create refund request
  const refundRequest = new RefundRequest({
    user: userId,
    order: orderId,
    amount,
    reason,
  });

  await refundRequest.save();

  // Populate order and user details
  await refundRequest.populate([
    { path: "user", select: "name email phone" },
    { path: "order", select: "orderNumber totalPrice createdAt" },
  ]);

  logger.info("Refund request created", {
    refundRequestId: refundRequest._id,
    orderId,
    userId,
    amount,
  });

  res
    .status(201)
    .json(
      new APIResponse(
        201,
        refundRequest,
        "Refund request submitted successfully"
      )
    );
});

/**
 * @desc    Get user's refund requests
 * @route   GET /api/v1/payment/refund-requests
 * @access  Private (User)
 */
export const getUserRefundRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;

  // Validate query parameters
  const { error } = refundRequestValidationSchemas.list.validate(req.query);
  if (error) {
    throw new APIError(400, error.details[0].message);
  }

  // Build query
  const query = { user: userId };
  if (status) {
    query.status = status;
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      {
        path: "order",
        select: "orderNumber totalPrice createdAt payment.paymentMethod",
      },
      { path: "processedBy", select: "name email" },
    ],
  };

  const refundRequests = await RefundRequest.paginate(query, options);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        refundRequests,
        "Refund requests retrieved successfully"
      )
    );
});

/**
 * @desc    Get refund request details
 * @route   GET /api/v1/payment/refund-request/:requestId
 * @access  Private (User - own requests only)
 */
export const getRefundRequestDetails = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user._id;

  const refundRequest = await RefundRequest.findById(requestId).populate([
    { path: "user", select: "name email phone" },
    { path: "order", select: "orderNumber totalPrice createdAt payment" },
    { path: "processedBy", select: "name email role" },
  ]);

  if (!refundRequest) {
    throw new APIError(404, "Refund request not found");
  }

  // Check if user owns this refund request
  if (refundRequest.user.toString() !== userId.toString()) {
    throw new APIError(403, "Access denied");
  }

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        refundRequest,
        "Refund request details retrieved successfully"
      )
    );
});

/**
 * @desc    Cancel refund request (User can cancel only pending requests)
 * @route   DELETE /api/v1/payment/refund-request/:requestId
 * @access  Private (User)
 */
export const cancelRefundRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const userId = req.user._id;

  const refundRequest = await RefundRequest.findById(requestId);
  if (!refundRequest) {
    throw new APIError(404, "Refund request not found");
  }

  // Check if user owns this request
  if (refundRequest.user.toString() !== userId.toString()) {
    throw new APIError(403, "Access denied");
  }

  // Check if request can be cancelled
  if (refundRequest.status !== "pending") {
    throw new APIError(400, "Can only cancel pending refund requests");
  }

  // Delete the request
  await RefundRequest.findByIdAndDelete(requestId);

  logger.info("Refund request cancelled", {
    refundRequestId: requestId,
    userId,
  });

  res
    .status(200)
    .json(new APIResponse(200, null, "Refund request cancelled successfully"));
});

// ===================== ADMIN CONTROLLERS =====================

/**
 * @desc    Get all refund requests (Admin)
 * @route   GET /api/v1/admin/refund-requests
 * @access  Private (Admin)
 */
export const getAllRefundRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status, startDate, endDate } = req.query;

  // Validate query parameters
  const { error } = refundRequestValidationSchemas.list.validate(req.query);
  if (error) {
    throw new APIError(400, error.details[0].message);
  }

  // Build query
  const query = {};
  if (status) {
    query.status = status;
  }
  if (startDate && endDate) {
    query.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      { path: "user", select: "name email phone" },
      {
        path: "order",
        select: "orderNumber totalPrice createdAt payment.paymentMethod",
      },
      { path: "processedBy", select: "name email" },
    ],
  };

  const refundRequests = await RefundRequest.paginate(query, options);

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        refundRequests,
        "Refund requests retrieved successfully"
      )
    );
});

/**
 * @desc    Update refund request status (Admin)
 * @route   PUT /api/v1/admin/refund-request/:requestId/status
 * @access  Private (Admin)
 */
export const updateRefundRequestStatus = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { status, adminNotes } = req.body;
  const adminId = req.user._id;

  // Validate input
  const { error } = refundRequestValidationSchemas.updateStatus.validate({
    status,
    adminNotes,
  });

  if (error) {
    throw new APIError(400, error.details[0].message);
  }

  const refundRequest = await RefundRequest.findById(requestId).populate(
    "order"
  );
  if (!refundRequest) {
    throw new APIError(404, "Refund request not found");
  }

  // Update refund request
  refundRequest.status = status;
  refundRequest.adminNotes = adminNotes;
  refundRequest.processedBy = adminId;
  refundRequest.processedAt = new Date();

  await refundRequest.save();

  // If approved, automatically process the refund
  if (status === "approved") {
    let coinRefundDetails = null;

    try {
      // Process coin refund first
      try {
        coinRefundDetails = await coinService.handleCoinRefund(
          refundRequest.user,
          refundRequest.order._id,
          refundRequest._id
        );

        logger.info("Coin refund processed", {
          refundRequestId: requestId,
          coinRefundDetails,
        });
      } catch (coinError) {
        logger.warn("Coin refund processing failed", {
          refundRequestId: requestId,
          error: coinError.message,
        });
      }

      // Process payment refund
      const refundResponse = await paymentService.initiateRefund({
        orderId: refundRequest.order._id.toString(),
        merchantTransactionId: refundRequest.order.payment.transactionId,
        amount: refundRequest.amount,
        reason: refundRequest.reason,
      });

      // Update refund request with transaction ID
      refundRequest.refundTransactionId = refundResponse.refundTransactionId;
      refundRequest.status = "processed";

      // Store coin refund details if available
      if (coinRefundDetails) {
        refundRequest.coinRefundDetails = coinRefundDetails;
      }

      await refundRequest.save();

      logger.info("Refund automatically processed", {
        refundRequestId: requestId,
        refundTransactionId: refundResponse.refundTransactionId,
        coinRefund: coinRefundDetails,
      });
    } catch (error) {
      logger.error("Auto refund processing failed", {
        refundRequestId: requestId,
        error: error.message,
      });
      // Keep status as approved, admin can manually process
    }
  }

  await refundRequest.populate([
    { path: "user", select: "name email phone" },
    { path: "order", select: "orderNumber totalPrice" },
    { path: "processedBy", select: "name email" },
  ]);

  logger.info("Refund request status updated", {
    refundRequestId: requestId,
    newStatus: status,
    processedBy: adminId,
  });

  res
    .status(200)
    .json(
      new APIResponse(
        200,
        refundRequest,
        "Refund request status updated successfully"
      )
    );
});
