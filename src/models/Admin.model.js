import mongoose from "mongoose";
import Joi from "joi";
import bcrypt from "bcrypt";

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      unique: true,
      required: [true, "E-mail is required"],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    profileImage: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: {
        values: ["admin"],
        message: "Role must be admin",
      },
      default: "admin",
    },
    permissions: {
      // Branch Management
      resetPasswordToken: {
        type: String,
        default: null,
      },
      resetPasswordExpires: {
        type: Date,
        default: null,
      },
      manageBranches: { type: Boolean, default: true },

      // User Management
      manageUsers: { type: Boolean, default: true },
      manageManagers: { type: Boolean, default: true },
      manageStaff: { type: Boolean, default: true },

      // Menu Management
      manageMenu: { type: Boolean, default: true },
      managePricing: { type: Boolean, default: true },
      manageOffers: { type: Boolean, default: true },

      // Reports & Analytics
      viewReports: { type: Boolean, default: true },
      viewAnalytics: { type: Boolean, default: true },
      viewFinancials: { type: Boolean, default: true },

      // Inventory Management
      manageInventory: { type: Boolean, default: true },

      // System Management
      manageSystem: { type: Boolean, default: false }, // Only for super_admin
      manageAdmins: { type: Boolean, default: false }, // Only for super_admin
    },
    assignedBranches: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Branch",
      },
    ], // For branch_admin role - restricts access to specific branches
    department: {
      type: String,
      enum: ["operations", "finance", "marketing", "hr", "it", "system"],
      default: "system",
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "suspended"],
        message: "Status must be either active, inactive, or suspended",
      },
      default: "active",
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
      max: 5,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    refreshToken: {
      type: String,
      default: null,
    },
    passwordResetToken: {
      type: String,
      default: null,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationOtp: {
      type: String,
      default: null,
    },
    emailVerificationOtpExpiry: {
      type: Date,
      default: null,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.passwordResetToken;
        delete ret.twoFactorSecret;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

// checking the github connection
// Virtual field to check if account is locked
adminSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to handle failed login attempts
adminSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // If we have hit max attempts and it's not locked already, lock the account
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000, // Lock for 2 hours
    };
  }

  return this.updateOne(updates);
};

// Method to reset login attempts on successful login
adminSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: new Date() },
  });
};

// Method to check if admin has specific permission
adminSchema.methods.hasPermission = function (permission) {
  if (this.role === "super_admin") return true;
  return this.permissions[permission] === true;
};

// Method to check if admin can access specific branch
adminSchema.methods.canAccessBranch = function (branchId) {
  if (this.role === "super_admin" || this.role === "admin") return true;
  if (this.role === "branch_admin") {
    return this.assignedBranches.some(
      (id) => id.toString() === branchId.toString()
    );
  }
  return false;
};

// Indexes for better performance
// Note: email and employeeId already have unique indexes from field definition
adminSchema.index({ role: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ assignedBranches: 1 });

export const Admin = mongoose.model("Admin", adminSchema);

export const validateAdmin = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    phone: Joi.string()
      .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
      }),
    password: Joi.string().min(6).required(),
    profileImage: Joi.string().uri().optional().allow(null, ""),
    role: Joi.string().valid("admin").optional(),
    department: Joi.string()
      .valid("operations", "finance", "marketing", "hr", "it", "system")
      .optional(),
    employeeId: Joi.string().optional(),
    assignedBranches: Joi.array().items(Joi.string()).optional(),
    permissions: Joi.object({
      manageBranches: Joi.boolean().optional(),
      manageUsers: Joi.boolean().optional(),
      manageManagers: Joi.boolean().optional(),
      manageStaff: Joi.boolean().optional(),
      manageMenu: Joi.boolean().optional(),
      managePricing: Joi.boolean().optional(),
      manageOffers: Joi.boolean().optional(),
      viewReports: Joi.boolean().optional(),
      viewAnalytics: Joi.boolean().optional(),
      viewFinancials: Joi.boolean().optional(),
      manageInventory: Joi.boolean().optional(),
      manageSystem: Joi.boolean().optional(),
      manageAdmins: Joi.boolean().optional(),
    }).optional(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

export const validateAdminLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });
  return schema.validate(data);
};

export const validateAdminUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    phone: Joi.string()
      .pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/)
      .optional()
      .messages({
        "string.pattern.base":
          "Phone number must be between 10-15 digits and can include +, spaces, -, (, )",
      }),
    department: Joi.string()
      .valid("operations", "finance", "marketing", "hr", "it", "system")
      .optional(),
    role: Joi.string().valid("super_admin").optional(),
    status: Joi.string().valid("active", "inactive", "suspended").optional(),
    assignedBranches: Joi.array().items(Joi.string()).optional(),
    permissions: Joi.object({
      manageBranches: Joi.boolean().optional(),
      manageUsers: Joi.boolean().optional(),
      manageManagers: Joi.boolean().optional(),
      manageStaff: Joi.boolean().optional(),
      manageMenu: Joi.boolean().optional(),
      managePricing: Joi.boolean().optional(),
      manageOffers: Joi.boolean().optional(),
      viewReports: Joi.boolean().optional(),
      viewAnalytics: Joi.boolean().optional(),
      viewFinancials: Joi.boolean().optional(),
      manageInventory: Joi.boolean().optional(),
      manageSystem: Joi.boolean().optional(),
      manageAdmins: Joi.boolean().optional(),
    }).optional(),
    notes: Joi.string().max(500).optional(),
  });
  return schema.validate(data);
};

export const validatePasswordChange = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  });
  return schema.validate(data);
};

export const validatePasswordReset = (data) => {
  const schema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required(),
  });
  return schema.validate(data);
};

export const validateEmailVerification = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
      "string.length": "OTP must be exactly 6 digits",
      "string.pattern.base": "OTP must contain only numbers",
    }),
  });
  return schema.validate(data);
};

export const validateResendOtp = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
  });
  return schema.validate(data);
};
