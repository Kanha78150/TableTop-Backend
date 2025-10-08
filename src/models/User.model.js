import mongoose from "mongoose";
import Joi from "joi";

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

// Indexes for better performance (email, phone, username already have unique indexes from field definition)
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
userSchema.methods.getCoinStats = function () {
  return {
    currentBalance: this.coins || 0,
    totalEarned: this.totalCoinsEarned || 0,
    totalUsed: this.totalCoinsUsed || 0,
    netGain: (this.totalCoinsEarned || 0) - (this.totalCoinsUsed || 0),
    lastActivity: this.lastCoinActivity,
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

export const validateUser = (data) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    username: Joi.string().alphanum().min(3).max(30).required(),
    email: Joi.string().email().required(),
    phone: Joi.string()
      .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
      .required()
      .messages({
        "string.pattern.base":
          "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
      }),
    password: Joi.string().min(6).required(),
  });
  return schema.validate(data);
};

export const validateEditProfile = (data) => {
  const schema = Joi.object({
    name: Joi.string().optional(),
    username: Joi.string().alphanum().min(3).max(30).optional(),
    phone: Joi.string()
      .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
      }),
  });
  return schema.validate(data);
};

export const validateChangePassword = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  });
  return schema.validate(data);
};

export const validateResetPassword = (data) => {
  const schema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  });
  return schema.validate(data);
};

export const validateOAuthUserCompletion = (data) => {
  const schema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .optional(),
  });
  return schema.validate(data);
};
