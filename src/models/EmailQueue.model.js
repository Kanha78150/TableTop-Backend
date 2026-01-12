import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const emailQueueSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["invoice", "credit_note", "subscription_invoice"],
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdminSubscription",
      index: true,
    },
    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "sent", "failed"],
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    lastAttemptAt: {
      type: Date,
    },
    errorMessage: {
      type: String,
    },
    emailData: {
      subject: String,
      invoiceNumber: String,
      creditNoteNumber: String,
      amount: Number,
      // Additional data needed for regeneration
      metadata: mongoose.Schema.Types.Mixed,
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient querying
emailQueueSchema.index({ status: 1, scheduledFor: 1 });
emailQueueSchema.index({ status: 1, attempts: 1 });
emailQueueSchema.index({ type: 1, status: 1 });

// Add pagination plugin
emailQueueSchema.plugin(mongoosePaginate);

// Method to schedule next retry with exponential backoff
emailQueueSchema.methods.scheduleRetry = function () {
  const backoffMinutes = [5, 30, 120]; // 5min, 30min, 2hrs
  const nextAttempt = this.attempts;

  if (nextAttempt >= 3) {
    this.status = "failed";
    return;
  }

  const delayMinutes = backoffMinutes[nextAttempt] || 120;
  this.scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);
  this.status = "pending";
};

// Static method to get pending emails ready for processing
emailQueueSchema.statics.getPendingEmails = function (limit = 10) {
  return this.find({
    status: "pending",
    attempts: { $lt: 3 },
    scheduledFor: { $lte: new Date() },
  })
    .limit(limit)
    .sort({ scheduledFor: 1, attempts: 1 });
};

// Static method to get stats
emailQueueSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    pending: 0,
    processing: 0,
    sent: 0,
    failed: 0,
  };

  stats.forEach((stat) => {
    result[stat._id] = stat.count;
  });

  return result;
};

export const EmailQueue = mongoose.model("EmailQueue", emailQueueSchema);
