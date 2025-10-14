import { razorpayConfig } from "../config/payment.js";
import crypto from "crypto";
import axios from "axios";
import Razorpay from "razorpay";
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils.js";

import { Order } from "../models/Order.model.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";
import { generateTransactionId } from "../utils/idGenerator.js";

class PaymentService {
  constructor() {
    this.config = razorpayConfig;
    this.razorpay = new Razorpay({
      key_id: this.config.keyId,
      key_secret: this.config.keySecret,
    });
  }

  async initiatePayment(orderId, paymentData) {
    try {
      logger.info("Initiating Razorpay payment", { orderId });

      // Get order details from database
      const order = await Order.findById(orderId);
      if (!order) {
        throw new APIError(404, "Order not found");
      }

      // Generate unique transaction ID
      const transactionId = generateTransactionId();

      // Convert amount to paise (Razorpay expects amount in smallest currency unit)
      const amountInPaise = Math.round(order.totalPrice * 100);

      // Create Razorpay order
      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `order_${orderId}`,
        notes: {
          orderId: orderId,
          transactionId: transactionId,
          userId: order.user.toString(),
          hotelId: order.hotel.toString(),
        },
      });

      // Update order with Razorpay order ID and transaction ID
      await Order.findByIdAndUpdate(orderId, {
        "payment.transactionId": transactionId,
        "payment.razorpayOrderId": razorpayOrder.id,
        "payment.gatewayTransactionId": razorpayOrder.id,
        "payment.paymentStatus": "pending",
      });

      logger.info("Razorpay order created successfully", {
        orderId,
        razorpayOrderId: razorpayOrder.id,
      });

