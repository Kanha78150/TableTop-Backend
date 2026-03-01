import Joi from "joi";

const passwordComplexity = Joi.string()
  .min(8)
  .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])"))
  .message(
    "Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character"
  );

const timePattern = Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/);

export const managerValidationSchemas = {
  // Registration validation (used by Super Admin when creating Branch Manager)
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

    employeeId: Joi.string().trim().alphanum().min(3).max(20).messages({
      "string.alphanum": "Employee ID must contain only letters and numbers",
      "string.min": "Employee ID must be at least 3 characters long",
      "string.max": "Employee ID cannot exceed 20 characters",
    }),

    hotel: Joi.string().required().messages({
      "string.empty": "Hotel assignment is required",
    }),

    branch: Joi.string().optional().allow(null, "").messages({
      "string.base": "Branch ID must be a string",
    }),

    profileImage: Joi.string().uri().allow(null, ""),

    department: Joi.string()
      .valid("operations", "kitchen", "service", "management")
      .default("operations"),

    // Permission customization (optional, defaults will be applied)
    permissions: Joi.object({
      manageStaff: Joi.boolean().default(true),
      viewStaff: Joi.boolean().default(true),
      manageMenu: Joi.boolean().default(true),
      viewMenu: Joi.boolean().default(true),
      updateMenuItems: Joi.boolean().default(true),
      processOrders: Joi.boolean().default(true),
      updateOrderStatus: Joi.boolean().default(true),
      viewOrders: Joi.boolean().default(true),
      manageReservations: Joi.boolean().default(true),
      manageTables: Joi.boolean().default(true),
      handleComplaints: Joi.boolean().default(true),
      viewFeedback: Joi.boolean().default(true),
      viewReports: Joi.boolean().default(true),
      viewBranchAnalytics: Joi.boolean().default(true),
      internalChat: Joi.boolean().default(true),
    }).optional(),
    profileImage: Joi.string().uri().allow(null, ""),

    emergencyContact: Joi.object({
      name: Joi.string().trim().max(100),
      phone: Joi.string().pattern(/^[0-9]{10}$/),
      relationship: Joi.string().trim().max(50),
    }).optional(),
  }),

  // Login validation
  login: Joi.object({
    identifier: Joi.string().trim().required().messages({
      "string.empty": "Email or Employee ID is required",
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
      monday: Joi.object({ start: timePattern, end: timePattern }),
      tuesday: Joi.object({ start: timePattern, end: timePattern }),
      wednesday: Joi.object({ start: timePattern, end: timePattern }),
      thursday: Joi.object({ start: timePattern, end: timePattern }),
      friday: Joi.object({ start: timePattern, end: timePattern }),
      saturday: Joi.object({ start: timePattern, end: timePattern }),
      sunday: Joi.object({ start: timePattern, end: timePattern }),
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

  // Update permissions (Super Admin only)
  updatePermissions: Joi.object({
    permissions: Joi.object({
      manageStaff: Joi.boolean(),
      viewStaff: Joi.boolean(),
      manageMenu: Joi.boolean(),
      viewMenu: Joi.boolean(),
      updateMenuItems: Joi.boolean(),
      processOrders: Joi.boolean(),
      updateOrderStatus: Joi.boolean(),
      viewOrders: Joi.boolean(),
      manageReservations: Joi.boolean(),
      manageTables: Joi.boolean(),
      handleComplaints: Joi.boolean(),
      viewFeedback: Joi.boolean(),
      viewReports: Joi.boolean(),
      viewBranchAnalytics: Joi.boolean(),
      internalChat: Joi.boolean(),
    }).required(),
  }),

  // Status update (Super Admin only)
  updateStatus: Joi.object({
    status: Joi.string()
      .valid("active", "inactive", "suspended")
      .required()
      .messages({
        "any.only": "Status must be active, inactive, or suspended",
      }),
  }),
};

export const validateManagerLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    branchId: Joi.string().required(),
  });
  return schema.validate(data);
};
