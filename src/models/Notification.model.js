/**
 * Notification Model
 * Stores in-app notifications for admins and super admins
 * Used for payment config approvals, activations, deactivations
 */

import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ["admin", "super_admin"],
      required: true,
    },

    // Notification details
    type: {
      type: String,
      enum: [
        "payment_config_created",
        "payment_config_pending_activation",
        "payment_config_activated",
        "payment_config_deactivated",
        "payment_config_failed",
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    // Related entities
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      index: true,
    },
    paymentConfig: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentConfig",
    },

    // Actor (who triggered this notification)
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    triggeredByName: String,
    triggeredByEmail: String,

    // Additional data (flexible JSON)
    metadata: {
      provider: String,
      isProduction: Boolean,
      actionRequired: Boolean,
      actionUrl: String,
    },

    // Status tracking
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: Date,

    dismissed: {
      type: Boolean,
      default: false,
    },
    dismissedAt: Date,

    // Delivery tracking
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailSentAt: Date,
    socketSent: {
      type: Boolean,
      default: false,
    },
    socketSentAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, type: 1, read: 1 });
notificationSchema.index({ hotel: 1, type: 1, createdAt: -1 });

// Mark as read
notificationSchema.methods.markAsRead = function () {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Dismiss notification
notificationSchema.methods.dismiss = function () {
  this.dismissed = true;
  this.dismissedAt = new Date();
  return this.save();
};

export const Notification = mongoose.model("Notification", notificationSchema);
