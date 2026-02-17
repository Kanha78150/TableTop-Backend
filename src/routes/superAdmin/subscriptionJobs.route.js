import express from "express";
import {
  getSubscriptionJobsStatus,
  triggerSubscriptionJob,
  getAvailableJobs,
} from "../../controllers/superAdmin/subscriptionJobs.controller.js";
import {
  authenticateAdmin,
  requireSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// All routes require super admin authentication
router.use(authenticateAdmin, requireSuperAdmin);

/**
 * @route   GET /api/v1/super-admin/subscription-jobs/status
 * @desc    Get status of all subscription-related scheduled jobs
 * @access  Super Admin
 */
router.get("/status", getSubscriptionJobsStatus);

/**
 * @route   GET /api/v1/super-admin/subscription-jobs/available
 * @desc    Get list of available jobs that can be manually triggered
 * @access  Super Admin
 */
router.get("/available", getAvailableJobs);

/**
 * @route   POST /api/v1/super-admin/subscription-jobs/trigger
 * @desc    Manually trigger a subscription job
 * @body    { jobName: string }
 * @access  Super Admin
 */
router.post("/trigger", triggerSubscriptionJob);

export default router;
