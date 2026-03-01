// src/routes/manager/dashboard.route.js - Manager Dashboard & Profile Routes
import express from "express";
import { upload } from "../../middleware/multer.middleware.js";
import {
  requireRole,
  requireManagerOrHigher,
  requirePermission,
  rateLimitSensitiveOps,
} from "../../middleware/roleAuth.middleware.js";
import {
  getDashboard,
  getBranchAnalytics,
  getManagerProfile,
  updateManagerProfile,
  changePassword,
} from "../../controllers/manager/dashboard.controller.js";

const router = express.Router();

router.get("/dashboard", requireRole(["branch_manager"]), getDashboard);

router.get(
  "/analytics",
  requireRole(["branch_manager"]),
  requirePermission("viewBranchAnalytics"),
  getBranchAnalytics
);

router.get("/profile", requireManagerOrHigher, getManagerProfile);

router.put(
  "/profile",
  requireManagerOrHigher,
  upload.single("profileImage"),
  updateManagerProfile
);

router.put(
  "/change-password",
  requireManagerOrHigher,
  rateLimitSensitiveOps,
  changePassword
);

export default router;
