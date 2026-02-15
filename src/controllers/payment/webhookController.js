/**
 * Webhook Controller
 * Handles incoming webhooks from payment gateways
 * Razorpay, PhonePe, and Paytm webhook processing
 */

import dynamicPaymentService from "../../services/dynamicPaymentService.js";
import { Order } from "../../models/Order.model.js";

/**
 * Handle Razorpay webhook
 * @route POST /api/v1/webhooks/razorpay/:hotelId
 * @access Public (webhook endpoint)
 */
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const signature = req.headers["x-razorpay-signature"];
    const payload = req.body;

    if (!signature) {
      console.error("Razorpay webhook: Missing signature");
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // Process webhook
    const result = await dynamicPaymentService.handleWebhook(
      "razorpay",
      payload,
      signature,
      hotelId
    );

    if (result.success) {
      console.log("Razorpay webhook processed:", result.orderId, result.status);
      return res.status(200).json({ success: true });
    } else {
      console.error("Razorpay webhook failed:", result.message);
      return res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error("Error processing Razorpay webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

/**
 * Handle Razorpay webhook (Universal - no hotelId required)
 * Auto-detects hotel from the order in the webhook payload.
 * Use this when you have a single webhook URL in Razorpay dashboard.
 * @route POST /api/v1/webhooks/razorpay (no hotelId param)
 * @access Public (webhook endpoint)
 */
export const handleRazorpayWebhookUniversal = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const payload = req.body;

    if (!signature) {
      console.error("Razorpay webhook (universal): Missing signature");
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // Extract Razorpay order_id from webhook payload to find the hotel
    const razorpayOrderId =
      payload.payload?.payment?.entity?.order_id ||
      payload.payload?.order?.entity?.id;

    if (!razorpayOrderId) {
      console.error("Razorpay webhook (universal): No order_id in payload");
      return res.status(400).json({
        success: false,
        message: "No order_id found in webhook payload",
      });
    }

    // Look up the order to find the hotel
    const order = await Order.findOne({
      "payment.gatewayOrderId": razorpayOrderId,
    });

    if (!order) {
      console.error(
        `Razorpay webhook (universal): Order not found for gatewayOrderId: ${razorpayOrderId}`
      );
      // Return 200 so Razorpay doesn't keep retrying for unknown orders
      return res.status(200).json({
        success: false,
        message: "Order not found",
      });
    }

    const hotelId = order.hotel.toString();

    console.log(
      `Razorpay webhook (universal): Found hotel ${hotelId} for order ${order._id}`
    );

    // Process webhook with detected hotelId
    const result = await dynamicPaymentService.handleWebhook(
      "razorpay",
      payload,
      signature,
      hotelId
    );

    if (result.success) {
      console.log(
        "Razorpay webhook (universal) processed:",
        result.orderId,
        result.status
      );
      return res.status(200).json({ success: true });
    } else {
      console.error("Razorpay webhook (universal) failed:", result.message);
      return res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error("Error processing Razorpay webhook (universal):", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

/**
 * Handle PhonePe webhook
 * @route POST /api/v1/webhooks/phonepe/:hotelId
 * @access Public (webhook endpoint)
 */
export const handlePhonePeWebhook = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const signature = req.headers["x-verify"];
    const payload = req.body;

    if (!signature) {
      console.error("PhonePe webhook: Missing signature");
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // PhonePe sends base64 encoded payload in response field
    let decodedPayload = payload;
    if (payload.response) {
      try {
        const decoded = Buffer.from(payload.response, "base64").toString(
          "utf8"
        );
        decodedPayload = JSON.parse(decoded);
      } catch (decodeError) {
        console.error("PhonePe webhook: Failed to decode payload");
        return res.status(400).json({
          success: false,
          message: "Invalid payload format",
        });
      }
    }

    // Process webhook
    const result = await dynamicPaymentService.handleWebhook(
      "phonepe",
      decodedPayload,
      signature,
      hotelId
    );

    if (result.success) {
      console.log("PhonePe webhook processed:", result.orderId, result.status);
      return res.status(200).json({ success: true });
    } else {
      console.error("PhonePe webhook failed:", result.message);
      return res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error("Error processing PhonePe webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

/**
 * Handle Paytm webhook
 * @route POST /api/v1/webhooks/paytm/:hotelId
 * @access Public (webhook endpoint)
 */
export const handlePaytmWebhook = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const payload = req.body;
    const signature = payload.CHECKSUMHASH;

    if (!signature) {
      console.error("Paytm webhook: Missing checksum");
      return res.status(400).json({
        success: false,
        message: "Missing webhook checksum",
      });
    }

    // Process webhook
    const result = await dynamicPaymentService.handleWebhook(
      "paytm",
      payload,
      signature,
      hotelId
    );

    if (result.success) {
      console.log("Paytm webhook processed:", result.orderId, result.status);
      return res.status(200).json({ success: true, RESPCODE: "01" });
    } else {
      console.error("Paytm webhook failed:", result.message);
      return res
        .status(400)
        .json({ success: false, RESPCODE: "02", message: result.message });
    }
  } catch (error) {
    console.error("Error processing Paytm webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      RESPCODE: "02",
    });
  }
};

/**
 * Get webhook logs for debugging (Admin only)
 * @route GET /api/v1/webhooks/logs/:hotelId
 * @access Private (Admin)
 */
export const getWebhookLogs = async (req, res) => {
  try {
    const { hotelId } = req.params;
    const { limit = 50, provider } = req.query;

    // Only admins can view webhook logs
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can view webhook logs",
      });
    }

    // Build query
    const query = {
      hotel: hotelId,
      "payment.webhookReceivedAt": { $exists: true },
    };

    if (provider) {
      query["payment.provider"] = provider;
    }

    // Fetch orders with webhook data
    const orders = await Order.find(query)
      .select(
        "orderNumber payment.provider payment.status payment.webhookReceivedAt payment.webhookData"
      )
      .sort({ "payment.webhookReceivedAt": -1 })
      .limit(parseInt(limit));

    return res.status(200).json({
      success: true,
      data: {
        logs: orders.map((order) => ({
          orderId: order._id,
          orderNumber: order.orderNumber,
          provider: order.payment.provider,
          status: order.payment.status,
          receivedAt: order.payment.webhookReceivedAt,
          webhookData: order.payment.webhookData,
        })),
        count: orders.length,
      },
    });
  } catch (error) {
    console.error("Error fetching webhook logs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch webhook logs",
      error: error.message,
    });
  }
};

/**
 * Test webhook endpoint (for development/testing)
 * @route POST /api/v1/webhooks/test/:provider/:hotelId
 * @access Private (Admin)
 */
export const testWebhook = async (req, res) => {
  try {
    const { provider, hotelId } = req.params;
    const { orderId } = req.body;

    // Only admins can test webhooks
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can test webhooks",
      });
    }

    // Validate provider
    if (!dynamicPaymentService.isProviderSupported(provider)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported provider: ${provider}`,
      });
    }

    // Fetch order
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.payment || !order.payment.gatewayOrderId) {
      return res.status(400).json({
        success: false,
        message: "Payment not initiated for this order",
      });
    }

    // Create mock webhook payload based on provider
    let mockPayload, mockSignature;

    if (provider === "razorpay") {
      mockPayload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: order.payment.paymentId || "test_payment_id",
              order_id: order.payment.gatewayOrderId,
              status: "captured",
              amount: order.payment.amount * 100,
            },
          },
        },
      };
      mockSignature = "test_signature_for_development";
    } else if (provider === "phonepe") {
      mockPayload = {
        transactionId: order.payment.paymentId || "test_transaction_id",
        merchantOrderId: order.payment.gatewayOrderId,
        code: "PAYMENT_SUCCESS",
        amount: order.payment.amount * 100,
      };
      mockSignature = "test_signature###1";
    } else if (provider === "paytm") {
      mockPayload = {
        TXNID: order.payment.paymentId || "test_txn_id",
        ORDERID: order.payment.gatewayOrderId,
        STATUS: "TXN_SUCCESS",
        TXNAMOUNT: order.payment.amount.toString(),
        CHECKSUMHASH: "test_checksum_hash",
      };
      mockSignature = mockPayload.CHECKSUMHASH;
    }

    return res.status(200).json({
      success: true,
      message: "Test webhook payload generated",
      note: "This is a mock payload for testing. Actual signature validation will fail.",
      data: {
        provider,
        hotelId,
        orderId: order._id,
        webhookUrl: `/api/v1/webhooks/${provider}/${hotelId}`,
        payload: mockPayload,
        signature: mockSignature,
        headers:
          provider === "razorpay"
            ? { "x-razorpay-signature": mockSignature }
            : provider === "phonepe"
              ? { "x-verify": mockSignature }
              : {},
      },
    });
  } catch (error) {
    console.error("Error generating test webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate test webhook",
      error: error.message,
    });
  }
};

/**
 * Retry failed webhook processing
 * @route POST /api/v1/webhooks/retry/:orderId
 * @access Private (Admin)
 */
export const retryWebhook = async (req, res) => {
  try {
    const { orderId } = req.params;

    // Only admins can retry webhooks
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Only administrators can retry webhook processing",
      });
    }

    // Fetch order
    const order = await Order.findById(orderId).populate("hotel");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (!order.payment || !order.payment.webhookData) {
      return res.status(400).json({
        success: false,
        message: "No webhook data found for this order",
      });
    }

    // Get stored webhook data
    const provider = order.payment.provider;
    const payload = order.payment.webhookData;
    const signature = payload.CHECKSUMHASH || "stored_signature";

    // Reprocess webhook
    const result = await dynamicPaymentService.handleWebhook(
      provider,
      payload,
      signature,
      order.hotel._id
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Webhook reprocessed successfully",
        data: result,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Webhook reprocessing failed",
        error: result.message,
      });
    }
  } catch (error) {
    console.error("Error retrying webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retry webhook processing",
      error: error.message,
    });
  }
};
