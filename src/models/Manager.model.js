// src/models/Manager.js - Branch Manager Model
import mongoose from "mongoose";
import Joi from "joi";
import bcrypt from "bcrypt";
import { generateManagerId, getNextCounter } from "../utils/idGenerator.js";

const managerSchema = new mongoose.Schema(
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
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    employeeId: {
      type: String,
      unique: true,
      trim: true,
      // Will be auto-generated in pre-save middleware
    },
    profileImage: {
      type: String,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: false,
    },
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel assignment is required"],
    },
    refreshToken: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: {
        values: ["branch_manager"],
        message: "Role must be branch_manager",
      },
      default: "branch_manager",
    },
    department: {
      type: String,
      enum: {
        values: ["operations", "kitchen", "service", "management"],
        message:
          "Department must be operations, kitchen, service, or management",
      },
      default: "operations",
    },
    // Branch Manager Specific Permissions
    permissions: {
      // Staff Management
      manageStaff: { type: Boolean, default: false },
      viewStaff: { type: Boolean, default: true },

      // Menu Management
      manageMenu: { type: Boolean, default: true },
      viewMenu: { type: Boolean, default: true },
      updateMenuItems: { type: Boolean, default: true },

      // Order Management
      processOrders: { type: Boolean, default: true },
      updateOrderStatus: { type: Boolean, default: true },
      viewOrders: { type: Boolean, default: true },

      // Table Management
      manageReservations: { type: Boolean, default: true },
      manageTables: { type: Boolean, default: true },

      // Complaint Management
      handleComplaints: { type: Boolean, default: true },
      viewFeedback: { type: Boolean, default: true },

      // Reports
      viewReports: { type: Boolean, default: true },
      viewBranchAnalytics: { type: Boolean, default: true },

      // Communication
      internalChat: { type: Boolean, default: true },
    },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "suspended"],
        message: "Status must be active, inactive, or suspended",
      },
      default: "active",
    },
    // Login attempts and security
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", // Created by Super Admin
    },
    lastLogin: { type: Date },
    isFirstLogin: { type: Boolean, default: true }, // Flag to track first login

    // Additional manager info
    shiftSchedule: {
      monday: { start: String, end: String },
      tuesday: { start: String, end: String },
      wednesday: { start: String, end: String },
      thursday: { start: String, end: String },
      friday: { start: String, end: String },
      saturday: { start: String, end: String },
      sunday: { start: String, end: String },
    },

    // Emergency contact
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
managerSchema.index({ branch: 1 });
managerSchema.index({ status: 1 });
managerSchema.index({ createdBy: 1 });
managerSchema.index({ createdBy: 1, status: 1 });

// Pre-save middleware to auto-generate employeeId and hash password
managerSchema.pre("save", async function (next) {
  // Auto-generate employeeId for new managers
  if (!this.employeeId && this.isNew) {
    try {
      const year = new Date().getFullYear();
      const prefix = `MGR-${year}`;
      const counter = await getNextCounter(
        this.constructor,
        "employeeId",
        prefix
      );
      this.employeeId = generateManagerId(counter);
    } catch (error) {
      return next(error);
    }
  }

  // Validate hotel-branch relationship (only if branch is provided)
  if (
    (this.isNew || this.isModified("hotel") || this.isModified("branch")) &&
    this.branch
  ) {
    try {
      const Branch = this.constructor.model("Branch");
      const branch = await Branch.findById(this.branch).populate("hotel");

      if (!branch) {
        return next(new Error("Branch not found"));
      }

      if (branch.hotel._id.toString() !== this.hotel.toString()) {
        return next(new Error("Manager's hotel must match the branch's hotel"));
      }
    } catch (error) {
      return next(error);
    }
  }

  // Hash password if modified
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // Auto-parse permissions if stored as JSON string
  if (typeof this.permissions === "string") {
    try {
      this.permissions = JSON.parse(this.permissions);
    } catch (e) {}
  }

  // Auto-parse emergencyContact if stored as JSON string
  if (typeof this.emergencyContact === "string") {
    try {
      this.emergencyContact = JSON.parse(this.emergencyContact);
    } catch (e) {}
  }

  next();
});

// Compare password method
managerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
managerSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Increment login attempts
managerSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }

  return this.updateOne(updates);
};

// Reset login attempts
managerSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

export const Manager = mongoose.model("Manager", managerSchema);

// Joi Validation Schemas
const passwordComplexity = Joi.string()
  .min(8)
  .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])"))
  .message(
    "Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character"
  );

const timePattern = Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);

// Validators extracted to src/validators/manager.validators.js
export { managerValidationSchemas, validateManagerLogin } from "../validators/manager.validators.js";
