import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

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
// Validators extracted to src/validators/refundrequest.validators.js
export { refundRequestValidationSchemas } from "../validators/refundrequest.validators.js";
