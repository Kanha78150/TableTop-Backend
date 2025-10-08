import mongoose from "mongoose";
import Joi from "joi";

const coinSettingsSchema = new mongoose.Schema(
  {
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
      max: 1,
    },

    // Maximum coins that can be earned per order (Admin configurable)
    maxCoinsPerOrder: {
      type: Number,
      required: true,
      min: 0,
    },

    // Maximum percentage of order value that can be paid with coins (Admin configurable)
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

    // Admin who last updated the settings
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: false, // Not required for initial system setup
      default: null,
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

// Note: MongoDB automatically creates unique _id index, no need to override it
// We rely on application logic to ensure only one settings document exists

// Static method to get current settings
coinSettingsSchema.statics.getCurrentSettings = async function () {
  const settings = await this.findOne();
  return settings; // Return null if no settings exist - admin must configure first
};

// Static method to create initial settings (admin must provide all values)
coinSettingsSchema.statics.createInitialSettings = async function (
  settingsData,
  adminId
) {
  const settings = await this.create({
    ...settingsData,
    updatedBy: adminId,
    lastUpdatedAt: new Date(),
  });
  return settings;
};

// Method to check if settings can be updated (48-hour rule)
coinSettingsSchema.methods.canUpdate = function () {
  if (!this.lastUpdatedAt) return true;

  const hoursSinceLastUpdate =
    (Date.now() - this.lastUpdatedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastUpdate >= 48;
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

// Method to calculate maximum coins usable for an order
coinSettingsSchema.methods.getMaxCoinsUsable = function (orderValue) {
  if (!this.isActive) return 0;

  const maxAmount = (orderValue * this.maxCoinUsagePercent) / 100;
  return Math.floor(maxAmount / this.coinValue);
};

export const CoinSettings = mongoose.model("CoinSettings", coinSettingsSchema);

// Validation schemas
export const coinSettingsValidationSchemas = {
  create: Joi.object({
    minimumOrderValue: Joi.number().min(0).required(),
    coinValue: Joi.number().min(0.01).required(),
    coinsPerRupee: Joi.number().min(0).max(1).required(),
    maxCoinsPerOrder: Joi.number().min(0).required(),
    maxCoinUsagePercent: Joi.number().min(0).max(100).required(),
    coinExpiryDays: Joi.number().min(0).required(),
    isActive: Joi.boolean().optional().default(true),
    reason: Joi.string().max(500).optional(),
  }),

  update: Joi.object({
    minimumOrderValue: Joi.number().min(0).optional(),
    coinValue: Joi.number().min(0.01).optional(),
    coinsPerRupee: Joi.number().min(0).max(1).optional(),
    maxCoinsPerOrder: Joi.number().min(0).optional(),
    maxCoinUsagePercent: Joi.number().min(0).max(100).optional(),
    coinExpiryDays: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
    reason: Joi.string().max(500).optional(),
  }),
};
