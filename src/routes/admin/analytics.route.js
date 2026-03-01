import express from "express";
import {
  getDashboardOverview,
  getSalesReport,
  getProfitLossReport,
  getCustomerAnalytics,
  getBestSellingItems,
} from "../../controllers/admin/analytics.controller.js";
import { rbac } from "../../middleware/roleAuth.middleware.js";
import {
  requireActiveSubscription,
  requireFeature,
} from "../../middleware/subscriptionAuth.middleware.js";

const router = express.Router();

// Dashboard
router.get(
  "/dashboard",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getDashboardOverview
);

// Sales Reports
router.get(
  "/reports/sales",
  rbac({ permissions: ["viewReports"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getSalesReport
);

// Profit & Loss Reports
router.get(
  "/reports/profit-loss",
  rbac({ permissions: ["viewFinancials"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getProfitLossReport
);

// Customer Analytics
router.get(
  "/analytics/customers",
  rbac({ permissions: ["viewAnalytics"] }),
  requireActiveSubscription,
  requireFeature("analyticsAccess"),
  getCustomerAnalytics
);

// Best Selling Items
router.get(
  "/reports/best-sellers",
  rbac({ permissions: ["viewReports"] }),
  getBestSellingItems
);

export default router;
