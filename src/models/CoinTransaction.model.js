import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import Joi from "joi";

const coinTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Transaction type
    type: {
      type: String,
      enum: [
        "earned", // Coins earned from order
        "used", // Coins used in order payment
        "refunded", // Coins refunded due to order cancellation
        "expired", // Coins expired
        "adjusted", // Admin adjustment (bonus/penalty)
      ],
      required: true,
      index: true,
    },

    // Amount of coins (positive for earned/refunded, negative for used/expired)
    amount: {
      type: Number,
      required: true,
    },

    // Balance after this transaction
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    // Related order (if applicable)
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      // Note: Sparse index is defined separately below
    },

    // Related refund request (if applicable)
    refundRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RefundRequest",
      // Note: This field is optional and doesn't need an index
    },

    // Description of the transaction
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },

    // Metadata for additional information
    metadata: {
      orderValue: Number, // Original order value (for earned transactions)
      coinsRate: Number, // Rate at which coins were earned (coins per rupee)
      coinValue: Number, // Value of each coin at time of transaction
      expiryDate: Date, // For earned coins, when they expire
      adminReason: String, // For admin adjustments
    },

    // Admin who made the adjustment (for manual adjustments)
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      // Note: This field is optional and doesn't need an index
    },

    // Transaction status
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "completed",
    },

    // Reference to original transaction (for reversals)
    originalTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CoinTransaction",
      // Note: This field is optional and doesn't need an index
    },

    // Expiry tracking for earned coins
    expiresAt: {
      type: Date,
      // Note: Index is defined separately below with sparse option
    },

    // Whether this transaction affects coin expiry
    affectsExpiry: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
coinTransactionSchema.index({ user: 1, createdAt: -1 });
coinTransactionSchema.index({ user: 1, type: 1 });
coinTransactionSchema.index({ order: 1 }, { sparse: true }); // Sparse since order can be null
coinTransactionSchema.index({ expiresAt: 1 }, { sparse: true }); // Sparse since expiresAt can be null
coinTransactionSchema.index({ status: 1 });
coinTransactionSchema.index({ user: 1, status: 1 }); // Compound index for user queries

// Static method to create a coin transaction
coinTransactionSchema.statics.createTransaction = async function ({
  userId,
  type,
  amount,
  orderId,
  description,
  metadata = {},
  adjustedBy = null,
  refundRequestId = null,
  expiresAt = null,
}) {
  const User = mongoose.model("User");

  // Get current user balance
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const currentBalance = user.coins || 0;
  const newBalance = currentBalance + amount;

  // Ensure balance doesn't go negative
  if (newBalance < 0) {
    throw new Error("Insufficient coin balance");
  }

  // Create transaction
  const transaction = new this({
    user: userId,
    type,
    amount,
    balanceAfter: newBalance,
    order: orderId || undefined,
    refundRequest: refundRequestId || undefined,
    description,
    metadata,
    adjustedBy: adjustedBy || undefined,
    expiresAt: expiresAt || undefined,
    affectsExpiry: type === "earned",
  });

  await transaction.save();

  // Update user's coin balance
  await User.findByIdAndUpdate(userId, { coins: newBalance });

  return transaction;
};

// Static method to get user's coin history with pagination
coinTransactionSchema.statics.getUserCoinHistory = async function (
  userId,
  options = {}
) {
  const {
    page = 1,
    limit = 20,
    type = null,
    startDate = null,
    endDate = null,
  } = options;

  const query = { user: userId };

  if (type) {
    query.type = type;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const result = await this.paginate(query, {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: { createdAt: -1 },
    populate: [
      { path: "order", select: "orderNumber totalPrice createdAt" },
      { path: "refundRequest", select: "amount status createdAt" },
      { path: "adjustedBy", select: "name email" },
    ],
  });

  return result;
};

// Static method to calculate total coins earned by user
coinTransactionSchema.statics.getTotalCoinsEarned = async function (userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: new mongoose.Schema.Types.ObjectId(userId),
        type: "earned",
      },
    },
    { $group: { _id: null, totalEarned: { $sum: "$amount" } } },
  ]);

  return result.length > 0 ? result[0].totalEarned : 0;
};

// Static method to calculate total coins used by user
coinTransactionSchema.statics.getTotalCoinsUsed = async function (userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: new mongoose.Schema.Types.ObjectId(userId),
        type: "used",
      },
    },
    { $group: { _id: null, totalUsed: { $sum: { $abs: "$amount" } } } },
  ]);

  return result.length > 0 ? result[0].totalUsed : 0;
};

// Static method to get coins that will expire soon
coinTransactionSchema.statics.getExpiringCoins = async function (
  userId,
  daysAhead = 30
) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + daysAhead);

  const expiringCoins = await this.find({
    user: userId,
    type: "earned",
    expiresAt: { $lte: expiryDate, $gt: new Date() },
    status: "completed",
  }).sort({ expiresAt: 1 });

  return expiringCoins;
};

// Static method to expire coins automatically
coinTransactionSchema.statics.expireCoins = async function () {
  const expiredEarnedCoins = await this.find({
    type: "earned",
    expiresAt: { $lt: new Date() },
    status: "completed",
  });

  for (const earnedTransaction of expiredEarnedCoins) {
    // Create expiry transaction
    await this.createTransaction({
      userId: earnedTransaction.user,
      type: "expired",
      amount: -earnedTransaction.amount,
      description: `Coins expired (earned on ${earnedTransaction.createdAt.toDateString()})`,
      metadata: {
        originalTransactionId: earnedTransaction._id,
        expiredAt: new Date(),
      },
    });

    // Mark original transaction as expired
    earnedTransaction.status = "expired";
    await earnedTransaction.save();
  }

  return expiredEarnedCoins.length;
};

// Instance method to reverse a transaction
coinTransactionSchema.methods.reverse = async function (
  reason = "Transaction reversed"
) {
  if (this.status !== "completed") {
    throw new Error("Only completed transactions can be reversed");
  }

  // Create reversal transaction
  const reversalTransaction = await this.constructor.createTransaction({
    userId: this.user,
    type: this.type === "earned" ? "adjusted" : "refunded",
    amount: -this.amount,
    description: reason,
    metadata: {
      originalTransactionId: this._id,
      reversalReason: reason,
    },
  });

  // Mark original transaction as reversed
  this.status = "reversed";
  await this.save();

  return reversalTransaction;
};

// Add pagination plugin
coinTransactionSchema.plugin(mongoosePaginate);

export const CoinTransaction = mongoose.model(
  "CoinTransaction",
  coinTransactionSchema
);

// Validation schemas
export const coinTransactionValidationSchemas = {
  create: Joi.object({
    userId: Joi.string().hex().length(24).required(),
    type: Joi.string()
      .valid("earned", "used", "refunded", "expired", "adjusted")
      .required(),
    amount: Joi.number().required(),
    orderId: Joi.string().hex().length(24).optional(),
    description: Joi.string().max(200).required(),
    metadata: Joi.object().optional(),
    adjustedBy: Joi.string().hex().length(24).optional(),
    refundRequestId: Joi.string().hex().length(24).optional(),
  }),

  getUserHistory: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    type: Joi.string()
      .valid("earned", "used", "refunded", "expired", "adjusted")
      .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
  }),
};
