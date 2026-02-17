import { Admin } from "../../models/Admin.model.js";
import { SubscriptionPlan } from "../../models/SubscriptionPlan.model.js";
import { AdminSubscription } from "../../models/AdminSubscription.model.js";
import { APIResponse } from "../../utils/APIResponse.js";
import { APIError } from "../../utils/APIError.js";
import { sendEmail } from "../../utils/emailService.js";
import { paymentService } from "../../services/payment.service.js";

/**
 * Get Available Plans
 * Returns active subscription plans for admins to choose from
 * @route GET /api/v1/admin/subscription/plans
 */
export const getAvailablePlans = async (req, res, next) => {
  try {
    // Query active plans only
    const plans = await SubscriptionPlan.find({ isActive: true })
      .sort({ displayOrder: 1, "price.monthly": 1 })
      .select("-createdAt -updatedAt -__v")
      .lean();

    // Get subscriber count for each plan
    const plansWithStats = await Promise.all(
      plans.map(async (plan) => {
        const subscriberCount = await AdminSubscription.countDocuments({
          plan: plan._id,
          status: "active",
        });

        return {
          ...plan,
          subscriberCount,
          popular: subscriberCount > 10, // Mark as popular if > 10 subscribers
        };
      })
    );

    res.status(200).json(
      new APIResponse(
        200,
        {
          plans: plansWithStats,
          totalPlans: plansWithStats.length,
        },
        "Available subscription plans retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Select Subscription Plan
 * Admin selects a subscription plan and creates pending subscription
 * @route POST /api/v1/admin/subscription/select
 */
export const selectSubscriptionPlan = async (req, res, next) => {
  try {
    const { planId, billingCycle } = req.body;
    const adminId = req.user._id;

    // Validate input
    if (!planId || !billingCycle) {
      return next(new APIError(400, "Plan ID and billing cycle are required"));
    }

    if (!["monthly", "yearly"].includes(billingCycle)) {
      return next(new APIError(400, "Billing cycle must be monthly or yearly"));
    }

    // Find the plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) {
      return next(new APIError(404, "Subscription plan not found"));
    }

    if (!plan.isActive) {
      return next(new APIError(400, "This subscription plan is not available"));
    }

    // Check if admin already has an active subscription
    const existingSubscription = await AdminSubscription.findOne({
      admin: adminId,
      status: { $in: ["active", "pending_payment"] },
    });

    if (existingSubscription) {
      if (existingSubscription.status === "active") {
        return next(
          new APIError(
            400,
            "You already have an active subscription. Please cancel or wait for it to expire before selecting a new plan."
          )
        );
      }
      if (existingSubscription.status === "pending_payment") {
        return next(
          new APIError(
            400,
            "You have a pending payment. Please complete or cancel it before selecting a new plan."
          )
        );
      }
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date(startDate);
    if (billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Calculate amount
    const amount =
      billingCycle === "monthly" ? plan.price.monthly : plan.price.yearly;

    // Create subscription record with pending_payment status
    const subscription = new AdminSubscription({
      admin: adminId,
      plan: planId,
      status: "pending_payment",
      billingCycle,
      startDate,
      endDate,
      autoRenew: false,
      usage: {
        hotels: 0,
        branches: 0,
        managers: 0,
        staff: 0,
        tables: 0,
        ordersThisMonth: 0,
        storageUsedGB: 0,
      },
    });

    await subscription.save();

    // Populate plan details for response
    await subscription.populate("plan");

    // Create Razorpay payment order
    const paymentOrder = await paymentService.createSubscriptionPaymentOrder({
      subscriptionId: subscription._id.toString(),
      amount,
      planName: plan.name,
      billingCycle,
    });

    res.status(201).json(
      new APIResponse(
        201,
        {
          subscription: {
            id: subscription._id,
            plan: subscription.plan,
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            amount,
          },
          paymentOrder: {
            orderId: paymentOrder.orderId,
            amount: paymentOrder.amount,
            currency: paymentOrder.currency,
            key: paymentOrder.key,
          },
        },
        "Subscription plan selected successfully. Please proceed with payment."
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Activate Subscription
 * Activates a subscription after successful payment (called by webhook)
 * @route POST /api/v1/admin/subscription/activate
 */
export const activateSubscription = async (req, res, next) => {
  try {
    const { subscriptionId, paymentDetails } = req.body;

    // Validate input
    if (!subscriptionId || !paymentDetails) {
      return next(
        new APIError(400, "Subscription ID and payment details are required")
      );
    }

    // Find subscription
    const subscription =
      await AdminSubscription.findById(subscriptionId).populate("plan admin");

    if (!subscription) {
      return next(new APIError(404, "Subscription not found"));
    }

    if (subscription.status !== "pending_payment") {
      return next(
        new APIError(400, "This subscription is not pending payment")
      );
    }

    // Update subscription status to active
    subscription.status = "active";
    subscription.startDate = new Date();

    // Recalculate end date from actual activation date
    const endDate = new Date(subscription.startDate);
    if (subscription.billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    subscription.endDate = endDate;

    // Add payment to history
    subscription.paymentHistory.push({
      amount: paymentDetails.amount,
      currency: paymentDetails.currency || "INR",
      paymentMethod: paymentDetails.paymentMethod || "razorpay",
      transactionId: paymentDetails.transactionId,
      paymentDate: new Date(),
      status: "success",
    });

    // Initialize usage counters (already initialized but ensure they're zero)
    subscription.usage = {
      hotels: 0,
      branches: 0,
      managers: 0,
      staff: 0,
      tables: 0,
      ordersThisMonth: 0,
      storageUsedGB: 0,
    };

    await subscription.save();

    // Update admin's subscription reference
    await Admin.findByIdAndUpdate(subscription.admin._id, {
      subscription: subscription._id,
    });

    // Send activation email
    try {
      await sendEmail(subscription.admin.email, "subscription-activated", {
        adminName: subscription.admin.name,
        planName: subscription.plan.name,
        startDate: subscription.startDate.toLocaleDateString(),
        endDate: subscription.endDate.toLocaleDateString(),
        amount: paymentDetails.amount,
      });
    } catch (emailError) {
      console.error("Failed to send activation email:", emailError);
      // Don't fail the activation if email fails
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          subscription: {
            id: subscription._id,
            plan: subscription.plan,
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            usage: subscription.usage,
          },
        },
        "Subscription activated successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get My Subscription
 * Returns current admin's subscription details
 * @route GET /api/v1/admin/subscription/my-subscription
 */
export const getMySubscription = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    // Find subscription
    const subscription = await AdminSubscription.findOne({
      admin: adminId,
      status: { $in: ["active", "pending_payment"] },
    })
      .populate("plan")
      .lean();

    if (!subscription) {
      return res.status(200).json(
        new APIResponse(
          200,
          {
            subscription: null,
            hasSubscription: false,
          },
          "No active subscription found"
        )
      );
    }

    // Calculate days remaining
    const daysRemaining = Math.max(
      0,
      Math.ceil(
        (new Date(subscription.endDate) - new Date()) / (1000 * 60 * 60 * 24)
      )
    );

    // Check if expiring soon (within 7 days)
    const isExpiringSoon = daysRemaining > 0 && daysRemaining <= 7;

    res.status(200).json(
      new APIResponse(
        200,
        {
          subscription: {
            ...subscription,
            daysRemaining,
            isExpiringSoon,
            isExpired: subscription.status === "expired",
          },
          hasSubscription: true,
        },
        "Subscription retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Get My Usage Stats
 * Returns current admin's subscription usage statistics
 * @route GET /api/v1/admin/subscription/usage
 */
export const getMyUsageStats = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    // Find active or pending subscription
    const subscription = await AdminSubscription.findOne({
      admin: adminId,
      status: { $in: ["active", "pending_payment"] },
    }).populate("plan");

    if (!subscription) {
      return next(new APIError(404, "No active subscription found"));
    }

    const plan = subscription.plan;
    const usage = subscription.usage;

    // Calculate usage percentages
    const usageStats = {
      hotels: {
        used: usage.hotels,
        limit: plan.features.maxHotels,
        percentage: (usage.hotels / plan.features.maxHotels) * 100,
        available: plan.features.maxHotels - usage.hotels,
      },
      branches: {
        used: usage.branches,
        limit: plan.features.maxBranches,
        percentage: (usage.branches / plan.features.maxBranches) * 100,
        available: plan.features.maxBranches - usage.branches,
      },
      managers: {
        used: usage.managers,
        limit: plan.features.maxManagers,
        percentage: (usage.managers / plan.features.maxManagers) * 100,
        available: plan.features.maxManagers - usage.managers,
      },
      staff: {
        used: usage.staff,
        limit: plan.features.maxStaff,
        percentage: (usage.staff / plan.features.maxStaff) * 100,
        available: plan.features.maxStaff - usage.staff,
      },
      tables: {
        used: usage.tables,
        limit: plan.features.maxTables,
        percentage: (usage.tables / plan.features.maxTables) * 100,
        available: plan.features.maxTables - usage.tables,
      },
      ordersThisMonth: {
        used: usage.ordersThisMonth,
        limit: plan.limitations.ordersPerMonth,
        percentage:
          (usage.ordersThisMonth / plan.limitations.ordersPerMonth) * 100,
        available: plan.limitations.ordersPerMonth - usage.ordersThisMonth,
      },
      storage: {
        used: usage.storageUsedGB,
        limit: plan.limitations.storageGB,
        percentage: (usage.storageUsedGB / plan.limitations.storageGB) * 100,
        available: plan.limitations.storageGB - usage.storageUsedGB,
      },
    };

    // Check for resources nearing limit (>80%)
    const warnings = [];
    Object.entries(usageStats).forEach(([resource, stats]) => {
      if (stats.percentage >= 80 && stats.percentage < 100) {
        warnings.push({
          resource,
          message: `${resource} usage is at ${stats.percentage.toFixed(
            1
          )}%. Consider upgrading your plan.`,
        });
      } else if (stats.percentage >= 100) {
        warnings.push({
          resource,
          message: `${resource} limit reached. Upgrade your plan to add more.`,
        });
      }
    });

    res.status(200).json(
      new APIResponse(
        200,
        {
          plan: {
            name: plan.name,
            billingCycle: subscription.billingCycle,
          },
          usage: usageStats,
          warnings,
        },
        "Usage statistics retrieved successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Cancel Subscription
 * Cancels current admin's active subscription
 * @route POST /api/v1/admin/subscription/cancel
 */
export const cancelSubscription = async (req, res, next) => {
  try {
    const adminId = req.user._id;
    const { reason } = req.body;

    // Find active subscription
    const subscription = await AdminSubscription.findOne({
      admin: adminId,
      status: "active",
    }).populate("admin plan");

    if (!subscription) {
      return next(new APIError(404, "No active subscription found"));
    }

    // Update status to cancelled
    subscription.status = "cancelled";
    subscription.autoRenew = false;

    // Add cancellation note to payment history
    subscription.paymentHistory.push({
      amount: 0,
      currency: "INR",
      paymentMethod: "cancellation",
      transactionId: `CANCEL-${Date.now()}`,
      paymentDate: new Date(),
      status: "cancelled",
      notes: reason || "Subscription cancelled by admin",
    });

    await subscription.save();

    // Send cancellation email
    try {
      await sendEmail(subscription.admin.email, "subscription-cancelled", {
        adminName: subscription.admin.name,
        planName: subscription.plan?.name || "Your plan",
        cancellationDate: new Date().toLocaleDateString(),
        accessUntil: subscription.endDate.toLocaleDateString(),
      });
    } catch (emailError) {
      console.error("Failed to send cancellation email:", emailError);
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          subscription: {
            id: subscription._id,
            status: subscription.status,
            endDate: subscription.endDate,
            message:
              "Your subscription has been cancelled. You will retain access until the end of your billing period.",
          },
        },
        "Subscription cancelled successfully"
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Renew Subscription
 * Creates payment order for subscription renewal
 * @route POST /api/v1/admin/subscription/renew
 */
export const renewSubscription = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    // Find subscription (can be expired or active)
    const subscription = await AdminSubscription.findOne({
      admin: adminId,
      status: { $in: ["active", "expired"] },
    })
      .sort({ endDate: -1 })
      .populate("plan");

    if (!subscription) {
      return next(new APIError(404, "No subscription found to renew"));
    }

    // Check if plan is still active
    if (!subscription.plan.isActive) {
      return next(
        new APIError(
          400,
          "This subscription plan is no longer available. Please select a different plan."
        )
      );
    }

    // Calculate amount based on billing cycle
    const amount =
      subscription.billingCycle === "monthly"
        ? subscription.plan.price.monthly
        : subscription.plan.price.yearly;

    // Calculate new dates
    const startDate = new Date();
    const endDate = new Date(startDate);
    if (subscription.billingCycle === "monthly") {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    res.status(200).json(
      new APIResponse(
        200,
        {
          subscription: {
            id: subscription._id,
            plan: subscription.plan,
            billingCycle: subscription.billingCycle,
            newStartDate: startDate,
            newEndDate: endDate,
          },
          payment: {
            amount,
            currency: "INR",
            description: `${subscription.plan.name} - ${subscription.billingCycle} renewal`,
          },
        },
        "Renewal details generated. Please proceed with payment."
      )
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Upgrade/Downgrade Plan
 * Changes subscription plan (with prorated calculation for upgrades)
 * @route POST /api/v1/admin/subscription/upgrade
 */
export const upgradePlan = async (req, res, next) => {
  try {
    const { newPlanId, immediate } = req.body;
    const adminId = req.user._id;

    // Validate input
    if (!newPlanId) {
      return next(new APIError(400, "New plan ID is required"));
    }

    // Find current subscription
    const subscription = await AdminSubscription.findOne({
      admin: adminId,
      status: "active",
    }).populate("plan");

    if (!subscription) {
      return next(new APIError(404, "No active subscription found"));
    }

    // Find new plan
    const newPlan = await SubscriptionPlan.findById(newPlanId);
    if (!newPlan) {
      return next(new APIError(404, "New subscription plan not found"));
    }

    if (!newPlan.isActive) {
      return next(new APIError(400, "The selected plan is not available"));
    }

    // Check if it's the same plan
    if (subscription.plan._id.toString() === newPlanId) {
      return next(new APIError(400, "You are already subscribed to this plan"));
    }

    const currentPlan = subscription.plan;
    const billingCycle = subscription.billingCycle;

    // Calculate current and new plan prices
    const currentPrice =
      billingCycle === "monthly"
        ? currentPlan.price.monthly
        : currentPlan.price.yearly;
    const newPrice =
      billingCycle === "monthly" ? newPlan.price.monthly : newPlan.price.yearly;

    const isUpgrade = newPrice > currentPrice;
    const planChangeType = isUpgrade ? "upgrade" : "downgrade";

    // Calculate prorated amount for upgrade
    let proratedAmount = 0;
    if (isUpgrade && immediate) {
      // Calculate remaining days in current period
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      const totalPeriodDays = billingCycle === "monthly" ? 30 : 365;
      const remainingDays = Math.max(
        0,
        Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
      );

      // Calculate unused amount from current plan
      const unusedAmount = (currentPrice / totalPeriodDays) * remainingDays;

      // Calculate prorated amount for new plan
      const newPlanDailyRate = newPrice / totalPeriodDays;
      proratedAmount = newPlanDailyRate * remainingDays - unusedAmount;
      proratedAmount = Math.max(0, proratedAmount);
    }

    if (immediate) {
      // Immediate plan change
      subscription.plan = newPlanId;

      if (isUpgrade) {
        // For upgrade, add payment history entry
        subscription.paymentHistory.push({
          amount: proratedAmount,
          currency: "INR",
          paymentMethod: "upgrade",
          transactionId: `UPGRADE-${Date.now()}`,
          paymentDate: new Date(),
          status: "success",
          notes: `Upgraded from ${currentPlan.name} to ${newPlan.name}`,
        });
      } else {
        // For downgrade, just change the plan (takes effect at next billing)
        subscription.paymentHistory.push({
          amount: 0,
          currency: "INR",
          paymentMethod: "downgrade",
          transactionId: `DOWNGRADE-${Date.now()}`,
          paymentDate: new Date(),
          status: "success",
          notes: `Downgraded from ${currentPlan.name} to ${newPlan.name}`,
        });
      }

      await subscription.save();

      return res.status(200).json(
        new APIResponse(
          200,
          {
            subscription: {
              id: subscription._id,
              plan: newPlan,
              billingCycle: subscription.billingCycle,
              status: subscription.status,
              changeType: planChangeType,
            },
            payment: isUpgrade
              ? {
                  amount: proratedAmount,
                  currency: "INR",
                  description: `Prorated amount for ${planChangeType}`,
                }
              : null,
          },
          `Plan ${planChangeType}d successfully${
            isUpgrade ? ". Please complete the payment." : "."
          }`
        )
      );
    } else {
      // Schedule plan change for next billing cycle
      return res.status(200).json(
        new APIResponse(
          200,
          {
            currentPlan: currentPlan,
            newPlan: newPlan,
            changeType: planChangeType,
            effectiveDate: subscription.endDate,
            message: `Your plan will be ${planChangeType}d to ${
              newPlan.name
            } at the end of your current billing period (${subscription.endDate.toLocaleDateString()}).`,
            priceDifference: {
              current: currentPrice,
              new: newPrice,
              difference: newPrice - currentPrice,
            },
          },
          "Plan change scheduled successfully"
        )
      );
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Sync Usage
 * Syncs subscription usage counters with actual database counts
 * Useful for fixing discrepancies
 * @route POST /api/v1/subscription/sync-usage
 */
export const syncUsage = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const { syncResourceUsage } =
      await import("../../middleware/subscriptionAuth.middleware.js");

    // Sync all resource types
    const resourceTypes = ["hotels", "branches", "managers", "staff", "tables"];
    const results = {};

    for (const resourceType of resourceTypes) {
      try {
        const subscription = await syncResourceUsage(adminId, resourceType);
        results[resourceType] = {
          success: true,
          count: subscription.usage[resourceType],
        };
      } catch (error) {
        results[resourceType] = {
          success: false,
          error: error.message,
        };
      }
    }

    res
      .status(200)
      .json(
        new APIResponse(200, results, "Usage counters synced with database")
      );
  } catch (error) {
    next(error);
  }
};
