import {
  SubscriptionPlan,
  validateSubscriptionPlan,
  validateSubscriptionPlanUpdate,
} from "../../models/SubscriptionPlan.model.js";
import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { asyncHandler } from "../../middleware/errorHandler.middleware.js";


/**
 * Create Subscription Plan
 * Super Admin only - creates a new subscription plan
 * @route POST /api/v1/super-admin/plans
 */
export const createSubscriptionPlan = asyncHandler(async (req, res, next) => {
  // Validate request body
  const { error } = validateSubscriptionPlan(req.body);
  if (error) {
    return next(new APIError(400, error.details[0].message));
  }

  const {
    name,
    description,
    price,
    features,
    limitations,
    displayOrder,
    isActive,
  } = req.body;

  // Check if plan name already exists
  const existingPlan = await SubscriptionPlan.findOne({ name });
  if (existingPlan) {
    return next(
      new APIError(409, "A subscription plan with this name already exists")
    );
  }

  // Create new subscription plan
  const subscriptionPlan = new SubscriptionPlan({
    name,
    description,
    price,
    features: features || {},
    limitations: limitations || {},
    displayOrder: displayOrder || 0,
    isActive: isActive !== undefined ? isActive : true,
    createdBy: req.admin._id, // Super admin who created it
  });

  await subscriptionPlan.save();

  res.status(201).json(
    new APIResponse(
      201,
      {
        plan: {
          id: subscriptionPlan._id,
          planId: subscriptionPlan.planId,
          name: subscriptionPlan.name,
          description: subscriptionPlan.description,
          price: subscriptionPlan.price,
          features: subscriptionPlan.features,
          limitations: subscriptionPlan.limitations,
          isActive: subscriptionPlan.isActive,
          displayOrder: subscriptionPlan.displayOrder,
          createdAt: subscriptionPlan.createdAt,
        },
      },
      "Subscription plan created successfully"
    )
  );
  });

/**
 * Get All Subscription Plans
 * Returns all plans with pagination, search, and filter options
 * @route GET /api/v1/super-admin/plans
 */
export const getAllSubscriptionPlans = asyncHandler(async (req, res) => {
  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search || "";
  const status = req.query.status; // Can be 'active', 'inactive', or 'all'
  const sortBy = req.query.sortBy || "displayOrder";
  const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

  // Build query filter
  const filter = {};

  // Search filter (name or description)
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { planId: { $regex: search, $options: "i" } },
    ];
  }

  // Status filter
  if (status && status !== "all") {
    if (status === "active") {
      filter.isActive = true;
    } else if (status === "inactive") {
      filter.isActive = false;
    }
  }

  // Get total count
  const total = await SubscriptionPlan.countDocuments(filter);

  // Get plans with pagination
  const plans = await SubscriptionPlan.find(filter)
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate("createdBy", "name email")
    .lean();

  // Get subscriber count for each plan
  const plansWithSubscribers = await Promise.all(
    plans.map(async (plan) => {
      const activeSubscribers = await AdminSubscription.countDocuments({
        plan: plan._id,
        status: "active",
      });

      const totalSubscribers = await AdminSubscription.countDocuments({
        plan: plan._id,
      });

      return {
        ...plan,
        activeSubscribers,
        totalSubscribers,
      };
    })
  );

  res.status(200).json(
    new APIResponse(
      200,
      {
        plans: plansWithSubscribers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalPlans: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Subscription plans retrieved successfully"
    )
  );
  });

/**
 * Get Subscription Plan by ID
 * Returns detailed information about a specific plan
 * @route GET /api/v1/super-admin/plans/:planId
 */
