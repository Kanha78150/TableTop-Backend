/**
 * Dynamic Payment Service
 * Orchestrates multi-provider payment processing for the hotel management system
 * Supports Razorpay, PhonePe, and Paytm with per-hotel configurations
 */

import { PaymentGatewayFactory } from "../paymentGateways/PaymentGatewayFactory.service.js";
import { PaymentConfig } from "../../models/PaymentConfig.model.js";
import { Hotel } from "../../models/Hotel.model.js";
import { Order } from "../../models/Order.model.js";
import { Transaction } from "../../models/Transaction.model.js";
import * as commissionCalculator from "../../utils/commissionCalculator.js";
import assignmentService from "../assignment/assignment.service.js";
import { paymentService } from "./payment.service.js";

class DynamicPaymentService {
  /**
   * Fetch and decrypt payment configuration for a hotel
   * @param {String} hotelId - MongoDB ObjectId of the hotel
   * @returns {Object} { provider, credentials, hotel }
   * @throws {Error} If config not found or invalid
   */
  async getPaymentConfig(hotelId) {
    try {
      // Fetch hotel
      const hotel = await Hotel.findById(hotelId);

      if (!hotel) {
        throw new Error(`Hotel not found: ${hotelId}`);
      }

      // Fetch payment config directly (more reliable than virtual populate)
      // IMPORTANT: Each credential subfield has select: false, must explicitly select all
      const paymentConfig = await PaymentConfig.findOne({
        hotel: hotelId,
      }).select(
        "+credentials.keyId +credentials.keySecret +credentials.webhookSecret " +
          "+credentials.merchantId +credentials.saltKey +credentials.saltIndex " +
          "+credentials.merchantKey +credentials.websiteName"
      );

      if (!paymentConfig) {
        throw new Error(
          `Payment configuration not found for hotel: ${hotel.name}`
        );
      }

      // Check if payment config is active
      if (!paymentConfig.isActive) {
        throw new Error(
          `Payment gateway is currently disabled for hotel: ${hotel.name}`
        );
      }

      // Get decrypted credentials
      const credentials = paymentConfig.getDecryptedCredentials();

      if (!credentials || !credentials.keyId || !credentials.keySecret) {
        throw new Error(
          `Failed to decrypt payment credentials for hotel: ${hotel.name}`
        );
      }

      return {
        provider: paymentConfig.provider,
        credentials,
        hotel,
        paymentConfig,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a payment order
   * @param {Object} orderData - Order details
   * @param {String} orderData.hotelId - Hotel ID
   * @param {String} orderData.orderId - Order ID from our system
   * @param {Number} orderData.amount - Order amount in rupees
   * @param {String} orderData.currency - Currency code (default: INR)
   * @param {Object} orderData.customerInfo - Customer details
   * @param {Object} orderData.metadata - Additional metadata
   * @returns {Object} Payment order response with gateway-specific details
   */
  async createOrder(orderData) {
    try {
      const {
        hotelId,
        orderId,
        amount,
        currency = "INR",
        customerInfo,
        metadata = {},
      } = orderData;

      // Validate required fields
      if (!hotelId || !orderId || !amount) {
        throw new Error(
          "Missing required fields: hotelId, orderId, and amount are required"
        );
      }

      if (amount <= 0) {
        throw new Error("Order amount must be greater than 0");
      }

      // Get payment config for the hotel
      const { provider, credentials, hotel } =
        await this.getPaymentConfig(hotelId);

      // Calculate commission for this order
      const commissionResult = commissionCalculator.calculateCommission(
        hotel,
        amount
      );

      // Create payment gateway instance
      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Prepare order data for gateway
      const gatewayOrderData = {
        orderId,
        amount,
        currency,
        customerInfo,
        metadata: {
          ...metadata,
          hotelId: hotel._id.toString(),
          hotelName: hotel.name,
          commissionAmount: commissionResult.amount,
          commissionRate: commissionResult.rate,
          commissionType: commissionResult.type,
        },
      };

      // Create order with the payment gateway
      const gatewayResponse = await gateway.createOrder(gatewayOrderData);

      // Find the order in our database and update with payment details
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Update order with payment information (preserve existing fields like paymentMethod)
      order.payment.provider = provider;
      order.payment.gatewayOrderId = gatewayResponse.orderId;
      order.payment.paymentStatus = "pending";
      order.payment.paymentMethod = provider; // Set paymentMethod to match the provider (e.g., "razorpay")
      order.payment.gatewayResponse = {
        orderId: gatewayResponse.orderId,
        amount,
        currency,
        createdAt: new Date(),
        metadata: gatewayResponse.metadata || {},
      };

      // Add commission information to payment object
      order.payment.commissionAmount = commissionResult.amount;
      order.payment.commissionRate = commissionResult.rate;
      order.payment.commissionStatus = commissionResult.applicable
        ? "pending"
        : "not_applicable";

      await order.save();

      return {
        success: true,
        provider,
        orderId: order._id,
        gatewayOrderId: gatewayResponse.orderId,
        amount,
        currency,
        commission: {
          amount: commissionResult.amount,
          rate: commissionResult.rate,
          type: commissionResult.type,
          applicable: commissionResult.applicable,
        },
        paymentDetails: gatewayResponse,
        message: "Payment order created successfully",
      };
    } catch (error) {
      console.error("Error creating payment order:", error.message);
      throw error;
    }
  }

  /**
   * Verify a payment after completion
   * @param {Object} paymentData - Payment verification data
   * @param {String} paymentData.orderId - Order ID from our system
   * @param {String} paymentData.paymentId - Payment ID from gateway
   * @param {String} paymentData.signature - Payment signature from gateway
   * @param {Object} paymentData.additionalData - Provider-specific data
   * @returns {Object} Verification result
   */
  async verifyPayment(paymentData) {
    try {
      const {
        orderId,
        paymentId,
        signature,
        additionalData = {},
      } = paymentData;

      // Validate required fields
      if (!orderId || !paymentId) {
        throw new Error(
          "Missing required fields: orderId and paymentId are required"
        );
      }

      // Fetch order from database
      const order = await Order.findById(orderId).populate("hotel");

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (!order.payment || !order.payment.provider) {
        throw new Error(`Payment information not found for order: ${orderId}`);
      }

      // Get payment config for verification
      const { provider, credentials } = await this.getPaymentConfig(
        order.hotel._id
      );

      // Verify provider matches
      if (provider !== order.payment.provider) {
        throw new Error(
          `Provider mismatch: expected ${order.payment.provider}, got ${provider}`
        );
      }

      // Create payment gateway instance
      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Prepare verification data based on provider
      let verificationData = {
        orderId: order.payment.gatewayOrderId,
        paymentId,
        signature,
      };

      // Add provider-specific fields
      if (provider === "razorpay") {
        // Razorpay verifyPayment expects orderId, paymentId, signature
        verificationData = {
          orderId: order.payment.gatewayOrderId,
          paymentId,
          signature,
        };
      } else if (provider === "phonepe") {
        // PhonePe uses callback response
        verificationData = {
          ...additionalData,
          transactionId: paymentId,
        };
      } else if (provider === "paytm") {
        // Paytm uses CHECKSUMHASH
        verificationData = {
          ...additionalData,
          orderId: order.payment.gatewayOrderId,
          txnId: paymentId,
        };
      }

      // Verify payment with gateway
      const verifyResult = await gateway.verifyPayment(verificationData);
      console.log("🔍 [verifyPayment] Gateway verification result:", {
        success: verifyResult.success,
        verified: verifyResult.verified,
        error: verifyResult.error || null,
      });

      if (!verifyResult || !verifyResult.verified) {
        // Update order status to failed
        order.payment.paymentStatus = "failed";
        order.payment.gatewayResponse = {
          error: verifyResult?.error || "Payment verification failed",
          verifiedAt: new Date(),
        };
        await order.save();

        // Create transaction record for failed verification
        try {
          await paymentService.createTransactionRecord(order);
          console.log(
            `📊 Transaction record (verification-failed) created for order: ${order._id}`
          );
        } catch (txError) {
          console.error(`❌ Transaction record error: ${txError.message}`);
        }

        // Restore cart so user can try again
        try {
          await paymentService.restoreCartAfterPaymentFailure(order._id);
        } catch (cartError) {
          console.error(`❌ Cart restore error: ${cartError.message}`);
        }

        return {
          success: false,
          verified: false,
          orderId: order._id,
          message: verifyResult?.error || "Payment verification failed",
        };
      }

      // Get payment status from gateway to ensure payment is successful
      const paymentStatus = await gateway.getPaymentStatus(
        paymentId,
        order.payment.gatewayOrderId
      );

      // Check if payment is successful (Razorpay: "captured" or "authorized", others: "success")
      const isPaymentSuccessful =
        paymentStatus.status === "captured" ||
        paymentStatus.status === "authorized" ||
        paymentStatus.status === "success";

      // Update order with payment success
      order.payment.paymentId = paymentId;
      order.payment.paymentStatus = isPaymentSuccessful ? "paid" : "failed";
      order.payment.paymentMethod = provider; // Ensure paymentMethod reflects actual provider used
      order.payment.paidAt = isPaymentSuccessful ? new Date() : null;
      order.payment.gatewayResponse = paymentStatus;

      // Update commission status if payment is successful
      if (isPaymentSuccessful && order.payment.commissionStatus === "pending") {
        order.payment.commissionStatus = "due";
      }

      // Order stays "pending" — staff will confirm it manually
      // Payment status (paid/failed) is tracked separately in order.payment.paymentStatus

      await order.save();

      // === POST-PAYMENT SUCCESS ACTIONS ===
      if (isPaymentSuccessful) {
        // Re-fetch the saved order with populated fields for post-payment processing
        const savedOrder = await Order.findById(order._id)
          .populate("user", "name email phone coins")
          .populate("hotel", "name email contactNumber gstin hotelId")
          .populate(
            "branch",
            "name branchId location email contactNumber address"
          );

        // 1. Trigger staff assignment
        if (!savedOrder.staff) {
          try {
            console.log(
              `\n🎯 ========== TRIGGERING STAFF ASSIGNMENT AFTER PAYMENT ==========`
            );
            console.log(`📦 Order: ${savedOrder._id}`);
            console.log(
              `🎯 =================================================================\n`
            );

            const assignmentResult =
              await assignmentService.assignOrder(savedOrder);

            if (assignmentResult.success && assignmentResult.waiter) {
              console.log(
                `✅ Staff assigned: ${assignmentResult.waiter.name} (${assignmentResult.waiter.id})`
              );
            } else {
              console.log(
                `⚠️ Staff assignment queued: ${assignmentResult.message || "No available staff"}`
              );
            }
          } catch (assignmentError) {
            console.error(
              `❌ Staff assignment error: ${assignmentError.message}`
            );
            // Don't fail payment verification if assignment fails
          }
        }

        // 2. Clear cart and process coins
        try {
          await paymentService.clearCartAfterPayment(savedOrder);
          console.log(`🛒 Cart cleared for order: ${savedOrder._id}`);
        } catch (cartError) {
          console.error(`❌ Cart clearing error: ${cartError.message}`);
        }

        // 3. Create transaction record for accounting
        try {
          await paymentService.createTransactionRecord(savedOrder);
          console.log(
            `📊 Transaction record created for order: ${savedOrder._id}`
          );
        } catch (txError) {
          console.error(`❌ Transaction record error: ${txError.message}`);
        }
      } else {
        // Payment was not successful — create failed transaction record
        try {
          await paymentService.createTransactionRecord(order);
          console.log(
            `📊 Transaction record (payment-failed) created for order: ${order._id}`
          );
        } catch (txError) {
          console.error(`❌ Transaction record error: ${txError.message}`);
        }

        // Restore cart so user can try again
        try {
          await paymentService.restoreCartAfterPaymentFailure(order._id);
        } catch (cartError) {
          console.error(`❌ Cart restore error: ${cartError.message}`);
        }
      }

      return {
        success: true,
        verified: true,
        orderId: order._id,
        paymentId,
        paymentStatus: order.payment.paymentStatus,
        orderStatus: order.status,
        amount: order.totalPrice,
        commission: {
          amount: order.payment.commissionAmount,
          status: order.payment.commissionStatus,
        },
        message: "Payment verified successfully",
      };
    } catch (error) {
      console.error("Error verifying payment:", error.message);
      throw error;
    }
  }

  /**
   * Get payment status from gateway
   * @param {String} orderId - Order ID from our system
   * @returns {Object} Payment status details
   */
  async getPaymentStatus(orderId) {
    try {
      // Fetch order from database
      const order = await Order.findById(orderId).populate("hotel");

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (!order.payment || !order.payment.gatewayOrderId) {
        throw new Error(`Payment not initiated for order: ${orderId}`);
      }

      // Get payment config
      const { provider, credentials } = await this.getPaymentConfig(
        order.hotel._id
      );

      // Create payment gateway instance
      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Get payment status from gateway
      const paymentStatus = await gateway.getPaymentStatus(
        order.payment.paymentId,
        order.payment.gatewayOrderId
      );

      // Update order payment status if changed
      const mappedStatus =
        paymentStatus.status === "captured" ||
        paymentStatus.status === "authorized"
          ? "paid"
          : paymentStatus.status === "failed"
            ? "failed"
            : order.payment.paymentStatus;

      if (mappedStatus !== order.payment.paymentStatus) {
        order.payment.paymentStatus = mappedStatus;
        order.payment.gatewayResponse = paymentStatus;
        if (mappedStatus === "paid" && !order.payment.paidAt) {
          order.payment.paidAt = new Date();
        }
        await order.save();
      }

      return {
        success: true,
        orderId: order._id,
        gatewayOrderId: order.payment.gatewayOrderId,
        paymentId: order.payment.paymentId,
        status: paymentStatus.status,
        paymentStatus: order.payment.paymentStatus,
        amount: order.totalPrice,
        currency: "INR",
        provider,
        details: paymentStatus,
      };
    } catch (error) {
      console.error("Error getting payment status:", error.message);
      throw error;
    }
  }

  /**
   * Process a refund for an order
   * @param {String} orderId - Order ID from our system
   * @param {Number} amount - Refund amount (optional, defaults to full amount)
   * @param {String} reason - Refund reason
   * @returns {Object} Refund result
   */
  async processRefund(orderId, amount = null, reason = "") {
    try {
      // Fetch order from database
      const order = await Order.findById(orderId).populate("hotel");

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (!order.payment || !order.payment.paymentId) {
        throw new Error(`Payment not found for order: ${orderId}`);
      }

      if (order.payment.paymentStatus !== "paid") {
        throw new Error(
          `Cannot refund order with payment status: ${order.payment.paymentStatus}`
        );
      }

      // Default to full refund
      const refundAmount = amount || order.totalPrice;

      // Validate refund amount
      if (refundAmount <= 0 || refundAmount > order.totalPrice) {
        throw new Error(
          `Invalid refund amount: ${refundAmount}. Order amount: ${order.totalPrice}`
        );
      }

      // Get payment config
      const { provider, credentials } = await this.getPaymentConfig(
        order.hotel._id
      );

      // Create payment gateway instance
      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Process refund with gateway
      const refundData = {
        paymentId: order.payment.paymentId,
        amount: refundAmount,
        currency: "INR",
        reason,
        orderId: order.payment.gatewayOrderId,
      };

      const refundResponse = await gateway.refund(refundData);

      // Update order with refund information
      if (!order.refunds) {
        order.refunds = [];
      }

      order.refunds.push({
        refundId: refundResponse.refundId,
        amount: refundAmount,
        status: refundResponse.status || "processed",
        reason,
        processedAt: new Date(),
        gatewayResponse: refundResponse,
      });

      // Calculate total refunded amount
      const totalRefunded = order.refunds.reduce(
        (sum, refund) => sum + refund.amount,
        0
      );

      // Update payment status
      if (totalRefunded >= order.totalPrice) {
        order.payment.paymentStatus = "refunded";
      } else {
        order.payment.paymentStatus = "refund_pending";
      }

      // Adjust commission if refunded
      if (
        order.payment.commissionStatus === "due" ||
        order.payment.commissionStatus === "collected"
      ) {
        const refundRatio = refundAmount / order.totalPrice;
        const commissionAdjustment =
          order.payment.commissionAmount * refundRatio;

        order.payment.commissionAmount -= commissionAdjustment;

        if (totalRefunded >= order.totalPrice) {
          order.payment.commissionStatus = "waived";
        }
      }

      await order.save();

      return {
        success: true,
        orderId: order._id,
        refundId: refundResponse.refundId,
        amount: refundAmount,
        status: refundResponse.status || "processed",
        totalRefunded,
        remainingAmount: order.totalPrice - totalRefunded,
        commission: {
          amount: order.payment.commissionAmount,
          status: order.payment.commissionStatus,
        },
        message: "Refund processed successfully",
      };
    } catch (error) {
      console.error("Error processing refund:", error.message);
      throw error;
    }
  }

  /**
   * Handle webhook from payment gateway
   * @param {String} provider - Payment provider (razorpay, phonepe, paytm)
   * @param {Object} payload - Webhook payload
   * @param {String} signature - Webhook signature
   * @param {String} hotelId - Hotel ID (for multi-tenant webhooks)
   * @returns {Object} Webhook processing result
   */
  async handleWebhook(provider, payload, signature, hotelId) {
    try {
      // Validate provider
      if (!PaymentGatewayFactory.isProviderSupported(provider)) {
        throw new Error(`Unsupported payment provider: ${provider}`);
      }

      // Get payment config
      const { credentials } = await this.getPaymentConfig(hotelId);

      // Create payment gateway instance
      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Validate webhook signature
      const isValid = await gateway.validateWebhookSignature(
        payload,
        signature
      );

      if (!isValid) {
        console.error("Invalid webhook signature:", { provider, hotelId });
        return {
          success: false,
          message: "Invalid webhook signature",
        };
      }

      // Extract payment information from payload based on provider
      let paymentInfo;

      if (provider === "razorpay") {
        const razorpayStatus = payload.payload?.payment?.entity?.status;
        // Map Razorpay status to our internal status: "captured" → "completed", "failed"/"refunded" → same
        const mappedStatus =
          razorpayStatus === "captured"
            ? "completed"
            : razorpayStatus === "failed"
              ? "failed"
              : razorpayStatus === "refunded"
                ? "refunded"
                : razorpayStatus;
        paymentInfo = {
          event: payload.event,
          paymentId: payload.payload?.payment?.entity?.id,
          orderId: payload.payload?.payment?.entity?.order_id,
          status: mappedStatus,
          amount: payload.payload?.payment?.entity?.amount / 100, // Convert from paise
        };
      } else if (provider === "phonepe") {
        paymentInfo = {
          event: "payment.success",
          paymentId: payload.transactionId,
          orderId: payload.merchantOrderId,
          status: payload.code === "PAYMENT_SUCCESS" ? "completed" : "failed",
          amount: payload.amount / 100, // Convert from paise
        };
      } else if (provider === "paytm") {
        paymentInfo = {
          event: "payment.success",
          paymentId: payload.TXNID,
          orderId: payload.ORDERID,
          status: payload.STATUS === "TXN_SUCCESS" ? "completed" : "failed",
          amount: parseFloat(payload.TXNAMOUNT),
        };
      }

      // Find order by gateway order ID (primary payment)
      let order = await Order.findOne({
        "payment.gatewayOrderId": paymentInfo.orderId,
      });

      // Check if this is a supplementary payment webhook
      let isSupplementaryWebhook = false;
      if (!order) {
        order = await Order.findOne({
          "supplementaryPayments.gatewayOrderId": paymentInfo.orderId,
        });
        if (order) {
          isSupplementaryWebhook = true;
        }
      }

      if (!order) {
        console.error("Order not found for webhook:", paymentInfo);
        return {
          success: false,
          message: "Order not found",
        };
      }

      // Handle supplementary payment webhook
      if (isSupplementaryWebhook) {
        const suppPayment = order.supplementaryPayments.find(
          (sp) => sp.gatewayOrderId === paymentInfo.orderId
        );
        if (!suppPayment) {
          return {
            success: false,
            message: "Supplementary payment entry not found",
          };
        }

        if (paymentInfo.status === "completed") {
          suppPayment.paymentStatus = "paid";
          suppPayment.paymentId = paymentInfo.paymentId;
          suppPayment.paidAt = new Date();
          suppPayment.gatewayResponse = payload;
          order.pendingAddOnPayment = false;

          await order.save();

          // Update existing transaction amount to reflect new total
          try {
            const existingTx = await Transaction.findOne({ order: order._id });
            if (existingTx) {
              existingTx.amount = order.totalPrice;
              await existingTx.save();
            }
          } catch (txError) {
            console.error(
              `[Webhook] Supplementary transaction update error: ${txError.message}`
            );
          }

          // Emit socket notification to staff
          try {
            const { getIO } = await import("../../utils/socketService.js");
            const io = getIO();
            const batchItems = order.items.filter(
              (i) => i.batch === suppPayment.batch
            );
            const notificationData = {
              orderId: order._id,
              orderNumber: order.orderNumber,
              newItems: batchItems.map((i) => ({
                foodItemName: i.foodItemName,
                quantity: i.quantity,
                price: i.price,
                totalPrice: i.totalPrice,
              })),
              batch: suppPayment.batch,
              updatedTotal: order.totalPrice,
              paymentMethod:
                order.payment?.paymentMethod || order.payment?.provider,
              paymentVerified: true,
              message: "Customer paid for add-on items — ready to prepare",
            };
            if (order.staff) {
              io.to(`staff_${order.staff}`).emit(
                "order:items-added",
                notificationData
              );
            }
            if (order.branch) {
              io.to(`branch_${order.branch}`).emit(
                "order:items-added",
                notificationData
              );
            }
          } catch (socketError) {
            console.error(
              "[Webhook] Socket notification error:",
              socketError.message
            );
          }
        } else if (paymentInfo.status === "failed") {
          suppPayment.paymentStatus = "failed";
          suppPayment.gatewayResponse = payload;
          await order.save();
        }

        return {
          success: true,
          orderId: order._id,
          event: paymentInfo.event,
          status: paymentInfo.status,
          type: "supplementary",
          batch: suppPayment.batch,
          message: "Supplementary webhook processed successfully",
        };
      }

      // Update order based on webhook event (primary payment)
      order.payment.paymentId = paymentInfo.paymentId;
      order.payment.gatewayResponse = payload;

      // Update commission status if payment successful
      if (
        paymentInfo.status === "completed" &&
        order.payment.commissionStatus === "pending"
      ) {
        order.payment.commissionStatus = "due";
      }

      // Update overall order status
      if (paymentInfo.status === "completed") {
        // Order stays "pending" — staff will confirm it manually
        order.payment.paymentStatus = "paid";
        order.payment.paidAt = new Date();
      } else if (paymentInfo.status === "failed") {
        order.payment.paymentStatus = "failed";

        // Commission not applicable — payment failed
        if (order.payment.commissionStatus !== "not_applicable") {
          order.payment.commissionStatus = "not_applicable";
          order.payment.commissionAmount = 0;
        }
      }

      await order.save();

      // Create transaction record for accounting (for all payment outcomes)
      if (
        paymentInfo.status === "completed" ||
        paymentInfo.status === "failed"
      ) {
        try {
          const paymentService = (await import("./payment.service.js")).default;
          await paymentService.createTransactionRecord(order);
          console.log(
            `[Webhook] Transaction record (${paymentInfo.status}) created for order: ${order._id}`
          );
        } catch (txError) {
          console.error(
            `[Webhook] Transaction record error: ${txError.message}`
          );
        }
      }

      return {
        success: true,
        orderId: order._id,
        event: paymentInfo.event,
        status: paymentInfo.status,
        message: "Webhook processed successfully",
      };
    } catch (error) {
      console.error("Error handling webhook:", error.message);
      throw error;
    }
  }

  /**
   * Get available payment providers for a hotel
   * @param {String} hotelId - Hotel ID
   * @returns {Object} Provider information
   */
  async getAvailableProvider(hotelId) {
    try {
      const hotel = await Hotel.findById(hotelId).populate("paymentConfig");

      if (!hotel) {
        throw new Error(`Hotel not found: ${hotelId}`);
      }

      if (!hotel.paymentConfig) {
        return {
          hasProvider: false,
          provider: null,
          isActive: false,
          message: "No payment gateway configured",
        };
      }

      return {
        hasProvider: true,
        provider: hotel.paymentConfig.provider,
        isActive: hotel.paymentConfig.isActive,
        isProduction: hotel.paymentConfig.isProduction,
        configuredAt: hotel.paymentConfig.createdAt,
        lastUpdated: hotel.paymentConfig.updatedAt,
      };
    } catch (error) {
      console.error("Error getting available provider:", error.message);
      throw error;
    }
  }

  /**
   * Get all supported payment providers
   * @returns {Array} List of supported providers
   */
  getSupportedProviders() {
    return PaymentGatewayFactory.getSupportedProviders();
  }

  /**
   * Validate if a provider is supported
   * @param {String} provider - Provider name
   * @returns {Boolean} Is provider supported
   */
  isProviderSupported(provider) {
    return PaymentGatewayFactory.isProviderSupported(provider);
  }

  /**
   * Initiate a supplementary payment for add-on items
   * Creates a new gateway order for the delta amount only.
   * @param {Object} data - { orderId, batch, customerInfo }
   * @returns {Object} Payment initiation response
   */
  async initiateSupplementaryPayment(data) {
    try {
      const { orderId, batch, customerInfo = {} } = data;

      if (!orderId || !batch) {
        throw new Error("Missing required fields: orderId and batch");
      }

      const order = await Order.findById(orderId).populate("hotel");
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      // Find the pending supplementary payment for this batch
      const suppPayment = order.supplementaryPayments.find(
        (sp) => sp.batch === batch && sp.paymentStatus === "pending"
      );
      if (!suppPayment) {
        throw new Error(
          `No pending supplementary payment found for batch ${batch}`
        );
      }

      const amount = suppPayment.amount;
      if (amount <= 0) {
        throw new Error("Supplementary payment amount must be greater than 0");
      }

      // Get payment config for the hotel
      const { provider, credentials, hotel } = await this.getPaymentConfig(
        order.hotel._id
      );

      // Create gateway instance
      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Create gateway order for delta amount only
      const gatewayOrderData = {
        orderId: `${orderId}_batch${batch}`,
        amount,
        currency: "INR",
        customerInfo,
        metadata: {
          hotelId: hotel._id.toString(),
          hotelName: hotel.name,
          originalOrderId: orderId,
          batch,
          type: "supplementary",
          commissionAmount: 0,
          commissionRate: 0,
        },
      };

      const gatewayResponse = await gateway.createOrder(gatewayOrderData);

      // Update supplementary payment entry with gateway details
      suppPayment.provider = provider;
      suppPayment.gatewayOrderId = gatewayResponse.orderId;
      suppPayment.gatewayResponse = {
        orderId: gatewayResponse.orderId,
        amount,
        currency: "INR",
        createdAt: new Date(),
        metadata: gatewayResponse.metadata || {},
      };

      await order.save();

      return {
        success: true,
        provider,
        orderId: order._id,
        batch,
        gatewayOrderId: gatewayResponse.orderId,
        amount,
        currency: "INR",
        type: "supplementary",
        paymentDetails: gatewayResponse,
        message: "Supplementary payment order created successfully",
      };
    } catch (error) {
      console.error(
        "Error creating supplementary payment order:",
        error.message
      );
      throw error;
    }
  }

  /**
   * Verify a supplementary payment after completion
   * @param {Object} paymentData - { orderId, paymentId, signature, additionalData }
   * @returns {Object} Verification result
   */
  async verifySupplementaryPayment(paymentData) {
    try {
      const {
        orderId,
        paymentId,
        signature,
        gatewayOrderId,
        additionalData = {},
      } = paymentData;

      if (!paymentId) {
        throw new Error("Missing required field: paymentId");
      }

      // Find order by looking at supplementaryPayments.gatewayOrderId
      let order;
      if (orderId) {
        order = await Order.findById(orderId).populate("hotel");
      }
      if (!order && gatewayOrderId) {
        order = await Order.findOne({
          "supplementaryPayments.gatewayOrderId": gatewayOrderId,
        }).populate("hotel");
      }
      if (!order) {
        throw new Error("Order not found for supplementary payment");
      }

      // Find the matching supplementary payment entry
      const suppPayment = order.supplementaryPayments.find(
        (sp) =>
          sp.gatewayOrderId === gatewayOrderId ||
          (sp.paymentStatus === "pending" && sp.provider)
      );
      if (!suppPayment) {
        throw new Error("Supplementary payment entry not found");
      }

      // Get payment config for verification
      const { provider, credentials } = await this.getPaymentConfig(
        order.hotel._id
      );

      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Prepare verification data based on provider
      let verificationData = {
        orderId: suppPayment.gatewayOrderId,
        paymentId,
        signature,
      };

      if (provider === "phonepe") {
        verificationData = { ...additionalData, transactionId: paymentId };
      } else if (provider === "paytm") {
        verificationData = {
          ...additionalData,
          orderId: suppPayment.gatewayOrderId,
          txnId: paymentId,
        };
      }

      // Verify payment with gateway
      const verifyResult = await gateway.verifyPayment(verificationData);

      if (!verifyResult || !verifyResult.verified) {
        suppPayment.paymentStatus = "failed";
        await order.save();
        return {
          success: false,
          verified: false,
          orderId: order._id,
          batch: suppPayment.batch,
          message:
            verifyResult?.error || "Supplementary payment verification failed",
        };
      }

      // Get payment status
      const paymentStatus = await gateway.getPaymentStatus(
        paymentId,
        suppPayment.gatewayOrderId
      );

      const isPaymentSuccessful =
        paymentStatus.status === "captured" ||
        paymentStatus.status === "authorized" ||
        paymentStatus.status === "success";

      if (isPaymentSuccessful) {
        suppPayment.paymentStatus = "paid";
        suppPayment.paymentId = paymentId;
        suppPayment.paidAt = new Date();
        suppPayment.gatewayResponse = paymentStatus;
        order.pendingAddOnPayment = false;

        await order.save();

        // Update existing transaction amount to reflect new order total
        try {
          const existingTx = await Transaction.findOne({ order: order._id });
          if (existingTx) {
            existingTx.amount = order.totalPrice;
            await existingTx.save();
            console.log(
              `Transaction updated for supplementary batch ${suppPayment.batch}, new total: ${order.totalPrice}`
            );
          }
        } catch (txError) {
          console.error(
            `Supplementary transaction update error: ${txError.message}`
          );
        }

        // Emit socket notification to staff — kitchen can now prepare add-on items
        try {
          const { getIO } = await import("../../utils/socketService.js");
          const io = getIO();

          // Get new batch items for notification
          const batchItems = order.items.filter(
            (i) => i.batch === suppPayment.batch
          );
          const notificationData = {
            orderId: order._id,
            orderNumber: order.orderNumber,
            newItems: batchItems.map((i) => ({
              foodItemName: i.foodItemName,
              quantity: i.quantity,
              price: i.price,
              totalPrice: i.totalPrice,
            })),
            batch: suppPayment.batch,
            updatedTotal: order.totalPrice,
            paymentMethod:
              order.payment?.paymentMethod || order.payment?.provider,
            paymentVerified: true,
            message: "Customer paid for add-on items — ready to prepare",
          };

          if (order.staff) {
            io.to(`staff_${order.staff}`).emit(
              "order:items-added",
              notificationData
            );
          }
          if (order.branch) {
            io.to(`branch_${order.branch}`).emit(
              "order:items-added",
              notificationData
            );
          }
        } catch (socketError) {
          console.error("Socket notification error:", socketError.message);
        }
      } else {
        suppPayment.paymentStatus = "failed";
        suppPayment.gatewayResponse = paymentStatus;
        await order.save();
      }

      return {
        success: isPaymentSuccessful,
        verified: true,
        orderId: order._id,
        batch: suppPayment.batch,
        paymentId,
        paymentStatus: suppPayment.paymentStatus,
        amount: suppPayment.amount,
        message: isPaymentSuccessful
          ? "Supplementary payment verified successfully"
          : "Supplementary payment failed",
      };
    } catch (error) {
      console.error("Error verifying supplementary payment:", error.message);
      throw error;
    }
  }

  /**
   * Refund a supplementary payment for a cancelled add-on batch
   * @param {string} orderId - Order ID
   * @param {number} batch - Batch number whose payment should be refunded
   * @returns {Object} Refund result
   */
  async refundSupplementaryPayment(orderId, batch) {
    try {
      const order = await Order.findById(orderId).populate("hotel");
      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      const suppPayment = order.supplementaryPayments.find(
        (sp) => sp.batch === batch
      );
      if (!suppPayment) {
        throw new Error(`No supplementary payment found for batch ${batch}`);
      }

      if (suppPayment.paymentStatus !== "refund_pending") {
        throw new Error(
          `Supplementary payment for batch ${batch} is not eligible for refund (status: ${suppPayment.paymentStatus})`
        );
      }

      if (!suppPayment.paymentId) {
        throw new Error(
          `No payment ID found for supplementary payment batch ${batch}`
        );
      }

      // Get payment config for the hotel
      const { provider, credentials } = await this.getPaymentConfig(
        order.hotel._id
      );

      const gateway = PaymentGatewayFactory.createGateway(
        provider,
        credentials
      );

      // Process refund with gateway
      const refundData = {
        paymentId: suppPayment.paymentId,
        amount: suppPayment.amount,
        currency: "INR",
        reason: `Add-on batch ${batch} cancelled by user`,
        orderId: suppPayment.gatewayOrderId,
      };

      const refundResponse = await gateway.refund(refundData);

      // Update supplementary payment status
      suppPayment.paymentStatus = "refunded";
      suppPayment.refundId = refundResponse.refundId;
      suppPayment.refundedAt = new Date();
      suppPayment.refundResponse = refundResponse;

      await order.save();

      console.log(
        `Supplementary payment refund processed for order ${orderId} batch ${batch}, amount: ${suppPayment.amount}`
      );

      return {
        success: true,
        orderId: order._id,
        batch,
        refundAmount: suppPayment.amount,
        refundId: refundResponse.refundId,
        message: `Supplementary payment for batch ${batch} refunded successfully`,
      };
    } catch (error) {
      console.error(
        `Error refunding supplementary payment for batch ${batch}:`,
        error.message
      );
      throw error;
    }
  }
}

// Export singleton instance
export default new DynamicPaymentService();
