// src/models/Staff.js - Staff Model for Hotel Management
import mongoose from "mongoose";
import Joi from "joi";
import bcrypt from "bcryptjs";
import { generateStaffId, getNextCounter } from "../utils/idGenerator.js";

const staffSchema = new mongoose.Schema(
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
    staffId: {
      type: String,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },

    // Role within staff hierarchy
    role: {
      type: String,
      enum: {
        values: [
          "waiter",
          "kitchen_staff",
          "cleaning_staff",
          "cashier",
          "receptionist",
          "security",
        ],
        message:
          "Role must be waiter, kitchen_staff, cleaning_staff, cashier, receptionist, or security",
      },
      required: [true, "Role is required"],
    },

    // Department for better organization
    department: {
      type: String,
      enum: {
        values: [
          "service",
          "kitchen",
          "housekeeping",
          "front_desk",
          "security",
        ],
        message:
          "Department must be service, kitchen, housekeeping, front_desk, or security",
      },
      required: [true, "Department is required"],
    },

    // Hierarchy relationships
    hotel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      required: [true, "Hotel assignment is required"],
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Branch assignment is required"],
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manager",
    },

    // Staff-specific permissions
    permissions: {
      // Order Management
      takeOrders: { type: Boolean, default: false },
      updateOrderStatus: { type: Boolean, default: false },
      viewOrders: { type: Boolean, default: false },
      processPayments: { type: Boolean, default: false },

      // Table Management
      manageTableStatus: { type: Boolean, default: false },
      viewTableReservations: { type: Boolean, default: false },

      // Menu Access
      viewMenu: { type: Boolean, default: true },
      suggestMenuItems: { type: Boolean, default: false },

      // Customer Service
      handleComplaints: { type: Boolean, default: false },
      accessCustomerInfo: { type: Boolean, default: false },

      // Kitchen Operations
      viewKitchenOrders: { type: Boolean, default: false },
      updateKitchenStatus: { type: Boolean, default: false },
      manageInventory: { type: Boolean, default: false },

      // Housekeeping
      manageRoomStatus: { type: Boolean, default: false },
      viewCleaningSchedule: { type: Boolean, default: false },

      // Communication
      internalChat: { type: Boolean, default: true },
      emergencyAlerts: { type: Boolean, default: true },
    },

    // Availability and scheduling
    isAvailable: { type: Boolean, default: true },
    status: {
      type: String,
      enum: {
        values: ["active", "inactive", "on_break", "on_leave", "suspended"],
        message:
          "Status must be active, inactive, on_break, on_leave, or suspended",
      },
      default: "active",
    },

    // Shift information
    currentShift: {
      type: String,
      enum: ["morning", "afternoon", "evening", "night"],
      default: null,
    },

    shiftSchedule: {
      monday: { start: String, end: String, shift: String },
      tuesday: { start: String, end: String, shift: String },
      wednesday: { start: String, end: String, shift: String },
      thursday: { start: String, end: String, shift: String },
      friday: { start: String, end: String, shift: String },
      saturday: { start: String, end: String, shift: String },
      sunday: { start: String, end: String, shift: String },
    },

    // Profile information
    profileImage: { type: String, default: null },
    avatar: { type: String, default: null },

    // Authentication
    refreshToken: { type: String, default: null },

    // Security features
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },

    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manager", // Created by Branch Manager
    },
    lastLogin: { type: Date },

    // Additional staff info
    dateOfJoining: { type: Date, default: Date.now },

    // Emergency contact
    emergencyContact: {
      name: String,
      phone: String,
      relationship: String,
    },

    // Performance tracking
    performanceRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },

    // Training status
    trainingCompleted: [
      {
        module: String,
        completedAt: Date,
        score: Number,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
staffSchema.index({ branch: 1 });
staffSchema.index({ manager: 1 });
staffSchema.index({ status: 1 });
staffSchema.index({ role: 1 });
staffSchema.index({ department: 1 });

// Hash password before saving
staffSchema.pre("save", async function (next) {
  // Auto-generate staffId for new staff
  if (!this.staffId && this.isNew) {
    try {
      const year = new Date().getFullYear();
      const prefix = `STF-${year}`;
      const counter = await getNextCounter(this.constructor, "staffId", prefix);
      this.staffId = generateStaffId(counter);
    } catch (error) {
      return next(error);
    }
  }

  // Validate hotel-branch relationship
  if (this.isNew || this.isModified("hotel") || this.isModified("branch")) {
    try {
      const Branch = this.constructor.model("Branch");
      const branch = await Branch.findById(this.branch).populate("hotel");

      if (!branch) {
        return next(new Error("Branch not found"));
      }

      if (branch.hotel._id.toString() !== this.hotel.toString()) {
        return next(new Error("Staff's hotel must match the branch's hotel"));
      }
    } catch (error) {
      return next(error);
    }
  }

  // Hash password if modified
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
staffSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
staffSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Increment login attempts
staffSchema.methods.incLoginAttempts = function () {
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
staffSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

// Set default permissions based on role
staffSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("role")) {
    this.setDefaultPermissions();
  }
  next();
});

// Method to set default permissions based on role
staffSchema.methods.setDefaultPermissions = function () {
  const rolePermissions = {
    waiter: {
      takeOrders: true,
      updateOrderStatus: true,
      viewOrders: true,
      manageTableStatus: true,
      viewTableReservations: true,
      viewMenu: true,
      suggestMenuItems: true,
      handleComplaints: true,
      accessCustomerInfo: true,
      internalChat: true,
      emergencyAlerts: true,
    },
    kitchen_staff: {
      viewOrders: true,
      viewKitchenOrders: true,
      updateKitchenStatus: true,
      manageInventory: true,
      viewMenu: true,
      internalChat: true,
      emergencyAlerts: true,
    },
    cleaning_staff: {
      manageRoomStatus: true,
      viewCleaningSchedule: true,
      internalChat: true,
      emergencyAlerts: true,
    },
    cashier: {
      processPayments: true,
      viewOrders: true,
      accessCustomerInfo: true,
      handleComplaints: true,
      internalChat: true,
      emergencyAlerts: true,
    },
    receptionist: {
      viewTableReservations: true,
      accessCustomerInfo: true,
      handleComplaints: true,
      manageTableStatus: true,
      internalChat: true,
      emergencyAlerts: true,
    },
    security: {
      emergencyAlerts: true,
      internalChat: true,
    },
  };

  const defaultPermissions = rolePermissions[this.role] || {};

  // Merge with existing permissions, but don't override explicitly set permissions
  for (const [key, value] of Object.entries(defaultPermissions)) {
    if (this.permissions[key] === undefined) {
      this.permissions[key] = value;
    }
  }

  // Set department based on role if not set
  if (!this.department) {
    const roleDepartmentMap = {
      waiter: "service",
      kitchen_staff: "kitchen",
      cleaning_staff: "housekeeping",
      cashier: "front_desk",
      receptionist: "front_desk",
      security: "security",
    };
    this.department = roleDepartmentMap[this.role] || "service";
  }
};

export const Staff = mongoose.model("Staff", staffSchema);

// Joi Validation Schemas
const passwordComplexity = Joi.string()
  .min(8)
  .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])"))
  .message(
    "Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character"
  );

