import express from "express";
import {
  createSubscriptionPlan,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  togglePlanStatus,
  getAdminsByPlan,
} from "../../controllers/superAdmin/subscriptionPlan.controller.js";
import {
  authenticateAdmin,
  requireSuperAdmin,
} from "../../middleware/roleAuth.middleware.js";

const router = express.Router();

// Apply authentication and super admin authorization to all routes
router.use(authenticateAdmin, requireSuperAdmin);

/**
 * @route   POST /api/v1/super-admin/plans
 * @desc    Create a new subscription plan
 * @access  Private (Super Admin)
 * @body    { name, description, price, features, limitations }
 */
router.post("/", createSubscriptionPlan);

/**
 * @route   GET /api/v1/super-admin/plans
 * @desc    Get all subscription plans with filters
 * @access  Private (Super Admin)
 * @query   { page, limit, search, isActive, sortBy, sortOrder }
 * @returns { plans[], pagination, stats }
 */
router.get("/", getAllSubscriptionPlans);

/**
 * @route   GET /api/v1/super-admin/plans/:planId
 * @desc    Get subscription plan by ID with statistics
 * @access  Private (Super Admin)
 * @params  { planId }
 * @returns { plan, stats }
 */
router.get("/:planId", getSubscriptionPlanById);

/**
 * @route   PUT /api/v1/super-admin/plans/:planId
 * @desc    Update subscription plan
 * @access  Private (Super Admin)
 * @params  { planId }
 * @body    { name, description, price, features, limitations }
 */
router.put("/:planId", updateSubscriptionPlan);

/**
 * @route   DELETE /api/v1/super-admin/plans/:planId
 * @desc    Delete subscription plan (soft delete if has subscriptions)
 * @access  Private (Super Admin)
 * @params  { planId }
 */
router.delete("/:planId", deleteSubscriptionPlan);

/**
 * @route   PATCH /api/v1/super-admin/plans/:planId/toggle-status
 * @desc    Toggle plan active/inactive status
 * @access  Private (Super Admin)
 * @params  { planId }
 * @returns { plan }
 */
router.patch("/:planId/toggle-status", togglePlanStatus);

/**
 * @route   GET /api/v1/super-admin/plans/:planId/admins
 * @desc    Get all admins subscribed to a specific plan
 * @access  Private (Super Admin)
 * @params  { planId }
 * @query   { page, limit, status }
 * @returns { admins[], pagination }
 */
router.get("/:planId/admins", getAdminsByPlan);

export default router;
