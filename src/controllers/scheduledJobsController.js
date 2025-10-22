// src/controllers/scheduledJobsController.js - Scheduled Jobs Controller
import scheduledJobsService from "../services/scheduledJobs.js";
import { APIResponse } from "../utils/APIResponse.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";

/**
 * Get status of all scheduled jobs
 * GET /api/v1/admin/scheduled-jobs/status
 * @access Admin
 */
export const getJobsStatus = async (req, res, next) => {
  try {
    const status = scheduledJobsService.getJobsStatus();

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          status,
          "Scheduled jobs status retrieved successfully"
        )
      );
  } catch (error) {
    logger.error("Error getting scheduled jobs status:", error);
    next(error);
  }
};

/**
 * Schedule a one-time round-robin reset
 * POST /api/v1/admin/scheduled-jobs/reset-round-robin
 * @access Admin
 */
export const scheduleOneTimeReset = async (req, res, next) => {
  try {
    const { dateTime } = req.body;

    if (!dateTime) {
      return next(new APIError(400, "DateTime is required"));
    }

    const resetDate = new Date(dateTime);

    if (resetDate <= new Date()) {
      return next(new APIError(400, "DateTime must be in the future"));
    }

    const job = scheduledJobsService.scheduleOneTimeReset(resetDate);

    res.status(200).json(
      new APIResponse(
        200,
        {
          scheduledFor: resetDate.toISOString(),
          scheduledForIST: resetDate.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          }),
        },
        "One-time round-robin reset scheduled successfully"
      )
    );
  } catch (error) {
    logger.error("Error scheduling one-time reset:", error);
    next(error);
  }
};

/**
 * Stop a scheduled job
 * POST /api/v1/admin/scheduled-jobs/:jobName/stop
 * @access Admin
 */
export const stopJob = async (req, res, next) => {
  try {
    const { jobName } = req.params;

    const success = scheduledJobsService.stopJob(jobName);

    if (!success) {
      return next(new APIError(404, `Job '${jobName}' not found`));
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { jobName, status: "stopped" },
          `Job '${jobName}' stopped successfully`
        )
      );
  } catch (error) {
    logger.error("Error stopping job:", error);
    next(error);
  }
};

/**
 * Start a scheduled job
 * POST /api/v1/admin/scheduled-jobs/:jobName/start
 * @access Admin
 */
export const startJob = async (req, res, next) => {
  try {
    const { jobName } = req.params;

    const success = scheduledJobsService.startJob(jobName);

    if (!success) {
      return next(new APIError(404, `Job '${jobName}' not found`));
    }

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { jobName, status: "started" },
          `Job '${jobName}' started successfully`
        )
      );
  } catch (error) {
    logger.error("Error starting job:", error);
    next(error);
  }
};

/**
 * Stop all scheduled jobs
 * POST /api/v1/admin/scheduled-jobs/stop-all
 * @access Admin
 */
export const stopAllJobs = async (req, res, next) => {
  try {
    scheduledJobsService.stopAllJobs();

    res
      .status(200)
      .json(
        new APIResponse(
          200,
          { status: "all_stopped" },
          "All scheduled jobs stopped successfully"
        )
      );
  } catch (error) {
    logger.error("Error stopping all jobs:", error);
    next(error);
  }
};
