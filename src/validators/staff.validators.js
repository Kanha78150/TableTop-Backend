import Joi from "joi";

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

    hotel: Joi.string().required().messages({
      "string.empty": "Hotel assignment is required",
    }),

    branch: Joi.string().optional().allow(null, "").messages({
      "string.base": "Branch ID must be a string",
    }),

    manager: Joi.string().optional().allow(null, "").messages({
      "string.base": "Manager ID must be a string",
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

    profileImage: Joi.string().uri().allow(null, "").optional(),
  }),

  // Login validation
  login: Joi.object({
    identifier: Joi.string().trim().required().messages({
      "string.empty": "Email or Staff ID is required",
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
