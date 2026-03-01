import { asyncHandler } from "../../middleware/errorHandler.middleware.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import {
  getJobsStatus as getSubscriptionJobsStatusService,
  triggerExpiryCheck,
  triggerRenewalReminder,
  triggerUsageReset,
  triggerAutoRenewal,
  triggerPaymentRetry,
  triggerCleanup,
} from "../../services/jobs/subscriptionJobs.service.js";

/**
 * Get status of all subscription-related scheduled jobs
 * GET /api/v1/super-admin/subscription-jobs/status
 * @access Super Admin
 */
export const getSubscriptionJobsStatus = asyncHandler(async (req, res) => {
  const jobsStatus = getSubscriptionJobsStatusService();

  return res
    .status(200)
    .json(
      new APIResponse(
        200,
        jobsStatus,
        "Subscription jobs status retrieved successfully"
      )
    );
});

/**
 * Manually trigger a subscription job
 * POST /api/v1/super-admin/subscription-jobs/trigger
 * @access Super Admin
 */
export const triggerSubscriptionJob = asyncHandler(async (req, res) => {
  const { jobName } = req.body;

  if (!jobName) {
    throw new APIError(400, "Job name is required");
  }

  let message = "";
  let triggered = false;

  switch (jobName) {
    case "expiryCheck":
      triggerExpiryCheck();
      message = "Subscription expiry check triggered successfully";
      triggered = true;
      break;

    case "renewalReminder":
      triggerRenewalReminder();
      message = "Renewal reminder job triggered successfully";
      triggered = true;
      break;

    case "usageReset":
      triggerUsageReset();
      message = "Usage counter reset triggered successfully";
      triggered = true;
      break;

    case "autoRenewal":
      triggerAutoRenewal();
      message = "Auto-renewal handler triggered successfully";
      triggered = true;
      break;

    case "paymentRetry":
      triggerPaymentRetry();
      message = "Failed payment retry triggered successfully";
      triggered = true;
      break;

    case "cleanup":
      triggerCleanup();
      message = "Inactive subscription cleanup triggered successfully";
      triggered = true;
      break;

    default:
      throw new APIError(400, `Unknown job name: ${jobName}`);
  }

  if (triggered) {
    return res.status(200).json(
      new APIResponse(
        200,
        {
          jobName,
          triggeredAt: new Date(),
          status: "triggered",
        },
        message
      )
    );
  }
});

/**
 * Get available job names for manual triggering
 * GET /api/v1/super-admin/subscription-jobs/available
 * @access Super Admin
 */
export const getAvailableJobs = asyncHandler(async (req, res) => {
  const availableJobs = [
    {
      name: "expiryCheck",
      description: "Check and expire subscriptions that reached their end date",
      schedule: "Daily at 00:00 (Midnight)",
    },
    {
      name: "renewalReminder",
      description: "Send renewal reminders at 7, 3, and 1 day before expiry",
      schedule: "Daily at 09:00 AM",
    },
    {
      name: "usageReset",
      description: "Reset monthly order counters for all subscriptions",
      schedule: "Monthly on 1st at 00:00",
    },
    {
      name: "autoRenewal",
      description:
        "Automatically renew subscriptions with auto-renewal enabled",
      schedule: "Daily at 00:00 (Midnight)",
    },
    {
      name: "paymentRetry",
      description: "Retry failed payments from last 3 days",
      schedule: "Daily at 10:00 AM",
    },
    {
      name: "cleanup",
      description: "Archive subscriptions expired for 30+ days",
      schedule: "Weekly on Sunday at 02:00 AM",
    },
  ];

  return res.status(200).json(
    new APIResponse(
      200,
      {
        totalJobs: availableJobs.length,
        jobs: availableJobs,
      },
      "Available subscription jobs retrieved successfully"
    )
  );
});
