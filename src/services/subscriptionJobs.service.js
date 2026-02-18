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

// Store job callbacks so we can trigger them manually
const jobCallbacks = {};

// ============================================
// JOB 1: Subscription Expiry Checker
// Runs daily at midnight (00:00)
// ============================================
jobCallbacks.expiryCheck = async () => {
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
};

export const subscriptionExpiryChecker = cron.schedule(
  "0 0 * * *",
  jobCallbacks.expiryCheck,
  {
    scheduled: false, // Don't start automatically
    timezone: "Asia/Kolkata", // Adjust to your timezone
  }
);

// ============================================
// JOB 2: Subscription Renewal Reminder
// Runs daily at 9 AM
// ============================================
jobCallbacks.renewalReminder = async () => {
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
};

export const subscriptionRenewalReminder = cron.schedule(
  "0 9 * * *",
  jobCallbacks.renewalReminder,
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 3: Usage Counter Reset
// Runs on 1st of every month at midnight
// ============================================
jobCallbacks.usageReset = async () => {
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
};

export const usageCounterReset = cron.schedule(
  "0 0 1 * *",
  jobCallbacks.usageReset,
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 4: Auto-Renewal Handler
// Runs daily at midnight
// ============================================
jobCallbacks.autoRenewal = async () => {
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

        // Add renewal to payment history (use plan.price, not plan.pricing)
        const amount =
          subscription.billingCycle === "monthly"
            ? subscription.plan.price.monthly
            : subscription.plan.price.yearly;

        subscription.paymentHistory.push({
          amount,
          status: "auto_renewed",
          paymentMethod: "auto_renewal",
          transactionId: `AUTO_RENEWAL_${Date.now()}`,
          paymentDate: new Date(),
          notes: `Auto-renewal for ${subscription.billingCycle} subscription`,
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
};

export const autoRenewalHandler = cron.schedule(
  "0 0 * * *",
  jobCallbacks.autoRenewal,
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 5: Failed Payment Retry
// Runs daily at 10 AM
// ============================================
jobCallbacks.paymentRetry = async () => {
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
          const latestFailedPayment = failedPayments[failedPayments.length - 1];

          // Calculate the amount to retry
          const retryAmount =
            subscription.billingCycle === "monthly"
              ? subscription.plan.price.monthly
              : subscription.plan.price.yearly;

          const retryLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/subscription/retry/${subscription._id}`;

          // Send payment retry notification email
          try {
            const { sendEmail } = await import("../utils/emailService.js");
            await sendEmail({
              to: subscription.admin.email,
              subject: `Action Required: Retry Payment for ${subscription.plan.name}`,
              html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                    <h1 style="color: #f44336; text-align: center;">⚠️ Payment Failed</h1>
                    <h2 style="color: #333;">Hi ${subscription.admin.name},</h2>
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">
                      Your payment of <strong>₹${retryAmount}</strong> for the
                      <strong>${subscription.plan.name}</strong> (${subscription.billingCycle}) subscription failed on
                      ${new Date(latestFailedPayment.paymentDate).toLocaleDateString()}.
                    </p>
                    <p style="font-size: 16px; color: #555; line-height: 1.6;">
                      Please retry your payment to activate your subscription.
                    </p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${retryLink}"
                         style="background-color: #4caf50; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                        Retry Payment
                      </a>
                    </div>
                    <p style="font-size: 14px; color: #777; margin-top: 30px;">
                      If you continue to face issues, please contact our support team.
                    </p>
                  </div>
                `,
            });

            logJob(
              jobName,
              "info",
              `Payment retry email sent to: ${subscription.admin.email}`,
              {
                failedAmount: latestFailedPayment.amount,
                failedDate: latestFailedPayment.paymentDate,
                retryAmount,
              }
            );

            notificationsSent++;
          } catch (emailError) {
            logJob(
              jobName,
              "error",
              `Failed to send retry email to: ${subscription.admin.email}`,
              { error: emailError.message }
            );
          }
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
};

export const failedPaymentRetry = cron.schedule(
  "0 10 * * *",
  jobCallbacks.paymentRetry,
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// ============================================
// JOB 6: Inactive Subscription Cleanup
// Runs every Sunday at 2 AM
// ============================================
jobCallbacks.cleanup = async () => {
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
};

export const inactiveSubscriptionCleanup = cron.schedule(
  "0 2 * * 0",
  jobCallbacks.cleanup,
  {
    scheduled: false,
    timezone: "Asia/Kolkata",
  }
);

// NOTE: Job 7 (Subscription Expiring Soon Alert) was removed.
// Its functionality (alerting for subscriptions expiring within 7 days) is fully covered
// by Job 2 (Subscription Renewal Reminder) which sends reminders at 7, 3, and 1 days.
// Having both caused duplicate emails to admins.

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

  console.log("✅ All subscription jobs stopped!\n");
};

// Manual trigger functions for testing
// Callbacks are stored in jobCallbacks object so they can be invoked directly
export const triggerExpiryCheck = () => {
  console.log("🔧 Manually triggering subscription expiry check...");
  jobCallbacks.expiryCheck();
};

export const triggerRenewalReminder = () => {
  console.log("🔧 Manually triggering renewal reminder...");
  jobCallbacks.renewalReminder();
};

export const triggerUsageReset = () => {
  console.log("🔧 Manually triggering usage counter reset...");
  jobCallbacks.usageReset();
};

export const triggerAutoRenewal = () => {
  console.log("🔧 Manually triggering auto-renewal handler...");
  jobCallbacks.autoRenewal();
};

export const triggerPaymentRetry = () => {
  console.log("🔧 Manually triggering failed payment retry...");
  jobCallbacks.paymentRetry();
};

export const triggerCleanup = () => {
  console.log("🔧 Manually triggering inactive subscription cleanup...");
  jobCallbacks.cleanup();
};

// Get job status
// Helper to safely check if a cron task is scheduled/active (compatible with node-cron v4)
// node-cron v4 statuses: "idle" (scheduled, waiting), "running" (executing), "stopped"
const isJobRunning = (task) => {
  if (typeof task.getStatus === "function") {
    return task.getStatus() !== "stopped";
  }
  return !!task.running;
};

export const getJobsStatus = () => {
  return {
    subscriptionExpiryChecker: {
      running: isJobRunning(subscriptionExpiryChecker),
      schedule: "Daily at 00:00 (Midnight)",
      description: "Expires subscriptions that reached their end date",
    },
    subscriptionRenewalReminder: {
      running: isJobRunning(subscriptionRenewalReminder),
      schedule: "Daily at 09:00 AM",
      description: "Sends renewal reminders at 7, 3, and 1 day before expiry",
    },
    usageCounterReset: {
      running: isJobRunning(usageCounterReset),
      schedule: "Monthly on 1st at 00:00",
      description: "Resets monthly order counters for all subscriptions",
    },
    autoRenewalHandler: {
      running: isJobRunning(autoRenewalHandler),
      schedule: "Daily at 00:00 (Midnight)",
      description:
        "Automatically renews subscriptions with auto-renewal enabled",
    },
    failedPaymentRetry: {
      running: isJobRunning(failedPaymentRetry),
      schedule: "Daily at 10:00 AM",
      description: "Retries failed payments from last 3 days",
    },
    inactiveSubscriptionCleanup: {
      running: isJobRunning(inactiveSubscriptionCleanup),
      schedule: "Weekly on Sunday at 02:00 AM",
      description: "Archives subscriptions expired for 30+ days",
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
};
