import mongoose from "mongoose";
import Joi from "joi";

const adminSubscriptionSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Admin reference is required"],
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: [true, "Subscription plan reference is required"],
    },
    status: {
      type: String,
      enum: {
        values: [
          "active",
          "expired",
          "cancelled",
          "pending_payment",
          "archived",
        ],
        message:
          "Status must be active, expired, cancelled, pending_payment, or archived",
      },
      default: "pending_payment",
    },
    billingCycle: {
      type: String,
      enum: {
        values: ["monthly", "yearly"],
        message: "Billing cycle must be monthly or yearly",
      },
      required: [true, "Billing cycle is required"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    paymentHistory: [
      {
        amount: {
          type: Number,
          required: true,
          min: [0, "Amount cannot be negative"],
        },
        paymentDate: {
          type: Date,
          default: Date.now,
        },
        transactionId: {
          type: String,
          required: true,
        },
        paymentMethod: {
          type: String,
          enum: ["razorpay", "stripe", "paypal", "bank_transfer", "other"],
          default: "razorpay",
        },
        status: {
          type: String,
          enum: ["success", "failed", "pending", "refunded"],
          default: "success",
        },
        currency: {
          type: String,
          default: "INR",
        },
        invoiceUrl: {
          type: String,
          default: null,
        },
        notes: {
          type: String,
          maxlength: [500, "Notes cannot exceed 500 characters"],
        },
      },
    ],
    usage: {
      hotels: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
      branches: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
      managers: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
      staff: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
      tables: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
      ordersThisMonth: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
      storageUsedGB: {
        type: Number,
        default: 0,
        min: [0, "Usage cannot be negative"],
      },
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    cancellationReason: {
      type: String,
      maxlength: [500, "Cancellation reason cannot exceed 500 characters"],
    },
    cancelledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual to check if subscription is expiring soon (within 7 days)
adminSubscriptionSchema.virtual("isExpiringSoon").get(function () {
  if (this.status !== "active") return false;
  const daysUntilExpiry = Math.ceil(
    (this.endDate - new Date()) / (1000 * 60 * 60 * 24)
  );
  return daysUntilExpiry > 0 && daysUntilExpiry <= 7;
});

// Virtual to check if subscription has expired
adminSubscriptionSchema.virtual("isExpired").get(function () {
  return new Date() > this.endDate;
});

// Virtual to get days remaining
adminSubscriptionSchema.virtual("daysRemaining").get(function () {
  if (this.status !== "active") return 0;
  const days = Math.ceil((this.endDate - new Date()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
});

// Pre-save middleware to update lastUpdated
adminSubscriptionSchema.pre("save", function (next) {
  this.lastUpdated = new Date();
  next();
});

// Indexes for better performance
adminSubscriptionSchema.index({ admin: 1 });
adminSubscriptionSchema.index({ plan: 1 });
adminSubscriptionSchema.index({ status: 1 });
adminSubscriptionSchema.index({ endDate: 1 });
adminSubscriptionSchema.index({ admin: 1, status: 1 }); // Compound index

// Static method to find active subscription for admin
adminSubscriptionSchema.statics.findActiveSubscription = function (adminId) {
  return this.findOne({ admin: adminId, status: "active" }).populate("plan");
};

// Static method to find expiring subscriptions
adminSubscriptionSchema.statics.findExpiring = function (days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: "active",
    endDate: {
      $gte: new Date(),
      $lte: futureDate,
    },
  })
    .populate("admin", "name email")
    .populate("plan", "name");
};

// Static method to find expired subscriptions
adminSubscriptionSchema.statics.findExpired = function () {
  return this.find({
    status: "active",
    endDate: { $lt: new Date() },
  })
    .populate("admin", "name email")
    .populate("plan", "name");
};

// Method to check if resource limit is reached
adminSubscriptionSchema.methods.isLimitReached = async function (resourceType) {
  await this.populate("plan");

  const resourceKey = `max${
    resourceType.charAt(0).toUpperCase() + resourceType.slice(1)
  }`;
  const limit = this.plan.features[resourceKey];
  const current = this.usage[resourceType] || 0;

  return current >= limit;
};

// Method to check if feature is available
adminSubscriptionSchema.methods.hasFeature = async function (featureName) {
  await this.populate("plan");
  return this.plan.features[featureName] === true;
};

export const AdminSubscription = mongoose.model(
  "AdminSubscription",
  adminSubscriptionSchema
);

// Validation schema for creating subscription
export const validateSubscription = (data) => {
  const schema = Joi.object({
    admin: Joi.string().required().messages({
      "any.required": "Admin ID is required",
    }),
    plan: Joi.string().required().messages({
      "any.required": "Plan ID is required",
    }),
    billingCycle: Joi.string().valid("monthly", "yearly").required().messages({
      "any.only": "Billing cycle must be monthly or yearly",
      "any.required": "Billing cycle is required",
    }),
    startDate: Joi.date().required().messages({
      "any.required": "Start date is required",
    }),
    endDate: Joi.date().greater(Joi.ref("startDate")).required().messages({
      "date.greater": "End date must be after start date",
      "any.required": "End date is required",
    }),
    autoRenew: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

// Validation schema for payment record
export const validatePayment = (data) => {
  const schema = Joi.object({
    amount: Joi.number().min(0).required().messages({
      "number.min": "Amount cannot be negative",
      "any.required": "Amount is required",
    }),
    transactionId: Joi.string().required().messages({
      "any.required": "Transaction ID is required",
    }),
    paymentMethod: Joi.string()
      .valid("razorpay", "stripe", "paypal", "bank_transfer", "other")
      .optional(),
    status: Joi.string()
      .valid("success", "failed", "pending", "refunded")
      .optional(),
    currency: Joi.string().optional(),
    invoiceUrl: Joi.string().uri().optional(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

// Validation schema for selecting subscription plan
export const validatePlanSelection = (data) => {
  const schema = Joi.object({
    planId: Joi.string().required().messages({
      "any.required": "Plan ID is required",
    }),
    billingCycle: Joi.string().valid("monthly", "yearly").required().messages({
      "any.only": "Billing cycle must be monthly or yearly",
      "any.required": "Billing cycle is required",
    }),
  });
  return schema.validate(data);
};

// Validation schema for cancellation
export const validateCancellation = (data) => {
  const schema = Joi.object({
    reason: Joi.string().max(500).required().messages({
      "string.max": "Reason cannot exceed 500 characters",
      "any.required": "Cancellation reason is required",
    }),
  });
  return schema.validate(data);
};
