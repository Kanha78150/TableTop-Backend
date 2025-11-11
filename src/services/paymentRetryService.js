import cron from "node-cron";
import { Order } from "../models/Order.model.js";
import { AdminSubscription } from "../models/AdminSubscription.model.js";
import { paymentService } from "./paymentService.js";
import { paymentLogger } from "../utils/paymentLogger.js";
import { logger } from "../utils/logger.js";
import { sendEmail } from "../utils/emailService.js";

/**
 * Payment Retry and Failure Recovery Service
 * Handles automatic retry of failed payments and notifications
 */

class PaymentRetryService {
  constructor() {
    this.maxRetryAttempts = 3;
    this.retryIntervals = [24, 48, 72]; // Hours
    this.jobs = {};
  }

  /**
   * Start payment retry jobs
   */
  startRetryJobs() {
    // Job 1: Retry failed subscription payments (runs every 6 hours)
    this.jobs.subscriptionRetry = cron.schedule(
      "0 */6 * * *",
      () => {
        this.retryFailedSubscriptionPayments();
      },
      {
        scheduled: false,
        timezone: "Asia/Kolkata",
      }
    );

    // Job 2: Retry failed order payments (runs every 3 hours)
    this.jobs.orderRetry = cron.schedule(
      "0 */3 * * *",
      () => {
        this.retryFailedOrderPayments();
      },
      {
        scheduled: false,
        timezone: "Asia/Kolkata",
      }
    );

    // Job 3: Send payment reminder for pending payments (runs daily at 10 AM)
    this.jobs.paymentReminder = cron.schedule(
      "0 10 * * *",
      () => {
        this.sendPaymentReminders();
      },
      {
        scheduled: false,
        timezone: "Asia/Kolkata",
      }
    );

    // Job 4: Mark long-pending payments as failed (runs daily at midnight)
    this.jobs.markFailed = cron.schedule(
      "0 0 * * *",
      () => {
        this.markLongPendingPaymentsAsFailed();
      },
      {
        scheduled: false,
        timezone: "Asia/Kolkata",
      }
    );

    // Start all jobs
    this.jobs.subscriptionRetry.start();
    this.jobs.orderRetry.start();
    this.jobs.paymentReminder.start();
    this.jobs.markFailed.start();

    logger.info("✅ Payment retry jobs started successfully");
  }

  /**
   * Stop all retry jobs
   */
  stopRetryJobs() {
    Object.values(this.jobs).forEach((job) => job.stop());
    logger.info("Payment retry jobs stopped");
  }

