import Joi from "joi";

export const offerValidationSchemas = {
  create: Joi.object({
    code: Joi.string().trim().uppercase().min(3).max(20).required().messages({
      "string.empty": "Offer code is required",
      "string.min": "Offer code must be at least 3 characters long",
      "string.max": "Offer code cannot exceed 20 characters",
    }),
    title: Joi.string().trim().min(3).max(100).required().messages({
      "string.empty": "Offer title is required",
      "string.min": "Offer title must be at least 3 characters long",
      "string.max": "Offer title cannot exceed 100 characters",
    }),
    description: Joi.string().max(500).allow("").optional(),
    discountType: Joi.string().valid("flat", "percent").required().messages({
      "any.only": "Discount type must be either flat or percent",
      "any.required": "Discount type is required",
    }),
    discountValue: Joi.number().positive().required().messages({
      "number.positive": "Discount value must be a positive number",
      "any.required": "Discount value is required",
    }),
    minOrderValue: Joi.number().min(0).default(0),
    maxDiscountAmount: Joi.number().min(0).optional(),
    usageLimit: Joi.number().integer().min(1).optional(),
    userUsageLimit: Joi.number().integer().min(1).default(1),
    startDate: Joi.date().default(Date.now).optional(),
    expiryDate: Joi.date().greater("now").required().messages({
      "date.greater": "Expiry date must be in the future",
      "any.required": "Expiry date is required",
    }),
    isActive: Joi.boolean().default(true),
    applicableFor: Joi.string()
      .valid("all", "category", "item", "hotel", "branch")
      .default("hotel"),
    hotelId: Joi.string()
      .pattern(/^HTL-\d{4}-\d{5}$/)
      .required()
      .messages({
        "string.pattern.base": "Hotel ID must be in format HTL-YYYY-NNNNN",
        "any.required": "Hotel ID is required",
      }),
    branchId: Joi.string()
      .pattern(/^BRN-[A-Z0-9]+-\d{5}$/)
      .optional()
      .messages({
        "string.pattern.base": "Branch ID must be in format BRN-XXX-NNNNN",
      }),
    hotel: Joi.alternatives()
      .try(
        Joi.string().length(24).hex(),
        Joi.string().pattern(/^HTL-\d{4}-\d{5}$/)
      )
      .optional(),
    branch: Joi.alternatives()
      .try(
        Joi.string().length(24).hex(),
        Joi.string().pattern(/^BRN-[A-Z0-9]+-\d{5}$/)
      )
      .optional(),
    foodCategory: Joi.when("applicableFor", {
      is: "item",
      then: Joi.string().length(24).hex().required().messages({
        "any.required":
          'Food category is required when applicable for is "item"',
      }),
      otherwise: Joi.string().length(24).hex().optional(),
    }),
    foodItem: Joi.when("applicableFor", {
      is: "item",
      then: Joi.string().length(24).hex().required().messages({
        "any.required": 'Food item is required when applicable for is "item"',
      }),
      otherwise: Joi.string().length(24).hex().optional(),
    }),
    validDays: Joi.array()
      .items(Joi.number().integer().min(0).max(6))
      .optional(),
    validTimeRange: Joi.object({
      startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    }).optional(),
    validTimeSlots: Joi.array()
      .items(
        Joi.object({
          startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
          endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        })
      )
      .optional(),
    terms: Joi.string().max(1000).optional(),
  }),

  update: Joi.object({
    code: Joi.string().trim().uppercase().min(3).max(20).optional(),
    title: Joi.string().trim().min(3).max(100).optional(),
    description: Joi.string().max(500).allow("").optional(),
    discountType: Joi.string().valid("flat", "percent").optional(),
    discountValue: Joi.number().positive().optional(),
    minOrderValue: Joi.number().min(0).optional(),
    maxDiscountAmount: Joi.number().min(0).optional(),
    usageLimit: Joi.number().integer().min(1).optional(),
    userUsageLimit: Joi.number().integer().min(1).optional(),
    startDate: Joi.date().optional(),
    expiryDate: Joi.date().greater("now").optional(),
    isActive: Joi.boolean().optional(),
    applicableFor: Joi.string()
      .valid("all", "category", "item", "hotel", "branch")
      .optional(),
    hotelId: Joi.string()
      .pattern(/^HTL-\d{4}-\d{5}$/)
      .optional()
      .messages({
        "string.pattern.base": "Hotel ID must be in format HTL-YYYY-NNNNN",
      }),
    branchId: Joi.string()
      .pattern(/^BRN-[A-Z0-9]+-\d{5}$/)
      .optional()
      .messages({
        "string.pattern.base": "Branch ID must be in format BRN-XXX-NNNNN",
      }),
    hotel: Joi.alternatives()
      .try(
        Joi.string().length(24).hex(),
        Joi.string().pattern(/^HTL-\d{4}-\d{5}$/),
        Joi.string().valid(null)
      )
      .optional(),
    branch: Joi.alternatives()
      .try(
        Joi.string().length(24).hex(),
        Joi.string().pattern(/^BRN-[A-Z0-9]+-\d{5}$/),
        Joi.string().valid(null)
      )
      .optional(),
    foodCategory: Joi.when("applicableFor", {
      is: "item",
      then: Joi.string().length(24).hex().required().messages({
        "any.required":
          'Food category is required when applicable for is "item"',
      }),
      otherwise: Joi.alternatives()
        .try(Joi.string().length(24).hex(), Joi.string().valid(null))
        .optional(),
    }),
    foodItem: Joi.when("applicableFor", {
      is: "item",
      then: Joi.string().length(24).hex().required().messages({
        "any.required": 'Food item is required when applicable for is "item"',
      }),
      otherwise: Joi.alternatives()
        .try(Joi.string().length(24).hex(), Joi.string().valid(null))
        .optional(),
    }),
    validDays: Joi.array()
      .items(Joi.number().integer().min(0).max(6))
      .optional(),
    validTimeRange: Joi.object({
      startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    }).optional(),
    validTimeSlots: Joi.array()
      .items(
        Joi.object({
          startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
          endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
        })
      )
      .optional(),
    terms: Joi.string().max(1000).optional(),
  }),
};

// Legacy validation function for backward compatibility
export const validateOffer = (data) => {
  return offerValidationSchemas.create.validate(data);
};

