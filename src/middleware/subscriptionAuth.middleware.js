import { APIError } from "../utils/APIError.js";
import { AdminSubscription } from "../models/AdminSubscription.model.js";

/**
 * Middleware to check if admin has an active subscription
 * Super admins bypass all subscription checks
 */
export const requireActiveSubscription = async (req, res, next) => {
  try {
    // Super admin bypasses subscription checks
    if (req.userRole === "super_admin") {
      return next();
    }

    // Check if user is an admin
    if (req.userType !== "admin") {
      return next(
        new APIError(403, "Subscription required for this operation")
      );
    }

    // Find active subscription for the admin
    const subscription = await AdminSubscription.findActiveSubscription(
      req.admin._id
    );

    if (!subscription) {
      return next(
        new APIError(
          403,
          "No active subscription found. Please subscribe to a plan to access this feature."
        )
      );
    }

    // Check if subscription has expired
    if (subscription.isExpired) {
      return next(
        new APIError(
          403,
          "Your subscription has expired. Please renew to continue using this feature."
        )
      );
    }

    // Attach subscription to request for later use
    req.subscription = subscription;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware factory to check if admin's subscription plan has a specific feature
 * @param {string} featureName - The feature name to check (e.g., 'analyticsAccess', 'coinSystem')
 * @returns {Function} Express middleware function
 */
export const requireFeature = (featureName) => {
  return async (req, res, next) => {
    try {
      // Super admin bypasses all feature checks
      if (req.userRole === "super_admin") {
        return next();
      }

      // Check if user is an admin
      if (req.userType !== "admin") {
        return next(new APIError(403, "Admin access required"));
      }

      // Use subscription from request if already fetched
      let subscription = req.subscription;

      // If not fetched, get it now
      if (!subscription) {
        subscription = await AdminSubscription.findActiveSubscription(
          req.admin._id
        );

        if (!subscription) {
          return next(
            new APIError(
              403,
              "No active subscription found. Please subscribe to a plan."
            )
          );
        }

        req.subscription = subscription;
      }

      // Check if feature is available in the plan
      const hasFeature = await subscription.hasFeature(featureName);

      if (!hasFeature) {
        return next(
          new APIError(
            403,
            `This feature is not available in your current plan. Please upgrade your subscription to access "${featureName}".`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware factory to check if admin has reached their resource limit
 * @param {string} resourceType - The resource type to check ('hotels', 'branches', 'managers', 'staff', 'tables')
 * @returns {Function} Express middleware function
 */
export const checkResourceLimit = (resourceType) => {
  return async (req, res, next) => {
    try {
      // Super admin bypasses all resource limits
      if (req.userRole === "super_admin") {
        return next();
      }

      // Check if user is an admin
      if (req.userType !== "admin") {
        return next(new APIError(403, "Admin access required"));
      }

      // Use subscription from request if already fetched
      let subscription = req.subscription;

      // If not fetched, get it now
      if (!subscription) {
        subscription = await AdminSubscription.findActiveSubscription(
          req.admin._id
        );

        if (!subscription) {
          return next(
            new APIError(
              403,
              "No active subscription found. Please subscribe to a plan."
            )
          );
        }

        req.subscription = subscription;
      }

      // Check if limit is reached
      const limitReached = await subscription.isLimitReached(resourceType);

      if (limitReached) {
        await subscription.populate("plan");
        const resourceKey = `max${
          resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
        }`;
        const limit = subscription.plan.features[resourceKey];
        const current = subscription.usage[resourceType];

        return next(
          new APIError(
            403,
            `You have reached your ${resourceType} limit (${current}/${limit}). Please upgrade your plan to add more ${resourceType}.`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Helper function to update resource usage after successful creation
 * Call this in controllers after creating hotels, branches, managers, staff, or tables
 * @param {string} adminId - The admin's ID
 * @param {string} resourceType - The resource type ('hotels', 'branches', 'managers', 'staff', 'tables')
 * @param {number} increment - The amount to increment (default: 1)
 * @returns {Promise<Object>} Updated subscription
 */
export const updateResourceUsage = async (
  adminId,
  resourceType,
  increment = 1
) => {
  try {
    const subscription = await AdminSubscription.findActiveSubscription(
      adminId
    );

    if (!subscription) {
      throw new APIError(404, "No active subscription found");
    }

    // Update the usage counter
    subscription.usage[resourceType] =
      (subscription.usage[resourceType] || 0) + increment;

    await subscription.save();

    return subscription;
  } catch (error) {
    throw error;
  }
};

/**
 * Sync resource usage with actual database count
 * Use this to fix discrepancies between usage counter and actual data
 * @param {string} adminId - The admin's ID
 * @param {string} resourceType - The resource type ('hotels', 'branches', 'managers', 'staff', 'tables')
 * @returns {Promise<Object>} Updated subscription
 */
export const syncResourceUsage = async (adminId, resourceType) => {
  try {
    const subscription = await AdminSubscription.findActiveSubscription(
      adminId
    );

    if (!subscription) {
      throw new APIError(404, "No active subscription found");
    }

    // Import models dynamically to avoid circular dependencies
    const { Hotel } = await import("../models/Hotel.model.js");
    const { Branch } = await import("../models/Branch.model.js");
    const { Manager } = await import("../models/Manager.model.js");
    const { Staff } = await import("../models/Staff.model.js");
    const { Table } = await import("../models/Table.model.js");

    let actualCount = 0;

    // Count actual resources in database
    switch (resourceType) {
      case "hotels":
        actualCount = await Hotel.countDocuments({ createdBy: adminId });
        break;
      case "branches":
        const hotels = await Hotel.find({ createdBy: adminId }).select("_id");
        const hotelIds = hotels.map((h) => h._id);
        actualCount = await Branch.countDocuments({ hotel: { $in: hotelIds } });
        break;
      case "managers":
        actualCount = await Manager.countDocuments({ createdBy: adminId });
        break;
      case "staff":
        actualCount = await Staff.countDocuments({ createdBy: adminId });
        break;
      case "tables":
        const allHotels = await Hotel.find({ createdBy: adminId }).select(
          "_id"
        );
        const allHotelIds = allHotels.map((h) => h._id);
        actualCount = await Table.countDocuments({
          hotel: { $in: allHotelIds },
        });
        break;
      default:
        throw new Error(`Unknown resource type: ${resourceType}`);
    }

    // Update usage with actual count
    subscription.usage[resourceType] = actualCount;
    await subscription.save();

    console.log(
      `✅ Synced ${resourceType} usage: ${actualCount} (was: ${
        subscription.usage[resourceType] || 0
      })`
    );

    return subscription;
  } catch (error) {
    console.error(`Failed to sync ${resourceType} usage:`, error.message);
    throw error;
  }
};

/**
 * Helper function to decrease resource usage after deletion
 * Call this in controllers after deleting hotels, branches, managers, staff, or tables
 * @param {string} adminId - The admin's ID
 * @param {string} resourceType - The resource type ('hotels', 'branches', 'managers', 'staff', 'tables')
 * @param {number} decrement - The amount to decrement (default: 1)
 * @returns {Promise<Object>} Updated subscription
 */
export const decreaseResourceUsage = async (
  adminId,
  resourceType,
  decrement = 1
) => {
  try {
    const subscription = await AdminSubscription.findActiveSubscription(
      adminId
    );

    if (!subscription) {
      // If no subscription, skip silently (might be super admin or subscription deleted)
      return null;
    }

    // Decrease the usage counter, but don't go below 0
    subscription.usage[resourceType] = Math.max(
      0,
      (subscription.usage[resourceType] || 0) - decrement
    );

    await subscription.save();

    return subscription;
  } catch (error) {
    // Log error but don't throw - deletion should succeed even if usage update fails
    console.error(
      `Failed to decrease resource usage for ${resourceType}:`,
      error.message
    );
    return null;
  }
};

/**
 * Helper function to increment order counter for monthly tracking
 * @param {string} adminId - The admin's ID
 * @param {number} increment - The amount to increment (default: 1)
 * @returns {Promise<Object>} Updated subscription
 */
export const incrementOrderCount = async (adminId, increment = 1) => {
  try {
    const subscription = await AdminSubscription.findActiveSubscription(
      adminId
    );

    if (!subscription) {
      // Skip silently if no subscription
      return null;
    }

    // Increment orders this month
    subscription.usage.ordersThisMonth =
      (subscription.usage.ordersThisMonth || 0) + increment;

    await subscription.save();

    return subscription;
  } catch (error) {
    console.error("Failed to increment order count:", error.message);
    return null;
  }
};

/**
 * Helper function to update storage usage
 * @param {string} adminId - The admin's ID
 * @param {number} storageGB - The storage amount in GB to add (can be negative for removal)
 * @returns {Promise<Object>} Updated subscription
 */
export const updateStorageUsage = async (adminId, storageGB) => {
  try {
    const subscription = await AdminSubscription.findActiveSubscription(
      adminId
    );

    if (!subscription) {
      return null;
    }

    // Update storage usage, but don't go below 0
    subscription.usage.storageUsedGB = Math.max(
      0,
      (subscription.usage.storageUsedGB || 0) + storageGB
    );

    await subscription.save();

    return subscription;
  } catch (error) {
    console.error("Failed to update storage usage:", error.message);
    return null;
  }
};

/**
 * Middleware to check if admin has storage space available
 * @param {number} requiredGB - The amount of GB required for the operation
 * @returns {Function} Express middleware function
 */
export const checkStorageLimit = (requiredGB) => {
  return async (req, res, next) => {
    try {
      // Super admin bypasses storage limits
      if (req.userRole === "super_admin") {
        return next();
      }

      if (req.userType !== "admin") {
        return next(new APIError(403, "Admin access required"));
      }

      let subscription = req.subscription;

      if (!subscription) {
        subscription = await AdminSubscription.findActiveSubscription(
          req.admin._id
        );

        if (!subscription) {
          return next(new APIError(403, "No active subscription found"));
        }

        req.subscription = subscription;
      }

      await subscription.populate("plan");

      const availableStorage =
        subscription.plan.limitations.storageGB -
        (subscription.usage.storageUsedGB || 0);

      if (availableStorage < requiredGB) {
        return next(
          new APIError(
            403,
            `Insufficient storage space. Required: ${requiredGB}GB, Available: ${availableStorage.toFixed(
              2
            )}GB. Please upgrade your plan.`
          )
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check monthly order limit
 * Super admins bypass this check
 */
export const checkMonthlyOrderLimit = async (req, res, next) => {
  try {
    // Super admin bypasses order limits
    if (req.userRole === "super_admin") {
      return next();
    }

    if (req.userType !== "admin") {
      return next(new APIError(403, "Admin access required"));
    }

    let subscription = req.subscription;

    if (!subscription) {
      subscription = await AdminSubscription.findActiveSubscription(
        req.admin._id
      );

      if (!subscription) {
        return next(new APIError(403, "No active subscription found"));
      }

      req.subscription = subscription;
    }

    await subscription.populate("plan");

    const currentOrders = subscription.usage.ordersThisMonth || 0;
    const orderLimit = subscription.plan.limitations.ordersPerMonth;

    if (currentOrders >= orderLimit) {
      return next(
        new APIError(
          403,
          `You have reached your monthly order limit (${currentOrders}/${orderLimit}). Please upgrade your plan or wait until next month.`
        )
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
