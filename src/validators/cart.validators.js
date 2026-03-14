import Joi from "joi";

export const cartValidationSchemas = {
  addItem: Joi.object({
    foodItem: Joi.string().length(24).hex().required().messages({
      "string.length": "Food item ID must be 24 characters",
      "string.hex": "Food item ID must be valid",
      "any.required": "Food item is required",
    }),
    quantity: Joi.number().integer().min(1).max(20).required().messages({
      "number.min": "Quantity must be at least 1",
      "number.max": "Maximum 20 items allowed per food item",
      "any.required": "Quantity is required",
    }),
    hotel: Joi.string().length(24).hex().required().messages({
      "any.required": "Hotel is required",
    }),
    branch: Joi.string().length(24).hex().optional().allow(null, "").messages({
      "string.length": "Branch ID must be 24 characters",
      "string.hex": "Branch ID must be valid",
    }),
    customizations: Joi.object({
      spiceLevel: Joi.string().valid("mild", "medium", "hot", "extra-hot"),
      size: Joi.string().valid("small", "medium", "large", "extra-large"),
      addOns: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          price: Joi.number().min(0).required(),
        })
      ),
      removedIngredients: Joi.array().items(Joi.string()),
      specialInstructions: Joi.string().max(200),
    }).optional(),
  }),

  updateQuantity: Joi.object({
    quantity: Joi.number().integer().min(0).max(20).required().messages({
      "number.min": "Quantity must be at least 0",
      "number.max": "Maximum 20 items allowed per food item",
      "any.required": "Quantity is required",
    }),
  }),

  updateCustomizations: Joi.object({
    customizations: Joi.object({
      spiceLevel: Joi.string().valid("mild", "medium", "hot", "extra-hot"),
      size: Joi.string().valid("small", "medium", "large", "extra-large"),
      addOns: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          price: Joi.number().min(0).required(),
        })
      ),
      removedIngredients: Joi.array().items(Joi.string()),
      specialInstructions: Joi.string().max(200),
    }).required(),
  }),
};

// Legacy validation functions for backward compatibility
export const validateAddToCart = (data) => {
  return cartValidationSchemas.addItem.validate(data);
};

export const validateUpdateQuantity = (data) => {
  return cartValidationSchemas.updateQuantity.validate(data);
};

