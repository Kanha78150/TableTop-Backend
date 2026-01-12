import { EmailQueue } from "../models/EmailQueue.model.js";
import { Order } from "../models/Order.model.js";
import { AdminSubscription } from "../models/AdminSubscription.model.js";
import { invoiceService } from "./invoiceService.js";
import { logger } from "../utils/logger.js";

/**
 * Email Queue Service
 * Handles background processing of failed email deliveries with retry logic
 */

class EmailQueueService {
  constructor() {
    this.processorInterval = null;
    this.isProcessing = false;
  }

  /**
   * Start the queue processor
   * Runs every 5 minutes to process pending emails
   */
  startQueueProcessor() {
    if (this.processorInterval) {
      logger.warn("Email queue processor already running");
      return;
    }

    logger.info("Starting email queue processor");

    // Process immediately on start
    this.processQueue();

    // Then process every 5 minutes
    this.processorInterval = setInterval(() => {
      this.processQueue();
    }, 5 * 60 * 1000); // 5 minutes

    logger.info("Email queue processor started successfully");
  }

  /**
   * Stop the queue processor
   */
  stopQueueProcessor() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
      logger.info("Email queue processor stopped");
    }
  }

  /**
   * Process pending emails in the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      logger.debug("Queue processing already in progress, skipping");
      return;
    }

    this.isProcessing = true;

    try {
      logger.info("Processing email queue");

      // Get pending emails ready for processing
      const pendingEmails = await EmailQueue.getPendingEmails(10);

      if (pendingEmails.length === 0) {
        logger.debug("No pending emails to process");
        this.isProcessing = false;
        return;
      }

      logger.info(`Found ${pendingEmails.length} pending emails to process`);

      // Process each email
      for (const emailItem of pendingEmails) {
        await this.processEmailItem(emailItem);
      }

      logger.info("Email queue processing completed");
    } catch (error) {
      logger.error("Error processing email queue", {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single email item
   * @param {Object} emailItem - EmailQueue document
   */
  async processEmailItem(emailItem) {
    try {
      logger.info(`Processing email item`, {
        id: emailItem._id,
        type: emailItem.type,
        attempt: emailItem.attempts + 1,
      });

      // Mark as processing
      emailItem.status = "processing";
      emailItem.lastAttemptAt = new Date();
      await emailItem.save();

      let invoice;

      // Regenerate invoice/credit note based on type
      if (emailItem.type === "invoice") {
        invoice = await this.regenerateOrderInvoice(emailItem.orderId);
      } else if (emailItem.type === "credit_note") {
        invoice = await this.regenerateCreditNote(emailItem.orderId);
      } else if (emailItem.type === "subscription_invoice") {
        invoice = await this.regenerateSubscriptionInvoice(
          emailItem.subscriptionId
        );
      }

      if (!invoice) {
        throw new Error("Failed to regenerate invoice/credit note");
      }

      // Try to send email
      await invoiceService.sendInvoiceEmail(
        invoice,
        emailItem.recipientEmail,
        emailItem.recipientName,
        emailItem.type === "credit_note" ? "credit_note" : "invoice"
      );

      // Email sent successfully
      emailItem.status = "sent";
      emailItem.sentAt = new Date();
      await emailItem.save();

      // Update order/subscription email status
      if (emailItem.type === "invoice") {
        await Order.findByIdAndUpdate(emailItem.orderId, {
          invoiceEmailStatus: "sent",
        });
      }

      logger.info("Email sent successfully", {
        id: emailItem._id,
        type: emailItem.type,
      });
    } catch (error) {
      logger.error("Failed to process email item", {
        id: emailItem._id,
        type: emailItem.type,
        error: error.message,
      });

      // Increment attempts
      emailItem.attempts += 1;
      emailItem.errorMessage = error.message;

      // Schedule retry or mark as failed
      if (emailItem.attempts >= 3) {
        emailItem.status = "failed";
        logger.error("Email delivery failed after 3 attempts", {
          id: emailItem._id,
          type: emailItem.type,
        });
      } else {
        emailItem.scheduleRetry();
        logger.info("Email rescheduled for retry", {
          id: emailItem._id,
          attempt: emailItem.attempts,
          scheduledFor: emailItem.scheduledFor,
        });
      }

      await emailItem.save();
    }
  }

  /**
   * Regenerate order invoice from metadata
   * @param {String} orderId - Order ID
   * @returns {Object} Invoice data with buffer
   */
  async regenerateOrderInvoice(orderId) {
    const order = await Order.findById(orderId)
      .populate("user", "name email phone")
      .populate("hotel", "name email contactNumber gstin")
      .populate("branch", "name email contactNumber address")
      .populate("items.foodItem", "name price");

    if (!order) {
      throw new Error("Order not found");
    }

    return await invoiceService.generateOrderInvoice(order, {
      showCancelledStamp: false,
    });
  }

  /**
   * Regenerate credit note from order data
   * @param {String} orderId - Order ID
   * @returns {Object} Credit note data with buffer
   */
  async regenerateCreditNote(orderId) {
    const order = await Order.findById(orderId)
      .populate("user", "name email phone")
      .populate("hotel", "name email contactNumber gstin")
      .populate("branch", "name email contactNumber address");

    if (!order || !order.creditNotes || order.creditNotes.length === 0) {
      throw new Error("Order or credit notes not found");
    }

    // Get the latest credit note
    const latestCreditNote = order.creditNotes[order.creditNotes.length - 1];

    // Find the refund request
    const { RefundRequest } = await import("../models/RefundRequest.model.js");
    const refundRequest = await RefundRequest.findById(
      latestCreditNote.refundRequestId
    );

    if (!refundRequest) {
      throw new Error("Refund request not found");
    }

    return await invoiceService.generateCreditNote(order, refundRequest);
  }

  /**
   * Regenerate subscription invoice
   * @param {String} subscriptionId - Subscription ID
   * @returns {Object} Invoice data with buffer
   */
  async regenerateSubscriptionInvoice(subscriptionId) {
    const subscription = await AdminSubscription.findById(subscriptionId)
      .populate("admin", "name email phone")
      .populate("admin.hotel", "name")
      .populate("plan");

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const lastPayment =
      subscription.paymentHistory[subscription.paymentHistory.length - 1];

    return await invoiceService.generateSubscriptionInvoice(
      subscription,
      lastPayment
    );
  }

  /**
   * Get queue statistics
   * @returns {Object} Statistics about email queue
   */
  async getStats() {
    return await EmailQueue.getStats();
  }

  /**
   * Manually retry a specific email
   * @param {String} emailId - Email queue ID
   */
  async retryEmail(emailId) {
    const emailItem = await EmailQueue.findById(emailId);

    if (!emailItem) {
      throw new Error("Email item not found");
    }

    if (emailItem.status === "sent") {
      throw new Error("Email already sent");
    }

    // Reset status and schedule for immediate processing
    emailItem.status = "pending";
    emailItem.scheduledFor = new Date();
    await emailItem.save();

    logger.info("Email manually rescheduled for retry", { emailId });

    return emailItem;
  }
}

// Export singleton instance
export const emailQueueService = new EmailQueueService();
