import { razorpayConfig } from "../config/payment.js";
import crypto from "crypto";
import axios from "axios";
import Razorpay from "razorpay";
import { validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils.js";

import { Order } from "../models/Order.model.js";
import { Cart } from "../models/Cart.model.js";
import { User } from "../models/User.model.js";
import { CoinTransaction } from "../models/CoinTransaction.model.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";
import { generateTransactionId } from "../utils/idGenerator.js";
import assignmentService from "./assignmentService.js";

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

          // 🎯 TRIGGER STAFF ASSIGNMENT AFTER PAYMENT STATUS UPDATE
          try {
            logger.info(
              "Triggering staff assignment after payment status update",
              {
                orderId: order._id,
              }
            );

            const assignmentResult = await assignmentService.assignOrder(
              order._id.toString()
            );

            if (
              assignmentResult.success &&
              assignmentResult.assignment.waiter
            ) {
              logger.info(
                "Staff assignment successful after payment status update",
                {
                  orderId: order._id,
                  waiterId: assignmentResult.assignment.waiter._id,
                  waiterName: assignmentResult.assignment.waiter.name,
                  method: assignmentResult.assignment.method,
                }
              );
            } else {
              logger.warn(
                "Staff assignment failed after payment status update",
                {
                  orderId: order._id,
                  reason: assignmentResult.message || "No available staff",
                }
              );
            }
          } catch (assignmentError) {
            // Log assignment error but don't fail the payment status update
            logger.error("Staff assignment error after payment status update", {
              orderId: order._id,
              error: assignmentError.message,
              stack: assignmentError.stack,
            });
          }

          // 🛒 CLEAR CART AND PROCESS COINS AFTER PAYMENT STATUS UPDATE
          try {
            await this.clearCartAfterPayment(order);
          } catch (cartError) {
            // Log cart clearing error but don't fail the payment status update
            logger.error("Cart clearing error after payment status update", {
              orderId: order._id,
              error: cartError.message,
              stack: cartError.stack,
            });
          }
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
      logger.info("Processing Razorpay payment callback", {
        callbackData,
        dataType: typeof callbackData,
        hasData: !!callbackData,
        keys: callbackData ? Object.keys(callbackData) : [],
      });

      // Validate callback data exists
      if (!callbackData || typeof callbackData !== "object") {
        logger.error("Invalid callback data received", {
          callbackData,
          type: typeof callbackData,
        });
        throw new APIError(400, "No callback data received");
      }

      // Check if this is a standard Razorpay callback or custom callback
      const isRazorpayCallback =
        callbackData.razorpay_payment_id && callbackData.razorpay_order_id;
      const isCustomCallback =
        callbackData.orderId && callbackData.transactionId;
      const isSuccessCallback =
        callbackData.orderId &&
        callbackData.transactionId &&
        (callbackData.code === "PAYMENT_SUCCESS" ||
          callbackData.status === "SUCCESS");

      logger.info("Callback type detection", {
        isRazorpayCallback,
        isCustomCallback,
        isSuccessCallback,
        hasPaymentId: !!callbackData.razorpay_payment_id,
        hasOrderId: !!callbackData.razorpay_order_id,
        hasCustomOrderId: !!callbackData.orderId,
        hasTransactionId: !!callbackData.transactionId,
        code: callbackData.code,
        status: callbackData.status,
      });

      if (isRazorpayCallback) {
        return await this.handleStandardRazorpayCallback(callbackData);
      } else if (isSuccessCallback) {
        return await this.handleSuccessCallback(callbackData);
      } else if (isCustomCallback) {
        return await this.handleCustomCallback(callbackData);
      } else {
        logger.error("Unrecognized callback format", {
          callbackData,
          availableKeys: Object.keys(callbackData),
        });
        throw new APIError(
          400,
          "Invalid callback parameters - missing required fields"
        );
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

    // 🎯 TRIGGER STAFF ASSIGNMENT AFTER PAYMENT CONFIRMATION
    try {
      logger.info("Triggering staff assignment after payment confirmation", {
        orderId: order._id,
      });

      const assignmentResult = await assignmentService.assignOrder(
        order._id.toString()
      );

      if (assignmentResult.success && assignmentResult.assignment.waiter) {
        logger.info("Staff assignment successful after payment", {
          orderId: order._id,
          waiterId: assignmentResult.assignment.waiter._id,
          waiterName: assignmentResult.assignment.waiter.name,
          method: assignmentResult.assignment.method,
        });
      } else {
        logger.warn("Staff assignment failed after payment", {
          orderId: order._id,
          reason: assignmentResult.message || "No available staff",
        });
      }
    } catch (assignmentError) {
      // Log assignment error but don't fail the payment confirmation
      logger.error("Staff assignment error after payment confirmation", {
        orderId: order._id,
        error: assignmentError.message,
        stack: assignmentError.stack,
      });
      // Payment is still successful even if assignment fails
    }

    // 🛒 CLEAR CART AND PROCESS COINS AFTER PAYMENT CONFIRMATION
    try {
      await this.clearCartAfterPayment(order);
    } catch (cartError) {
      // Log cart clearing error but don't fail the payment confirmation
      logger.error("Cart clearing error after payment confirmation", {
        orderId: order._id,
        error: cartError.message,
        stack: cartError.stack,
      });
    }

    return {
      transactionId: order.payment.transactionId,
      orderId: order._id,
      status: "success",
      razorpayPaymentId: razorpay_payment_id,
      amount: payment.amount / 100,
    };
  }

  async handleSuccessCallback(callbackData) {
    const { orderId, transactionId, code, status } = callbackData;

    logger.info("Processing success callback", {
      orderId,
      transactionId,
      code,
      status,
    });

    // Find order by order ID
    let order = null;

    if (orderId) {
      order = await Order.findById(orderId);
    } else if (transactionId) {
      order = await Order.findOne({
        "payment.transactionId": transactionId,
      });
    }

    if (!order) {
      throw new APIError(404, "Order not found for success callback");
    }

    // Check if payment is already confirmed
    if (order.payment.paymentStatus === "paid") {
      logger.info("Payment already confirmed for order", {
        orderId: order._id,
        currentStatus: order.payment.paymentStatus,
      });

      return {
        transactionId: order.payment.transactionId,
        orderId: order._id,
        status: "success",
        message: "Payment already confirmed",
      };
    }

    // Update order status to confirmed and payment status to paid
    await Order.findByIdAndUpdate(order._id, {
      "payment.paymentStatus": "paid",
      "payment.paidAt": new Date(),
      "payment.paymentMethod": "razorpay",
      status: "confirmed",
    });

    logger.info("Success callback processed successfully", {
      orderId: order._id,
      transactionId: order.payment.transactionId,
    });

    // 🎯 TRIGGER STAFF ASSIGNMENT AFTER PAYMENT CONFIRMATION
    try {
      logger.info("Triggering staff assignment after success callback", {
        orderId: order._id,
      });

      const assignmentResult = await assignmentService.assignOrder(
        order._id.toString()
      );

      if (assignmentResult.success && assignmentResult.assignment.waiter) {
        logger.info("Staff assignment successful after success callback", {
          orderId: order._id,
          waiterId: assignmentResult.assignment.waiter._id,
          waiterName: assignmentResult.assignment.waiter.name,
          method: assignmentResult.assignment.method,
        });
      } else {
        logger.warn("Staff assignment failed after success callback", {
          orderId: order._id,
          reason: assignmentResult.message || "No available staff",
        });
      }
    } catch (assignmentError) {
      // Log assignment error but don't fail the payment confirmation
      logger.error("Staff assignment error after success callback", {
        orderId: order._id,
        error: assignmentError.message,
        stack: assignmentError.stack,
      });
    }

    // 🛒 CLEAR CART AND PROCESS COINS AFTER PAYMENT CONFIRMATION
    try {
      await this.clearCartAfterPayment(order);
    } catch (cartError) {
      // Log cart clearing error but don't fail the payment confirmation
      logger.error("Cart clearing error after success callback", {
        orderId: order._id,
        error: cartError.message,
        stack: cartError.stack,
      });
    }

    return {
      transactionId: order.payment.transactionId,
      orderId: order._id,
      status: "success",
      amount: order.totalPrice,
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

  /**
   * Clear cart and process coins after successful payment
   * @param {Object} order - The order object
   */
  async clearCartAfterPayment(order) {
    try {
      logger.info(
        "Processing cart clearing and coin transactions after payment",
        {
          orderId: order._id,
          userId: order.user._id || order.user,
          coinsUsed: order.coinsUsed || 0,
          rewardCoins: order.rewardCoins || 0,
        }
      );

      const userId = order.user._id || order.user;

      // 1. Find and clear the cart
      const cart = await Cart.findOne({
        user: userId,
        checkoutOrderId: order._id,
        status: "checkout",
      });

      if (cart) {
        // Clear cart items and mark as completed
        cart.items = [];
        cart.status = "completed";
        cart.completedAt = new Date();
        await cart.save();

        logger.info("Cart cleared successfully after payment", {
          cartId: cart._id,
          orderId: order._id,
          userId: userId,
        });
      } else {
        logger.warn("Cart not found for order after payment", {
          orderId: order._id,
          userId: userId,
        });
      }

      // 2. Deduct coins if used (only if not already deducted)
      if (order.coinsUsed > 0) {
        // Check if coins were already deducted
        const existingCoinTransaction = await CoinTransaction.findOne({
          userId: userId,
          orderId: order._id,
          type: "used",
        });

        if (!existingCoinTransaction) {
          // Create coin usage transaction record
          await CoinTransaction.createTransaction({
            userId: userId,
            type: "used",
            amount: -order.coinsUsed,
            orderId: order._id,
            description: `Coins used for Order #${order._id}`,
            metadata: {
              orderTotal: order.totalPrice,
              coinDiscount: order.coinDiscount,
              coinValue: 1,
            },
          });

          logger.info("Coins deducted successfully after payment", {
            userId: userId,
            orderId: order._id,
            coinsDeducted: order.coinsUsed,
          });
        } else {
          logger.info("Coins already deducted for order", {
            orderId: order._id,
            userId: userId,
          });
        }
      }

      // 3. Add reward coins (only if not already added)
      if (order.rewardCoins > 0) {
        // Check if reward coins were already added
        const existingRewardTransaction = await CoinTransaction.findOne({
          userId: userId,
          orderId: order._id,
          type: "earned",
        });

        if (!existingRewardTransaction) {
          // Create reward coin transaction record
          await CoinTransaction.createTransaction({
            userId: userId,
            type: "earned",
            amount: order.rewardCoins,
            orderId: order._id,
            description: `Reward coins for Order #${order._id}`,
            metadata: {
              orderTotal: order.totalPrice,
              rewardRate: 0.01, // 1% reward rate
            },
          });

          logger.info("Reward coins added successfully after payment", {
            userId: userId,
            orderId: order._id,
            rewardCoins: order.rewardCoins,
          });
        } else {
          logger.info("Reward coins already added for order", {
            orderId: order._id,
            userId: userId,
          });
        }
      }

      logger.info("Cart clearing and coin processing completed successfully", {
        orderId: order._id,
        userId: userId,
      });
    } catch (error) {
      logger.error("Error in clearCartAfterPayment", {
        orderId: order._id,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Restore cart to active status when payment fails or is cancelled
   * @param {String} orderId - The order ID
   */
  async restoreCartAfterPaymentFailure(orderId) {
    try {
      logger.info("Restoring cart after payment failure", {
        orderId: orderId,
      });

      // Find the order to get user ID
      const order = await Order.findById(orderId);
      if (!order) {
        logger.warn("Order not found for cart restoration", { orderId });
        return;
      }

      const userId = order.user._id || order.user;

      // Find and restore the cart
      const cart = await Cart.findOne({
        user: userId,
        checkoutOrderId: orderId,
        status: "checkout",
      });

      if (cart) {
        // Restore cart to active status so user can modify or reorder
        cart.status = "active";
        cart.checkoutOrderId = undefined;
        await cart.save();

        logger.info("Cart restored successfully after payment failure", {
          cartId: cart._id,
          orderId: orderId,
          userId: userId,
          itemCount: cart.items.length,
        });
      } else {
        logger.warn("Cart not found for restoration after payment failure", {
          orderId: orderId,
          userId: userId,
        });
      }
    } catch (error) {
      logger.error("Error in restoreCartAfterPaymentFailure", {
        orderId: orderId,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Get all payments with filtering and pagination
   * @param {Object} options - Query options
   * @returns {Object} Paginated payments with metadata
   */
  async getAllPayments(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        method,
        startDate,
        endDate,
      } = options;

      logger.info("Fetching all payments", {
        page,
        limit,
        status,
        method,
        startDate,
        endDate,
      });

      // Build query filter
      let query = {};

      // Filter by payment status
      if (status) {
        query["payment.paymentStatus"] = status;
      }

      // Filter by payment method
      if (method) {
        query["payment.paymentMethod"] = method;
      }

      // Filter by date range
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Execute query with pagination
      const [orders, totalCount] = await Promise.all([
        Order.find(query)
          .populate([
            {
              path: "user",
              select: "name email phone",
            },
            {
              path: "hotel",
              select: "name",
            },
            {
              path: "branch",
              select: "name address",
            },
            {
              path: "staff",
              select: "name staffId role",
            },
          ])
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Order.countDocuments(query),
      ]);

      // Transform data for response
      const payments = orders.map((order) => ({
        orderId: order._id,
        transactionId: order.payment?.transactionId,
        razorpayOrderId: order.payment?.razorpayOrderId,
        razorpayPaymentId: order.payment?.razorpayPaymentId,
        amount: order.totalPrice,
        paymentStatus: order.payment?.paymentStatus || "pending",
        paymentMethod: order.payment?.paymentMethod || "cash",
        orderStatus: order.status,
        user: {
          id: order.user?._id,
          name: order.user?.name,
          email: order.user?.email,
          phone: order.user?.phone,
        },
        hotel: {
          id: order.hotel?._id,
          name: order.hotel?.name,
        },
        branch: {
          id: order.branch?._id,
          name: order.branch?.name,
          address: order.branch?.address,
        },
        staff: order.staff
          ? {
              id: order.staff._id,
              name: order.staff.name,
              staffId: order.staff.staffId,
              role: order.staff.role,
            }
          : null,
        createdAt: order.createdAt,
        paidAt: order.payment?.paidAt,
        coinsUsed: order.coinsUsed || 0,
        coinDiscount: order.coinDiscount || 0,
        rewardCoins: order.rewardCoins || 0,
      }));

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      // Calculate summary statistics
      const totalRevenue = orders.reduce((sum, order) => {
        return order.payment?.paymentStatus === "paid"
          ? sum + order.totalPrice
          : sum;
      }, 0);

      const paymentMethodStats = orders.reduce((stats, order) => {
        const method = order.payment?.paymentMethod || "cash";
        stats[method] = (stats[method] || 0) + 1;
        return stats;
      }, {});

      const paymentStatusStats = orders.reduce((stats, order) => {
        const status = order.payment?.paymentStatus || "pending";
        stats[status] = (stats[status] || 0) + 1;
        return stats;
      }, {});

      logger.info("Payments retrieved successfully", {
        totalCount,
        currentPage: page,
        totalPages,
        paymentCount: payments.length,
      });

      return {
        payments,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit),
        },
        summary: {
          totalRevenue,
          totalOrders: totalCount,
          averageOrderValue:
            totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0,
          paymentMethodStats,
          paymentStatusStats,
        },
        filters: {
          status,
          method,
          startDate,
          endDate,
        },
      };
    } catch (error) {
      logger.error("Failed to get all payments", {
        error: error.message,
        stack: error.stack,
        options,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Failed to retrieve payments");
    }
  }

  /**
   * Get payment analytics and reports
   * @param {Object} options - Analytics options
   * @returns {Object} Analytics data
   */
  async getPaymentAnalytics(options = {}) {
    try {
      const { startDate, endDate, branchId } = options;

      logger.info("Generating payment analytics", {
        startDate,
        endDate,
        branchId,
      });

      // Build base query
      let query = {};

      // Filter by date range
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // Filter by branch
      if (branchId) {
        query.branch = branchId;
      }

      // Get all orders for analytics
      const orders = await Order.find(query)
        .populate([
          {
            path: "branch",
            select: "name",
          },
          {
            path: "hotel",
            select: "name",
          },
        ])
        .lean();

      // Calculate overall statistics
      const totalOrders = orders.length;
      const paidOrders = orders.filter(
        (order) => order.payment?.paymentStatus === "paid"
      );
      const totalRevenue = paidOrders.reduce(
        (sum, order) => sum + order.totalPrice,
        0
      );
      const averageOrderValue =
        totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

      // Payment method breakdown
      const paymentMethodStats = orders.reduce((stats, order) => {
        const method = order.payment?.paymentMethod || "cash";
        if (!stats[method]) {
          stats[method] = { count: 0, revenue: 0 };
        }
        stats[method].count += 1;
        if (order.payment?.paymentStatus === "paid") {
          stats[method].revenue += order.totalPrice;
        }
        return stats;
      }, {});

      // Payment status breakdown
      const paymentStatusStats = orders.reduce((stats, order) => {
        const status = order.payment?.paymentStatus || "pending";
        if (!stats[status]) {
          stats[status] = { count: 0, revenue: 0 };
        }
        stats[status].count += 1;
        if (status === "paid") {
          stats[status].revenue += order.totalPrice;
        }
        return stats;
      }, {});

      // Daily revenue breakdown (last 30 days or date range)
      const dailyRevenue = {};
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const startAnalysisDate = startDate ? new Date(startDate) : thirtyDaysAgo;
      const endAnalysisDate = endDate ? new Date(endDate) : now;

      // Initialize all dates with 0
      for (
        let d = new Date(startAnalysisDate);
        d <= endAnalysisDate;
        d.setDate(d.getDate() + 1)
      ) {
        const dateKey = d.toISOString().split("T")[0];
        dailyRevenue[dateKey] = 0;
      }

      // Fill in actual revenue data
      paidOrders.forEach((order) => {
        const dateKey = order.createdAt.toISOString().split("T")[0];
        if (dailyRevenue.hasOwnProperty(dateKey)) {
          dailyRevenue[dateKey] += order.totalPrice;
        }
      });

      // Top branches by revenue
      const branchStats = orders.reduce((stats, order) => {
        if (!order.branch) return stats;

        const branchId = order.branch._id.toString();
        const branchName = order.branch.name || "Unknown Branch";

        if (!stats[branchId]) {
          stats[branchId] = {
            branchId,
            branchName,
            totalOrders: 0,
            totalRevenue: 0,
            paidOrders: 0,
          };
        }

        stats[branchId].totalOrders += 1;
        if (order.payment?.paymentStatus === "paid") {
          stats[branchId].totalRevenue += order.totalPrice;
          stats[branchId].paidOrders += 1;
        }

        return stats;
      }, {});

      const topBranches = Object.values(branchStats)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 10);

      // Refund statistics
      const refundOrders = orders.filter(
        (order) =>
          order.payment?.paymentStatus === "refunded" ||
          order.payment?.paymentStatus === "refund_pending"
      );

      const refundStats = {
        totalRefunds: refundOrders.length,
        totalRefundAmount: refundOrders.reduce(
          (sum, order) => sum + order.totalPrice,
          0
        ),
        refundRate:
          totalOrders > 0
            ? Math.round((refundOrders.length / totalOrders) * 100)
            : 0,
      };

      // Coins statistics
      const totalCoinsUsed = orders.reduce(
        (sum, order) => sum + (order.coinsUsed || 0),
        0
      );
      const totalCoinsRewarded = orders.reduce(
        (sum, order) => sum + (order.rewardCoins || 0),
        0
      );
      const totalCoinDiscount = orders.reduce(
        (sum, order) => sum + (order.coinDiscount || 0),
        0
      );

      const coinStats = {
        totalCoinsUsed,
        totalCoinsRewarded,
        totalCoinDiscount,
        netCoins: totalCoinsRewarded - totalCoinsUsed,
      };

      // Conversion metrics
      const conversionRate =
        totalOrders > 0
          ? Math.round((paidOrders.length / totalOrders) * 100)
          : 0;
      const failedPayments = orders.filter(
        (order) => order.payment?.paymentStatus === "failed"
      ).length;
      const failureRate =
        totalOrders > 0 ? Math.round((failedPayments / totalOrders) * 100) : 0;

      logger.info("Payment analytics generated successfully", {
        totalOrders,
        totalRevenue,
        conversionRate,
        analysisDateRange: {
          start: startAnalysisDate.toISOString(),
          end: endAnalysisDate.toISOString(),
        },
      });

      return {
        overview: {
          totalOrders,
          paidOrders: paidOrders.length,
          totalRevenue,
          averageOrderValue,
          conversionRate,
          failureRate,
        },
        paymentMethods: paymentMethodStats,
        paymentStatus: paymentStatusStats,
        dailyRevenue: Object.entries(dailyRevenue).map(([date, revenue]) => ({
          date,
          revenue,
        })),
        topBranches,
        refundStats,
        coinStats,
        dateRange: {
          start: startDate || startAnalysisDate.toISOString(),
          end: endDate || endAnalysisDate.toISOString(),
        },
      };
    } catch (error) {
      logger.error("Failed to generate payment analytics", {
        error: error.message,
        stack: error.stack,
        options,
      });
      if (error instanceof APIError) throw error;
      throw new APIError(500, "Failed to generate payment analytics");
    }
  }
}

export const paymentService = new PaymentService();
