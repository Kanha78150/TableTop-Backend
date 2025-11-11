import { Router } from "express";
import userAuthRoutes from "./auth/userAuth.route.js";
import adminAuthRoutes from "./auth/adminAuth.route.js";
import managerAuthRoutes from "./auth/managerAuth.route.js";
import staffAuthRoutes from "./auth/staffAuth.route.js";
import superAdminAuthRoutes from "./auth/superAdminAuth.route.js";
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

const router = Router();

// Authentication routes
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

// User routes (you might want to add authentication middleware here)
router.use("/user", userRoutes);

// Public QR scan routes (no authentication required)
router.use("/scan", scanRoutes);

// Payment routes (Razorpay integration)
router.use("/payment", paymentRoutes);

// Health check
router.get("/", (req, res) => {
  res.json({ message: "API Root 🚀" });
});

export default router;
