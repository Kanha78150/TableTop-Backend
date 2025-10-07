import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import Joi from "joi";

const refundRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "processed", "completed"],
      default: "pending",
    },
    adminNotes: {
      type: String,
      maxlength: 1000,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who processed the request
    },
    processedAt: {
      type: Date,
    },
    refundTransactionId: {
      type: String,
    },
    attachments: [
      {
        name: String,
        url: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
refundRequestSchema.index({ user: 1, status: 1 });
refundRequestSchema.index({ order: 1 });
refundRequestSchema.index({ createdAt: -1 });

// Add pagination plugin
refundRequestSchema.plugin(mongoosePaginate);

export const RefundRequest = mongoose.model(
  "RefundRequest",
  refundRequestSchema
);

// Validation schemas
export const refundRequestValidationSchemas = {
  create: Joi.object({
    orderId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid order ID format",
      }),
    amount: Joi.number().positive().required().messages({
      "number.positive": "Refund amount must be positive",
    }),
    reason: Joi.string().min(10).max(500).required().messages({
      "string.min": "Reason must be at least 10 characters long",
      "string.max": "Reason cannot exceed 500 characters",
    }),
  }),

  updateStatus: Joi.object({
    status: Joi.string()
      .valid("approved", "rejected", "processed", "completed")
      .required(),
    adminNotes: Joi.string().max(1000).optional(),
  }),

  list: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string()
      .valid("pending", "approved", "rejected", "processed", "completed")
      .optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
  }),
};
