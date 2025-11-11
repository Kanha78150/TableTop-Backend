import mongoose from "mongoose";
import Joi from "joi";

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Plan name is required"],
      unique: true,
      trim: true,
      maxlength: [100, "Plan name cannot exceed 100 characters"],
    },
    planId: {
      type: String,
      unique: true,
    },
    description: {
      type: String,
      required: [true, "Plan description is required"],
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    price: {
      monthly: {
        type: Number,
        required: [true, "Monthly price is required"],
        min: [0, "Price cannot be negative"],
      },
      yearly: {
        type: Number,
        required: [true, "Yearly price is required"],
        min: [0, "Price cannot be negative"],
      },
    },
    features: {
      // Resource Limits
      maxHotels: {
        type: Number,
        default: 1,
        min: [1, "Must allow at least 1 hotel"],
      },
      maxBranches: {
        type: Number,
        default: 1,
        min: [1, "Must allow at least 1 branch"],
      },
      maxManagers: {
        type: Number,
        default: 5,
        min: [1, "Must allow at least 1 manager"],
      },
      maxStaff: {
        type: Number,
        default: 20,
        min: [1, "Must allow at least 1 staff member"],
      },
      maxTables: {
        type: Number,
        default: 50,
        min: [1, "Must allow at least 1 table"],
      },

      // Feature Flags
      analyticsAccess: {
        type: Boolean,
        default: false,
      },
      advancedReports: {
        type: Boolean,
        default: false,
      },
      coinSystem: {
        type: Boolean,
        default: false,
      },
      offerManagement: {
        type: Boolean,
        default: false,
      },
      multipleLocations: {
        type: Boolean,
        default: false,
      },
      inventoryManagement: {
        type: Boolean,
        default: false,
      },
      orderAssignment: {
        type: Boolean,
        default: false,
      },
      qrCodeGeneration: {
        type: Boolean,
        default: false,
      },
      customBranding: {
        type: Boolean,
        default: false,
      },
      apiAccess: {
        type: Boolean,
        default: false,
      },
      prioritySupport: {
        type: Boolean,
        default: false,
      },
    },
    limitations: {
      ordersPerMonth: {
        type: Number,
        default: 1000,
        min: [0, "Orders limit cannot be negative"],
      },
      storageGB: {
        type: Number,
        default: 5,
        min: [1, "Storage must be at least 1 GB"],
      },
      customReports: {
        type: Number,
        default: 0,
        min: [0, "Custom reports cannot be negative"],
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
      min: [0, "Display order cannot be negative"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Creator is required"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Pre-save hook to auto-generate planId
subscriptionPlanSchema.pre("save", async function (next) {
  if (!this.isNew) return next();

  try {
    const count = await this.constructor.countDocuments();
    this.planId = `PLAN-${String(count + 1).padStart(4, "0")}`;
    next();
  } catch (error) {
    next(error);
  }
});

// Indexes for better performance (name and planId already have unique indexes)
subscriptionPlanSchema.index({ isActive: 1 });
subscriptionPlanSchema.index({ displayOrder: 1 });

// Virtual to get active subscriber count
subscriptionPlanSchema.virtual("activeSubscribers", {
  ref: "AdminSubscription",
  localField: "_id",
  foreignField: "plan",
  count: true,
  match: { status: "active" },
});

export const SubscriptionPlan = mongoose.model(
  "SubscriptionPlan",
  subscriptionPlanSchema
);

// Validation schema for creating/updating subscription plans
export const validateSubscriptionPlan = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100).required().messages({
      "string.min": "Plan name must be at least 3 characters",
      "string.max": "Plan name cannot exceed 100 characters",
      "any.required": "Plan name is required",
    }),
    description: Joi.string().min(10).max(500).required().messages({
      "string.min": "Description must be at least 10 characters",
      "string.max": "Description cannot exceed 500 characters",
      "any.required": "Description is required",
    }),
    price: Joi.object({
      monthly: Joi.number().min(0).required().messages({
        "number.min": "Monthly price cannot be negative",
        "any.required": "Monthly price is required",
      }),
      yearly: Joi.number().min(0).required().messages({
        "number.min": "Yearly price cannot be negative",
        "any.required": "Yearly price is required",
      }),
    }).required(),
    features: Joi.object({
      maxHotels: Joi.number().min(1).required(),
      maxBranches: Joi.number().min(1).required(),
      maxManagers: Joi.number().min(1).required(),
      maxStaff: Joi.number().min(1).required(),
      maxTables: Joi.number().min(1).required(),
      analyticsAccess: Joi.boolean().optional(),
      advancedReports: Joi.boolean().optional(),
      coinSystem: Joi.boolean().optional(),
      offerManagement: Joi.boolean().optional(),
      multipleLocations: Joi.boolean().optional(),
      inventoryManagement: Joi.boolean().optional(),
      orderAssignment: Joi.boolean().optional(),
      qrCodeGeneration: Joi.boolean().optional(),
      customBranding: Joi.boolean().optional(),
      apiAccess: Joi.boolean().optional(),
      prioritySupport: Joi.boolean().optional(),
    }).optional(),
    limitations: Joi.object({
      ordersPerMonth: Joi.number().min(0).optional(),
      storageGB: Joi.number().min(1).optional(),
      customReports: Joi.number().min(0).optional(),
    }).optional(),
    displayOrder: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

// Validation for updating plan
export const validateSubscriptionPlanUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100).optional(),
    description: Joi.string().min(10).max(500).optional(),
    price: Joi.object({
      monthly: Joi.number().min(0).optional(),
      yearly: Joi.number().min(0).optional(),
    }).optional(),
    features: Joi.object({
      maxHotels: Joi.number().min(1).optional(),
      maxBranches: Joi.number().min(1).optional(),
      maxManagers: Joi.number().min(1).optional(),
      maxStaff: Joi.number().min(1).optional(),
      maxTables: Joi.number().min(1).optional(),
      analyticsAccess: Joi.boolean().optional(),
      advancedReports: Joi.boolean().optional(),
      coinSystem: Joi.boolean().optional(),
      offerManagement: Joi.boolean().optional(),
      multipleLocations: Joi.boolean().optional(),
      inventoryManagement: Joi.boolean().optional(),
      orderAssignment: Joi.boolean().optional(),
      qrCodeGeneration: Joi.boolean().optional(),
      customBranding: Joi.boolean().optional(),
      apiAccess: Joi.boolean().optional(),
      prioritySupport: Joi.boolean().optional(),
    }).optional(),
    limitations: Joi.object({
      ordersPerMonth: Joi.number().min(0).optional(),
      storageGB: Joi.number().min(1).optional(),
      customReports: Joi.number().min(0).optional(),
    }).optional(),
    displayOrder: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
  });
  return schema.validate(data);
};
