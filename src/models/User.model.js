import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, "Name is required"] },
    username: {
      type: String,
      unique: true,
      sparse: true, // Allows null values to be non-unique for OAuth users
    },
    email: {
      type: String,
      unique: true,
      required: [true, "E-mail is required"],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // Allows null values to be non-unique for OAuth users
    },
    password: {
      type: String,
      required: function () {
        return !this.googleId; // Password not required for OAuth users
      },
    },
    emailOtp: { type: String, default: null },
    phoneOtp: { type: String, default: null },
    isEmailVerified: { type: Boolean, default: false },
    isPhoneVerified: { type: Boolean, default: false },
    coins: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (v) {
          return v >= 0;
        },
        message: "Coin balance cannot be negative",
      },
    },
    refreshToken: { type: String, default: null },
    profileImage: { type: String, default: null },
    avatar: { type: String, default: null },
    role: { type: String, enum: ["user"], default: "user" },

    // Coin-related metadata
    totalCoinsEarned: { type: Number, default: 0 },
    totalCoinsUsed: { type: Number, default: 0 },
    lastCoinActivity: { type: Date, default: null },
    // Password reset fields
    passwordResetToken: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    // Google OAuth fields
    googleId: { type: String, default: null },
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    isOAuthUser: { type: Boolean, default: false },
    // Additional OAuth user fields
    googleProfile: {
      picture: { type: String, default: null },
      locale: { type: String, default: null },
      verified_email: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Only add additional indexes that aren't already defined
userSchema.index({ coins: 1 });
userSchema.index({ lastCoinActivity: 1 });
userSchema.index({ totalCoinsEarned: 1 });

// Instance method to add coins
userSchema.methods.addCoins = function (amount, source = "order") {
  if (amount <= 0) {
    throw new Error("Coin amount must be positive");
  }

  this.coins = (this.coins || 0) + amount;
  this.totalCoinsEarned = (this.totalCoinsEarned || 0) + amount;
  this.lastCoinActivity = new Date();

  return this.save();
};

// Instance method to deduct coins
userSchema.methods.deductCoins = function (amount) {
  if (amount <= 0) {
    throw new Error("Coin amount must be positive");
  }

  if ((this.coins || 0) < amount) {
    throw new Error("Insufficient coin balance");
  }

  this.coins = (this.coins || 0) - amount;
  this.totalCoinsUsed = (this.totalCoinsUsed || 0) + amount;
  this.lastCoinActivity = new Date();

  return this.save();
};

// Instance method to check if user has sufficient coins
userSchema.methods.hasSufficientCoins = function (amount) {
  return (this.coins || 0) >= amount;
};

// Instance method to get coin balance
userSchema.methods.getCoinBalance = function () {
  return this.coins || 0;
};

// Instance method to get coin statistics
userSchema.methods.getCoinStats = async function () {
  const CoinTransaction = mongoose.model("CoinTransaction");

  // Calculate totals dynamically from coin transactions
  const totalEarned = await CoinTransaction.getTotalCoinsEarned(this._id);
  const totalUsed = await CoinTransaction.getTotalCoinsUsed(this._id);

  // Get the last coin transaction for activity timestamp
  const lastTransaction = await CoinTransaction.findOne({
    user: this._id,
  })
    .sort({ createdAt: -1 })
    .select("createdAt");

  return {
    currentBalance: this.coins || 0,
    totalEarned,
    totalUsed,
    netGain: totalEarned - totalUsed,
    lastActivity: lastTransaction ? lastTransaction.createdAt : null,
  };
};

// Static method to get users with coin balances
userSchema.statics.getUsersWithCoins = function (minBalance = 0) {
  return this.find({
    coins: { $gte: minBalance },
  }).select("name email coins totalCoinsEarned totalCoinsUsed");
};

// Static method to get total coins in circulation
userSchema.statics.getTotalCoinsInCirculation = async function () {
  const result = await this.aggregate([
    { $group: { _id: null, totalCoins: { $sum: "$coins" } } },
  ]);

  return result.length > 0 ? result[0].totalCoins : 0;
};

export const User = mongoose.model("User", userSchema);

// Validators extracted to src/validators/user.validators.js
export { validateUser, validateEditProfile, validateChangePassword, validateResetPassword, validateOAuthUserCompletion } from "../validators/user.validators.js";
