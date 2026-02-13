/**
 * Payment Routes
 * Customer-facing payment operations
 * Payment initiation, verification, status, and history
 */

import express from "express";
import {
  initiatePayment,
  verifyPayment,
  getPaymentStatus,
  requestRefund,
  getHotelPaymentHistory,
  getMyPayments,
  getCommissionSummary,
  getPaymentPublicKey,
} from "../../controllers/payment/paymentController.js";
import {
  authenticateUser,
  authenticateAny,
} from "../../middleware/auth.middleware.js";
import { authenticate, rbac } from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Public route - Get payment gateway public key for frontend
router.get("/public-key/:hotelId", getPaymentPublicKey);

// Customer routes - require user authentication
router.post("/initiate", authenticateUser, initiatePayment);
router.post("/verify", authenticateUser, verifyPayment);
router.get("/my-payments", authenticateUser, getMyPayments);

// Payment status - accessible by customer, manager, admin
// router.get("/:orderId/status", authenticate, getPaymentStatus);
router.get("/:orderId/status", authenticateAny, getPaymentStatus);

// Refund - Manager/Admin only
router.post(
  "/:orderId/refund",
  authenticate,
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  requestRefund
);

// Hotel payment history - Manager/Admin only
router.get(
  "/hotel/:hotelId/history",
  authenticate,
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  getHotelPaymentHistory
);

// Commission summary - Manager/Admin only
router.get(
  "/hotel/:hotelId/commission",
  authenticate,
  rbac({ roles: ["admin", "super_admin", "branch_manager"] }),
  getCommissionSummary
);

export default router;