  /**
   * Retry failed subscription payments
   */
  async retryFailedSubscriptionPayments() {
    try {
      logger.info("[PAYMENT_RETRY] Starting subscription payment retry job");

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Find subscriptions with failed payments in last 3 days
      const failedSubscriptions = await AdminSubscription.find({
        status: "pending_payment",
        paymentHistory: {
          $elemMatch: {
            status: "failed",
            date: { $gte: threeDaysAgo },
          },
        },
      }).populate("admin plan");

      logger.info(
        `Found ${failedSubscriptions.length} subscriptions with failed payments`
      );

      let retrySuccessCount = 0;
      let retryFailureCount = 0;

      for (const subscription of failedSubscriptions) {
        try {
          // Check retry count
          const failedPayments = subscription.paymentHistory.filter(
            (p) => p.status === "failed" && p.date >= threeDaysAgo
          );

          if (failedPayments.length >= this.maxRetryAttempts) {
            logger.warn("Max retry attempts reached", {
              subscriptionId: subscription._id,
              attempts: failedPayments.length,
            });

            // Send final failure notification
            await this.sendFinalFailureNotification(subscription);
            continue;
          }

          // Calculate amount
          const amount =
            subscription.billingCycle === "monthly"
              ? subscription.plan.pricing.monthly
              : subscription.plan.pricing.yearly;

          // Log retry attempt
          paymentLogger.logPaymentRetry({
            subscriptionId: subscription._id.toString(),
            attemptNumber: failedPayments.length + 1,
            maxAttempts: this.maxRetryAttempts,
            previousFailureReason:
              failedPayments[failedPayments.length - 1]?.notes,
            userId: subscription.admin._id.toString(),
          });

          // Create new payment order
          const paymentOrder =
            await paymentService.createSubscriptionPaymentOrder({
              subscriptionId: subscription._id,
              amount: amount,
              planName: subscription.plan.name,
              billingCycle: subscription.billingCycle,
            });

          // Send retry notification email
          await this.sendRetryNotificationEmail(subscription, paymentOrder);

          retrySuccessCount++;

          logger.info("Payment retry initiated successfully", {
            subscriptionId: subscription._id,
            orderId: paymentOrder.orderId,
          });
        } catch (error) {
          retryFailureCount++;
          logger.error("Failed to retry payment for subscription", {
            subscriptionId: subscription._id,
            error: error.message,
          });
        }
      }

      logger.info("[PAYMENT_RETRY] Subscription payment retry job completed", {
        total: failedSubscriptions.length,
        success: retrySuccessCount,
        failed: retryFailureCount,
      });
    } catch (error) {
      logger.error("[PAYMENT_RETRY] Subscription payment retry job failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Retry failed order payments
   */
  async retryFailedOrderPayments() {
    try {
      logger.info("[PAYMENT_RETRY] Starting order payment retry job");

      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      // Find orders with failed payments in last 24 hours
      const failedOrders = await Order.find({
        "payment.paymentStatus": "failed",
        createdAt: { $gte: oneDayAgo },
      }).populate("user hotel branch");

      logger.info(`Found ${failedOrders.length} orders with failed payments`);

      let retrySuccessCount = 0;
      let retryFailureCount = 0;

      for (const order of failedOrders) {
        try {
          // Check if order is still valid (not cancelled)
          if (order.status === "cancelled") {
            continue;
          }

          // Send retry notification
          await this.sendOrderRetryNotification(order);

          retrySuccessCount++;
        } catch (error) {
          retryFailureCount++;
          logger.error("Failed to process order retry", {
            orderId: order._id,
            error: error.message,
          });
        }
      }

      logger.info("[PAYMENT_RETRY] Order payment retry job completed", {
        total: failedOrders.length,
        success: retrySuccessCount,
        failed: retryFailureCount,
      });
    } catch (error) {
      logger.error("[PAYMENT_RETRY] Order payment retry job failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Send payment reminders for pending payments
   */
  async sendPaymentReminders() {
    try {
      logger.info("[PAYMENT_REMINDER] Starting payment reminder job");

      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      // Find pending subscription payments
      const pendingSubscriptions = await AdminSubscription.find({
        status: "pending_payment",
        createdAt: { $gte: twoDaysAgo },
      }).populate("admin plan");

      logger.info(`Found ${pendingSubscriptions.length} pending subscriptions`);

      let remindersSent = 0;

      for (const subscription of pendingSubscriptions) {
        try {
          await this.sendPaymentPendingReminder(subscription);
          remindersSent++;
        } catch (error) {
          logger.error("Failed to send payment reminder", {
            subscriptionId: subscription._id,
            error: error.message,
          });
        }
      }

      logger.info("[PAYMENT_REMINDER] Payment reminder job completed", {
        total: pendingSubscriptions.length,
        sent: remindersSent,
      });
    } catch (error) {
      logger.error("[PAYMENT_REMINDER] Payment reminder job failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Mark long-pending payments as failed
   */
  async markLongPendingPaymentsAsFailed() {
    try {
      logger.info("[PAYMENT_CLEANUP] Starting long-pending payment cleanup");

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Find payments pending for more than 7 days
      const result = await AdminSubscription.updateMany(
        {
          status: "pending_payment",
          createdAt: { $lte: sevenDaysAgo },
        },
        {
          $set: { status: "cancelled" },
          $push: {
            paymentHistory: {
              amount: 0,
              currency: "INR",
              date: new Date(),
              status: "failed",
              notes: "Payment timeout - automatically cancelled after 7 days",
            },
          },
        }
      );

      logger.info("[PAYMENT_CLEANUP] Long-pending payments marked as failed", {
        count: result.modifiedCount,
      });
    } catch (error) {
      logger.error("[PAYMENT_CLEANUP] Payment cleanup job failed", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Send retry notification email
   */
  async sendRetryNotificationEmail(subscription, paymentOrder) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="margin: 0;">Payment Retry Notification</h2>
          </div>
          <p>Dear ${subscription.admin.name},</p>
          <p>We noticed that your previous payment attempt for the <strong>${
            subscription.plan.name
          }</strong> plan failed.</p>
          <p>We've generated a new payment link for you. Please complete the payment to activate your subscription.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Subscription Details:</strong></p>
            <ul style="list-style: none; padding: 0;">
              <li>Plan: ${subscription.plan.name}</li>
              <li>Billing Cycle: ${subscription.billingCycle}</li>
              <li>Amount: ₹${paymentOrder.amount / 100}</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/subscription/payment/${
        subscription._id
      }?order=${paymentOrder.orderId}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Complete Payment
            </a>
          </div>
          <p style="color: #666; font-size: 12px;">If you continue to face issues, please contact our support team.</p>
        </div>
      `;

      await sendEmail({
        to: subscription.admin.email,
        subject: `Payment Retry - ${subscription.plan.name} Subscription`,
        html: emailHtml,
      });

      logger.info("Retry notification email sent", {
        subscriptionId: subscription._id,
        email: subscription.admin.email,
      });
    } catch (error) {
      logger.error("Failed to send retry notification email", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send final failure notification
   */
  async sendFinalFailureNotification(subscription) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #dc3545; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="margin: 0;">Subscription Payment Failed</h2>
          </div>
          <p>Dear ${subscription.admin.name},</p>
          <p>Unfortunately, we were unable to process your payment for the <strong>${subscription.plan.name}</strong> plan after multiple attempts.</p>
          <p>Your subscription request has been cancelled. You can create a new subscription anytime from your dashboard.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/subscription/plans" 
               style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Subscription Plans
            </a>
          </div>
          <p style="color: #666; font-size: 12px;">If you need assistance, please contact our support team at support@tabletop.com</p>
        </div>
      `;

      await sendEmail({
        to: subscription.admin.email,
        subject: `Subscription Payment Failed - Action Required`,
        html: emailHtml,
      });

      logger.info("Final failure notification sent", {
        subscriptionId: subscription._id,
        email: subscription.admin.email,
      });
    } catch (error) {
      logger.error("Failed to send final failure notification", {
        error: error.message,
      });
    }
  }

  /**
   * Send order retry notification
   */
  async sendOrderRetryNotification(order) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #ffc107; color: #333; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="margin: 0;">Order Payment Failed</h2>
          </div>
          <p>Dear ${order.user.name || "Customer"},</p>
          <p>Your payment for Order #${
            order._id
          } failed. Please try again to complete your order.</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Order Details:</strong></p>
            <ul style="list-style: none; padding: 0;">
              <li>Order ID: ${order._id}</li>
              <li>Amount: ₹${order.totalPrice}</li>
              <li>Hotel: ${order.hotel?.name}</li>
              <li>Branch: ${order.branch?.name}</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/orders/${order._id}/payment" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Complete Payment
            </a>
          </div>
        </div>
      `;

      await sendEmail({
        to: order.user.email,
        subject: `Payment Failed - Order #${order._id}`,
        html: emailHtml,
      });

      logger.info("Order retry notification sent", {
        orderId: order._id,
        email: order.user.email,
      });
    } catch (error) {
      logger.error("Failed to send order retry notification", {
        error: error.message,
      });
    }
  }

  /**
   * Send payment pending reminder
   */
  async sendPaymentPendingReminder(subscription) {
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #17a2b8; color: white; padding: 15px; border-radius: 5px; margin-bottom: 20px;">
            <h2 style="margin: 0;">Payment Pending Reminder</h2>
          </div>
          <p>Dear ${subscription.admin.name},</p>
          <p>Your subscription to the <strong>${subscription.plan.name}</strong> plan is awaiting payment.</p>
          <p>Please complete the payment to activate your subscription and enjoy all the features.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/subscription/payment/${subscription._id}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Complete Payment Now
            </a>
          </div>
          <p style="color: #666; font-size: 12px; font-style: italic;">
            Note: Pending payments will be automatically cancelled after 7 days.
          </p>
        </div>
      `;

      await sendEmail({
        to: subscription.admin.email,
        subject: `Payment Reminder - ${subscription.plan.name} Subscription`,
        html: emailHtml,
      });

      logger.info("Payment pending reminder sent", {
        subscriptionId: subscription._id,
        email: subscription.admin.email,
      });
    } catch (error) {
      logger.error("Failed to send payment pending reminder", {
        error: error.message,
      });
    }
  }

  /**
   * Get retry jobs status
   */
  getJobsStatus() {
    return {
      subscriptionRetry: {
        running: this.jobs.subscriptionRetry?.running || false,
        schedule: "Every 6 hours",
        description: "Retry failed subscription payments",
      },
      orderRetry: {
        running: this.jobs.orderRetry?.running || false,
        schedule: "Every 3 hours",
        description: "Retry failed order payments",
      },
      paymentReminder: {
        running: this.jobs.paymentReminder?.running || false,
        schedule: "Daily at 10:00 AM",
        description: "Send payment reminders",
      },
      markFailed: {
        running: this.jobs.markFailed?.running || false,
        schedule: "Daily at 00:00",
        description: "Mark long-pending payments as failed",
      },
    };
  }

  /**
   * Manual trigger for retry job
   */
  async manualRetryTrigger(type) {
    switch (type) {
      case "subscription":
        await this.retryFailedSubscriptionPayments();
        break;
      case "order":
        await this.retryFailedOrderPayments();
        break;
      case "reminder":
        await this.sendPaymentReminders();
        break;
      case "cleanup":
        await this.markLongPendingPaymentsAsFailed();
        break;
      default:
        throw new Error("Invalid retry type");
    }
  }
}

// Export singleton instance
export const paymentRetryService = new PaymentRetryService();
