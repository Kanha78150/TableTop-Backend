import Joi from "joi";

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
      manageTables: Joi.boolean().optional(),
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
      manageTables: Joi.boolean().optional(),
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

// Super Admin Validation Schemas
export const validateSuperAdminRegistration = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required().messages({
      "string.min": "Password must be at least 8 characters for super admin",
    }),
    dateOfBirth: Joi.date().max("now").required().messages({
      "date.max": "Date of birth cannot be in the future",
    }),
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

export const validateSuperAdminLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    dateOfBirth: Joi.date().required().messages({
      "date.base": "Date of birth is required for super admin login",
    }),
  });
  return schema.validate(data);
};

