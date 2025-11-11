import express from "express";
import {
  getAvailablePlans,
  selectSubscriptionPlan,
  activateSubscription,
  getMySubscription,
  getMyUsageStats,
  cancelSubscription,
  renewSubscription,
  upgradePlan,
  syncUsage,
} from "../../controllers/admin/subscription.controller.js";
import {
  handleSubscriptionWebhook,
  verifySubscriptionPayment,
} from "../../controllers/payment/subscriptionWebhook.controller.js";
import {
  authenticateAdmin,
  requireAdmin,
  requireAdminOrSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

/**
 * @route   GET /api/v1/subscription/plans
 * @desc    Get all available subscription plans for admins
 * @access  Private (Admin)
 * @query   { isActive }
 * @returns { plans[] }
 */
router.get("/plans", authenticateAdmin, requireAdmin, getAvailablePlans);

/**
 * @route   POST /api/v1/subscription/select
 * @desc    Select a subscription plan and create payment order
 * @access  Private (Admin)
 * @body    { subscriptionPlanId }
 * @returns { subscription, paymentOrder }
 */
router.post("/select", authenticateAdmin, requireAdmin, selectSubscriptionPlan);

/**
 * @route   GET /api/v1/subscription/my-subscription
 * @desc    Get admin's current subscription details
 * @access  Private (Admin or Super Admin)
 * @returns { subscription, plan }
 */
router.get(
  "/my-subscription",
  authenticateAdmin,
  requireAdminOrSuperAdmin,
  getMySubscription
);

/**
 * @route   GET /api/v1/subscription/usage
 * @desc    Get admin's subscription usage statistics
 * @access  Private (Admin)
 * @returns { usage, warnings }
 */
router.get("/usage", authenticateAdmin, requireAdmin, getMyUsageStats);

/**
 * @route   POST /api/v1/subscription/cancel
 * @desc    Cancel current subscription
 * @access  Private (Admin)
 * @returns { subscription }
 */
router.post("/cancel", authenticateAdmin, requireAdmin, cancelSubscription);

/**
 * @route   POST /api/v1/subscription/renew
 * @desc    Renew expired subscription with same plan
 * @access  Private (Admin)
 * @returns { subscription, paymentOrder }
 */
router.post("/renew", authenticateAdmin, requireAdmin, renewSubscription);

/**
 * @route   POST /api/v1/subscription/upgrade
 * @desc    Upgrade to a higher-tier subscription plan
 * @access  Private (Admin)
 * @body    { newPlanId }
 * @returns { subscription, paymentOrder }
 */
router.post("/upgrade", authenticateAdmin, requireAdmin, upgradePlan);

/**
 * @route   POST /api/v1/payment/webhook
 * @desc    Handle Razorpay webhook for subscription payments
 * @access  Public (Webhook)
 * @body    Razorpay webhook payload with signature
 * @returns { success }
 */
router.post("/payment/webhook", handleSubscriptionWebhook);

/**
 * @route   POST /api/v1/payment/verify
 * @desc    Manually verify subscription payment
 * @access  Private (Admin)
 * @body    { razorpayPaymentId, razorpayOrderId, razorpaySignature }
 * @returns { subscription }
 */
router.post(
  "/payment/verify",
  authenticateAdmin,
  requireAdmin,
  verifySubscriptionPayment
);

/**
 * @route   POST /api/v1/subscription/sync-usage
 * @desc    Sync subscription usage counters with actual database counts
 * @access  Private (Admin)
 * @returns { usage_counts }
 */
router.post("/sync-usage", authenticateAdmin, requireAdmin, syncUsage);

export default router;
