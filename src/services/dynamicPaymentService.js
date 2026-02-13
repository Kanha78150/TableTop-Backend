/**
 * Dynamic Payment Service
 * Orchestrates multi-provider payment processing for the hotel management system
 * Supports Razorpay, PhonePe, and Paytm with per-hotel configurations
 */

import { PaymentGatewayFactory } from "./paymentGateways/PaymentGatewayFactory.js";
import { PaymentConfig } from "../models/PaymentConfig.model.js";
import { Hotel } from "../models/Hotel.model.js";
import { Order } from "../models/Order.model.js";
import * as commissionCalculator from "../utils/commissionCalculator.js";
import assignmentService from "./assignmentService.js";
import { paymentService } from "./paymentService.js";

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
        paymentInfo = {
          event: payload.event,
          paymentId: payload.payload?.payment?.entity?.id,
          orderId: payload.payload?.payment?.entity?.order_id,
          status: payload.payload?.payment?.entity?.status,
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

      // Find order by gateway order ID
      const order = await Order.findOne({
        "payment.gatewayOrderId": paymentInfo.orderId,
      });

      if (!order) {
        console.error("Order not found for webhook:", paymentInfo);
        return {
          success: false,
          message: "Order not found",
        };
      }

      // Update order based on webhook event
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
        order.status = "confirmed";
        order.payment.paymentStatus = "paid";
        order.payment.paidAt = new Date();

        // Only add to statusHistory if status is NOT already "confirmed"
        if (!order.statusHistory.some((h) => h.status === "confirmed")) {
          order.statusHistory.push({
            status: "confirmed",
            timestamp: new Date(),
            updatedBy: null,
          });
        }
      } else if (paymentInfo.status === "failed") {
        order.payment.paymentStatus = "failed";
      }

      await order.save();

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
}

// Export singleton instance
export default new DynamicPaymentService();
