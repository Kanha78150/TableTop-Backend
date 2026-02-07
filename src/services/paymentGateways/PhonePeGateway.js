/**
 * PhonePe Payment Gateway Implementation
 *
 * Handles payment operations using PhonePe API
 * Credentials required: merchantId, saltKey, saltIndex
 * Signature: SHA256(base64(payload) + "/pg/v1/pay" + saltKey) + ### + saltIndex
 */

import crypto from "crypto";
import axios from "axios";
import { BasePaymentGateway } from "./BasePaymentGateway.js";

export class PhonePeGateway extends BasePaymentGateway {
  constructor(credentials) {
    super("phonepe", credentials);

    // Validate required credentials
    if (
      !credentials.merchantId ||
      !credentials.saltKey ||
      !credentials.saltIndex
    ) {
      throw new Error("PhonePe requires merchantId, saltKey, and saltIndex");
    }

    this.merchantId = credentials.merchantId;
    this.saltKey = credentials.saltKey;
    this.saltIndex = credentials.saltIndex;

    // API endpoints based on environment
    this.baseUrl = credentials.isProduction
      ? "https://api.phonepe.com/apis/hermes"
      : "https://api-preprod.phonepe.com/apis/pg-sandbox";
  }

  /**
   * Generate X-VERIFY header for PhonePe API
   * @param {string} base64Payload - Base64 encoded payload
   * @param {string} endpoint - API endpoint path
   * @returns {string} X-VERIFY header value
   */
  generateSignature(base64Payload, endpoint) {
    const stringToHash = base64Payload + endpoint + this.saltKey;
    const sha256Hash = crypto
      .createHash("sha256")
      .update(stringToHash)
      .digest("hex");
    return `${sha256Hash}###${this.saltIndex}`;
  }

  /**
   * Create a PhonePe payment request
   * @param {Object} orderData - { amount, orderId, userId, callbackUrl, redirectUrl }
   * @returns {Promise<Object>} PhonePe payment response
   */
  async createOrder(orderData) {
    try {
      const {
        amount,
        orderId,
        userId,
        callbackUrl,
        redirectUrl,
        mobileNumber,
      } = orderData;

      // PhonePe amount is in paise (multiply by 100)
      const amountInPaise = Math.round(amount * 100);

      // Create payload
      const payload = {
        merchantId: this.merchantId,
        merchantTransactionId: orderId,
        merchantUserId: userId || `USER_${Date.now()}`,
        amount: amountInPaise,
        redirectUrl: redirectUrl,
        redirectMode: "POST",
        callbackUrl: callbackUrl,
        mobileNumber: mobileNumber || undefined,
        paymentInstrument: {
          type: "PAY_PAGE",
        },
      };

      // Convert to base64
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
        "base64"
      );

      // Generate signature
      const endpoint = "/pg/v1/pay";
      const xVerify = this.generateSignature(base64Payload, endpoint);

      // Make API request
      const response = await axios.post(
        `${this.baseUrl}${endpoint}`,
        {
          request: base64Payload,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-VERIFY": xVerify,
          },
        }
      );

