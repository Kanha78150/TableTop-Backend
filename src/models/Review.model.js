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
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
      default: "",
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
// Validators extracted to src/validators/review.validators.js
export { validateCreateReview, validateUpdateReview, validateHelpfulVote, validateAdminResponse, validateRejectReview, validateGetReviewsQuery } from "../validators/review.validators.js";
