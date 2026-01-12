// src/models/Review.model.js - Review and Rating Model
import mongoose from "mongoose";
import Joi from "joi";
import { getNextCounter } from "../utils/idGenerator.js";

const reviewSchema = new mongoose.Schema(
  {
    reviewId: {
      type: String,
      unique: true,
      trim: true,
      // Will be auto-generated in pre-save middleware (REV-YYYYMMDD-00001)
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: [true, "Order is required"],
      index: true,
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel is required"],
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      index: true,
    },
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      index: true,
      // Optional - populated from order.staff if order was served by staff
    },

    // Rating Fields (all required, 1-5 stars)
    foodRating: {
      type: Number,
      required: [true, "Food rating is required"],
      min: [1, "Food rating must be at least 1"],
      max: [5, "Food rating cannot exceed 5"],
    },
    hotelRating: {
      type: Number,
      required: [true, "Hotel rating is required"],
      min: [1, "Hotel rating must be at least 1"],
      max: [5, "Hotel rating cannot exceed 5"],
    },
    branchRating: {
      type: Number,
      required: [true, "Branch rating is required"],
      min: [1, "Branch rating must be at least 1"],
      max: [5, "Branch rating cannot exceed 5"],
    },
    staffRating: {
      type: Number,
      required: [true, "Staff rating is required"],
      min: [1, "Staff rating must be at least 1"],
      max: [5, "Staff rating cannot exceed 5"],
    },

    // Review Content
    comment: {
      type: String,
      trim: true,
      minlength: [10, "Comment must be at least 10 characters"],
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },

    // Status and Moderation
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be pending, approved, or rejected",
      },
      default: "pending",
      index: true,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    moderatedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      maxlength: [500, "Rejection reason cannot exceed 500 characters"],
    },

    // Helpfulness System
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    helpfulVotes: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        helpful: {
          type: Boolean,
          required: true,
        },
        votedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Admin Response
    response: {
      message: {
        type: String,
        minlength: [10, "Response message must be at least 10 characters"],
        maxlength: [500, "Response message cannot exceed 500 characters"],
      },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
      respondedAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field: Overall Rating (average of all 4 ratings)
reviewSchema.virtual("overallRating").get(function () {
  return parseFloat(
    (
      (this.foodRating +
        this.hotelRating +
        this.branchRating +
        this.staffRating) /
      4
    ).toFixed(2)
  );
});

// Virtual field: Is Editable (can only edit if not approved)
reviewSchema.virtual("isEditable").get(function () {
  return this.status !== "approved";
});

// Compound unique index: One review per user per order
reviewSchema.index({ user: 1, order: 1 }, { unique: true });

// Index for querying helpful votes by user
reviewSchema.index({ "helpfulVotes.user": 1 });

// Pre-save middleware to auto-generate reviewId
reviewSchema.pre("save", async function (next) {
  if (!this.reviewId && this.isNew) {
    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
      const prefix = `REV-${dateStr}`;
      const counter = await getNextCounter(
        this.constructor,
        "reviewId",
        prefix
      );
      this.reviewId = `${prefix}-${String(counter).padStart(5, "0")}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Instance method: Check if user has voted
reviewSchema.methods.hasUserVoted = function (userId) {
  return this.helpfulVotes.some((vote) => vote.user.equals(userId));
};

// Instance method: Get user's vote
reviewSchema.methods.getUserVote = function (userId) {
  return this.helpfulVotes.find((vote) => vote.user.equals(userId));
};

// Instance method: Update helpful count
reviewSchema.methods.updateHelpfulCount = function () {
  this.helpfulCount = this.helpfulVotes.filter((vote) => vote.helpful).length;
};

export const Review = mongoose.model("Review", reviewSchema);

// Validation Schemas using Joi

/**
 * Validate review creation
 */
export const validateCreateReview = (data) => {
  const schema = Joi.object({
    orderId: Joi.string().length(24).hex().required().messages({
      "string.length": "Order ID must be 24 characters",
      "string.hex": "Order ID must be valid",
      "any.required": "Order ID is required",
    }),
    foodRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Food rating must be at least 1",
      "number.max": "Food rating cannot exceed 5",
      "any.required": "Food rating is required",
    }),
    hotelRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Hotel rating must be at least 1",
      "number.max": "Hotel rating cannot exceed 5",
      "any.required": "Hotel rating is required",
    }),
    branchRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Branch rating must be at least 1",
      "number.max": "Branch rating cannot exceed 5",
      "any.required": "Branch rating is required",
    }),
    staffRating: Joi.number().integer().min(1).max(5).required().messages({
      "number.min": "Staff rating must be at least 1",
      "number.max": "Staff rating cannot exceed 5",
      "any.required": "Staff rating is required",
    }),
    comment: Joi.string()
      .min(10)
      .max(1000)
      .trim()
      .optional()
      .allow("")
      .messages({
        "string.min": "Comment must be at least 10 characters",
        "string.max": "Comment cannot exceed 1000 characters",
      }),
  });
  return schema.validate(data);
};

/**
 * Validate review update
 */
export const validateUpdateReview = (data) => {
  const schema = Joi.object({
    foodRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Food rating must be at least 1",
      "number.max": "Food rating cannot exceed 5",
    }),
    hotelRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Hotel rating must be at least 1",
      "number.max": "Hotel rating cannot exceed 5",
    }),
    branchRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Branch rating must be at least 1",
      "number.max": "Branch rating cannot exceed 5",
    }),
    staffRating: Joi.number().integer().min(1).max(5).optional().messages({
      "number.min": "Staff rating must be at least 1",
      "number.max": "Staff rating cannot exceed 5",
    }),
    comment: Joi.string()
      .min(10)
      .max(1000)
      .trim()
      .optional()
      .allow("")
      .messages({
        "string.min": "Comment must be at least 10 characters",
        "string.max": "Comment cannot exceed 1000 characters",
      }),
  }).min(1); // At least one field must be provided
  return schema.validate(data);
};

/**
 * Validate helpful vote
 */
export const validateHelpfulVote = (data) => {
  const schema = Joi.object({
    helpful: Joi.boolean().required().messages({
      "any.required": "Helpful value is required",
      "boolean.base": "Helpful must be a boolean value",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate admin response
 */
export const validateAdminResponse = (data) => {
  const schema = Joi.object({
    message: Joi.string().min(10).max(500).trim().required().messages({
      "string.min": "Response message must be at least 10 characters",
      "string.max": "Response message cannot exceed 500 characters",
      "any.required": "Response message is required",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate rejection
 */
export const validateRejectReview = (data) => {
  const schema = Joi.object({
    rejectionReason: Joi.string().min(10).max(500).trim().required().messages({
      "string.min": "Rejection reason must be at least 10 characters",
      "string.max": "Rejection reason cannot exceed 500 characters",
      "any.required": "Rejection reason is required",
    }),
  });
  return schema.validate(data);
};

/**
 * Validate query parameters for getting reviews
 */
export const validateGetReviewsQuery = (data) => {
  const schema = Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string()
      .valid("all", "pending", "approved", "rejected")
      .optional(),
    hotelId: Joi.string().length(24).hex().optional(),
    branchId: Joi.string().length(24).hex().optional(),
    minRating: Joi.number().min(1).max(5).optional(),
    maxRating: Joi.number().min(1).max(5).optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    sortBy: Joi.string()
      .valid("createdAt", "overallRating", "helpfulCount")
      .optional(),
    sortOrder: Joi.string().valid("asc", "desc").optional(),
    search: Joi.string().optional(),
  });
  return schema.validate(data);
};