      if (response.data.success) {
        return {
          success: true,
          orderId: orderId,
          merchantTransactionId: response.data.data.merchantTransactionId,
          paymentUrl: response.data.data.instrumentResponse.redirectInfo.url,
          amount: amount,
          provider: "phonepe",
          rawResponse: response.data,
        };
      } else {
        return {
          success: false,
          error: response.data.message || "Payment creation failed",
          code: response.data.code,
          provider: "phonepe",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        provider: "phonepe",
      };
    }
  }

  /**
   * Verify PhonePe payment status
   * @param {Object} paymentData - { merchantTransactionId }
   * @returns {Promise<Object>} Payment verification result
   */
  async verifyPayment(paymentData) {
    try {
      const { merchantTransactionId } = paymentData;

      if (!merchantTransactionId) {
        return {
          success: false,
          verified: false,
          error: "merchantTransactionId is required",
          provider: "phonepe",
        };
      }

      // Check payment status
      const statusResponse = await this.getPaymentStatus(merchantTransactionId);

      if (
        statusResponse.success &&
        statusResponse.status === "PAYMENT_SUCCESS"
      ) {
        return {
          success: true,
          verified: true,
          transactionId: statusResponse.transactionId,
          merchantTransactionId: statusResponse.merchantTransactionId,
          amount: statusResponse.amount,
          status: statusResponse.status,
          paymentMethod: statusResponse.paymentMethod,
          provider: "phonepe",
          rawResponse: statusResponse.rawResponse,
        };
      } else {
        return {
          success: false,
          verified: false,
          status: statusResponse.status,
          error: statusResponse.error || "Payment verification failed",
          provider: "phonepe",
        };
      }
    } catch (error) {
      return {
        success: false,
        verified: false,
        error: error.message,
        provider: "phonepe",
      };
    }
  }

  /**
   * Get payment status from PhonePe
   * @param {string} merchantTransactionId - Merchant transaction ID
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(merchantTransactionId) {
    try {
      const endpoint = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;

      // Generate signature for status check
      const stringToHash = endpoint + this.saltKey;
      const sha256Hash = crypto
        .createHash("sha256")
        .update(stringToHash)
        .digest("hex");
      const xVerify = `${sha256Hash}###${this.saltIndex}`;

      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-MERCHANT-ID": this.merchantId,
        },
      });

      if (response.data.success) {
        const paymentData = response.data.data;

        return {
          success: true,
          transactionId: paymentData.transactionId,
          merchantTransactionId: paymentData.merchantTransactionId,
          amount: paymentData.amount / 100, // Convert from paise
          status: paymentData.state,
          paymentMethod: paymentData.paymentInstrument?.type,
          responseCode: paymentData.responseCode,
          provider: "phonepe",
          rawResponse: response.data,
        };
      } else {
        return {
          success: false,
          error: response.data.message || "Status check failed",
          code: response.data.code,
          provider: "phonepe",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        provider: "phonepe",
      };
    }
  }

  /**
   * Refund a PhonePe payment
   * @param {string} merchantTransactionId - Original transaction ID
   * @param {number} amount - Amount to refund
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund response
   */
  async refund(merchantTransactionId, amount, reason = null) {
    try {
      const amountInPaise = Math.round(amount * 100);
      const refundTransactionId = `REFUND_${merchantTransactionId}_${Date.now()}`;

      const payload = {
        merchantId: this.merchantId,
        merchantUserId: `USER_${Date.now()}`,
        originalTransactionId: merchantTransactionId,
        merchantTransactionId: refundTransactionId,
        amount: amountInPaise,
        callbackUrl:
          process.env.BACKEND_URL + "/api/v1/webhooks/phonepe/refund",
      };

      const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
        "base64"
      );
      const endpoint = "/pg/v1/refund";
      const xVerify = this.generateSignature(base64Payload, endpoint);

      const response = await axios.post(
        `${this.baseUrl}${endpoint}`,
        {
          request: base64Payload,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-VERIFY": xVerify,
          },
        }
      );

      if (response.data.success) {
        return {
          success: true,
          refundId: refundTransactionId,
          originalTransactionId: merchantTransactionId,
          amount: amount,
          status: response.data.data.state,
          provider: "phonepe",
          rawResponse: response.data,
        };
      } else {
        return {
          success: false,
          error: response.data.message || "Refund failed",
          code: response.data.code,
          provider: "phonepe",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        provider: "phonepe",
      };
    }
  }

  /**
   * Validate PhonePe webhook signature
   * @param {string} payload - Webhook payload (base64 string from request body)
   * @param {string} signature - X-VERIFY header
   * @returns {boolean} True if signature is valid
   */
  validateWebhookSignature(payload, signature) {
    try {
      const [receivedHash, receivedSaltIndex] = signature.split("###");

      // Verify salt index matches
      if (receivedSaltIndex !== this.saltIndex.toString()) {
        console.error("PhonePe webhook: Salt index mismatch");
        return false;
      }

      // Generate expected signature
      const stringToHash = payload + this.saltKey;
      const expectedHash = crypto
        .createHash("sha256")
        .update(stringToHash)
        .digest("hex");

      return expectedHash === receivedHash;
    } catch (error) {
      console.error("PhonePe webhook validation error:", error.message);
      return false;
    }
  }
}
