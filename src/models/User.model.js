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
    coins: { type: Number, default: 0 },
    refreshToken: { type: String, default: null },
    profileImage: { type: String, default: null },
    avatar: { type: String, default: null },
    role: { type: String, enum: ["user"], default: "user" },
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
