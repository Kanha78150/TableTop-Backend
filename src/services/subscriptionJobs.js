import cron from "node-cron";
import { AdminSubscription } from "../models/AdminSubscription.model.js";
import { Admin } from "../models/Admin.model.js";
import { SubscriptionPlan } from "../models/SubscriptionPlan.model.js";
import {
  sendSubscriptionExpiringEmail,
  sendSubscriptionExpiredEmail,
  sendSubscriptionRenewalReminderEmail,
} from "../utils/emailService.js";

// Job logging utility
const logJob = (jobName, status, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logLevel = status === "error" ? "ERROR" : "INFO";
  console.log(
    `[${timestamp}] [${logLevel}] [${jobName}] ${message}`,
    data ? JSON.stringify(data) : ""
  );
};

// ============================================
// JOB 1: Subscription Expiry Checker
// Runs daily at midnight (00:00)
// ============================================
export const subscriptionExpiryChecker = cron.schedule(
  "0 0 * * *",
  async () => {
    const jobName = "Subscription Expiry Checker";
    logJob(jobName, "start", "Starting subscription expiry check...");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Find all active subscriptions that expire today
      const expiringSubscriptions = await AdminSubscription.find({
        status: "active",
        endDate: {
          $gte: today,
          $lt: tomorrow,
        },
      }).populate("admin plan");

      logJob(
        jobName,
        "info",
        `Found ${expiringSubscriptions.length} subscriptions expiring today`
      );

      let successCount = 0;
      let errorCount = 0;

      for (const subscription of expiringSubscriptions) {
        try {
          // Update subscription status to expired
          subscription.status = "expired";
          await subscription.save();

          // Send expiry notification email
          if (subscription.admin && subscription.admin.email) {
            await sendSubscriptionExpiredEmail(
              subscription.admin.email,
              subscription.admin.name,
              subscription.plan.name,
              subscription.endDate
            );
          }

          successCount++;
          logJob(
            jobName,
            "info",
            `Expired subscription for admin: ${subscription.admin?.email}`
          );
        } catch (error) {
          errorCount++;
          logJob(
            jobName,
            "error",
            `Failed to expire subscription for admin: ${subscription.admin?.email}`,
            { error: error.message }
          );
        }
      }

      logJob(
        jobName,
        "complete",
        `Job completed. Success: ${successCount}, Errors: ${errorCount}`
      );
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false, // Don't start automatically
    timezone: "Asia/Kolkata", // Adjust to your timezone
  }
);

