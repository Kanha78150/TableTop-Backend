import { Router } from "express";
import userAuthRoutes from "./auth/userAuth.route.js";
import adminAuthRoutes from "./auth/adminAuth.route.js";
import managerAuthRoutes from "./auth/managerAuth.route.js";
import staffAuthRoutes from "./auth/staffAuth.route.js";
import superAdminAuthRoutes from "./auth/superAdminAuth.route.js";
import unifiedAuthRoutes from "./auth/unifiedAuth.route.js";
import adminRoutes from "./admin.route.js";
import managerRoutes from "./manager.route.js";
import staffRoutes from "./staff.route.js";
import userRoutes from "./user.route.js";
import scanRoutes from "./scan.route.js";
import paymentRoutes from "./payment.route.js";
import assignmentRoutes from "./assignment.route.js";
import superAdminDashboardRoutes from "./superAdmin/dashboard.route.js";
import superAdminSubscriptionPlanRoutes from "./superAdmin/subscriptionPlan.route.js";
import superAdminSubscriptionJobsRoutes from "./superAdmin/subscriptionJobs.route.js";
import adminSubscriptionRoutes from "./admin/subscription.route.js";
import { getPublicSubscriptionPlans } from "../controllers/superAdmin/subscriptionPlan.controller.js";

const router = Router();

// Public routes (no authentication required)
router.get("/public/subscription-plans", getPublicSubscriptionPlans);

// Authentication routes
router.use("/auth", unifiedAuthRoutes); // Unified login endpoint
router.use("/auth/user", userAuthRoutes);
router.use("/auth/admin", adminAuthRoutes);
router.use("/auth/manager", managerAuthRoutes);
router.use("/auth/staff", staffAuthRoutes);
router.use("/auth/super-admin", superAdminAuthRoutes);

// Admin routes (authentication is handled within the admin routes)
router.use("/admin", adminRoutes);

// Super Admin routes (authentication is handled within the super admin routes)
router.use("/super-admin", superAdminDashboardRoutes);
router.use("/super-admin/plans", superAdminSubscriptionPlanRoutes);
router.use("/super-admin/subscription-jobs", superAdminSubscriptionJobsRoutes);

// Admin subscription routes
router.use("/subscription", adminSubscriptionRoutes);

// Manager routes (authentication is handled within the manager routes)
router.use("/manager", managerRoutes);

// Staff routes (authentication is handled within the staff routes)
router.use("/staff", staffRoutes);

// Assignment system routes (authentication is handled within the assignment routes)
router.use("/assignment", assignmentRoutes);

// User routes
router.use("/user", userRoutes);

// Public QR scan routes (no authentication required)
router.use("/scan", scanRoutes);

// Payment routes (Razorpay integration)
router.use("/payment", paymentRoutes);

// Health check endpoints for Cloud Run
router.get("/", (req, res) => {
  res.json({ message: "API Root 🚀", status: "ok" });
});

router.get("/health", async (req, res) => {
  // Import initialization status
  const mongoose = await import("mongoose");
  const dbStatus = mongoose.default.connection.readyState;

  const status = {
    status: "healthy",
    database: dbStatus === 1 ? "connected" : "disconnected",
    dbReadyState: dbStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };

  res.status(200).json(status);
});

// Readiness check (for checking if dependencies are ready)
router.get("/ready", async (req, res) => {
  const mongoose = await import("mongoose");
  const dbStatus = mongoose.default.connection.readyState;

  if (dbStatus !== 1) {
    return res.status(503).json({
      status: "not ready",
      database: "disconnected",
      message: "Database connection not ready",
      timestamp: new Date().toISOString(),
    });
  }

  res.status(200).json({
    status: "ready",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});

export default router;
