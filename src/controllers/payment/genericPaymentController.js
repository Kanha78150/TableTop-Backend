import { paymentService } from "../../services/paymentService.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { logger } from "../../utils/logger.js";

/**
 * @desc    Initiate Razorpay payment
 * @route   POST /api/v1/payment/razorpay/initiate
 * @access  Private (User)
 */
export const initiatePayment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const userId = req.user.id;

    logger.info("Payment initiation request", { orderId, userId });

    const paymentResponse = await paymentService.initiatePayment(orderId, {
      userId,
      ...req.body,
    });

    return res
      .status(200)
      .json(
        new APIResponse(200, paymentResponse, "Payment initiated successfully")
      );
  } catch (error) {
    logger.error("Payment initiation failed", {
      error: error.message,
      stack: error.stack,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "Payment initiation failed"));
  }
};

/**
 * @desc    Handle Razorpay payment callback/redirect
 * @route   GET /api/v1/payment/razorpay/callback
 * @access  Public
 */
export const handlePaymentCallback = async (req, res) => {
  try {
    // Handle both GET (redirect) and POST (form submission) callbacks
    const callbackData = req.method === "GET" ? req.query : req.body;

    logger.info("Payment callback received", {
      method: req.method,
      data: callbackData,
    });

    const result = await paymentService.handlePaymentCallback(callbackData);

    // Redirect to frontend with payment status
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = `${frontendUrl}/payment/${result.status}?orderId=${result.orderId}`;

    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error("Payment callback handling failed", {
      error: error.message,
      stack: error.stack,
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const redirectUrl = `${frontendUrl}/payment/failed`;

    return res.redirect(redirectUrl);
  }
};

/**
 * @desc    Handle Razorpay payment webhook/status callback
 * @route   POST /api/v1/payment/razorpay/webhook
 * @access  Public
 */
export const handlePaymentWebhook = async (req, res) => {
  try {
    const webhookBody = req.body;
    const webhookSignature = req.get("X-Razorpay-Signature");

    logger.info("Payment webhook received", {
      hasBody: !!webhookBody,
      hasSignature: !!webhookSignature,
      event: webhookBody?.event,
    });

    // Verify webhook signature before processing
    const isSignatureValid = paymentService.verifyWebhookSignature(
      webhookBody,
      webhookSignature
    );

    if (!isSignatureValid) {
      logger.error("Invalid webhook signature", {
        signature: webhookSignature,
      });
      return res
        .status(400)
        .json(new APIResponse(400, null, "Invalid signature"));
    }

    // Process the webhook based on event type
    if (webhookBody.event === "payment.captured") {
      await paymentService.handlePaymentCallback({
        razorpay_payment_id: webhookBody.payload.payment.entity.id,
        razorpay_order_id: webhookBody.payload.payment.entity.order_id,
        razorpay_signature: "webhook_verified", // Mark as verified via webhook
      });
    } else if (webhookBody.event === "payment.failed") {
      // Handle payment failure
      logger.info("Payment failed webhook", {
        paymentId: webhookBody.payload.payment.entity.id,
        orderId: webhookBody.payload.payment.entity.order_id,
      });
    }

    // Razorpay expects a success response
    return res
      .status(200)
      .json(new APIResponse(200, null, "Webhook processed successfully"));
  } catch (error) {
    logger.error("Payment webhook handling failed", {
      error: error.message,
      stack: error.stack,
    });

    // Still return success to Razorpay to avoid retries
    return res.status(200).json(new APIResponse(200, null, "Webhook received"));
  }
};

/**
 * @desc    Check payment status
 * @route   GET /api/v1/payment/razorpay/status/:transactionId
 * @access  Private (User)
 */
export const checkPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    logger.info("Payment status check request", { transactionId });

    const statusResponse = await paymentService.checkPaymentStatus(
      transactionId
    );

    return res
      .status(200)
      .json(
        new APIResponse(
          200,
          statusResponse,
          "Payment status retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Payment status check failed", {
      error: error.message,
      transactionId: req.params.transactionId,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "Payment status check failed"));
  }
};

/**
 * @desc    Initiate refund
 * @route   POST /api/v1/payment/razorpay/refund
 * @access  Private (Admin/Manager)
 */
export const initiateRefund = async (req, res) => {
  try {
    const { orderId, amount, reason } = req.body;

    logger.info("Refund initiation request", { orderId, amount, reason });

    const refundResponse = await paymentService.initiateRefund(orderId, {
      amount,
      reason,
      initiatedBy: req.user.id,
    });

    return res
      .status(200)
      .json(
        new APIResponse(200, refundResponse, "Refund initiated successfully")
      );
  } catch (error) {
    logger.error("Refund initiation failed", {
      error: error.message,
      stack: error.stack,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "Refund initiation failed"));
  }
};

/**
 * @desc    Get payment history
 * @route   GET /api/v1/payment/history
 * @access  Private (User)
 */
export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    logger.info("Payment history request", { userId, page, limit });

    // TODO: Implement payment history retrieval
    throw new APIError(501, "Payment history not implemented");
  } catch (error) {
    logger.error("Payment history retrieval failed", {
      error: error.message,
      userId: req.user?.id,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "Payment history retrieval failed"));
  }
};

/**
 * @desc    Get all payments (Admin only)
 * @route   GET /api/v1/payment/all
 * @access  Private (Admin)
 */
export const getAllPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, method } = req.query;

    logger.info("All payments request", { page, limit, status, method });

    // TODO: Implement all payments retrieval
    throw new APIError(501, "All payments retrieval not implemented");
  } catch (error) {
    logger.error("All payments retrieval failed", {
      error: error.message,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "All payments retrieval failed"));
  }
};

/**
 * @desc    Get payment analytics (Admin only)
 * @route   GET /api/v1/payment/analytics
 * @access  Private (Admin)
 */
export const getPaymentAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;

    logger.info("Payment analytics request", { startDate, endDate, groupBy });

    // TODO: Implement payment analytics
    throw new APIError(501, "Payment analytics not implemented");
  } catch (error) {
    logger.error("Payment analytics retrieval failed", {
      error: error.message,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "Payment analytics retrieval failed"));
  }
};

/**
 * @desc    Debug orders data (Development only)
 * @route   GET /api/v1/payment/debug/orders
 * @access  Private (Admin) - Development only
 */
export const debugOrdersData = async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      throw new APIError(403, "Debug endpoints not available in production");
    }

    logger.info("Debug orders request");

    // TODO: Implement debug orders data
    throw new APIError(501, "Debug orders not implemented");
  } catch (error) {
    logger.error("Debug orders failed", {
      error: error.message,
    });

    if (error instanceof APIError) {
      return res
        .status(error.statusCode)
        .json(new APIResponse(error.statusCode, null, error.message));
    }

    return res
      .status(500)
      .json(new APIResponse(500, null, "Debug orders failed"));
  }
};
