// src/controllers/scheduledJobsController.js - Scheduled Jobs Controller
import scheduledJobsService from "../services/jobs/scheduledJobs.service.js";
import { APIResponse } from "../utils/APIResponse.js";
import { APIError } from "../utils/APIError.js";
import { logger } from "../utils/logger.js";
import { asyncHandler } from "../middleware/errorHandler.middleware.js";


/**
 * Get status of all scheduled jobs
 * GET /api/v1/admin/scheduled-jobs/status
 * @access Admin
 */
export const getJobsStatus = asyncHandler(async (req, res) => {
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
  });

/**
 * Schedule a one-time round-robin reset
 * POST /api/v1/admin/scheduled-jobs/reset-round-robin
 * @access Admin
 */
export const scheduleOneTimeReset = asyncHandler(async (req, res, next) => {
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
  });

/**
 * Stop a scheduled job
 * POST /api/v1/admin/scheduled-jobs/:jobName/stop
 * @access Admin
 */
export const stopJob = asyncHandler(async (req, res, next) => {
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
  });

/**
 * Start a scheduled job
 * POST /api/v1/admin/scheduled-jobs/:jobName/start
 * @access Admin
 */
export const startJob = asyncHandler(async (req, res, next) => {
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
  });

/**
 * Stop all scheduled jobs
 * POST /api/v1/admin/scheduled-jobs/stop-all
 * @access Admin
 */
export const stopAllJobs = asyncHandler(async (req, res) => {
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
  });