export const getSubscriptionPlanById = asyncHandler(async (req, res, next) => {
  const { planId } = req.params;

  // Find plan by ID or planId
  const plan = await SubscriptionPlan.findOne({
    $or: [{ _id: planId }, { planId: planId }],
  })
    .populate("createdBy", "name email")
    .lean();

  if (!plan) {
    return next(new APIError(404, "Subscription plan not found"));
  }

  // Get subscriber statistics
  const activeSubscribers = await AdminSubscription.countDocuments({
    plan: plan._id,
    status: "active",
  });

  const totalSubscribers = await AdminSubscription.countDocuments({
    plan: plan._id,
  });

  const expiredSubscribers = await AdminSubscription.countDocuments({
    plan: plan._id,
    status: "expired",
  });

  const cancelledSubscribers = await AdminSubscription.countDocuments({
    plan: plan._id,
    status: "cancelled",
  });

  // Calculate total revenue from this plan
  const subscriptions = await AdminSubscription.find({
    plan: plan._id,
  }).select("paymentHistory");

  let totalRevenue = 0;
  subscriptions.forEach((subscription) => {
    subscription.paymentHistory.forEach((payment) => {
      if (payment.status === "success") {
        totalRevenue += payment.amount;
      }
    });
  });

  res.status(200).json(
    new APIResponse(
      200,
      {
        plan: {
          ...plan,
          statistics: {
            activeSubscribers,
            totalSubscribers,
            expiredSubscribers,
            cancelledSubscribers,
            totalRevenue,
          },
        },
      },
      "Subscription plan retrieved successfully"
    )
  );
  });

/**
 * Update Subscription Plan
 * Updates an existing subscription plan
 * @route PUT /api/v1/super-admin/plans/:planId
 */
export const updateSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const { planId } = req.params;

  // Validate request body
  const { error } = validateSubscriptionPlanUpdate(req.body);
  if (error) {
    return next(new APIError(400, error.details[0].message));
  }

  // Find plan by ID or planId
  const plan = await SubscriptionPlan.findOne({
    $or: [{ _id: planId }, { planId: planId }],
  });

  if (!plan) {
    return next(new APIError(404, "Subscription plan not found"));
  }

  // Check if name is being updated and if it already exists
  if (req.body.name && req.body.name !== plan.name) {
    const existingPlan = await SubscriptionPlan.findOne({
      name: req.body.name,
    });
    if (existingPlan) {
      return next(
        new APIError(409, "A subscription plan with this name already exists")
      );
    }
  }

  // Update fields
  const allowedUpdates = [
    "name",
    "description",
    "price",
    "features",
    "limitations",
    "displayOrder",
    "isActive",
  ];

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (
        field === "price" ||
        field === "features" ||
        field === "limitations"
      ) {
        // Merge nested objects instead of replacing
        plan[field] = { ...plan[field].toObject(), ...req.body[field] };
      } else {
        plan[field] = req.body[field];
      }
    }
  });

  await plan.save();

  // Get updated subscriber count
  const activeSubscribers = await AdminSubscription.countDocuments({
    plan: plan._id,
    status: "active",
  });

  res.status(200).json(
    new APIResponse(
      200,
      {
        plan: {
          id: plan._id,
          planId: plan.planId,
          name: plan.name,
          description: plan.description,
          price: plan.price,
          features: plan.features,
          limitations: plan.limitations,
          isActive: plan.isActive,
          displayOrder: plan.displayOrder,
          activeSubscribers,
          updatedAt: plan.updatedAt,
        },
      },
      "Subscription plan updated successfully"
    )
  );
  });

/**
 * Delete Subscription Plan
 * Deletes a plan only if no active subscriptions exist
 * @route DELETE /api/v1/super-admin/plans/:planId
 */
export const deleteSubscriptionPlan = asyncHandler(async (req, res, next) => {
  const { planId } = req.params;

  // Find plan by ID or planId
  const plan = await SubscriptionPlan.findOne({
    $or: [{ _id: planId }, { planId: planId }],
  });

  if (!plan) {
    return next(new APIError(404, "Subscription plan not found"));
  }

  // Check for active subscriptions
  const activeSubscriptionCount = await AdminSubscription.countDocuments({
    plan: plan._id,
    status: "active",
  });

  if (activeSubscriptionCount > 0) {
    return next(
      new APIError(
        409,
        `Cannot delete plan. ${activeSubscriptionCount} admin(s) are currently subscribed to this plan. Please wait for subscriptions to expire or be cancelled.`
      )
    );
  }

  // Check for any subscriptions (not just active)
  const totalSubscriptionCount = await AdminSubscription.countDocuments({
    plan: plan._id,
  });

  if (totalSubscriptionCount > 0) {
    // If there are historical subscriptions, just deactivate instead
    plan.isActive = false;
    await plan.save();

    return res.status(200).json(
      new APIResponse(
        200,
        {
          plan: {
            id: plan._id,
            planId: plan.planId,
            name: plan.name,
            isActive: plan.isActive,
          },
          message: `Plan has historical subscriptions and has been deactivated instead of deleted.`,
        },
        "Subscription plan deactivated successfully"
      )
    );
  }

  // Delete the plan
  await SubscriptionPlan.deleteOne({ _id: plan._id });

  res.status(200).json(
    new APIResponse(
      200,
      {
        deletedPlan: {
          id: plan._id,
          planId: plan.planId,
          name: plan.name,
        },
      },
      "Subscription plan deleted successfully"
    )
  );
  });

