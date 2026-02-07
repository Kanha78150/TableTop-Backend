/**
 * Paytm Payment Gateway Implementation
 *
 * Handles payment operations using Paytm API
 * Credentials required: merchantId, merchantKey, websiteName
 * Uses checksum validation for security
 */

import crypto from "crypto";
import axios from "axios";
import { BasePaymentGateway } from "./BasePaymentGateway.js";

export class PaytmGateway extends BasePaymentGateway {
  constructor(credentials) {
    super("paytm", credentials);

    // Validate required credentials
    if (!credentials.merchantId || !credentials.merchantKey) {
      throw new Error("Paytm requires merchantId and merchantKey");
    }

    this.merchantId = credentials.merchantId;
    this.merchantKey = credentials.merchantKey;
    this.websiteName = credentials.websiteName || "DEFAULT";

    // API endpoints based on environment
    this.baseUrl = credentials.isProduction
      ? "https://securegw.paytm.in"
      : "https://securegw-stage.paytm.in";
  }

  /**
   * Generate Paytm checksum
   * @param {Object} params - Parameters object
   * @param {string} merchantKey - Merchant key
   * @returns {string} Checksum
   */
  generateChecksum(params, merchantKey) {
    const paramString = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join("&");

    const checksum = crypto
      .createHash("sha256")
      .update(paramString + merchantKey)
      .digest("hex");

    return checksum;
  }

  /**
   * Verify Paytm checksum
   * @param {Object} params - Parameters object
   * @param {string} receivedChecksum - Checksum from Paytm
   * @returns {boolean} True if valid
   */
  verifyChecksum(params, receivedChecksum) {
    const generatedChecksum = this.generateChecksum(params, this.merchantKey);
    return generatedChecksum === receivedChecksum;
  }

