/**
 * Payment Gateway Factory
 *
 * Factory pattern to create payment gateway instances based on provider.
 * Each gateway implements a common interface for payment operations.
 */

import { RazorpayGateway } from "./RazorpayGateway.js";
import { PhonePeGateway } from "./PhonePeGateway.js";
import { PaytmGateway } from "./PaytmGateway.js";

/**
 * Payment Gateway Interface (all gateways must implement these methods)
 *
 * createOrder(orderData)
 * verifyPayment(paymentData)
 * getPaymentStatus(paymentId)
 * refund(paymentId, amount, reason)
 * validateWebhookSignature(payload, signature)
 */

export class PaymentGatewayFactory {
  /**
   * Create a payment gateway instance based on provider
   * @param {string} provider - Payment provider (razorpay, phonepe, paytm)
   * @param {object} credentials - Decrypted credentials for the provider
   * @returns {Object} Payment gateway instance
   */
  static createGateway(provider, credentials) {
    if (!provider) {
      throw new Error("Payment provider is required");
    }

    if (!credentials) {
      throw new Error("Payment credentials are required");
    }

    switch (provider.toLowerCase()) {
      case "razorpay":
        return new RazorpayGateway(credentials);

      case "phonepe":
        return new PhonePeGateway(credentials);

      case "paytm":
        return new PaytmGateway(credentials);

      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }
  }

  /**
   * Get list of supported payment providers
   * @returns {Array<string>} List of supported providers
   */
  static getSupportedProviders() {
    return ["razorpay", "phonepe", "paytm"];
  }

  /**
   * Check if a provider is supported
   * @param {string} provider - Provider name
   * @returns {boolean} True if supported
   */
  static isProviderSupported(provider) {
    return this.getSupportedProviders().includes(provider.toLowerCase());
  }
}
