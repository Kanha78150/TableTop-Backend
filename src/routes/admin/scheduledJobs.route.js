import express from "express";
import {
  getJobsStatus,
  scheduleOneTimeReset,
  stopJob,
  startJob,
  stopAllJobs,
} from "../../controllers/scheduledJobs.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Get status of all scheduled jobs
router.get("/status", rbac({ permissions: ["manageSystem"] }), getJobsStatus);

// Schedule a one-time round-robin reset
router.post(
  "/reset-round-robin",
  rbac({ permissions: ["manageSystem"] }),
  scheduleOneTimeReset
);

// Stop all scheduled jobs (must be before :jobName routes)
router.post("/stop-all", rbac({ permissions: ["manageSystem"] }), stopAllJobs);

// Stop a scheduled job
router.post("/:jobName/stop", rbac({ permissions: ["manageSystem"] }), stopJob);

// Start a scheduled job
router.post(
  "/:jobName/start",
  rbac({ permissions: ["manageSystem"] }),
  startJob
);

export default router;