/**
 * Toggle Plan Status (Active/Inactive)
 * Enables or disables a subscription plan
 * @route PATCH /api/v1/super-admin/plans/:planId/toggle-status
 */
export const togglePlanStatus = asyncHandler(async (req, res, next) => {
  const { planId } = req.params;

  // Find plan by ID or planId
  const plan = await SubscriptionPlan.findOne({
    $or: [{ _id: planId }, { planId: planId }],
  });

  if (!plan) {
    return next(new APIError(404, "Subscription plan not found"));
  }

  // Toggle status
  plan.isActive = !plan.isActive;
  await plan.save();

  // Get subscriber count
  const activeSubscribers = await AdminSubscription.countDocuments({
    plan: plan._id,
    status: "active",
  });

  res.status(200).json(
    new APIResponse(
      200,
      {
        plan: {
          id: plan._id,
          planId: plan.planId,
          name: plan.name,
          isActive: plan.isActive,
          activeSubscribers,
        },
      },
      `Subscription plan ${
        plan.isActive ? "activated" : "deactivated"
      } successfully`
    )
  );
  });

/**
 * Get Admins by Plan
 * Returns all admins subscribed to a specific plan
 * @route GET /api/v1/super-admin/plans/:planId/admins
 */
export const getAdminsByPlan = asyncHandler(async (req, res, next) => {
  const { planId } = req.params;

  // Parse query parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status; // Filter by subscription status

  // Find plan by ID or planId
  const plan = await SubscriptionPlan.findOne({
    $or: [{ _id: planId }, { planId: planId }],
  });

  if (!plan) {
    return next(new APIError(404, "Subscription plan not found"));
  }

  // Build subscription filter
  const subscriptionFilter = { plan: plan._id };
  if (status) {
    subscriptionFilter.status = status;
  }

  // Get total count
  const total = await AdminSubscription.countDocuments(subscriptionFilter);

  // Get subscriptions with admin details (no .lean() so Mongoose virtuals work)
  const subscriptions = await AdminSubscription.find(subscriptionFilter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("admin", "name email phone status createdAt");

  // Format response
  const admins = subscriptions.map((subscription) => ({
    admin: subscription.admin,
    subscription: {
      id: subscription._id,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      autoRenew: subscription.autoRenew,
      usage: subscription.usage,
      daysRemaining: subscription.daysRemaining,
      isExpiringSoon: subscription.isExpiringSoon,
      isExpired: subscription.isExpired,
    },
  }));

  res.status(200).json(
    new APIResponse(
      200,
      {
        plan: {
          id: plan._id,
          planId: plan.planId,
          name: plan.name,
        },
        admins,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalSubscribers: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
      "Admins retrieved successfully"
    )
  );
  });

// Public endpoint - No authentication required
export const getPublicSubscriptionPlans = asyncHandler(async (req, res) => {
  // Get only active plans
  const plans = await SubscriptionPlan.find({ isActive: true })
    .select("-createdBy -__v -createdAt -updatedAt") // Exclude sensitive fields
    .sort({ displayOrder: 1, "price.monthly": 1 })
    .lean();

  // Format response for public consumption
  const publicPlans = plans.map((plan) => ({
    id: plan._id,
    planId: plan.planId,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    features: plan.features,
    limitations: plan.limitations,
    displayOrder: plan.displayOrder,
  }));

  return res
    .status(200)
    .json(
      new APIResponse(
        200,
        { plans: publicPlans, totalPlans: publicPlans.length },
        "Public subscription plans retrieved successfully"
      )
    );
  });
