import mongoose from "mongoose";
import { getNextSequence } from "./Counter.model.js";

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

// Pre-save hook to auto-generate planId using atomic counter (race-condition safe)
subscriptionPlanSchema.pre("save", async function (next) {
  if (!this.isNew) return next();

  try {
    const seq = await getNextSequence("subscriptionPlan");
    this.planId = `PLAN-${String(seq).padStart(4, "0")}`;
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
// Validators extracted to src/validators/subscriptionplan.validators.js
export { validateSubscriptionPlan, validateSubscriptionPlanUpdate } from "../validators/subscriptionplan.validators.js";