const timePattern = Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);

export const staffValidationSchemas = {
  // Registration validation (used by Branch Manager when creating Staff)
  register: Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
      "string.empty": "Name is required",
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name cannot exceed 100 characters",
    }),

    email: Joi.string().email().trim().lowercase().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),

    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .required()
      .messages({
        "string.pattern.base": "Phone number must be 10 digits",
        "string.empty": "Phone number is required",
      }),

    password: passwordComplexity.required(),

    staffId: Joi.string().trim().alphanum().min(3).max(20).messages({
      "string.alphanum": "Staff ID must contain only letters and numbers",
      "string.min": "Staff ID must be at least 3 characters long",
      "string.max": "Staff ID cannot exceed 20 characters",
    }),

    role: Joi.string()
      .valid(
        "waiter",
        "kitchen_staff",
        "cleaning_staff",
        "cashier",
        "receptionist",
        "security"
      )
      .required()
      .messages({
        "any.only":
          "Role must be waiter, kitchen_staff, cleaning_staff, cashier, receptionist, or security",
        "string.empty": "Role is required",
      }),

    department: Joi.string()
      .valid("service", "kitchen", "housekeeping", "front_desk", "security")
      .messages({
        "any.only":
          "Department must be service, kitchen, housekeeping, front_desk, or security",
      }),

    hotel: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid hotel ID format",
        "string.empty": "Hotel assignment is required",
      }),

    branch: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        "string.pattern.base": "Invalid branch ID format",
        "string.empty": "Branch assignment is required",
      }),

    manager: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .optional()
      .messages({
        "string.pattern.base": "Invalid manager ID format",
      }),

    // Permission customization (optional, defaults will be applied based on role)
    permissions: Joi.object({
      takeOrders: Joi.boolean(),
      updateOrderStatus: Joi.boolean(),
      viewOrders: Joi.boolean(),
      processPayments: Joi.boolean(),
      manageTableStatus: Joi.boolean(),
      viewTableReservations: Joi.boolean(),
      viewMenu: Joi.boolean(),
      suggestMenuItems: Joi.boolean(),
      handleComplaints: Joi.boolean(),
      accessCustomerInfo: Joi.boolean(),
      viewKitchenOrders: Joi.boolean(),
      updateKitchenStatus: Joi.boolean(),
      manageInventory: Joi.boolean(),
      manageRoomStatus: Joi.boolean(),
      viewCleaningSchedule: Joi.boolean(),
      internalChat: Joi.boolean(),
      emergencyAlerts: Joi.boolean(),
    }).optional(),

    emergencyContact: Joi.object({
      name: Joi.string().trim().max(100),
      phone: Joi.string().pattern(/^[0-9]{10}$/),
      relationship: Joi.string().trim().max(50),
    }).optional(),
  }),

  // Login validation
  login: Joi.object({
    email: Joi.string().email().trim().lowercase().required().messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
    }),

    password: Joi.string().min(6).required().messages({
      "string.min": "Password must be at least 6 characters long",
      "string.empty": "Password is required",
    }),
  }),

  // Profile update validation
  updateProfile: Joi.object({
    name: Joi.string().trim().min(2).max(100).messages({
      "string.min": "Name must be at least 2 characters long",
      "string.max": "Name cannot exceed 100 characters",
    }),

    phone: Joi.string()
      .pattern(/^[0-9]{10}$/)
      .messages({
        "string.pattern.base": "Phone number must be 10 digits",
      }),

    profileImage: Joi.string().uri().allow(null, ""),

    emergencyContact: Joi.object({
      name: Joi.string().trim().max(100).allow(""),
      phone: Joi.string()
        .pattern(/^[0-9]{10}$/)
        .allow(""),
      relationship: Joi.string().trim().max(50).allow(""),
    }),

    shiftSchedule: Joi.object({
      monday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
      tuesday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
      wednesday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
      thursday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
      friday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
      saturday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
      sunday: Joi.object({
        start: timePattern,
        end: timePattern,
        shift: Joi.string().valid("morning", "afternoon", "evening", "night"),
      }),
    }),
  }),

  // Password change validation
  changePassword: Joi.object({
    currentPassword: Joi.string().required().messages({
      "string.empty": "Current password is required",
    }),

    newPassword: passwordComplexity.required(),

    confirmPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .messages({
        "any.only": "Password confirmation does not match new password",
        "string.empty": "Password confirmation is required",
      }),
  }),

  // Update permissions (Branch Manager or Super Admin only)
  updatePermissions: Joi.object({
    permissions: Joi.object({
      takeOrders: Joi.boolean(),
      updateOrderStatus: Joi.boolean(),
      viewOrders: Joi.boolean(),
      processPayments: Joi.boolean(),
      manageTableStatus: Joi.boolean(),
      viewTableReservations: Joi.boolean(),
      viewMenu: Joi.boolean(),
      suggestMenuItems: Joi.boolean(),
      handleComplaints: Joi.boolean(),
      accessCustomerInfo: Joi.boolean(),
      viewKitchenOrders: Joi.boolean(),
      updateKitchenStatus: Joi.boolean(),
      manageInventory: Joi.boolean(),
      manageRoomStatus: Joi.boolean(),
      viewCleaningSchedule: Joi.boolean(),
      internalChat: Joi.boolean(),
      emergencyAlerts: Joi.boolean(),
    }).required(),
  }),

  // Status update (Branch Manager or Super Admin only)
  updateStatus: Joi.object({
    status: Joi.string()
      .valid("active", "inactive", "on_break", "on_leave", "suspended")
      .required()
      .messages({
        "any.only":
          "Status must be active, inactive, on_break, on_leave, or suspended",
      }),
  }),

  // Shift update
  updateShift: Joi.object({
    currentShift: Joi.string()
      .valid("morning", "afternoon", "evening", "night")
      .allow(null)
      .messages({
        "any.only":
          "Current shift must be morning, afternoon, evening, or night",
      }),

    status: Joi.string()
      .valid("active", "inactive", "on_break", "on_leave")
      .messages({
        "any.only": "Status must be active, inactive, on_break, or on_leave",
      }),
  }),

  // Performance rating update (Branch Manager only)
  updatePerformance: Joi.object({
    performanceRating: Joi.number().min(1).max(5).required().messages({
      "number.min": "Performance rating must be at least 1",
      "number.max": "Performance rating cannot exceed 5",
      "any.required": "Performance rating is required",
    }),
  }),

  // Training completion
  addTraining: Joi.object({
    module: Joi.string().trim().required().messages({
      "string.empty": "Training module name is required",
    }),

    score: Joi.number().min(0).max(100).required().messages({
      "number.min": "Score must be at least 0",
      "number.max": "Score cannot exceed 100",
      "any.required": "Training score is required",
    }),
  }),
};

// Legacy validation function for backward compatibility
export const validateStaff = (data) => {
  return staffValidationSchemas.register.validate(data);
};
