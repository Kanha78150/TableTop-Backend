/**
 * Payment Configuration Routes
 * Routes for managing payment gateway configurations
 * Admin/Manager access only
 */

import express from "express";
import {
  getPaymentConfig,
  setupPaymentConfig,
  togglePaymentConfig,
  testPaymentConfig,
  deletePaymentConfig,
  getSupportedProviders,
  activateProductionConfig,
  deactivateConfig,
  getPendingApprovals,
  requestDeactivation,
} from "../../controllers/payment/paymentConfigController.js";
import { authenticate, rbac } from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Public route - get supported providers
router.get("/providers", getSupportedProviders);

// Protected routes - require authentication
router.use(authenticate);

// Super Admin only - View all pending approvals
router.get(
  "/pending-approvals",
  rbac({ roles: ["super_admin"] }),
  getPendingApprovals
);

// Admin/Manager only routes
router.get(
  "/:hotelId",
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  getPaymentConfig
);
router.post(
  "/:hotelId",
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  setupPaymentConfig
);
router.patch(
  "/:hotelId/toggle",
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  togglePaymentConfig
);
router.post(
  "/:hotelId/test",
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  testPaymentConfig
);

// Admin/Manager - Request deactivation of production gateway
router.post(
  "/:hotelId/request-deactivation",
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  requestDeactivation
);

// Super Admin only routes - Production activation/deactivation
router.post(
  "/:hotelId/activate",
  rbac({ roles: ["super_admin"] }),
  activateProductionConfig
);
router.post(
  "/:hotelId/deactivate",
  rbac({ roles: ["super_admin"] }),
  deactivateConfig
);

// Admin only route - Delete configuration
router.delete(
  "/:hotelId",
  rbac({ roles: ["admin", "super_admin"] }),
  deletePaymentConfig
);

export default router;