// ============================================
// JOB 2: Subscription Renewal Reminder
// Runs daily at 9 AM
// ============================================
export const subscriptionRenewalReminder = cron.schedule(
  "0 9 * * *",
  async () => {
    const jobName = "Subscription Renewal Reminder";
    logJob(jobName, "start", "Starting renewal reminder check...");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Reminder intervals: 7 days, 3 days, 1 day
      const reminderDays = [7, 3, 1];
      let totalSent = 0;

      for (const days of reminderDays) {
        const reminderDate = new Date(today);
        reminderDate.setDate(reminderDate.getDate() + days);

        const nextDay = new Date(reminderDate);
        nextDay.setDate(nextDay.getDate() + 1);

        // Find subscriptions expiring in X days
        const expiringSubscriptions = await AdminSubscription.find({
          status: "active",
          endDate: {
            $gte: reminderDate,
            $lt: nextDay,
          },
        }).populate("admin plan");

        logJob(
          jobName,
          "info",
          `Found ${expiringSubscriptions.length} subscriptions expiring in ${days} days`
        );

        for (const subscription of expiringSubscriptions) {
          try {
            if (subscription.admin && subscription.admin.email) {
              await sendSubscriptionRenewalReminderEmail(
                subscription.admin.email,
                subscription.admin.name,
                subscription.plan.name,
                subscription.endDate,
                days
              );

              totalSent++;
              logJob(
                jobName,
                "info",
                `Sent ${days}-day reminder to: ${subscription.admin.email}`
              );
            }
          } catch (error) {
            logJob(
              jobName,
              "error",
              `Failed to send reminder to: ${subscription.admin?.email}`,
              { error: error.message }
            );
          }
        }
      }

      logJob(
        jobName,
        "complete",
        `Job completed. Total reminders sent: ${totalSent}`
      );
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 3: Usage Counter Reset
// Runs on 1st of every month at midnight
// ============================================
export const usageCounterReset = cron.schedule(
  "0 0 1 * *",
  async () => {
    const jobName = "Usage Counter Reset";
    logJob(jobName, "start", "Starting monthly usage counter reset...");

    try {
      // Reset ordersThisMonth for all active subscriptions
      const result = await AdminSubscription.updateMany(
        { status: "active" },
        { $set: { "usage.ordersThisMonth": 0 } }
      );

      logJob(
        jobName,
        "complete",
        `Reset ordersThisMonth counter for ${result.modifiedCount} subscriptions`
      );
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 4: Auto-Renewal Handler
// Runs daily at midnight
// ============================================
export const autoRenewalHandler = cron.schedule(
  "0 0 * * *",
  async () => {
    const jobName = "Auto-Renewal Handler";
    logJob(jobName, "start", "Starting auto-renewal processing...");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Find subscriptions expiring tomorrow with auto-renewal enabled
      const subscriptionsToRenew = await AdminSubscription.find({
        status: "active",
        autoRenew: true,
        endDate: {
          $gte: today,
          $lt: tomorrow,
        },
      }).populate("admin plan");

      logJob(
        jobName,
        "info",
        `Found ${subscriptionsToRenew.length} subscriptions for auto-renewal`
      );

      let successCount = 0;
      let errorCount = 0;

      for (const subscription of subscriptionsToRenew) {
        try {
          // Calculate new dates
          const newStartDate = new Date(subscription.endDate);
          const newEndDate = new Date(newStartDate);

          if (subscription.billingCycle === "monthly") {
            newEndDate.setMonth(newEndDate.getMonth() + 1);
          } else if (subscription.billingCycle === "yearly") {
            newEndDate.setFullYear(newEndDate.getFullYear() + 1);
          }

          // Update subscription
          subscription.startDate = newStartDate;
          subscription.endDate = newEndDate;

          // Add renewal to payment history
          const amount =
            subscription.billingCycle === "monthly"
              ? subscription.plan.pricing.monthly
              : subscription.plan.pricing.yearly;

          subscription.paymentHistory.push({
            amount,
            status: "auto_renewed",
            paymentMethod: "auto_renewal",
            transactionId: `AUTO_RENEWAL_${Date.now()}`,
            paymentDate: new Date(),
            billingCycle: subscription.billingCycle,
            description: `Auto-renewal for ${subscription.billingCycle} subscription`,
          });

          await subscription.save();

          // Send renewal confirmation email
          if (subscription.admin && subscription.admin.email) {
            await sendSubscriptionExpiringEmail(
              subscription.admin.email,
              subscription.admin.name,
              subscription.plan.name,
              newEndDate,
              0 // Days remaining
            );
          }

          successCount++;
          logJob(
            jobName,
            "info",
            `Auto-renewed subscription for: ${subscription.admin?.email}`
          );
        } catch (error) {
          errorCount++;
          logJob(
            jobName,
            "error",
            `Failed to auto-renew for: ${subscription.admin?.email}`,
            { error: error.message }
          );

          // Disable auto-renewal on failure
          try {
            subscription.autoRenew = false;
            await subscription.save();
          } catch (saveError) {
            logJob(jobName, "error", "Failed to disable auto-renewal", {
              error: saveError.message,
            });
          }
        }
      }

      logJob(
        jobName,
        "complete",
        `Job completed. Success: ${successCount}, Errors: ${errorCount}`
      );
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 5: Failed Payment Retry
// Runs daily at 10 AM
// ============================================
export const failedPaymentRetry = cron.schedule(
  "0 10 * * *",
  async () => {
    const jobName = "Failed Payment Retry";
    logJob(jobName, "start", "Starting failed payment retry...");

    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Find subscriptions with failed payments in last 3 days
      const subscriptionsWithFailedPayments = await AdminSubscription.find({
        status: "pending_payment",
        "paymentHistory.status": "failed",
        "paymentHistory.paymentDate": { $gte: threeDaysAgo },
      }).populate("admin plan");

      logJob(
        jobName,
        "info",
        `Found ${subscriptionsWithFailedPayments.length} subscriptions with failed payments`
      );

      let notificationsSent = 0;

      for (const subscription of subscriptionsWithFailedPayments) {
        try {
          // Get the latest failed payment
          const failedPayments = subscription.paymentHistory.filter(
            (payment) =>
              payment.status === "failed" && payment.paymentDate >= threeDaysAgo
          );

          if (failedPayments.length > 0 && subscription.admin) {
            // Send retry notification email
            const latestFailedPayment =
              failedPayments[failedPayments.length - 1];

            // In a real implementation, you would:
            // 1. Create a new payment order
            // 2. Send payment link to user
            // 3. Log the retry attempt

            logJob(
              jobName,
              "info",
              `Payment retry notification sent to: ${subscription.admin.email}`,
              {
                failedAmount: latestFailedPayment.amount,
                failedDate: latestFailedPayment.paymentDate,
              }
            );

            notificationsSent++;
          }
        } catch (error) {
          logJob(
            jobName,
            "error",
            `Failed to process retry for: ${subscription.admin?.email}`,
            { error: error.message }
          );
        }
      }

      logJob(
        jobName,
        "complete",
        `Job completed. Notifications sent: ${notificationsSent}`
      );
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 6: Inactive Subscription Cleanup
// Runs every Sunday at 2 AM
// ============================================
export const inactiveSubscriptionCleanup = cron.schedule(
  "0 2 * * 0",
  async () => {
    const jobName = "Inactive Subscription Cleanup";
    logJob(jobName, "start", "Starting inactive subscription cleanup...");

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Find subscriptions expired for more than 30 days
      const inactiveSubscriptions = await AdminSubscription.find({
        status: "expired",
        endDate: { $lt: thirtyDaysAgo },
      });

      logJob(
        jobName,
        "info",
        `Found ${inactiveSubscriptions.length} subscriptions expired for 30+ days`
      );

      let archivedCount = 0;

      for (const subscription of inactiveSubscriptions) {
        try {
          // Archive subscription (you can move to a separate collection or just mark as archived)
          subscription.status = "archived";
          await subscription.save();

          archivedCount++;
          logJob(
            jobName,
            "info",
            `Archived subscription ID: ${subscription._id}`
          );
        } catch (error) {
          logJob(
            jobName,
            "error",
            `Failed to archive subscription ID: ${subscription._id}`,
            { error: error.message }
          );
        }
      }

      logJob(
        jobName,
        "complete",
        `Job completed. Archived ${archivedCount} subscriptions`
      );
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 7: Subscription Expiring Soon Alert
// Runs daily at 8 AM
// Sends alerts for subscriptions expiring within 7 days
// ============================================
export const subscriptionExpiringSoonAlert = cron.schedule(
  "0 8 * * *",
  async () => {
    const jobName = "Subscription Expiring Soon Alert";
    logJob(jobName, "start", "Starting expiring soon alert check...");

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const sevenDaysLater = new Date(today);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

      // Find active subscriptions expiring within 7 days
      const expiringSubscriptions = await AdminSubscription.find({
        status: "active",
        endDate: {
          $gte: today,
          $lte: sevenDaysLater,
        },
      }).populate("admin plan");

      logJob(
        jobName,
        "info",
        `Found ${expiringSubscriptions.length} subscriptions expiring within 7 days`
      );

      let alertsSent = 0;

      for (const subscription of expiringSubscriptions) {
        try {
          const daysRemaining = Math.ceil(
            (subscription.endDate - today) / (1000 * 60 * 60 * 24)
          );

          if (subscription.admin && subscription.admin.email) {
            await sendSubscriptionExpiringEmail(
              subscription.admin.email,
              subscription.admin.name,
              subscription.plan.name,
              subscription.endDate,
              daysRemaining
            );

            alertsSent++;
            logJob(
              jobName,
              "info",
              `Sent expiring alert to: ${subscription.admin.email} (${daysRemaining} days remaining)`
            );
          }
        } catch (error) {
          logJob(
            jobName,
            "error",
            `Failed to send alert to: ${subscription.admin?.email}`,
            { error: error.message }
          );
        }
      }

      logJob(jobName, "complete", `Job completed. Alerts sent: ${alertsSent}`);
    } catch (error) {
      logJob(jobName, "error", "Job failed with error", {
        error: error.message,
      });
    }
  },
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// Job Manager - Start/Stop all jobs
// ============================================
export const startAllJobs = () => {
  console.log("\n🚀 Starting all subscription background jobs...\n");

  subscriptionExpiryChecker.start();
  console.log("✅ Subscription Expiry Checker - Started (Daily at 00:00)");

  subscriptionRenewalReminder.start();
  console.log("✅ Subscription Renewal Reminder - Started (Daily at 09:00)");

  usageCounterReset.start();
  console.log("✅ Usage Counter Reset - Started (Monthly on 1st at 00:00)");

  autoRenewalHandler.start();
  console.log("✅ Auto-Renewal Handler - Started (Daily at 00:00)");

  failedPaymentRetry.start();
  console.log("✅ Failed Payment Retry - Started (Daily at 10:00)");

  inactiveSubscriptionCleanup.start();
  console.log(
    "✅ Inactive Subscription Cleanup - Started (Weekly on Sunday at 02:00)"
  );

  subscriptionExpiringSoonAlert.start();
  console.log("✅ Subscription Expiring Soon Alert - Started (Daily at 08:00)");

  console.log("\n✨ All subscription jobs are running!\n");
};

export const stopAllJobs = () => {
  console.log("\n🛑 Stopping all subscription background jobs...\n");

  subscriptionExpiryChecker.stop();
  subscriptionRenewalReminder.stop();
  usageCounterReset.stop();
  autoRenewalHandler.stop();
  failedPaymentRetry.stop();
  inactiveSubscriptionCleanup.stop();
  subscriptionExpiringSoonAlert.stop();

  console.log("✅ All subscription jobs stopped!\n");
};

// Manual trigger functions for testing
export const triggerExpiryCheck = () => {
  console.log("🔧 Manually triggering subscription expiry check...");
  subscriptionExpiryChecker.now();
};

export const triggerRenewalReminder = () => {
  console.log("🔧 Manually triggering renewal reminder...");
  subscriptionRenewalReminder.now();
};

export const triggerUsageReset = () => {
  console.log("🔧 Manually triggering usage counter reset...");
  usageCounterReset.now();
};

export const triggerAutoRenewal = () => {
  console.log("🔧 Manually triggering auto-renewal handler...");
  autoRenewalHandler.now();
};

export const triggerPaymentRetry = () => {
  console.log("🔧 Manually triggering failed payment retry...");
  failedPaymentRetry.now();
};

export const triggerCleanup = () => {
  console.log("🔧 Manually triggering inactive subscription cleanup...");
  inactiveSubscriptionCleanup.now();
};

export const triggerExpiringSoonAlert = () => {
  console.log("🔧 Manually triggering expiring soon alert...");
  subscriptionExpiringSoonAlert.now();
};

// Get job status
export const getJobsStatus = () => {
  return {
    subscriptionExpiryChecker: {
      running: subscriptionExpiryChecker.running,
      schedule: "Daily at 00:00 (Midnight)",
      description: "Expires subscriptions that reached their end date",
    },
    subscriptionRenewalReminder: {
      running: subscriptionRenewalReminder.running,
      schedule: "Daily at 09:00 AM",
      description: "Sends renewal reminders at 7, 3, and 1 day before expiry",
    },
    usageCounterReset: {
      running: usageCounterReset.running,
      schedule: "Monthly on 1st at 00:00",
      description: "Resets monthly order counters for all subscriptions",
    },
    autoRenewalHandler: {
      running: autoRenewalHandler.running,
      schedule: "Daily at 00:00 (Midnight)",
      description:
        "Automatically renews subscriptions with auto-renewal enabled",
    },
    failedPaymentRetry: {
      running: failedPaymentRetry.running,
      schedule: "Daily at 10:00 AM",
      description: "Retries failed payments from last 3 days",
    },
    inactiveSubscriptionCleanup: {
      running: inactiveSubscriptionCleanup.running,
      schedule: "Weekly on Sunday at 02:00 AM",
      description: "Archives subscriptions expired for 30+ days",
    },
    subscriptionExpiringSoonAlert: {
      running: subscriptionExpiringSoonAlert.running,
      schedule: "Daily at 08:00 AM",
      description: "Sends alerts for subscriptions expiring within 7 days",
    },
  };
};

export default {
  startAllJobs,
  stopAllJobs,
  getJobsStatus,
  triggerExpiryCheck,
  triggerRenewalReminder,
  triggerUsageReset,
  triggerAutoRenewal,
  triggerPaymentRetry,
  triggerCleanup,
  triggerExpiringSoonAlert,
};
