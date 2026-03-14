import Joi from "joi";

export const foodCategoryValidationSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(2).max(100).required().messages({
      "string.empty": "Category name is required",
      "string.min": "Category name must be at least 2 characters long",
      "string.max": "Category name cannot exceed 100 characters",
    }),
    description: Joi.string().max(500).allow("").optional(),
    type: Joi.string().valid("veg", "non-veg", "both").default("both"),
    isActive: Joi.boolean().default(true),
    displayOrder: Joi.number().integer().min(0).optional(),
    branch: Joi.alternatives()
      .try(
        Joi.string().length(24).hex().messages({
          "string.length": "Branch MongoDB ID must be 24 characters",
          "string.hex": "Branch MongoDB ID must be hexadecimal",
        }),
        Joi.string()
          .pattern(/^BRN-[A-Z0-9]+-\d{5}$/)
          .messages({
            "string.pattern.base": "Branch ID must be in format BRN-XXX-00000",
          })
      )
      .required()
      .messages({
        "any.required": "Branch is required",
      }),
    hotel: Joi.alternatives()
      .try(
        Joi.string().length(24).hex().messages({
          "string.length": "Hotel MongoDB ID must be 24 characters",
          "string.hex": "Hotel MongoDB ID must be hexadecimal",
        }),
        Joi.string()
          .pattern(/^HTL-\d{4}-\d{5}$/)
          .messages({
            "string.pattern.base": "Hotel ID must be in format HTL-YYYY-00000",
          })
      )
      .required()
      .messages({
        "any.required": "Hotel is required",
      }),
    image: Joi.string().uri().optional().allow(null, ""),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
    availableTimings: Joi.object({
      breakfast: Joi.boolean(),
      lunch: Joi.boolean(),
      dinner: Joi.boolean(),
      snacks: Joi.boolean(),
    }).optional(),
    slug: Joi.string().lowercase().trim().optional(),
  }),

  update: Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    description: Joi.string().max(500).allow("").optional(),
    type: Joi.string().valid("veg", "non-veg", "both").optional(),
    isActive: Joi.boolean().optional(),
    displayOrder: Joi.number().integer().min(0).optional(),
    image: Joi.string().uri().optional().allow(null, ""),
    tags: Joi.array().items(Joi.string().trim().max(50)).optional(),
    availableTimings: Joi.object({
      breakfast: Joi.boolean(),
      lunch: Joi.boolean(),
      dinner: Joi.boolean(),
      snacks: Joi.boolean(),
    }).optional(),
    slug: Joi.string().lowercase().trim().optional(),
  }),
};

// Legacy validation function for backward compatibility
export const validateFoodCategory = (data) => {
  return foodCategoryValidationSchemas.create.validate(data);
};

