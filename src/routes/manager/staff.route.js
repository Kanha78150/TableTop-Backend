// src/routes/manager/staff.route.js - Manager Staff Management Routes
import express from "express";
import {
  requireRole,
  requirePermission,
  rateLimitSensitiveOps,
} from "../../middleware/roleAuth.middleware.js";
import {
  createStaff,
  getStaff,
  getAllStaff,
  updateStaff,
  deleteStaff,
  updateStaffStatus,
  getStaffPerformance,
  updateStaffPerformance,
  addStaffTraining,
  getStaffSchedule,
  updateStaffSchedule,
} from "../../controllers/manager/staff.controller.js";

const router = express.Router();

router.post(
  "/",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  rateLimitSensitiveOps,
  createStaff
);

router.get(
  "/",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getAllStaff
);

router.get(
  "/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getStaff
);

router.put(
  "/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaff
);

router.delete(
  "/:staffId",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  rateLimitSensitiveOps,
  deleteStaff
);

router.put(
  "/:staffId/status",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaffStatus
);

router.get(
  "/:staffId/performance",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getStaffPerformance
);

router.put(
  "/:staffId/performance",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaffPerformance
);

router.post(
  "/:staffId/training",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  addStaffTraining
);

router.get(
  "/:staffId/schedule",
  requireRole(["branch_manager"]),
  requirePermission("viewStaff"),
  getStaffSchedule
);

router.put(
  "/:staffId/schedule",
  requireRole(["branch_manager"]),
  requirePermission("manageStaff"),
  updateStaffSchedule
);

export default router;