  /**
   * Create a Paytm payment transaction
   * @param {Object} orderData - { amount, orderId, customerId, callbackUrl }
   * @returns {Promise<Object>} Paytm transaction response
   */
  async createOrder(orderData) {
    try {
      const { amount, orderId, customerId, callbackUrl, email, mobileNumber } =
        orderData;

      // Paytm transaction parameters
      const params = {
        MID: this.merchantId,
        WEBSITE: this.websiteName,
        INDUSTRY_TYPE_ID: "Retail",
        CHANNEL_ID: "WEB",
        ORDER_ID: orderId,
        CUST_ID: customerId || `CUST_${Date.now()}`,
        TXN_AMOUNT: amount.toString(),
        CALLBACK_URL: callbackUrl,
        EMAIL: email || "",
        MOBILE_NO: mobileNumber || "",
      };

      // Generate checksum
      const checksum = this.generateChecksum(params, this.merchantKey);

      // Create transaction token (for Paytm JS integration)
      const tokenResponse = await axios.post(
        `${this.baseUrl}/theia/api/v1/initiateTransaction?mid=${this.merchantId}&orderId=${orderId}`,
        {
          body: {
            requestType: "Payment",
            mid: this.merchantId,
            websiteName: this.websiteName,
            orderId: orderId,
            txnAmount: {
              value: amount.toString(),
              currency: "INR",
            },
            userInfo: {
              custId: customerId || `CUST_${Date.now()}`,
              email: email || "",
              mobile: mobileNumber || "",
            },
            callbackUrl: callbackUrl,
          },
          head: {
            signature: checksum,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (tokenResponse.data.body.resultInfo.resultStatus === "S") {
        return {
          success: true,
          orderId: orderId,
          txnToken: tokenResponse.data.body.txnToken,
          amount: amount,
          paymentUrl: `${this.baseUrl}/theia/api/v1/showPaymentPage?mid=${this.merchantId}&orderId=${orderId}`,
          provider: "paytm",
          checksum: checksum,
          params: params,
          rawResponse: tokenResponse.data,
        };
      } else {
        return {
          success: false,
          error: tokenResponse.data.body.resultInfo.resultMsg,
          code: tokenResponse.data.body.resultInfo.resultCode,
          provider: "paytm",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        provider: "paytm",
      };
    }
  }

  /**
   * Verify Paytm payment
   * @param {Object} paymentData - { orderId, checksum, ...otherParams }
   * @returns {Promise<Object>} Verification result
   */
  async verifyPayment(paymentData) {
    try {
      const { orderId, CHECKSUMHASH, ...otherParams } = paymentData;

      if (!orderId || !CHECKSUMHASH) {
        return {
          success: false,
          verified: false,
          error: "Missing orderId or checksum",
          provider: "paytm",
        };
      }

      // Verify checksum
      const isValidChecksum = this.verifyChecksum(
        { ...otherParams, ORDER_ID: orderId },
        CHECKSUMHASH
      );

      if (!isValidChecksum) {
        return {
          success: false,
          verified: false,
          error: "Invalid checksum",
          provider: "paytm",
        };
      }

      // Get transaction status from Paytm
      const statusResponse = await this.getPaymentStatus(orderId);

      if (statusResponse.success && statusResponse.status === "TXN_SUCCESS") {
        return {
          success: true,
          verified: true,
          orderId: statusResponse.orderId,
          transactionId: statusResponse.transactionId,
          amount: statusResponse.amount,
          status: statusResponse.status,
          paymentMethod: statusResponse.paymentMethod,
          bankName: statusResponse.bankName,
          provider: "paytm",
          rawResponse: statusResponse.rawResponse,
        };
      } else {
        return {
          success: false,
          verified: false,
          status: statusResponse.status,
          error: statusResponse.error || "Payment verification failed",
          provider: "paytm",
        };
      }
    } catch (error) {
      return {
        success: false,
        verified: false,
        error: error.message,
        provider: "paytm",
      };
    }
  }

  /**
   * Get payment status from Paytm
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Payment status
   */
  async getPaymentStatus(orderId) {
    try {
      const params = {
        MID: this.merchantId,
        ORDERID: orderId,
      };

      const checksum = this.generateChecksum(params, this.merchantKey);

      const response = await axios.post(
        `${this.baseUrl}/order/status`,
        {
          body: {
            mid: this.merchantId,
            orderId: orderId,
          },
          head: {
            signature: checksum,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.body.resultInfo.resultStatus === "TXN_SUCCESS") {
        return {
          success: true,
          orderId: response.data.body.orderId,
          transactionId: response.data.body.txnId,
          amount: parseFloat(response.data.body.txnAmount),
          status: response.data.body.resultInfo.resultStatus,
          statusMessage: response.data.body.resultInfo.resultMsg,
          paymentMethod: response.data.body.paymentMode,
          bankName: response.data.body.bankName,
          txnDate: response.data.body.txnDate,
          provider: "paytm",
          rawResponse: response.data,
        };
      } else {
        return {
          success: false,
          error:
            response.data.body.resultInfo.resultMsg ||
            "Transaction status check failed",
          status: response.data.body.resultInfo.resultStatus,
          code: response.data.body.resultInfo.resultCode,
          provider: "paytm",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        provider: "paytm",
      };
    }
  }

  /**
   * Refund a Paytm payment
   * @param {string} orderId - Original order ID
   * @param {number} amount - Amount to refund
   * @param {string} reason - Refund reason
   * @returns {Promise<Object>} Refund response
   */
  async refund(orderId, amount, reason = null) {
    try {
      const refundId = `REFUND_${orderId}_${Date.now()}`;

      const params = {
        MID: this.merchantId,
        ORDERID: orderId,
        REFUNDID: refundId,
        TXNID: "", // Will be fetched from status
        REFUNDAMOUNT: amount.toString(),
      };

      // First get transaction ID
      const statusResponse = await this.getPaymentStatus(orderId);
      if (!statusResponse.success) {
        return {
          success: false,
          error: "Cannot fetch transaction details for refund",
          provider: "paytm",
        };
      }

      params.TXNID = statusResponse.transactionId;

      const checksum = this.generateChecksum(params, this.merchantKey);

      const response = await axios.post(
        `${this.baseUrl}/refund/apply`,
        {
          body: {
            mid: this.merchantId,
            orderId: orderId,
            refId: refundId,
            txnId: params.TXNID,
            refundAmount: amount.toString(),
          },
          head: {
            signature: checksum,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.body.resultInfo.resultStatus === "PENDING") {
        return {
          success: true,
          refundId: refundId,
          orderId: orderId,
          transactionId: params.TXNID,
          amount: amount,
          status: response.data.body.resultInfo.resultStatus,
          message: response.data.body.resultInfo.resultMsg,
          provider: "paytm",
          rawResponse: response.data,
        };
      } else {
        return {
          success: false,
          error: response.data.body.resultInfo.resultMsg || "Refund failed",
          code: response.data.body.resultInfo.resultCode,
          provider: "paytm",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        provider: "paytm",
      };
    }
  }

  /**
   * Validate Paytm webhook checksum
   * @param {Object} payload - Webhook payload
   * @param {string} receivedChecksum - CHECKSUMHASH from webhook
   * @returns {boolean} True if valid
   */
  validateWebhookSignature(payload, receivedChecksum) {
    try {
      const { CHECKSUMHASH, ...params } = payload;
      const checksum = receivedChecksum || CHECKSUMHASH;

      if (!checksum) {
        console.error("Paytm webhook: No checksum provided");
        return false;
      }

      return this.verifyChecksum(params, checksum);
    } catch (error) {
      console.error("Paytm webhook validation error:", error.message);
      return false;
    }
  }
}
