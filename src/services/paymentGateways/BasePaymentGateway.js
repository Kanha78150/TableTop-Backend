/**
 * Base Payment Gateway Class
 * All specific gateway implementations should extend this
 */

export class BasePaymentGateway {
  constructor(provider, credentials) {
    this.provider = provider;
    this.credentials = credentials;
    this.isProduction = credentials.isProduction || false;
  }

  /**
   * Create an order/payment request
   * Must be implemented by child class
   */
  async createOrder(orderData) {
    throw new Error("createOrder method must be implemented");
  }

  /**
   * Verify payment signature/response
   * Must be implemented by child class
   */
  async verifyPayment(paymentData) {
    throw new Error("verifyPayment method must be implemented");
  }

  /**
   * Get payment status
   * Must be implemented by child class
   */
  async getPaymentStatus(paymentId) {
    throw new Error("getPaymentStatus method must be implemented");
  }

  /**
   * Refund a payment
   * Must be implemented by child class
   */
  async refund(paymentId, amount, reason) {
    throw new Error("refund method must be implemented");
  }

  /**
   * Validate webhook signature
   * Must be implemented by child class
   */
  validateWebhookSignature(payload, signature) {
    throw new Error("validateWebhookSignature method must be implemented");
  }

  /**
   * Get provider name
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Check if in production mode
   */
  isProductionMode() {
    return this.isProduction;
  }
}
