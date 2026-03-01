import mongoose from "mongoose";

const coinSettingsSchema = new mongoose.Schema(
  {
    // Admin who owns this coin settings configuration (ISOLATION)
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    // Minimum order value to earn coins (Admin configurable)
    minimumOrderValue: {
      type: Number,
      required: true,
      min: 0,
    },

    // Coin value configuration (Admin configurable)
    coinValue: {
      type: Number,
      required: true,
      min: 0.01,
    },

    // How many coins earned per rupee spent (Admin configurable)
    coinsPerRupee: {
      type: Number,
      required: true,
      min: 0,
      max: 50,
    },

    // Maximum coins that can be earned per order (Admin configurable)
    maxCoinsPerOrder: {
      type: Number,
      required: true,
      min: 0,
    },

    // Maximum percentage of user's coin balance that can be used per order (Admin configurable)
    maxCoinUsagePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    // Coin expiry settings (Admin configurable, 0 means no expiry)
    coinExpiryDays: {
      type: Number,
      required: true,
      min: 0,
    },

    // Admin who last updated the settings (same as adminId for first creation)
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true, // Now required since we have admin isolation
    },

    // Last update timestamp for 48-hour restriction
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },

    // Whether coin system is active
    isActive: {
      type: Boolean,
      default: true,
    },

    // Settings history for audit trail
    history: [
      {
        minimumOrderValue: Number,
        coinValue: Number,
        coinsPerRupee: Number,
        maxCoinsPerOrder: Number,
        maxCoinUsagePercent: Number,
        coinExpiryDays: Number,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Admin",
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        reason: String, // Reason for the update
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Create compound index for admin isolation
coinSettingsSchema.index({ adminId: 1 }, { unique: true });

// Static method to get settings for specific admin (ISOLATED)
coinSettingsSchema.statics.getCurrentSettings = async function (adminId) {
  if (!adminId) {
    throw new Error("Admin ID is required for isolated coin settings");
  }
  const settings = await this.findOne({ adminId });
  return settings; // Return null if admin hasn't configured settings yet
};

// Static method to create initial settings for specific admin (ISOLATED)
coinSettingsSchema.statics.createInitialSettings = async function (
  settingsData,
  adminId
) {
  if (!adminId) {
    throw new Error("Admin ID is required for isolated coin settings");
  }

  // Check if admin already has settings
  const existingSettings = await this.findOne({ adminId });
  if (existingSettings) {
    throw new Error("Admin already has coin settings configured");
  }

  const settings = await this.create({
    ...settingsData,
    adminId: adminId, // Link to specific admin
    updatedBy: adminId,
    lastUpdatedAt: new Date(),
  });
  return settings;
};

// Static method to get settings for order processing (by hotel/admin context)
coinSettingsSchema.statics.getSettingsForOrder = async function (adminId) {
  if (!adminId) {
    return null; // No admin context = no coin earning
  }
  return await this.findOne({ adminId, isActive: true });
};

// Method to check if settings can be updated (2-minute rule - TEMPORARY FOR TESTING)
coinSettingsSchema.methods.canUpdate = function () {
  if (!this.lastUpdatedAt) return true;

  const minutesSinceLastUpdate =
    (Date.now() - this.lastUpdatedAt.getTime()) / (1000 * 60);
  return minutesSinceLastUpdate >= 2; // Changed from 48 hours to 2 minutes
};

// Method to update settings with history tracking
coinSettingsSchema.methods.updateSettings = function (
  newSettings,
  adminId,
  reason = ""
) {
  // Save current settings to history
  this.history.push({
    minimumOrderValue: this.minimumOrderValue,
    coinValue: this.coinValue,
    coinsPerRupee: this.coinsPerRupee,
    maxCoinsPerOrder: this.maxCoinsPerOrder,
    maxCoinUsagePercent: this.maxCoinUsagePercent,
    coinExpiryDays: this.coinExpiryDays,
    updatedBy: this.updatedBy,
    updatedAt: this.lastUpdatedAt,
    reason: reason,
  });

  // Update settings
  Object.assign(this, newSettings);
  this.updatedBy = adminId;
  this.lastUpdatedAt = new Date();

  return this.save();
};

// Method to calculate coins earned for an order
coinSettingsSchema.methods.calculateCoinsEarned = function (orderValue) {
  if (!this.isActive || orderValue < this.minimumOrderValue) {
    return 0;
  }

  const baseCoins = Math.floor(orderValue * this.coinsPerRupee);
  return Math.min(baseCoins, this.maxCoinsPerOrder);
};

// Method to calculate maximum coins usable based on user's coin balance
coinSettingsSchema.methods.getMaxCoinsUsable = function (
  userCoinBalance,
  orderValue = null
) {
  if (!this.isActive) return 0;

  // Calculate maximum coins based on percentage of user's total coin balance
  const maxCoinsFromBalance = Math.floor(
    (userCoinBalance * this.maxCoinUsagePercent) / 100
  );

  // If order value is provided, also ensure we don't exceed order value
  if (orderValue) {
    const maxCoinsFromOrderValue = Math.floor(orderValue / this.coinValue);
    return Math.min(maxCoinsFromBalance, maxCoinsFromOrderValue);
  }

  return maxCoinsFromBalance;
};

export const CoinSettings = mongoose.model("CoinSettings", coinSettingsSchema);

// Validation schemas
// Validators extracted to src/validators/coinsettings.validators.js
export { coinSettingsValidationSchemas } from "../validators/coinsettings.validators.js";
