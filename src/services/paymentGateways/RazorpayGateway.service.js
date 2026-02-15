/**
 * Razorpay Payment Gateway Implementation
 *
 * Handles payment operations using Razorpay API
 * Credentials required: keyId, keySecret, webhookSecret
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import { BasePaymentGateway } from "./BasePaymentGateway.service.js";

export class RazorpayGateway extends BasePaymentGateway {
  constructor(credentials) {
    super("razorpay", credentials);

    // Validate required credentials
    if (!credentials.keyId || !credentials.keySecret) {
      throw new Error("Razorpay requires keyId and keySecret");
    }

    // Initialize Razorpay instance
    this.razorpay = new Razorpay({
      key_id: credentials.keyId,
      key_secret: credentials.keySecret,
    });

    this.webhookSecret = credentials.webhookSecret;
  }

  /**
   * Create a Razorpay order
   * @param {Object} orderData - { amount, currency, receipt, notes }
   * @returns {Promise<Object>} Razorpay order response
   */
  async createOrder(orderData) {
    try {
      const { amount, currency = "INR", receipt, notes = {} } = orderData;

      // Razorpay amount is in paise (multiply by 100)
      const amountInPaise = Math.round(amount * 100);

      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency,
        receipt,
        notes,
      });

      return {
        success: true,
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount / 100, // Convert back to rupees
        currency: razorpayOrder.currency,
        receipt: razorpayOrder.receipt,
        status: razorpayOrder.status,
        createdAt: razorpayOrder.created_at,
        provider: "razorpay",
        rawResponse: razorpayOrder,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: error.error?.code,
        errorDescription: error.error?.description,
        provider: "razorpay",
      };
    }
  }

  /**
   * Verify Razorpay payment signature
   * @param {Object} paymentData - { orderId, paymentId, signature }
   * @returns {Object} Verification result
   */
  async verifyPayment(paymentData) {
    try {
      const { orderId, paymentId, signature } = paymentData;

      if (!orderId || !paymentId || !signature) {
        return {
          success: false,
          verified: false,
          error: "Missing required fields: orderId, paymentId, or signature",
          provider: "razorpay",
        };
      }

      // Generate expected signature
      const generatedSignature = crypto
        .createHmac("sha256", this.credentials.keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

      // Compare signatures
      const isValid = generatedSignature === signature;

      if (isValid) {
        // Fetch payment details from Razorpay
        const payment = await this.razorpay.payments.fetch(paymentId);

        return {
          success: true,
          verified: true,
          paymentId: payment.id,
          orderId: payment.order_id,
          amount: payment.amount / 100,
          currency: payment.currency,
          status: payment.status,
          method: payment.method,
          email: payment.email,
          contact: payment.contact,
          createdAt: payment.created_at,
          provider: "razorpay",
          rawResponse: payment,
        };
      } else {
        return {
          success: false,
          verified: false,
          error: "Invalid payment signature",
          provider: "razorpay",
        };
      }
    } catch (error) {
      return {
        success: false,
        verified: false,
        error: error.message,
        provider: "razorpay",
      };
    }
  }

  /**
   * Get payment status from Razorpay
   * @param {string} paymentId - Razorpay payment ID
   * @returns {Promise<Object>} Payment details
   */
  async getPaymentStatus(paymentId) {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        email: payment.email,
        contact: payment.contact,
        createdAt: payment.created_at,
        provider: "razorpay",
        rawResponse: payment,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: error.error?.code,
        provider: "razorpay",
      };
    }
  }

  /**
   * Refund a Razorpay payment
   * @param {string} paymentId - Razorpay payment ID
   * @param {number} amount - Amount to refund (optional, full refund if not provided)
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund response
   */
  async refund(paymentId, amount = null, reason = null) {
    try {
      const refundData = {};

      // If amount specified, convert to paise
      if (amount) {
        refundData.amount = Math.round(amount * 100);
      }

      // Add notes if reason provided
      if (reason) {
        refundData.notes = { reason };
      }

      const refund = await this.razorpay.payments.refund(paymentId, refundData);

      return {
        success: true,
        refundId: refund.id,
        paymentId: refund.payment_id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        createdAt: refund.created_at,
        provider: "razorpay",
        rawResponse: refund,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        errorCode: error.error?.code,
        errorDescription: error.error?.description,
        provider: "razorpay",
      };
    }
  }

  /**
   * Validate Razorpay webhook signature
   * @param {string} payload - Webhook payload (raw body string)
   * @param {string} signature - X-Razorpay-Signature header
   * @returns {boolean} True if signature is valid
   */
  validateWebhookSignature(payload, signature) {
    try {
      if (!this.webhookSecret) {
        throw new Error("Webhook secret not configured");
      }

      const expectedSignature = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(payload)
        .digest("hex");

      return expectedSignature === signature;
    } catch (error) {
      console.error("Razorpay webhook validation error:", error.message);
      return false;
    }
  }

  /**
   * Capture a payment (for authorized payments)
   * @param {string} paymentId - Razorpay payment ID
   * @param {number} amount - Amount to capture
   * @returns {Promise<Object>} Capture response
   */
  async capturePayment(paymentId, amount) {
    try {
      const amountInPaise = Math.round(amount * 100);

      const payment = await this.razorpay.payments.capture(
        paymentId,
        amountInPaise,
        "INR"
      );

      return {
        success: true,
        paymentId: payment.id,
        amount: payment.amount / 100,
        status: payment.status,
        captured: payment.captured,
        provider: "razorpay",
        rawResponse: payment,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: "razorpay",
      };
    }
  }
}
