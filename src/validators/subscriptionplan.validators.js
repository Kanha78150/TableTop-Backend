import Joi from "joi";

export const validateSubscriptionPlan = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100).required().messages({
      "string.min": "Plan name must be at least 3 characters",
      "string.max": "Plan name cannot exceed 100 characters",
      "any.required": "Plan name is required",
    }),
    description: Joi.string().min(10).max(500).required().messages({
      "string.min": "Description must be at least 10 characters",
      "string.max": "Description cannot exceed 500 characters",
      "any.required": "Description is required",
    }),
    price: Joi.object({
      monthly: Joi.number().min(0).required().messages({
        "number.min": "Monthly price cannot be negative",
        "any.required": "Monthly price is required",
      }),
      yearly: Joi.number().min(0).required().messages({
        "number.min": "Yearly price cannot be negative",
        "any.required": "Yearly price is required",
      }),
    }).required(),
    features: Joi.object({
      maxHotels: Joi.number().min(1).required(),
      maxBranches: Joi.number().min(1).required(),
      maxManagers: Joi.number().min(1).required(),
      maxStaff: Joi.number().min(1).required(),
      maxTables: Joi.number().min(1).required(),
      analyticsAccess: Joi.boolean().optional(),
      advancedReports: Joi.boolean().optional(),
      coinSystem: Joi.boolean().optional(),
      offerManagement: Joi.boolean().optional(),
      multipleLocations: Joi.boolean().optional(),
      inventoryManagement: Joi.boolean().optional(),
      orderAssignment: Joi.boolean().optional(),
      qrCodeGeneration: Joi.boolean().optional(),
      customBranding: Joi.boolean().optional(),
      apiAccess: Joi.boolean().optional(),
      prioritySupport: Joi.boolean().optional(),
    }).optional(),
    limitations: Joi.object({
      ordersPerMonth: Joi.number().min(0).optional(),
      storageGB: Joi.number().min(1).optional(),
      customReports: Joi.number().min(0).optional(),
    }).optional(),
    displayOrder: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

// Validation for updating plan
export const validateSubscriptionPlanUpdate = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(100).optional(),
    description: Joi.string().min(10).max(500).optional(),
    price: Joi.object({
      monthly: Joi.number().min(0).optional(),
      yearly: Joi.number().min(0).optional(),
    }).optional(),
    features: Joi.object({
      maxHotels: Joi.number().min(1).optional(),
      maxBranches: Joi.number().min(1).optional(),
      maxManagers: Joi.number().min(1).optional(),
      maxStaff: Joi.number().min(1).optional(),
      maxTables: Joi.number().min(1).optional(),
      analyticsAccess: Joi.boolean().optional(),
      advancedReports: Joi.boolean().optional(),
      coinSystem: Joi.boolean().optional(),
      offerManagement: Joi.boolean().optional(),
      multipleLocations: Joi.boolean().optional(),
      inventoryManagement: Joi.boolean().optional(),
      orderAssignment: Joi.boolean().optional(),
      qrCodeGeneration: Joi.boolean().optional(),
      customBranding: Joi.boolean().optional(),
      apiAccess: Joi.boolean().optional(),
      prioritySupport: Joi.boolean().optional(),
    }).optional(),
    limitations: Joi.object({
      ordersPerMonth: Joi.number().min(0).optional(),
      storageGB: Joi.number().min(1).optional(),
      customReports: Joi.number().min(0).optional(),
    }).optional(),
    displayOrder: Joi.number().min(0).optional(),
    isActive: Joi.boolean().optional(),
  });
  return schema.validate(data);
};