      return {
        transactionId: transactionId,
        orderId: razorpayOrder.id,
        amount: amountInPaise,
        currency: "INR",
        key: this.config.keyId,
        name: "Hotel Management System",
        description: `Payment for Order #${orderId}`,
        order_id: razorpayOrder.id,
        callback_url: this.config.callbackUrl,
        prefill: {
          name: paymentData.customerName || "",
          email: paymentData.customerEmail || "",
          contact: paymentData.customerPhone || "",
        },
        theme: {
          color: "#3399cc",
        },
      };
    } catch (error) {
      logger.error("Payment initiation failed", {
        orderId,
        error: error.message,
        stack: error.stack,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Payment initiation failed");
    }
  }

  async checkPaymentStatus(identifier) {
    try {
      logger.info("Checking payment status", { identifier });

      let order;
      let payment;

      // Check if identifier is a transaction ID (our format) or Razorpay payment ID
      if (identifier.startsWith("TXN-")) {
        // Find order by our transaction ID
        order = await Order.findOne({
          "payment.transactionId": identifier,
        });

        if (!order) {
          throw new APIError(404, "Transaction not found");
        }

        // If we have a Razorpay payment ID, fetch payment details
        if (order.payment.razorpayPaymentId) {
          payment = await this.razorpay.payments.fetch(
            order.payment.razorpayPaymentId
          );
        }
      } else {
        // Assume it's a Razorpay payment ID
        payment = await this.razorpay.payments.fetch(identifier);

        // Find order by Razorpay order ID
        order = await Order.findOne({
          "payment.razorpayOrderId": payment.order_id,
        });
      }
      if (!order) {
        throw new APIError(404, "Order not found for this payment");
      }

      // Map Razorpay status to our system status (if payment exists)
      let paymentStatus = order.payment.paymentStatus || "pending";

      if (payment) {
        switch (payment.status) {
          case "captured":
          case "authorized":
            paymentStatus = "paid";
            break;
          case "failed":
            paymentStatus = "failed";
            break;
          case "refunded":
            paymentStatus = "refunded";
            break;
          default:
            paymentStatus = "pending";
        }

        // Update order status if payment is successful
        if (
          paymentStatus === "paid" &&
          order.payment.paymentStatus !== "paid"
        ) {
          await Order.findByIdAndUpdate(order._id, {
            "payment.paymentStatus": "paid",
            "payment.razorpayPaymentId": payment.id,
            "payment.paidAt": new Date(),
            status: "confirmed",
          });
        }
      }

      logger.info("Payment status checked successfully", {
        identifier,
        transactionId: order.payment.transactionId,
        status: paymentStatus,
      });

      return {
        transactionId: order.payment.transactionId,
        orderId: order._id,
        razorpayOrderId: order.payment.razorpayOrderId,
        razorpayPaymentId:
          order.payment.razorpayPaymentId || (payment ? payment.id : null),
        status: paymentStatus,
        amount: payment ? payment.amount / 100 : order.totalPrice, // Convert back to rupees
        currency: payment ? payment.currency : "INR",
        method: payment ? payment.method : order.payment.paymentMethod,
        createdAt: payment
          ? new Date(payment.created_at * 1000)
          : order.createdAt,
      };
    } catch (error) {
      logger.error("Payment status check failed", {
        identifier,
        error: error.message,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Payment status check failed");
    }
  }

  async handlePaymentCallback(callbackData) {
    try {
      logger.info("Processing Razorpay payment callback", callbackData);

      // Check if this is a standard Razorpay callback or custom callback
      const isRazorpayCallback =
        callbackData.razorpay_payment_id && callbackData.razorpay_order_id;
      const isCustomCallback =
        callbackData.orderId && callbackData.transactionId;

      if (isRazorpayCallback) {
        return await this.handleStandardRazorpayCallback(callbackData);
      } else if (isCustomCallback) {
        return await this.handleCustomCallback(callbackData);
      } else {
        throw new APIError(400, "Invalid callback parameters");
      }
    } catch (error) {
      logger.error("Payment callback handling failed", {
        error: error.message,
        callbackData,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Payment callback handling failed");
    }
  }

  async handleStandardRazorpayCallback(callbackData) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      callbackData;

    // Verify payment signature (skip if already verified via webhook)
    if (razorpay_signature !== "webhook_verified") {
      const isSignatureValid = this.verifyPaymentSignature({
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
      });

      if (!isSignatureValid) {
        throw new APIError(400, "Invalid payment signature");
      }
    }

    // Find order by Razorpay order ID
    const order = await Order.findOne({
      "payment.razorpayOrderId": razorpay_order_id,
    });

    if (!order) {
      throw new APIError(404, "Order not found");
    }

    // Get payment details from Razorpay
    const payment = await this.razorpay.payments.fetch(razorpay_payment_id);

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      "payment.paymentStatus": "paid",
      "payment.razorpayPaymentId": razorpay_payment_id,
      "payment.paidAt": new Date(),
      "payment.paymentMethod": "razorpay",
      status: "confirmed",
    });

    logger.info("Standard Razorpay callback processed successfully", {
      orderId: order._id,
      razorpayPaymentId: razorpay_payment_id,
    });

    return {
      transactionId: order.payment.transactionId,
      orderId: order._id,
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      amount: payment.amount / 100,
    };
  }

  async handleCustomCallback(callbackData) {
    const { orderId, transactionId } = callbackData;

    logger.info("Processing custom callback", { orderId, transactionId });

    // Find order by order ID or transaction ID
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId);
    }

    if (!order && transactionId) {
      order = await Order.findOne({
        "payment.transactionId": transactionId,
      });
    }

    if (!order) {
      throw new APIError(404, "Order not found");
    }

    // Check current payment status from Razorpay
    const currentStatus = await this.checkPaymentStatus(
      transactionId || order.payment.transactionId
    );

    if (currentStatus.status === "paid") {
      // Update order if payment is successful
      await Order.findByIdAndUpdate(order._id, {
        "payment.paymentStatus": "paid",
        "payment.paidAt": new Date(),
        "payment.paymentMethod": "razorpay",
        status: "confirmed",
      });

      logger.info(
        "Custom callback processed successfully - payment confirmed",
        {
          orderId: order._id,
          transactionId: currentStatus.transactionId,
        }
      );

      return {
        transactionId: currentStatus.transactionId,
        orderId: order._id,
        status: "success",
        razorpayPaymentId: currentStatus.razorpayPaymentId,
        amount: currentStatus.amount,
      };
    } else {
      logger.info("Custom callback processed - payment still pending/failed", {
        orderId: order._id,
        transactionId: currentStatus.transactionId,
        paymentStatus: currentStatus.status,
      });

      return {
        transactionId: currentStatus.transactionId,
        orderId: order._id,
        status: currentStatus.status,
        amount: currentStatus.amount,
      };
    }
  }

  async initiateRefund(orderId, refundData) {
    try {
      logger.info("Initiating Razorpay refund", { orderId, refundData });

      // Get order details
      const order = await Order.findById(orderId);
      if (!order) {
        throw new APIError(404, "Order not found");
      }

      if (!order.payment.razorpayPaymentId) {
        throw new APIError(400, "No payment found for this order");
      }

      if (order.payment.paymentStatus !== "paid") {
        throw new APIError(400, "Cannot refund unpaid order");
      }

      // Calculate refund amount (in paise)
      const refundAmount = refundData.amount
        ? Math.round(refundData.amount * 100)
        : Math.round(order.totalPrice * 100);

      // Create refund in Razorpay
      const refund = await this.razorpay.payments.refund(
        order.payment.razorpayPaymentId,
        {
          amount: refundAmount,
          notes: {
            orderId: orderId,
            reason: refundData.reason || "Refund requested",
            initiatedBy: refundData.initiatedBy,
          },
        }
      );

      // Update order status
      await Order.findByIdAndUpdate(orderId, {
        "payment.paymentStatus": "refund_pending",
        "payment.refundId": refund.id,
        "payment.refundAmount": refundAmount / 100,
        "payment.refundInitiatedAt": new Date(),
      });

      logger.info("Refund initiated successfully", {
        orderId,
        refundId: refund.id,
        amount: refundAmount / 100,
      });

      return {
        refundId: refund.id,
        orderId: orderId,
        amount: refundAmount / 100,
        status: refund.status,
        estimatedSettlement: "5-7 business days",
      };
    } catch (error) {
      logger.error("Refund initiation failed", {
        orderId,
        error: error.message,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Refund initiation failed");
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - Payment verification data
   * @returns {boolean} - Signature validity
   */
  verifyPaymentSignature(paymentData) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
        paymentData;

      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", this.config.keySecret)
        .update(body.toString())
        .digest("hex");

      return expectedSignature === razorpay_signature;
    } catch (error) {
      logger.error("Signature verification failed", {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Verify Razorpay webhook signature using official Razorpay utility
   * @param {string} body - Raw webhook body
   * @param {string} signature - Webhook signature from headers
   * @returns {boolean} - Signature validity
   */
  verifyWebhookSignature(body, signature) {
    try {
      if (!this.config.webhookSecret) {
        logger.warn("Webhook secret not configured, skipping verification");
        return true; // Allow for now if webhook secret is not set
      }

      // Use official Razorpay utility for webhook validation
      const isValid = validateWebhookSignature(
        JSON.stringify(body),
        signature,
        this.config.webhookSecret
      );

      logger.info("Webhook signature verification", {
        isValid,
        hasSignature: !!signature,
        hasSecret: !!this.config.webhookSecret,
      });

      return isValid;
    } catch (error) {
      logger.error("Webhook signature verification failed", {
        error: error.message,
      });
      return false;
    }
  }
}

export const paymentService = new PaymentService();
