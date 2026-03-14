import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      required: [true, "Offer code is required"],
      uppercase: true,
      trim: true,
      maxlength: [20, "Offer code cannot exceed 20 characters"],
    },
    title: {
      type: String,
      required: [true, "Offer title is required"],
      trim: true,
      maxlength: [100, "Offer title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      default: "",
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    discountType: {
      type: String,
      enum: {
        values: ["flat", "percent"],
        message: "Discount type must be either flat or percent",
      },
      required: [true, "Discount type is required"],
    },
    discountValue: {
      type: Number,
      required: [true, "Discount value is required"],
      min: [0, "Discount value cannot be negative"],
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: [0, "Minimum order value cannot be negative"],
    },
    maxDiscountAmount: {
      type: Number,
      min: [0, "Maximum discount amount cannot be negative"],
    },
    usageLimit: {
      type: Number,
      min: [1, "Usage limit must be at least 1"],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: [0, "Used count cannot be negative"],
    },
    userUsageLimit: {
      type: Number,
      default: 1,
      min: [1, "User usage limit must be at least 1"],
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Scope - what the offer applies to
    applicableFor: {
      type: String,
      enum: {
        values: ["all", "category", "item", "hotel", "branch"],
        message:
          "Applicable for must be one of: all, category, item, hotel, branch",
      },
      default: "all",
    },
    // Hotel/Branch Identification
    hotelId: {
      type: String,
      required: [true, "Hotel ID is required"],
      match: [/^HTL-\d{4}-\d{5}$/, "Invalid hotel ID format"],
      index: true,
    },
    branchId: {
      type: String,
      match: [/^BRN-[A-Z0-9]+-\d{5}$/, "Invalid branch ID format"],
      index: true,
    },
    // References (populated from hotelId/branchId)
    hotel: {
      type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
      ref: "Hotel",
    },
    branch: {
      type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String
      ref: "Branch",
    },
    foodCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodCategory",
    },
    foodItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodItem",
    },
    // Days of week when offer is valid (0=Sunday, 6=Saturday)
    validDays: [
      {
        type: Number,
        min: 0,
        max: 6,
      },
    ],
    // Time range when offer is valid
    validTimeRange: {
      startTime: { type: String }, // HH:MM format
      endTime: { type: String }, // HH:MM format
    },
    // Multiple time slots when offer is valid
    validTimeSlots: [
      {
        startTime: { type: String }, // HH:MM format
        endTime: { type: String }, // HH:MM format
      },
    ],
    // Terms and conditions
    terms: {
      type: String,
      maxlength: [1000, "Terms cannot exceed 1000 characters"],
    },
    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: [true, "Created by is required"],
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
offerSchema.index({ isActive: 1 });
offerSchema.index({ expiryDate: 1 });
offerSchema.index({ startDate: 1 });
offerSchema.index({ hotel: 1 });
offerSchema.index({ branch: 1 });
offerSchema.index({ foodCategory: 1 });
offerSchema.index({ foodItem: 1 });
offerSchema.index({ applicableFor: 1 });
offerSchema.index({ createdBy: 1 });

// Compound indexes
offerSchema.index({ isActive: 1, expiryDate: 1 });
offerSchema.index({ hotel: 1, branch: 1 });

// Virtual for checking if offer is expired
offerSchema.virtual("isExpired").get(function () {
  return new Date() > this.expiryDate;
});

// Virtual for checking if offer is currently valid
offerSchema.virtual("isCurrentlyValid").get(function () {
  const now = new Date();
  return (
    this.isActive &&
    now >= this.startDate &&
    now <= this.expiryDate &&
    (!this.usageLimit || this.usedCount < this.usageLimit)
  );
});

// Virtual for usage percentage
offerSchema.virtual("usagePercentage").get(function () {
  if (!this.usageLimit) return 0;
  return Math.round((this.usedCount / this.usageLimit) * 100);
});

// Pre-save middleware for validation
offerSchema.pre("save", function (next) {
  // Validate discount value for percentage type
  if (this.discountType === "percent" && this.discountValue > 100) {
    return next(new Error("Percentage discount cannot exceed 100%"));
  }

  // Validate date range
  if (this.startDate && this.expiryDate && this.startDate >= this.expiryDate) {
    return next(new Error("Start date must be before expiry date"));
  }

  // Validate time range
  if (this.validTimeRange?.startTime && this.validTimeRange?.endTime) {
    const startTime = this.validTimeRange.startTime;
    const endTime = this.validTimeRange.endTime;

    if (
      !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(startTime) ||
      !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(endTime)
    ) {
      return next(new Error("Time must be in HH:MM format"));
    }
  }

  // Validate scope-specific references
  if (this.applicableFor === "hotel" && !this.hotel) {
    return next(
      new Error("Hotel reference is required when applicable for hotel")
    );
  }

  if (this.applicableFor === "branch" && !this.branch) {
    return next(
      new Error("Branch reference is required when applicable for branch")
    );
  }

  if (this.applicableFor === "category" && !this.foodCategory) {
    return next(
      new Error(
        "Food category reference is required when applicable for category"
      )
    );
  }

  if (this.applicableFor === "item" && !this.foodItem) {
    return next(
      new Error("Food item reference is required when applicable for item")
    );
  }

  if (this.applicableFor === "item" && !this.foodCategory) {
    return next(
      new Error("Food category reference is required when applicable for item")
    );
  }

  next();
});

export const Offer = mongoose.model("Offer", offerSchema);

// Enhanced validation schemas
// Validators extracted to src/validators/offer.validators.js
export { offerValidationSchemas, validateOffer } from "../validators/offer.validators.js";
