import express from "express";
import {
  getOrderStatusDistribution,
  getCustomerRatings,
  getTableUtilization,
  getBookingTrends,
  getStaffPerformance,
  getComplaintsSummary,
  getCoinActivity,
} from "../../controllers/admin/dashboard.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  requireFeature,
} from "../../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

const dashboardAuth = [
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
];

// Order Status Distribution (Pie Chart)
router.get("/order-status", ...dashboardAuth, getOrderStatusDistribution);

// Customer Ratings (Multi-Dimensional)
router.get("/customer-ratings", ...dashboardAuth, getCustomerRatings);

// Table Utilization (Hourly)
router.get("/table-utilization", ...dashboardAuth, getTableUtilization);

// Booking Trends (Weekly Comparison)
router.get("/booking-trends", ...dashboardAuth, getBookingTrends);

// Staff Performance
router.get("/staff-performance", ...dashboardAuth, getStaffPerformance);

// Complaints Summary
router.get("/complaints-summary", ...dashboardAuth, getComplaintsSummary);

// Coin & Reward Activity
router.get("/coin-activity", ...dashboardAuth, getCoinActivity);

export default router;
